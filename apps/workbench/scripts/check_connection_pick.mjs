import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import ts from 'typescript';

const origin = process.env.PSOP_ORIGIN || 'http://127.0.0.1:8780';
const repo = path.resolve(import.meta.dirname, '../../..');
const out = path.join(repo, 'build/connection-sites-review/picking'); fs.mkdirSync(out, { recursive: true });
const catalog = await (await fetch(origin + '/api/workspaces')).json();
const snapshot = catalog.workspaces.find(w => w.id === 'microduck').selectedSnapshotId;
const data = await (await fetch(`${origin}/api/workspaces/microduck/snapshots/${snapshot}/view`)).json();
assert.equal(data.meta.validation.profile, 'psop.hardware.source-model/1.12');
const source = fs.readFileSync(path.join(repo, 'apps/workbench/src/connection-sites.ts'), 'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const part = data.parts.find(p => p.id === 'part:microduck:fa9ee2f71faafb88');
const site = api.connectionSitesFor(data, part.id).find(s => s.name === 'X 向四孔组');
const bytes = await (await fetch(new URL(part.geometryUrl, origin))).arrayBuffer();
const sha = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
assert.equal(sha, data.sources.find(s => s.id === part.sourceIds.at(-1)).digest);
const geometry = new STLLoader().parse(bytes);
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
mesh.position.fromArray(part.position); mesh.quaternion.fromArray(part.quaternion); mesh.scale.fromArray(part.scale); mesh.updateMatrixWorld();
const center = new THREE.Vector3().fromArray(site.position).applyMatrix4(mesh.matrixWorld);
const axis = new THREE.Vector3().fromArray(site.axis).transformDirection(mesh.matrixWorld);
const tangent = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
await page.addInitScript(() => localStorage.setItem('psop.workbench.inspector-width', '360'));
const positions = geometry.getAttribute('position');
let record;
for (const sign of [-1, 1]) {
  const position = center.clone().addScaledVector(axis, sign * .035).addScaledVector(tangent, .007);
  const query = new URLSearchParams({ workspace: 'microduck', snapshot, part: part.id, connectionSite: site.id, detail: 'interfaces', isolate: part.id, labels: '0', grid: '0', camera: [...position.toArray(), ...center.toArray()].join(',') });
  await page.goto(`${origin}/#explorer?${query}`);
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 330000 });
  const box = await page.locator('.scene-canvas canvas').boundingBox();
  const camera = new THREE.PerspectiveCamera(34, box.width / box.height, .001, 20);
  camera.up.set(0, 0, 1); camera.position.copy(position); camera.lookAt(center); camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const member of site.members) {
    for (const triangle of member.triangles) {
      const local = new THREE.Vector3();
      for (let v = 0; v < 3; v++) local.add(new THREE.Vector3().fromBufferAttribute(positions, triangle * 3 + v));
      const world = local.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);
      ray.set(position, world.clone().sub(position).normalize());
      const first = ray.intersectObject(mesh, false)[0];
      if (!first || !member.triangles.includes(first.faceIndex)) continue;
      const projected = world.clone().project(camera);
      if (Math.abs(projected.x) > .9 || Math.abs(projected.y) > .75) continue;
      const pixel = { x: box.x + (projected.x + 1) * box.width / 2, y: box.y + (1 - projected.y) * box.height / 2 };
      await page.mouse.click(pixel.x, pixel.y);
      await page.waitForFunction(id => document.querySelector('.scene-canvas')?.getAttribute('data-connection-member') === id, member.id, { timeout: 5000 });
      assert.equal(await page.locator(`button[data-connection-member="${member.id}"]`).getAttribute('aria-pressed'), 'true');
      record = { snapshot, version: data.meta.packageVersion, packageDigest: data.meta.packageDigest, part: part.id, geometrySha256: sha, site: site.id, member: member.id, independentlyProjectedSourceTriangle: triangle, firstVisibleSourceTriangle: first.faceIndex, pixel, camera: { position: position.toArray(), target: center.toArray() }, url: page.url() };
      await page.screenshot({ path: path.join(out, 'source-triangle-pick.png') });
      break;
    }
    if (record) break;
  }
  if (record) break;
}
assert.ok(record, 'An independently visible source-wall triangle must reverse-select its actual directory member');
fs.writeFileSync(path.join(out, 'source-triangle-pick.json'), JSON.stringify(record, null, 2));
await browser.close();
console.log(JSON.stringify({ passed: true, site: record.site, member: record.member, sourceTriangle: record.firstVisibleSourceTriangle }));
