import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const phase = process.argv[2] || 'before';
if (!/^[a-z][a-z0-9-]*$/.test(phase)) throw new Error('Use a simple capture phase name.');
const origin = process.env.PSOP_CAPTURE_BASE_URL || 'http://127.0.0.1:8780';
const artifactDir = path.join(repo, 'build/interface-selection', phase);
if (phase === 'before' && fs.existsSync(path.join(artifactDir, 'capture.json'))) throw new Error('The before capture is frozen. Use another phase name for additional captures.');
fs.mkdirSync(artifactDir, { recursive: true });
const catalog = await (await fetch(origin + '/api/workspaces')).json();
const workspace = catalog.workspaces.find(item => item.id === 'microduck');
if (!workspace?.snapshots.length) throw new Error('Prepare and register the Microduck workspace first.');
const baselineFile = path.join(repo, 'build/interface-selection/baseline-view.json');
if (!fs.existsSync(baselineFile)) {
  const initialSnapshot = process.argv[3] || workspace.selectedSnapshotId || workspace.snapshots.at(-1).id;
  const response = await fetch(`${origin}/api/workspaces/microduck/snapshots/${initialSnapshot}/view`, { signal: AbortSignal.timeout(330000) });
  if (!response.ok) throw new Error(await response.text());
  fs.writeFileSync(baselineFile, JSON.stringify(await response.json()));
}
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const part = baseline.parts.find(item => item.meshKey === 'right_shell');
if (!part) throw new Error('The baseline must contain the source right_shell instance.');
const baselineSnapshot = part.geometryUrl.split('/')[5];
const snapshot = process.argv[3] || (phase === 'before' ? baselineSnapshot : workspace.selectedSnapshotId);
const quaternion = new Quaternion().fromArray(part.quaternion);
const targets = [
  { key: 'y42-z52', center: [-.0003, .042, .0525], axis: [1, 0, 0], radius: .0008 },
  { key: 'x25-y9', center: [-.0255, -.0095, .0425], axis: [0, 0, 1], radius: .0011 },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const records = [];
const normalCameraFile = path.join(repo, 'build/interface-selection/normal-camera.json');
let normalCamera;
if (fs.existsSync(normalCameraFile)) {
  normalCamera = JSON.parse(fs.readFileSync(normalCameraFile, 'utf8')).camera;
} else {
  const query = new URLSearchParams({ workspace: 'microduck', snapshot: baselineSnapshot, part: part.id, detail: 'geometry', labels: '0', grid: '0', explode: '0' });
  await page.goto(origin + '/#explorer?' + query, { timeout: 360000 });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 360000 });
  await page.getByRole('button', { name: '适应全部模型', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.cameraFlight === 'settled');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  const exported = JSON.parse(fs.readFileSync(await (await downloading).path(), 'utf8'));
  await page.locator('.toast').waitFor({ state: 'hidden' });
  normalCamera = [...exported.camera.position, ...exported.camera.target];
  fs.writeFileSync(normalCameraFile, JSON.stringify({ camera: normalCamera, sourceSnapshot: baselineSnapshot, sourceDigest: baseline.meta.packageDigest, method: 'Fit all source assembly bounds with the unchanged fitAll framing implementation.' }, null, 2) + '\n');
}
for (const target of targets) {
  const opening = baseline.analysis.circular_openings.find(item => item.owner_ref === part.id && item.geometry.center.every((value, i) => Math.abs(value - target.center[i]) < 1e-5));
  if (!opening) throw new Error(`Missing baseline target ${target.key}`);
  const world = new Vector3().fromArray(opening.geometry.center).applyQuaternion(quaternion).add(new Vector3().fromArray(part.position));
  const direction = new Vector3().fromArray(target.axis).applyQuaternion(quaternion).normalize();
  const tangent = new Vector3(1, .3, .2).addScaledVector(direction, -new Vector3(1, .3, .2).dot(direction)).normalize();
  for (const variant of [
    { key: 'normal', distance: .24, isolation: false, selected: true, local: false, angle: .25 },
    { key: 'isolated', distance: .055, isolation: true, selected: true, local: false, angle: .25 },
    { key: 'close', distance: .018, isolation: true, selected: true, local: false, angle: .25 },
    { key: 'oblique', distance: .028, isolation: true, selected: true, local: false, angle: -.1 },
    { key: 'local', distance: .028, isolation: false, selected: true, local: true, angle: .25 },
    { key: 'cleared', distance: .018, isolation: true, selected: false, local: false, angle: .25 },
  ]) {
    const position = world.clone().addScaledVector(direction, variant.distance).addScaledVector(tangent, variant.distance * variant.angle);
    const camera = variant.key === 'normal' ? normalCamera : [...position.toArray(), ...world.toArray()];
    const query = new URLSearchParams({ workspace: 'microduck', snapshot, part: part.id, detail: 'geometry', labels: '0', grid: '0', explode: '0', camera: camera.join(',') });
    if (variant.selected) query.set('opening', opening.id);
    if (variant.isolation) query.set('isolate', part.id);
    if (variant.local) query.set('inspection', '1');
    await page.goto(origin + '/#explorer?' + query, { timeout: 360000 });
    const scene = page.locator('.scene-canvas');
    await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 360000 });
    await page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.cameraFlight === 'settled');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const image = `${target.key}-${variant.key}.png`;
    await page.screenshot({ path: path.join(artifactDir, image) });
    await scene.screenshot({ path: path.join(artifactDir, `${target.key}-${variant.key}-scene.png`) });
    records.push({ image, target: target.key, variant: variant.key, openingRef: opening.id, camera, url: page.url(), scene: await scene.evaluate(element => ({ ...element.dataset })) });
  }
}
fs.writeFileSync(path.join(artifactDir, 'capture.json'), JSON.stringify({ snapshot, baselineDigest: baseline.meta.packageDigest, partRef: part.id,
  capturedAtUtc: new Date().toISOString(), rendererSha256: createHash('sha256').update(fs.readFileSync(path.join(repo, 'apps/workbench/src/SceneCanvas.tsx'))).digest('hex'), records, errors }, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify({ phase, snapshot, records: records.length, errors, artifactDir }));
