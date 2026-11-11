import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { readRegistry } from '../scripts/dkp.mjs';
import { planExplosion, type ExplosionPart } from '../src/explosion-layout';
import { resolveGeometry } from '../src/mechanics-model';
import { referenceView } from '../src/reference-alignment';
import type { PrototypeData } from '../src/types';

const workspace = (await readRegistry()).workspaces.find((w: { id: string }) => w.id === 'microduck');
const snapshot = process.env.PSOP_TEST_SNAPSHOT || workspace.selectedSnapshotId;
let data: PrototypeData, entries: ExplosionPart[], offsets: Map<string, Vector3>;

test.beforeAll(async () => {
  test.setTimeout(360000);
  const base = 'http://127.0.0.1:8780';
  const response = await fetch(`${base}/api/workspaces/microduck/snapshots/${snapshot}/view`);
  expect(response.ok).toBe(true); data = referenceView(await response.json());
  const boxes = new Map<string, Box3>();
  await Promise.all([...new Set(data.parts.map(part => part.geometryUrl))].map(async url => {
    const asset = await fetch(base + url); expect(asset.ok).toBe(true);
    const geometry = new STLLoader().parse(await asset.arrayBuffer());
    geometry.computeBoundingBox(); boxes.set(url, geometry.boundingBox!.clone()); geometry.dispose();
  }));
  entries = data.parts.map(part => ({ part, bounds: boxes.get(part.geometryUrl)!.clone().applyMatrix4(new Matrix4().compose(new Vector3().fromArray(part.position), new Quaternion().fromArray(part.quaternion).normalize(), new Vector3().fromArray(part.scale))) }));
  offsets = planExplosion(entries, data.bodies, data.joints);
});

async function exported(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  return JSON.parse(fs.readFileSync((await (await event).path())!, 'utf8'));
}
async function settled(page: Page) {
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight', 'settled');
}
async function allInFrame(page: Page, pose: { position: number[]; target: number[] }, amount: number) {
  const rect = (await page.locator('canvas.scene-webgl').boundingBox())!;
  const camera = new PerspectiveCamera(34, rect.width / rect.height, .0001, 4);
  camera.up.set(0, 0, 1); camera.position.fromArray(pose.position); camera.lookAt(new Vector3().fromArray(pose.target)); camera.updateMatrixWorld(true);
  for (const entry of entries) {
    const box = entry.bounds.clone().translate(offsets.get(entry.part.id)!.clone().multiplyScalar(amount));
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new Vector3(x, y, z).project(camera);
      expect(Math.abs(point.x), entry.part.meshKey).toBeLessThan(.95);
      expect(Math.abs(point.y), entry.part.meshKey).toBeLessThan(.95);
    }
  }
}

test('真实模型完整展开时各部件分离，小件保持在附近', () => {
  expect(entries).toHaveLength(data.meta.counts.parts);
  const all = new Box3(); entries.forEach(entry => all.union(entry.bounds));
  const sourceSize = all.getSize(new Vector3()), span = Math.max(...sourceSize.toArray());
  const boxes = entries.map(entry => entry.bounds.clone().translate(offsets.get(entry.part.id)!));
  const extent = new Box3(); boxes.forEach(box => extent.union(box));
  expect(extent.getSize(new Vector3()).length() / sourceSize.length()).toBeLessThan(3);
  for (let i = 0; i < boxes.length; i++) {
    let nearest = Infinity;
    for (let j = 0; j < boxes.length; j++) if (i !== j) {
      expect(boxes[i].intersectsBox(boxes[j]), `${entries[i].part.meshKey} / ${entries[j].part.meshKey}`).toBe(false);
      nearest = Math.min(nearest, Math.hypot(...(['x', 'y', 'z'] as const).map(key => Math.max(0, boxes[i].min[key] - boxes[j].max[key], boxes[j].min[key] - boxes[i].max[key]))));
    }
    expect(nearest, entries[i].part.meshKey).toBeLessThan(span * .04);
  }
});

test('腿部舵机保持所属关系，左右脚的踝、脚体和脚底保持竖直分层', () => {
  for (const body of data.bodies) {
    const motors = entries.filter(entry => entry.part.body === body.name && entry.part.kind === 'actuator');
    for (const motor of motors.slice(1)) {
      expect(offsets.get(motor.part.id)!.distanceTo(offsets.get(motors[0].part.id)!)).toBeLessThan(1e-8);
    }
  }
  for (const [leg, ankle, side] of [['leg', 'ankle_left', 'left'], ['leg_2', 'ankle_right', 'right']]) {
    const motor = entries.find(entry => entry.part.body === leg && entry.part.kind === 'actuator')!;
    const link = entries.find(entry => entry.part.body === leg && entry.part.meshKey === 'leg')!;
    const layers = ['ankle', 'foot', 'sole'].map(name => entries.find(entry => entry.part.body === ankle && entry.part.meshKey === `${name}_${side}`)!);
    expect(Math.abs(offsets.get(motor.part.id)!.z - offsets.get(link.part.id)!.z)).toBeLessThan(1e-8);
    for (const layer of layers) {
      const relative = offsets.get(layer.part.id)!.clone().sub(offsets.get(motor.part.id)!);
      expect(Math.hypot(relative.x, relative.y)).toBeLessThan(1e-8);
    }
    for (const amount of [.25, .5, .75, 1]) {
      const centers = layers.map(layer => layer.bounds.getCenter(new Vector3()).addScaledVector(offsets.get(layer.part.id)!, amount));
      expect(centers[0].z).toBeGreaterThan(centers[1].z);
      expect(centers[1].z).toBeGreaterThan(centers[2].z);
      expect(Math.abs(centers[1].x - centers[2].x)).toBeLessThan(.001);
      expect(Math.abs(centers[1].y - centers[2].y)).toBeLessThan(.001);
    }
  }
});

test('左右腿保持镜像展开，部件在中间展开程度也不会换到另一侧', () => {
  const bodyPairs = [['yaw2roll', 'bearing_roll'], ['hip_l', 'hip_l_2'], ['upper_leg_left', 'upper_leg_right'], ['leg', 'leg_2'], ['ankle_left', 'ankle_right']];
  for (const [left, right] of bodyPairs) for (const entry of entries.filter(entry => entry.part.body === left)) {
    const key = entry.part.meshKey.replace(/_(left|right)$/, '');
    const point = entry.bounds.getCenter(new Vector3());
    const peers = entries.filter(peer => peer.part.body === right && peer.part.meshKey.replace(/_(left|right)$/, '') === key);
    const mirrorDistance = (peer: ExplosionPart) => { const p = peer.bounds.getCenter(new Vector3()); return Math.hypot(p.x - point.x, p.y + point.y, p.z - point.z); };
    const peer = peers.sort((a, b) => mirrorDistance(a) - mirrorDistance(b))[0];
    expect(peer, entry.part.meshKey).toBeDefined();
    const a = offsets.get(entry.part.id)!, b = offsets.get(peer.part.id)!;
    expect(Math.hypot(a.x - b.x, a.y + b.y, a.z - b.z), entry.part.meshKey).toBeLessThan(1e-6);
  }
  for (const amount of [.25, .5, .75, 1]) for (const entry of entries.filter(entry => ['left-leg', 'right-leg'].includes(entry.part.group))) {
    const point = entry.bounds.getCenter(new Vector3()).addScaledVector(offsets.get(entry.part.id)!, amount);
    expect(point.y * (entry.part.group === 'left-leg' ? 1 : -1), entry.part.meshKey).toBeGreaterThan(0);
  }
});

test('展开按钮、滑杆和快捷键保持全模型可见，复原恢复原始装配', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#explorer?' + new URLSearchParams({ workspace: 'microduck', snapshot, labels: '0', explode: '0' }));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 60000 }); await settled(page);
  const assembled = await exported(page);
  const slider = page.getByRole('slider', { name: '爆炸展开程度' });
  await page.getByRole('button', { name: '展开', exact: true }).click();
  await expect(slider).toHaveValue('100'); await settled(page);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-source-placement', 'exploded');
  const expanded = await exported(page); await allInFrame(page, expanded.camera, 1);
  expect(expanded.inspection.visiblePartIds).toHaveLength(data.parts.length);

  await page.getByRole('button', { name: '复原装配', exact: true }).click();
  await expect(slider).toHaveValue('0'); await settled(page);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-source-placement', 'restored');
  const restored = await exported(page); await allInFrame(page, restored.camera, 0);
  for (const key of ['position', 'target']) restored.camera[key].forEach((n: number, i: number) => expect(n).toBeCloseTo(assembled.camera[key][i], 7));

  await slider.focus(); await page.keyboard.press('End'); await settled(page);
  await expect(slider).toHaveValue('100'); await allInFrame(page, (await exported(page)).camera, 1);
  await page.locator('.view-selector').click(); await settled(page);
  await allInFrame(page, (await exported(page)).camera, 1);
  await page.keyboard.press('e'); await expect(slider).toHaveValue('0'); await settled(page);
  await page.keyboard.press('e'); await expect(slider).toHaveValue('100'); await settled(page);
  await allInFrame(page, (await exported(page)).camera, 1);
  expect(errors).toEqual([]);
});

test('局部查看中展开后仍能看到接口，返回装配后重新容纳完整模型', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const part = data.parts.find(part => part.meshKey === 'motor_support')!;
  const item = data.assembly!.interfaces.find(item => item.owner_ref === part.id)!;
  await page.goto('/#explorer?' + new URLSearchParams({ workspace: 'microduck', snapshot, part: part.id, interface: item.id, labels: '0', explode: '0' }));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 60000 }); await settled(page);
  await page.getByRole('button', { name: '定位所选几何', exact: true }).click(); await settled(page);
  expect((await exported(page)).inspection.mode).toBe('local');
  const slider = page.getByRole('slider', { name: '爆炸展开程度' });
  await slider.focus(); await page.keyboard.press('End'); await settled(page);
  const focused = await exported(page); expect(focused.inspection.mode).toBe('local');
  const geometry = resolveGeometry(data, focused.geometrySelection)!;
  const matrix = new Matrix4().compose(new Vector3().fromArray(part.position), new Quaternion().fromArray(part.quaternion).normalize(), new Vector3().fromArray(part.scale));
  const point = new Vector3().fromArray(geometry.position).applyMatrix4(matrix).add(offsets.get(part.id)!);
  const rect = (await page.locator('canvas.scene-webgl').boundingBox())!;
  const camera = new PerspectiveCamera(34, rect.width / rect.height, .0001, 4);
  camera.up.set(0, 0, 1); camera.position.fromArray(focused.camera.position); camera.lookAt(new Vector3().fromArray(focused.camera.target)); camera.updateMatrixWorld(true);
  point.project(camera); expect(Math.abs(point.x)).toBeLessThan(.95); expect(Math.abs(point.y)).toBeLessThan(.95);
  await page.getByRole('button', { name: '返回装配', exact: true }).click(); await settled(page);
  const returned = await exported(page); expect(returned.inspection.mode).toBe('inactive');
  await allInFrame(page, returned.camera, 1);
});
