import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { readRegistry } from '../scripts/dkp.mjs';
import type { PrototypeData } from '../src/types';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const workspace = (await readRegistry()).workspaces.find((w: { id: string }) => w.id === 'microduck');
const snapshot = process.env.PSOP_TEST_SNAPSHOT || workspace.selectedSnapshotId;
const views = [
  { name: '用户分享视角', position: [.1799421, .3237751, .1894222], target: [.0202565, 0, .1454614] },
  { name: '颈部水平视角', position: [.2377647, .3970588, .1774], target: [.026, 0, .1774] },
  { name: '颈部另一侧水平视角', position: [.2377647, -.3970588, .1774], target: [.026, 0, .1774] },
];

for (const view of views) test(`${view.name}下舵机边缘不会穿透颈部连接片`, async ({ page, request }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await request.get(`/api/workspaces/microduck/snapshots/${snapshot}/view`);
  expect(response.ok()).toBe(true);
  const data: PrototypeData = await response.json();
  const side = Math.sign(view.position[1]);
  const plate = data.parts.find(part => part.body === 'neck' && part.meshKey === 'neck' && Math.sign(part.position[1]) === side)!;
  expect(plate).toBeDefined();
  const asset = await request.get(plate.geometryUrl);
  expect(asset.ok()).toBe(true);
  const bytes = await asset.body();
  const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  geometry.computeBoundingBox();
  const matrix = new Matrix4().compose(new Vector3().fromArray(plate.position), new Quaternion().fromArray(plate.quaternion).normalize(), new Vector3().fromArray(plate.scale));
  const bounds = geometry.boundingBox!.clone().applyMatrix4(matrix);
  geometry.dispose();

  await page.goto('/#explorer?' + new URLSearchParams({
    workspace: 'microduck', snapshot, part: 'part:microduck:a682dc3620df43f5',
    explode: '0', detail: 'interfaces', labels: '1', camera: [...view.position, ...view.target].join(','),
  }));
  const scene = page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true', { timeout: 60000 });
  await expect(scene).toHaveAttribute('data-camera-flight', 'settled');
  const rect = (await page.locator('canvas.scene-webgl').boundingBox())!;
  const camera = new PerspectiveCamera(34, rect.width / rect.height, .001, 4);
  camera.up.set(0, 0, 1);
  camera.position.fromArray((await scene.getAttribute('data-camera-position'))!.split(',').map(Number));
  camera.lookAt(new Vector3().fromArray((await scene.getAttribute('data-camera-target'))!.split(',').map(Number)));
  camera.updateMatrixWorld(true);

  // Sample the continuous center of the source plate, away from its four holes.
  // Both motor end-cap levels project into this patch at the reported angles.
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  const points = [-.25, .25].flatMap(x => [-.3, .3].map(z => {
    const p = new Vector3(center.x + x * size.x, side > 0 ? bounds.max.y : bounds.min.y, center.z + z * size.z).project(camera);
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  }));
  const x = Math.ceil(Math.min(...points.map(p => p.x))) + 1;
  const y = Math.ceil(Math.min(...points.map(p => p.y))) + 1;
  const clip = { x, y, width: Math.floor(Math.max(...points.map(p => p.x))) - x - 1, height: Math.floor(Math.max(...points.map(p => p.y))) - y - 1 };
  expect(clip.width).toBeGreaterThan(15);
  expect(clip.height).toBeGreaterThan(15);
  const image = PNG.sync.read(await page.screenshot({ path: testInfo.outputPath('neck-plate.png'), clip, scale: 'css' }));
  const brightness: number[] = [];
  for (let i = 0; i < image.data.length; i += 4) brightness.push((image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3);
  brightness.sort((a, b) => a - b);
  const litSurface = brightness[Math.floor(brightness.length * .9)];
  expect(litSurface).toBeGreaterThan(150);
  expect(brightness[0], '连接片中央不应出现舵机穿透产生的横向暗线').toBeGreaterThan(litSurface - 20);
});
