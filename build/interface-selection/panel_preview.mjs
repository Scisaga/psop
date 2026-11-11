import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../../apps/workbench/node_modules/playwright-core/index.mjs';

const dir = path.resolve('build/interface-selection');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'baseline-view.json'), 'utf8'));
const prepared = JSON.parse(fs.readFileSync(path.join(dir, 'backend-work-2/investigation.json'), 'utf8'));
const available = prepared.available_sources;
delete prepared.available_sources;
Object.assign(data.analysis, prepared);
data.meta.packageVersion = '1.10-prepare-preview';
data.meta.version = data.meta.packageVersion;
data.meta.validation.profile = 'psop.hardware.source-model/1.10';
for (const source of available) {
  const current = data.sources.find(item => item.id === source.id);
  const local = path.join(dir, 'backend-work-2/capture', source.url);
  const replacement = { ...current, ...source, digest: source.sha256, scope: current?.scope || 'package',
    url: `/api/workspaces/microduck/snapshots/dkp-59ce1b25aea434fc3367/assets/${source.url}`,
    text: fs.existsSync(local) && /^(?:MD|JSON|XML|CSV|TXT)$/.test(source.format) ? fs.readFileSync(local, 'utf8') : current?.text };
  if (current) Object.assign(current, replacement); else data.sources.push(replacement);
}
const captures = JSON.parse(fs.readFileSync(path.join(dir, 'before/capture.json'), 'utf8'));
const out = path.join(dir, 'panel-preview');
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  if (route.request().url().endsWith('/view')) return route.fulfill({ json: data });
  const response = await route.fetch({url: route.request().url().replace(':8781/', ':8780/')});
  await route.fulfill({response});
});
try {
  for (const hypothesis of data.analysis.installation_hypotheses) {
    const owner = hypothesis.participants.find(item => data.parts.find(part => part.id === item.part_ref)?.meshKey === 'right_shell') || hypothesis.participants[0];
    const query = new URLSearchParams({workspace:'microduck', snapshot:'dkp-59ce1b25aea434fc3367', part:owner.part_ref, hypothesis:hypothesis.id, detail:'interfaces', labels:'0', explode:'0'});
    await page.goto('http://127.0.0.1:8781/#explorer?' + query);
    await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});
    const card = page.locator(`[data-installation-hypothesis-id="${hypothesis.id}"]`);
    await card.waitFor();
    await page.waitForTimeout(700);
    const key = hypothesis.id.split(':')[1];
    await page.screenshot({path:path.join(out, `${key}.png`)});
    const measure = card.locator('.hypothesis-measurements');
    await measure.locator('summary').click();
    await card.locator('[data-hypothesis-evidence="support"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out, `${key}-evidence.png`)});
    await card.locator('[data-hypothesis-evidence="support"] .mechanics-source-link').first().click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({path:path.join(out, `${key}-source.png`)});
    await page.keyboard.press('Escape');
    const peer = hypothesis.participants.find(item => item.part_ref !== owner.part_ref);
    await card.locator(`[data-hypothesis-participant="${peer.part_ref}"]`).click();
    await page.locator('.object-id').filter({hasText:peer.part_ref}).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out, `${key}-peer.png`)});
  }
  for (const target of ['y42-z52', 'x25-y9']) {
    const capture = captures.records.find(item => item.target === target && item.variant === 'isolated');
    await page.goto(capture.url.replace(':8780/', ':8781/'));
    await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});
    await page.locator('.physical-structure-inspector').waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({path:path.join(out, `${target}-geometry.png`)});
  }
  console.log(JSON.stringify({out, errors, count:fs.readdirSync(out).length}));
} finally { await browser.close(); }
