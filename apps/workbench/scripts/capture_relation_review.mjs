import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const phase = process.argv[2] || 'before';
const origin = process.env.PSOP_ORIGIN || 'http://127.0.0.1:8780';
const repo = path.resolve(import.meta.dirname, '../../..');
const out = path.join(repo, 'build/stability-review/relations', phase);
fs.mkdirSync(out, { recursive: true });
const catalog = await (await fetch(origin + '/api/workspaces')).json();
const workspace = catalog.workspaces.find(item => item.id === 'microduck');
const snapshot = phase === 'before' ? 'dkp-1c8eeda600249ce33b99' : workspace.selectedSnapshotId;
const data = phase === 'before' ? JSON.parse(fs.readFileSync(path.join(repo, 'build/stability-review/baseline-view.json'))) : await (await fetch(`${origin}/api/workspaces/microduck/snapshots/${snapshot}/view`)).json();
const hip = data.parts.find(item => item.id === 'part:microduck:fa9ee2f71faafb88');
const reviews = data.analysis.connection_reviews.filter(item => item.participants.some(p => p.part_ref === hip.id));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const records = [];
const query = new URLSearchParams({ workspace: 'microduck', snapshot, part: hip.id, detail: 'interfaces', labels: '0', grid: '0', explode: '0' });
await page.goto(`${origin}/#explorer?${query}`, { timeout: 360000 });
await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 360000 });
await page.screenshot({ path: path.join(out, 'hip-interfaces.png') });
for (const review of reviews) {
  query.set('review', review.id);
  await page.goto(`${origin}/#explorer?${query}`, { timeout: 360000 });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 360000 });
  await page.locator(`[data-connection-review-id="${review.id}"]`).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.cameraFlight === 'settled');
  const detail = page.locator(`[data-connection-review-id="${review.id}"]`);
  await detail.scrollIntoViewIfNeeded();
  const file = `${review.id.split(':').at(-1)}.png`;
  await page.screenshot({ path: path.join(out, file) });
  records.push({ reviewId: review.id, participants: review.participants, text: await detail.innerText(), url: page.url(), image: file });
}
fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ phase, snapshot, meta: data.meta, reviews: records, errors }, null, 2));
await browser.close();
console.log(JSON.stringify({ phase, snapshot, reviews: records.length, errors, out }));
