import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = 'http://127.0.0.1:8792', apiBase = 'http://127.0.0.1:8780';
const output = path.join(root, 'build/stability-review/transparency/relation-render-probe');
await mkdir(output, { recursive: true });
const checks = JSON.parse(await readFile(path.join(root, 'build/stability-review/relations/after/checks.json'), 'utf8'));
const cases = (Array.isArray(checks) ? checks : checks.checks || checks.reviews || checks.results).filter(item => /27d56794bd7c8a86|926a5beb2c028185/.test(item.reviewId));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const item of cases) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(base, apiBase) });
    await route.fulfill({ response });
  });
  await page.route('**/src/SceneCanvas.tsx', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/function updateInspectionVisibility\(runtime, props, force = false\) \{/, 'function updateInspectionVisibility(runtime, props, force = false) {window.__inspectionRuntime=runtime;window.__applySourcePresentation=()=>applySourcePresentation(runtime,props);');
    await route.fulfill({ response, body: source });
  });
  await page.goto(item.url.replace(apiBase, base));
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 335000 });
  await page.waitForFunction(id => window.__inspectionRuntime?.inspection?.selection.id === id && !window.__inspectionRuntime?.flight, item.reviewId, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const snapshot = await page.evaluate(() => {
    const runtime = window.__inspectionRuntime;
    runtime.inspection.updatedAt = Infinity; runtime.inspection.visibilitySettled = true;
    const materials = [...runtime.records.values()].map(record => ({ partId: record.part.id, kind: record.part.kind, name: record.part.name, meshKey: record.part.meshKey, visible: record.mesh.visible, opacity: record.mesh.material.opacity, transparent: record.mesh.material.transparent, alphaHash: record.mesh.material.alphaHash, alphaToCoverage: record.mesh.material.alphaToCoverage, depthWrite: record.mesh.material.depthWrite, depthTest: record.mesh.material.depthTest, polygonOffset: record.mesh.material.polygonOffset, polygonOffsetFactor: record.mesh.material.polygonOffsetFactor, polygonOffsetUnits: record.mesh.material.polygonOffsetUnits, color: record.mesh.material.color.getHex() }));
    const overlays = [];
    for (const group of [runtime.geometryOverlay, ...runtime.peerGeometryOverlays]) group?.traverse(object => {
      if (object.material) overlays.push({ owner: group.parent?.userData.partId, type: object.type, vertices: object.geometry?.getAttribute('position')?.count, material: { opacity: object.material.opacity, color: object.material.color?.getHex(), transparent: object.material.transparent, depthWrite: object.material.depthWrite, depthTest: object.material.depthTest, polygonOffset: object.material.polygonOffset } });
    });
    return { camera: { position: runtime.camera.position.toArray(), target: runtime.controls.target.toArray() }, translucentPartIds: [...runtime.inspection.translucentPartIds], contextPartIds: [...runtime.inspection.contextPartIds], materials, overlays, samples: runtime.coverageSamples };
  });
  const captures = [];
  for (const variant of ['original', 'source-only', 'actuator-priority', 'source-priority', 'old-alpha', 'old-alpha-source', 'opaque-source']) {
    await page.evaluate(({ variant, snapshot }) => {
      const runtime = window.__inspectionRuntime;
      for (const state of snapshot.materials) {
        const record = runtime.records.get(state.partId), material = record.mesh.material;
        for (const name of ['opacity', 'transparent', 'alphaHash', 'alphaToCoverage', 'depthWrite', 'depthTest', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']) material[name] = state[name];
        material.color.setHex(state.color); material.needsUpdate = true;
        if (variant.includes('priority') && record.part.kind === 'actuator' && material.depthWrite) material.polygonOffset = true;
        if (variant.startsWith('old-alpha') && material.opacity < 1) {
          material.transparent = true; material.alphaHash = false; material.alphaToCoverage = false; material.depthWrite = false;
          material.opacity = runtime.inspection.contextPartIds.has(record.part.id) ? .18 : .08;
          material.polygonOffset = false;
        }
        if (variant === 'opaque-source') { material.transparent = false; material.opacity = 1; material.alphaHash = false; material.alphaToCoverage = false; material.depthWrite = true; }
      }
      for (const group of [runtime.geometryOverlay, ...runtime.peerGeometryOverlays]) if (group) group.visible = !['source-only', 'source-priority', 'old-alpha-source', 'opaque-source'].includes(variant);
      runtime.renderer.shadowMap.needsUpdate = true;
    }, { variant, snapshot });
    await page.waitForTimeout(250);
    const key = item.reviewId.split(':').at(-1);
    const filename = `${key}-${variant}.png`;
    await page.locator('.scene-webgl').screenshot({ path: path.join(output, filename) });
    const metrics = await page.evaluate(() => {
      const runtime = window.__inspectionRuntime, gl = runtime.renderer.getContext();
      runtime.renderer.render(runtime.scene, runtime.camera);
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const areas = { center: [.25, .2, .8, .8], strip: [.63, .15, .98, .68] };
      const result = {};
      for (const [name, roi] of Object.entries(areas)) {
        let count = 0, white = 0, luminance = 0, chroma = 0, edges = 0;
        for (let y = Math.round(height * roi[1]); y < height * roi[3]; y++) for (let x = Math.round(width * roi[0]); x < width * roi[2]; x++) {
          const i = ((height - 1 - y) * width + x) * 4, rgb = [pixels[i], pixels[i + 1], pixels[i + 2]], max = Math.max(...rgb), min = Math.min(...rgb);
          count++; white += min > 245 ? 1 : 0; luminance += rgb.reduce((a, b) => a + b, 0) / 3; chroma += max - min;
          if (x > width * roi[0] + 1 && Math.abs(pixels[i] - pixels[i - 4]) + Math.abs(pixels[i + 1] - pixels[i - 3]) + Math.abs(pixels[i + 2] - pixels[i - 2]) > 40) edges++;
        }
        result[name] = { count, whiteFraction: white / count, meanBrightness: luminance / count, meanChroma: chroma / count, horizontalEdgeFraction: edges / count };
      }
      return result;
    });
    captures.push({ variant, image: filename, metrics });
  }
  results.push({ reviewId: item.reviewId, url: item.url, snapshot, captures });
  await writeFile(path.join(output, 'probes.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ reviewId: item.reviewId, materials: snapshot.materials.filter(item => item.opacity < 1), captures }, null, 2));
  await page.close();
}
await browser.close();
