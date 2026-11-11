import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { repoRoot } from './dkp.mjs';

const base = process.env.PSOP_SCREENSHOT_URL || 'http://127.0.0.1:8780/';
const destination = path.join(repoRoot, 'docs/assets/screenshots');
async function json(endpoint) {
  const response = await fetch(new URL(endpoint, base), { signal: AbortSignal.timeout(115000) });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
const catalog = await json('/api/workspaces');
const workspace = catalog.workspaces.find(item => item.deviceId === 'microduck');
if (!workspace?.snapshots.length) throw new Error('Prepare the Microduck workspace first.');
const snapshot = workspace.selectedSnapshotId || workspace.snapshots.at(-1).id;
const data = await json(`/api/workspaces/${workspace.id}/snapshots/${snapshot}/view`);
const servo = data.parts.find(item => item.id === 'part:microduck:0820b4025f26a004');
const support = data.parts.find(item => item.meshKey === 'motor_support');
const thigh = data.parts.find(item => item.meshKey === 'upper_leg_right');
const mount = data.analysis?.reference_mounts?.find(item => item.participants.some(part => part.part_ref === servo?.id));
if (!servo || !support || !thigh || !mount) throw new Error('The selected package lacks the illustrated Microduck mounting knowledge.');
await mkdir(destination, { recursive: true });
const viewport = { width: 1680, height: 1080 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
await context.addInitScript(() => localStorage.setItem('psop.workbench.inspector-width', '420'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const images = [];
const explorer = (part, extra = {}) => new URL('/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot, part, labels: '0', explode: '0', ...extra }), base).href;
async function settled() {
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-scene-ready', 'true', { timeout: 30000 });
  await page.waitForFunction(() => {
    const state = document.querySelector('.scene-canvas')?.dataset.cameraFlight;
    return !state || state === 'settled';
  });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function capture(name, purpose) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Page overflow in ' + name);
  const filename = name + '.png';
  await page.screenshot({ path: path.join(destination, filename), animations: 'disabled' });
  const bytes = await readFile(path.join(destination, filename));
  images.push({ file: filename, purpose, route: new URL(page.url()).hash, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
try {
  await page.goto(explorer(thigh.id, { explode: '.18', detail: 'overview' }));
  await settled();
  await page.getByRole('button', { name: '适应全部模型', exact: true }).click();
  const overviewCanvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(overviewCanvas.x + overviewCanvas.width / 2, overviewCanvas.y + overviewCanvas.height / 2);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(450);
  await settled();
  await capture('workbench-overview', 'Device workspace, source assembly, tree and object details');

  const localParts = new Set(mount.participants.map(item => item.part_ref));
  const hidden = data.parts.filter(item => !localParts.has(item.id)).map(item => item.id).join(',');
  await page.goto(explorer(servo.id, { mount: mount.id, detail: 'interfaces', supplements: '0', explode: '.32', hidden }));
  await settled();
  await expect(page.locator('.mounting-reference-connection')).toHaveCount(1);
  await expect(page.locator('.mounting-correspondence')).toHaveCount(2);
  await page.locator('.connection-fastener-items > button').first().click();
  await settled();
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .45, canvas.y + canvas.height * .5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .45 + 100, canvas.y + canvas.height * .5 + 24, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(450);
  await settled();
  await page.locator('.inspector-body').evaluate(element => { element.scrollTop = 0; });
  await capture('workbench-interfaces', 'Reference site mappings and explicitly unconfirmed connector schematics');

  await page.goto(explorer(support.id));
  await settled();
  await page.getByRole('tab', { name: /证据/ }).click();
  await page.locator('.evidence-card').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('robot_walk.xml');
  await expect(dialog.locator('.bp-document-line.is-evidence')).toContainText('motor_support');
  await page.evaluate(() => document.fonts.ready);
  await dialog.locator('.bp-document-line.is-evidence').first().scrollIntoViewIfNeeded();
  await expect(dialog.locator('.bp-document-line.is-evidence').first()).toBeInViewport();
  await capture('workbench-evidence', 'Actual source XML and evidence line navigation');
  if (errors.length) throw new Error(errors.join('\n'));
  const record = {
    captured_at: new Date().toISOString(), viewport, device_id: workspace.deviceId,
    snapshot_id: snapshot, registered_snapshot_count: workspace.snapshots.length,
    package_version: data.meta.packageVersion, package_digest: data.meta.packageDigest,
    knowledge_profile: data.meta.validation?.profile,
    counts: { parts: data.parts.length, sources: data.sources.length, geometries: data.meta.counts.geometries },
    images, browser_errors: errors,
  };
  await writeFile(path.join(destination, 'capture.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ snapshot, images: images.map(item => item.file), browser_errors: errors }, null, 2));
} finally {
  await browser.close();
}
