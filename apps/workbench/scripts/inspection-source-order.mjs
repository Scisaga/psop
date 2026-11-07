import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--base', 'http://127.0.0.1:8780'), apiBase = option('--api', base);
const run = option('--run', 'stable-alpha');
const output = path.join(root, 'build/stability-review/transparency', 'source-order-' + run);
await mkdir(output, { recursive: true });
const checks = JSON.parse(await readFile(path.join(root, 'build/stability-review/relations/after/checks.json'), 'utf8'));
const cases = (Array.isArray(checks) ? checks : checks.checks || checks.reviews || checks.results).filter(item => /27d56794bd7c8a86|926a5beb2c028185/.test(item.reviewId)).map(item => ({ key: item.reviewId.split(':').at(-1), selectionId: item.reviewId, url: item.url }));
const opening = 'opening:microduck:fa9ee2f71faafb88:12a19b5328586872';
const holeQuery = new URL(cases[0].url).hash.slice('#explorer?'.length);
const holeParams = new URLSearchParams(holeQuery); holeParams.delete('review'); holeParams.set('opening', opening); holeParams.set('detail', 'geometry');
cases.push({ key: 'hip-single-hole', selectionId: opening, url: apiBase + '/#explorer?' + holeParams });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const item of cases) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__PSOP_INSPECTION_DIAGNOSTICS__ = true; window.__inspectionPhase = 'initial'; });
  if (base !== apiBase) await page.route('**/api/**', async route => { const response = await route.fetch({ url: route.request().url().replace(base, apiBase) }); await route.fulfill({ response }); });
  await page.route(/\/(src\/SceneCanvas\.tsx|assets\/index-[^/]+\.js)(\?.*)?$/, async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace(/function updateInspectionVisibility\(runtime, props, force = false\) \{/, 'function updateInspectionVisibility(runtime, props, force = false) {window.__inspectionRuntime=runtime;');
    // Production builds keep the diagnostic export; the linked runtime is
    // only needed by this independent fixed-camera rendering audit.
    if (!source.includes('window.__inspectionRuntime=runtime;')) {
      const match = source.match(/function (\w+)\((\w+),(\w+),(\w+)=!1\)\{let (\w+)=\2\.inspection;if\(!\5\|\|!\2\.ready/);
      if (!match) throw new Error('Could not instrument the source visibility function.');
      source = source.replace(match[0], match[0].replace('{let ', `{window.__inspectionRuntime=${match[2]};let `));
    }
    await route.fulfill({ response, body: source });
  });
  await page.goto(item.url.replace(apiBase, base));
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 335000 });
  await page.waitForFunction(id => window.__inspectionRuntime?.inspection?.selection.id === id && !window.__inspectionRuntime?.flight, item.selectionId, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const canvas = page.locator('.scene-webgl'), bounds = await canvas.boundingBox();
  const initial = await page.evaluate(() => { const r = window.__inspectionRuntime; return { camera: { position: r.camera.position.toArray(), target: r.controls.target.toArray() }, parts: [...r.inspection.translucentPartIds] }; });
  const captures = [];
  const capture = async name => {
    const record = await page.evaluate(() => {
      const r = window.__inspectionRuntime;
      const order = r.renderer.renderLists.get(r.scene, 0).transparent.filter(item => item.object.userData.partId).map(item => item.object.userData.partId);
      const cameraDepth = [...r.records.values()].filter(record => order.includes(record.part.id)).map(record => ({ id: record.part.id, z: (record.mesh.geometry.boundingSphere?.center.clone() || record.mesh.geometry.boundingBox.getCenter(record.mesh.position.clone())).applyMatrix4(record.mesh.matrixWorld).applyMatrix4(r.camera.matrixWorldInverse).z })).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
      return { time: performance.now(), camera: { position: r.camera.position.toArray(), target: r.controls.target.toArray() }, controlsActive: r.controlsActive, cameraQuietMs: performance.now() - r.lastCameraChangeAt, parts: [...r.inspection.translucentPartIds], drawOrder: order, cameraDepth, materialStates: [...r.records.values()].filter(record => record.mesh.material.transparent).map(record => ({ id: record.part.id, opacity: record.mesh.material.opacity, depthWrite: record.mesh.material.depthWrite, alphaToCoverage: record.mesh.material.alphaToCoverage, polygonOffset: record.mesh.material.polygonOffset })) };
    });
    const image = `${item.key}-${name}.png`;
    await canvas.screenshot({ path: path.join(output, image) });
    captures.push({ name, image, ...record });
    await writeFile(path.join(output, item.key + '-checkpoint.json'), JSON.stringify({ item, initial, captures }));
  };
  await capture('00-initial');
  await page.evaluate(() => { window.__inspectionPhase = 'continuous-circle'; });
  const x = bounds.x + bounds.width * .48, y = bounds.y + bounds.height * .5;
  for (let quarter = 0; quarter < 4; quarter++) {
    await page.mouse.move(x, y); await page.mouse.down();
    for (let step = 1; step <= 32; step++) { await page.mouse.move(x + bounds.height / 4 * step / 32, y); await page.waitForTimeout(80); }
    await page.waitForTimeout(300); await capture(`01-moving-${(quarter + 1) * 90}`); await page.mouse.up();
  }
  await page.evaluate(() => { window.__inspectionPhase = 'circle-settle'; });
  await page.waitForTimeout(1600); await capture('02-circle-settled');
  for (const angle of [90, 180, 270, 360]) {
    await page.evaluate(({ angle, initial }) => {
      window.__inspectionPhase = 'settled-' + angle;
      const r = window.__inspectionRuntime, radians = angle * Math.PI / 180;
      const offset = initial.camera.position.map((v, i) => v - initial.camera.target[i]);
      r.flight = null; r.controls.enableDamping = false; r.controls.update();
      r.controls.target.fromArray(initial.camera.target);
      r.camera.position.set(initial.camera.target[0] + offset[0] * Math.cos(radians) - offset[1] * Math.sin(radians), initial.camera.target[1] + offset[0] * Math.sin(radians) + offset[1] * Math.cos(radians), initial.camera.target[2] + offset[2]);
      r.controls.update();
    }, { angle, initial });
    await page.waitForTimeout(1400); await capture(`03-settled-${angle}`);
  }
  const recording = await page.evaluate(() => window.__inspectionDiagnostics.export());
  const circle = recording.frames.filter(frame => frame.phase === 'continuous-circle');
  const membership = frame => frame.translucentPartIds.slice().sort().join('|');
  const membershipChanges = circle.filter((frame, i) => i && membership(frame) !== membership(circle[i - 1])).length;
  const pairOrderChanges = [];
  for (let i = 1; i < circle.length; i++) {
    const previous = circle[i - 1].sourceTransparentSortOrder, current = circle[i].sourceTransparentSortOrder;
    const common = previous.filter(id => current.includes(id));
    if (common.join('|') !== current.filter(id => common.includes(id)).join('|')) pairOrderChanges.push({ time: circle[i].time, previous, current });
  }
  const durationMs = circle.at(-1).time - circle[0].time;
  const settledOrderChecks = captures.filter(item => item.name.startsWith('03-')).map(item => ({ name: item.name, expected: item.cameraDepth.map(entry => entry.id), actual: item.drawOrder, matches: item.cameraDepth.map(entry => entry.id).join('|') === item.drawOrder.join('|') }));
  const result = { item, initial, captures, recording, summary: { durationMs, fps: (circle.length - 1) * 1000 / durationMs, membershipChanges, pairOrderChanges, settledOrderChecks, errors } };
  await writeFile(path.join(output, item.key + '.json'), JSON.stringify(result));
  results.push({ item, summary: result.summary });
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1), null, 2));
  if (membershipChanges || pairOrderChanges.length || settledOrderChecks.some(item => !item.matches) || durationMs < 10000 || errors.length) throw new Error('Source transparency order or visibility changed during the continuous camera gesture.');
  await page.close();
}
await browser.close();
