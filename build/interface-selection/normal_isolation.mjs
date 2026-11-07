import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '../../apps/workbench/node_modules/playwright-core/index.mjs';

const root = path.resolve('build/interface-selection');
const captures = JSON.parse(fs.readFileSync(path.join(root, 'before/capture.json'), 'utf8'));
const out = path.join(root, 'normals');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
process.env.NO_PROXY='127.0.0.1,localhost';
for (const record of captures.records.filter(r => r.variant === 'close' && r.target === 'x25-y9')) {
  for (const mode of ['no_edges', 'smooth_no_edges']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    console.log('start', record.target,mode);
    page.on('pageerror',error => console.log('PAGE ERROR',error.message));
    page.on('console',message => {if(message.type()==='error') console.log('CONSOLE',message.text());});
    let transformed = false;
    let responseHash, suppliedHash;
    await page.route('**/api/**', async route => {
      const response = await route.fetch({url:route.request().url().replace(':8781/', ':8780/')});
      await route.fulfill({response});
    });
    await page.route('**/src/SceneCanvas.tsx*', async route => {
      const response = await route.fetch();
      let body = await response.text();
      responseHash = createHash('sha256').update(body).digest('hex');
      if (mode === 'no_edges' || mode === 'source_only' || mode === 'smooth_no_edges') {
        if (!body.includes('if (selected?.mesh.visible)')) throw new Error('Edges guard not found in transformed module');
        body = body.replace('if (selected?.mesh.visible)', 'if (false && selected?.mesh.visible)');
        transformed = true;
      }
      if (mode === 'no_overlay' || mode === 'source_only') {
        if (!body.includes('owner.mesh.add(group);')) throw new Error('Overlay attach not found');
        body = body.replaceAll('owner.mesh.add(group);', '/* isolating: geometry overlay not attached */');
        body = body.replaceAll('record.mesh.add(overlay);', '/* isolating: peer overlay not attached */');
        transformed = true;
      }
      if (mode === 'smooth_no_edges') { body = `import { prepareSourceDisplayNormals } from '/src/source-display-normals.ts';\n` + body; body = body.replace('geometry.computeVertexNormals();', 'prepareSourceDisplayNormals(geometry);'); }
      suppliedHash = createHash('sha256').update(body).digest('hex');
      await route.fulfill({ response, body });
    });
    await page.goto(record.url.replace(':8780/', ':8781/'), { timeout: 60000 });
    await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.cameraFlight === 'settled');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const image = `${record.target}-${record.variant}-${mode}.png`;
    await page.locator('.scene-canvas').screenshot({ path: path.join(out, image) });
    if (!responseHash || mode !== 'full' && !transformed) throw new Error('Isolation did not intercept actual SceneCanvas module: ' + mode);
    results.push({ image, mode, transformed, responseHash, suppliedHash, camera: record.camera, url: record.url });
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(out, 'isolation.json'), JSON.stringify({ baselineDigest: captures.baselineDigest, records: results }, null, 2));
console.log(JSON.stringify({ count: results.length, out }));
