import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--base', 'http://127.0.0.1:8780');
const apiBase = option('--api', base);
const mode = option('--run', 'before');
const output = path.join(root, 'build/stability-review/transparency', 'render-probe-' + mode);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
if (apiBase !== base) await page.route('**/api/**', async route => {
  const response = await route.fetch({ url: route.request().url().replace(base, apiBase) });
  await route.fulfill({ response });
});
await page.route(/\/(assets\/index-[^/]+\.js|src\/SceneCanvas\.tsx)(\?.*)?$/, async route => {
  const response = await route.fetch();
  const original = mode === 'before' ? await readFile(path.join(root, 'build/stability-review/transparency/baseline-9f714f6.js'), 'utf8') : await response.text();
  const source = original.replace('function xh(e,t,n=!1){', 'function xh(e,t,n=!1){window.__inspectionRuntime=e;window.__applySourcePresentation=()=>dh(e,t);').replace(/function updateInspectionVisibility\(runtime, props, force = false\) \{/, 'function updateInspectionVisibility(runtime, props, force = false) {window.__inspectionRuntime=runtime;window.__applySourcePresentation=()=>applySourcePresentation(runtime,props);');
  await route.fulfill({ response, body: source });
});
await page.goto(base + '/#explorer?' + new URLSearchParams({ workspace: 'microduck', snapshot: 'dkp-1c8eeda600249ce33b99', part: 'part:microduck:fa9ee2f71faafb88', detail: 'geometry', opening: 'opening:microduck:fa9ee2f71faafb88:12a19b5328586872', labels: '0', grid: '0' }));
await page.locator('[data-scene-ready="true"][data-camera-flight="settled"]').waitFor({ timeout: 335000 });
await page.waitForTimeout(1000);
const canvas = page.locator('.scene-webgl');
await page.evaluate(() => { window.__inspectionRuntime.inspection.updatedAt = Infinity; });
await canvas.screenshot({ path: path.join(output, '01-alpha-blended.png') });
const result = [];
if (mode === 'before') for (const mode of ['coverage', 'hash']) {
  const state = await page.evaluate(mode => {
    const runtime = window.__inspectionRuntime;
    const materials = [];
    for (const record of runtime.records.values()) if (record.mesh.material.opacity < 1) {
      const material = record.mesh.material;
      material.transparent = false;
      material.depthWrite = true;
      material.alphaToCoverage = mode === 'coverage';
      material.alphaHash = mode === 'hash';
      material.needsUpdate = true;
      materials.push({ partId: record.part.id, opacity: material.opacity, alphaToCoverage: material.alphaToCoverage, alphaHash: material.alphaHash });
    }
    return { mode, materials, samples: runtime.renderer.getContext().getParameter(runtime.renderer.getContext().SAMPLES) };
  }, mode);
  await page.waitForTimeout(600);
  await canvas.screenshot({ path: path.join(output, '02-' + mode + '.png') });
  result.push(state);
}
const before = JSON.parse(await readFile(path.join(root, 'build/stability-review/transparency/before/frames.json'), 'utf8'));
const pose = before.frames.find(frame => frame.phase === 'rotation-settle' && frame.translucentPartIds.length >= 3);
if (!pose) throw new Error('The independently recorded multi-obstruction pose is missing.');
await page.evaluate(pose => {
  const runtime = window.__inspectionRuntime;
  runtime.flight = null;
  runtime.controls.enableDamping = false; runtime.controls.update();
  runtime.camera.position.fromArray(pose.camera.position); runtime.controls.target.fromArray(pose.camera.target); runtime.controls.update();
  for (const record of runtime.records.values()) { record.mesh.material.alphaHash = false; record.mesh.material.alphaToCoverage = false; record.mesh.material.needsUpdate = true; }
  runtime.inspection.translucentPartIds = new Set(pose.translucentPartIds);
  window.__applySourcePresentation();
  runtime.inspection.updatedAt = Infinity; runtime.inspection.visibilitySettled = true;
}, pose);
await page.waitForTimeout(300);
await canvas.screenshot({ path: path.join(output, '03-multi-default-order.png') });
const ordering = await page.evaluate(() => {
  const runtime = window.__inspectionRuntime, gl = runtime.renderer.getContext();
  const render = () => {
    runtime.renderer.render(runtime.scene, runtime.camera);
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const first = render();
  const sourceOrder = runtime.renderer.renderLists.get(runtime.scene, 0).transparent.filter(item => item.object.userData.partId).map(item => item.object.userData.partId);
  runtime.renderer.setTransparentSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || b.id - a.id);
  const second = render();
  let changedPixels = 0, maxDelta = 0, squaredError = 0;
  for (let i = 0; i < first.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 3; c++) { const delta = Math.abs(first[i + c] - second[i + c]); maxDelta = Math.max(maxDelta, delta); squaredError += delta * delta; changed ||= delta > 2; }
    if (changed) changedPixels++;
  }
  return { sourceOrder, translucentPartIds: [...runtime.inspection.translucentPartIds], camera: { position: runtime.camera.position.toArray(), target: runtime.controls.target.toArray() }, changedPixels, maxDelta, rmse: Math.sqrt(squaredError / (first.length * .75)), totalPixels: first.length / 4 };
});
await canvas.screenshot({ path: path.join(output, '04-multi-reversed-order.png') });
result.push({ ordering });
await writeFile(path.join(output, 'probe.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, result }, null, 2));
await browser.close();
