import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--base', 'http://127.0.0.1:8780');
const apiBase = option('--api', base);
const run = option('--run', 'before');
const output = path.join(root, 'build/stability-review/transparency', run);
await mkdir(output, { recursive: true });
const catalog = await (await fetch(apiBase + '/api/workspaces')).json();
const workspace = catalog.workspaces.find(item => item.deviceId === 'microduck');
const snapshot = option('--snapshot', workspace.selectedSnapshotId);
const data = await (await fetch(`${apiBase}/api/workspaces/${workspace.id}/snapshots/${snapshot}/view`)).json();
const part = data.parts.find(item => item.id === 'part:microduck:fa9ee2f71faafb88');
const openings = data.analysis.circular_openings.filter(item => item.owner_ref === part.id && Math.abs(item.geometry.center[0] - .0175) < 1e-5 && Math.abs(item.geometry.center[2] + .006) < 1e-5);
if (!openings.length) throw new Error('The specified hip opening is missing.');
const opening = openings[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
if (apiBase !== base) await page.route('**/api/**', async route => {
  const response = await route.fetch({ url: route.request().url().replace(base, apiBase) });
  await route.fulfill({ response });
});

// Instrument the unchanged production bundle in memory for the before run.
// The returned mesh/raycast values and their order remain untouched.
if (run === 'before') await page.route('**/assets/index-*.js', async route => {
  const response = await route.fetch();
  let source = await readFile(path.join(root, 'build/stability-review/transparency/baseline-9f714f6.js'), 'utf8').catch(() => response.text());
  const end = source.indexOf('function xh(e,t,n=!1)'), start = source.lastIndexOf('function bh(', end);
  if (start < 0 || end < 0) throw new Error('Baseline bundle no longer matches the audited 9f714f6 render functions.');
  let raycast = source.slice(start, end);
  raycast = raycast.replace('{const ', '{const '); // Preserve the actual emitted declaration style.
  raycast = raycast.replace('{let ', '{let __counts={},__started=performance.now();let ');
  if (!raycast.includes('__started')) raycast = raycast.replace(/\)\{/, '){let __counts={},__started=performance.now();');
  raycast = raycast.replace('&&(s.add(n.id),u=!0)', '&&(__counts[n.id]=(__counts[n.id]||0)+1,s.add(n.id),u=!0)');
  raycast = raycast.replace('return{blockers:s,blockedSamples:c}', 'window.__inspectionRaycasts?.push({time:performance.now(),durationMs:performance.now()-__started,camera:e.camera.position.toArray(),testedCamera:n.toArray(),sampleCount:r.length,hitCounts:__counts,blockedSamples:c,desiredPose:i,translucentPartIds:[...s],phase:window.__inspectionPhase});return{blockers:s,blockedSamples:c}');
  if (!raycast.includes('window.__inspectionRaycasts')) throw new Error('The baseline raycast return was not instrumented.');
  source = source.slice(0, start) + raycast + source.slice(end);
  source = source.replace('function xh(e,t,n=!1){', 'function xh(e,t,n=!1){window.__inspectionRuntime=e;');
  await route.fulfill({ response, body: source });
});
await page.addInitScript(() => {
  window.__PSOP_INSPECTION_DIAGNOSTICS__ = true;
  window.__inspectionFrames = [];
  window.__inspectionRaycasts = [];
  window.__inspectionMaterialStates = [];
  window.__inspectionPhase = 'initial';
  let previousMaterial = '';
  const frame = () => {
    const runtime = window.__inspectionRuntime;
    if (runtime?.ready) {
      const materials = [...runtime.records.values()].map(record => ({ partId: record.part.id, visible: record.mesh.visible, opacity: record.mesh.material.opacity, transparent: record.mesh.material.transparent, depthWrite: record.mesh.material.depthWrite, depthTest: record.mesh.material.depthTest, renderOrder: record.mesh.renderOrder }));
      const key = JSON.stringify(materials);
      if (key !== previousMaterial) { window.__inspectionMaterialStates.push({ time: performance.now(), materials }); previousMaterial = key; }
      window.__inspectionFrames.push({ time: performance.now(), phase: window.__inspectionPhase, camera: { position: runtime.camera.position.toArray(), target: runtime.controls.target.toArray(), quaternion: runtime.camera.quaternion.toArray() }, translucentPartIds: [...runtime.inspection?.translucentPartIds || []], active: !!runtime.inspection, flight: !!runtime.flight, materialStateIndex: window.__inspectionMaterialStates.length - 1 });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
const params = new URLSearchParams({ workspace: workspace.id, snapshot, part: part.id, detail: 'geometry', opening: opening.id, labels: '0', grid: '0', explode: '0', inspectionDiagnostics: '1' });
await page.goto(`${base}/#explorer?${params}`);
await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 335000 });
await page.locator(`.scene-canvas[data-geometry-focus-selection="${opening.id}"]`).waitFor({ timeout: 120000 });
await page.locator('.scene-canvas[data-camera-flight="settled"]').waitFor({ timeout: 120000 });
if (run !== 'before') await page.waitForFunction(() => window.__inspectionDiagnostics?.export().frames.at(-1)?.active && !window.__inspectionDiagnostics?.export().frames.at(-1)?.flight, undefined, { timeout: 120000 });
await page.waitForTimeout(1200);
const canvas = page.locator('.scene-webgl');
const box = await canvas.boundingBox();
const x = box.x + box.width * .54, y = box.y + box.height * .5;
const phase = async name => { await page.evaluate(name => { window.__inspectionPhase = name; }, name); };
const captures = [];
let previousCaptureTime = -1;
const checkpoint = async () => {
  const recorded = await page.evaluate(() => window.__inspectionDiagnostics?.export?.() || ({ frames: window.__inspectionFrames, raycasts: window.__inspectionRaycasts, materialStates: window.__inspectionMaterialStates }));
  await writeFile(path.join(output, 'checkpoint.json'), JSON.stringify({ ...recorded, captures }));
};
const capture = async name => {
  const time = await page.evaluate(() => performance.now());
  if (time <= previousCaptureTime) throw new Error('The page reloaded during the frame recording; this run is invalid.');
  previousCaptureTime = time;
  captures.push({ name, time });
  await canvas.screenshot({ path: path.join(output, name + '.png') });
  await checkpoint();
};
await phase('initial-selected');
await capture('01-initial-selected');
await page.waitForTimeout(1000);
await phase('focus');
await page.keyboard.press('f');
await page.waitForTimeout(2000);
await capture('02-focus');
await phase('rotate-10s');
await page.mouse.move(x, y); await page.mouse.down();
for (let i = 0; i < 100; i++) {
  await page.mouse.move(x + Math.sin(i * .07) * box.width * .19, y + Math.sin(i * .047) * box.height * .13);
  await page.waitForTimeout(100);
  if (i === 45) await capture('03-during-rotation');
}
await page.mouse.up();
await phase('rotation-settle'); await page.waitForTimeout(1800); await capture('04-after-rotation');
await phase('zoom-10s');
for (let i = 0; i < 100; i++) { await page.mouse.wheel(0, i < 50 ? -8 : 8); await page.waitForTimeout(100); }
await phase('zoom-settle'); await page.waitForTimeout(1800); await capture('05-after-zoom');
await phase('alternate');
for (let i = 0; i < 5; i++) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + (i % 2 ? -100 : 100), y + (i % 2 ? -50 : 50), { steps: 20 });
  await page.mouse.up(); await page.mouse.wheel(0, i % 2 ? 60 : -60); await page.waitForTimeout(1000);
}
await page.waitForTimeout(1500); await capture('06-after-alternate');
await phase('other-opening');
const choices = await page.locator('select').evaluateAll(items => items.map(item => ({ label: item.getAttribute('aria-label'), options: [...item.options].map(option => option.value) })));
const positionPicker = choices.find(item => item.options.includes(opening.id));
const otherOpening = positionPicker?.options.find(id => id.startsWith('opening:') && id !== opening.id);
if (positionPicker && otherOpening) await page.locator(`select[aria-label="${positionPicker.label}"]`).selectOption(otherOpening);
await page.waitForTimeout(2000); await capture('07-other-opening');
await phase('restore');
await page.locator('.scene-inspection-notice button').click();
await page.waitForTimeout(2000); await capture('08-restored');
await phase('clear-selection');
await page.getByRole('button', { name: '\u6e05\u9664\u51e0\u4f55\u6807\u6ce8', exact: true }).click();
await page.waitForTimeout(600); await capture('09-cleared-selection');
const recorded = await page.evaluate(() => window.__inspectionDiagnostics?.export?.() || ({ frames: window.__inspectionFrames, raycasts: window.__inspectionRaycasts, materialStates: window.__inspectionMaterialStates }));
const signature = frame => frame.translucentPartIds.slice().sort().join('|');
const transitions = recorded.frames.filter((frame, i, all) => i && signature(frame) !== signature(all[i - 1])).map(frame => ({ time: frame.time, phase: frame.phase, parts: frame.translucentPartIds }));
const phases = [...new Set(recorded.frames.map(frame => frame.phase))].map(phase => {
  const frames = recorded.frames.filter(frame => frame.phase === phase);
  const duration = frames.at(-1)?.time - frames[0]?.time;
  return { phase, durationMs: duration, frames: frames.length, fps: duration > 0 ? (frames.length - 1) * 1000 / duration : 0, transitions: transitions.filter(item => item.phase === phase).length };
});
await writeFile(path.join(output, 'frames.json'), JSON.stringify({ source: { head: run === 'before' ? '9f714f6e21f59b0c86f83dfc637cda2b319f2191' : 'working-tree', packageVersion: data.meta.packageVersion, digest: data.meta.packageDigest, snapshot, base, apiBase, run }, selection: { part, opening, otherOpeningRef: otherOpening || null }, ...recorded, transitions, phases, captures, errors }));
await writeFile(path.join(output, 'summary.json'), JSON.stringify({ raycasts: recorded.raycasts.length, phases, transitions, errors }, null, 2));
console.log(JSON.stringify({ output, phases, transitions: transitions.length, errors }, null, 2));
if (!recorded.frames.length || !recorded.raycasts.length) throw new Error('Frame and per-part obstruction measurements are required.');
if (run !== 'before' && phases.some(item => ['rotate-10s', 'zoom-10s'].includes(item.phase) && (item.durationMs < 10000 || item.transitions > 0))) throw new Error('Continuous camera motion changed the stable transparency set.');
const finalMaterials = recorded.materialStates.at(-1)?.materials || [];
if (finalMaterials.some(item => item.opacity !== 1 || item.transparent || !item.depthWrite || item.alphaToCoverage || item.alphaHash)) throw new Error('Source material state was not restored after leaving the geometry selection.');
if (errors.length) throw new Error(errors.join('\n'));
await browser.close();
