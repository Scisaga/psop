import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
import { Vector3, Quaternion } from '../../../apps/workbench/node_modules/three/build/three.module.js';

const origin = process.env.PSOP_CAPTURE_BASE_URL || 'http://127.0.0.1:8780';
const phase = process.argv[2] || 'before';
const out = path.resolve('build/stability-review/geometry', phase);
fs.mkdirSync(out, { recursive: true });
const snapshot = process.env.PSOP_SNAPSHOT || 'dkp-1c8eeda600249ce33b99';
const response = await fetch(`${origin.replace(':8791',':8780')}/api/workspaces/microduck/snapshots/${snapshot}/view`, {signal:AbortSignal.timeout(330000)});
if (!response.ok) throw new Error(await response.text());
const data = await response.json();
const targets = [
  { key: 'right-y42-z52', meshKey: 'right_shell', center: [-.0003, .042, .0525], direction: [1,0,0] },
  { key: 'right-x25-y9', meshKey: 'right_shell', center: [-.0255, -.0095, .0425], direction: [0,0,1] },
  { key: 'hip-x17-z6', meshKey: 'hip_l', center: [.0175, -.0195, -.006], direction: [0,-1,0] },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
if (origin.includes(':8791')) await page.route('**/api/**', async route => { const response = await route.fetch({url:route.request().url().replace(':8791/',':8780/')}); await route.fulfill({response}); });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const records = [];
// Isolate the actual running workbench renderer. No source modules or API data
// are replaced; diagnostic mutations live only in this browser context.
async function findRuntime() {
  await page.evaluate(() => {
    const host = document.querySelector('.scene-canvas');
    let fiber = host[Object.keys(host).find(key => key.startsWith('__reactFiber'))];
    for (; fiber; fiber = fiber.return) {
      for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (value?.records instanceof Map && value?.renderer?.domElement) { window.__geometryRuntime = value; return; }
      }
    }
    throw new Error('Running SceneCanvas runtime not found');
  });
}
for (const target of targets) {
  const part = data.parts.find(item => item.meshKey === target.meshKey);
  const opening = data.analysis.circular_openings.find(item => item.owner_ref === part.id && item.geometry.center.every((value, i) => Math.abs(value - target.center[i]) < 1e-5));
  if (!opening) throw new Error('Missing source opening ' + target.key);
  const quaternion = new Quaternion().fromArray(part.quaternion);
  const center = new Vector3().fromArray(opening.geometry.center).applyQuaternion(quaternion).add(new Vector3().fromArray(part.position));
  const direction = new Vector3().fromArray(target.direction).applyQuaternion(quaternion).normalize();
  let tangent = new Vector3(1,.3,.2).addScaledVector(direction, -new Vector3(1,.3,.2).dot(direction)).normalize();
  const position = center.clone().addScaledVector(direction, .018).addScaledVector(tangent, .018 * .25);
  const camera = [...position.toArray(), ...center.toArray()];
  const query = new URLSearchParams({ workspace: 'microduck', snapshot, part: part.id, opening: opening.id, detail: 'geometry', isolate: part.id, labels: '0', grid: '0', explode: '0', camera: camera.join(',') });
  await page.goto(origin + '/#explorer?' + query, { timeout: 360000 });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 360000 });
  await page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.cameraFlight === 'settled');
  await findRuntime();
  const meta = await page.evaluate(async partId => {
    const r = window.__geometryRuntime, source = r.records.get(partId).mesh.geometry;
    window.__geometrySmooth = source.getAttribute('normal').clone();
    window.__geometryOverlayVisibility = [];
    r.geometryOverlay?.traverse(object => window.__geometryOverlayVisibility.push([object, object.visible]));
    const positions=source.getAttribute('position').array;
    const sourcePositionSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return { actualCamera: {position:r.camera.position.toArray(),target:r.controls.target.toArray()},sourcePositionSha256,
      indexed:!!source.index, vertices:source.getAttribute('position').count, sourceDisplayMapping:source.userData.sourceDisplayMapping,
      context:r.renderer.getContext().getContextAttributes(), samples:r.renderer.getContext().getParameter(r.renderer.getContext().SAMPLES), depthBits:r.renderer.getContext().getParameter(r.renderer.getContext().DEPTH_BITS), pixelRatio:r.renderer.getPixelRatio(), renderer:r.renderer.getContext().getParameter(r.renderer.getContext().RENDERER),
      selectedEdge:!!r.selectedEdge, objects: window.__geometryOverlayVisibility.map(([o])=>({type:o.type,userData:o.userData,position:o.position.toArray(),material:o.material?{type:o.material.type,depthTest:o.material.depthTest,depthWrite:o.material.depthWrite,transparent:o.material.transparent,opacity:o.material.opacity,polygonOffset:o.material.polygonOffset,polygonOffsetFactor:o.material.polygonOffsetFactor,polygonOffsetUnits:o.material.polygonOffsetUnits,renderOrder:o.renderOrder}:null}))};
  }, part.id);
  for (const mode of ['source-facets','display-normals','opening-outline','all-overlays','final']) {
    await page.evaluate(({mode,partId}) => {
      const r = window.__geometryRuntime, source = r.records.get(partId).mesh.geometry;
      for (const [object,visible] of window.__geometryOverlayVisibility) object.visible = visible;
      if (mode === 'source-facets') source.computeVertexNormals(); else source.setAttribute('normal',window.__geometrySmooth);
      if (mode === 'source-facets' || mode === 'display-normals') { if(r.geometryOverlay) r.geometryOverlay.visible = false; }
      if (mode === 'opening-outline') r.geometryOverlay?.traverse(object => { if(object.isMesh) object.visible = false; });
      r.renderer.render(r.scene,r.camera);
    }, {mode,partId:part.id});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const image = `${target.key}-${mode}.png`;
    await page.locator('.scene-webgl').screenshot({ path: path.join(out,image) });
    records.push({target:target.key,mode,image,partRef:part.id,openingRef:opening.id,camera,url:page.url(),...meta});
  }
  for (const mode of ['no-shadow','zero-normal-bias','smaller-normal-bias','no-double-shadow']) {
    await page.evaluate(({mode,partId})=>{
      const r=window.__geometryRuntime, mesh=r.records.get(partId).mesh;
      mesh.receiveShadow=mode!=='no-shadow';mesh.material.needsUpdate=true;
      r.scene.traverse(object=>{if(object.isDirectionalLight&&object.castShadow){object.shadow.normalBias=mode==='zero-normal-bias'?0:mode==='smaller-normal-bias'?.00002:.0005;}});
      if(mode==='no-double-shadow') {mesh.material.shadowSide=0;mesh.material.needsUpdate=true;}
      r.renderer.shadowMap.needsUpdate=true;r.renderer.render(r.scene,r.camera);
    },{mode,partId:part.id});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const image=`${target.key}-${mode}.png`;
    await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});
    records.push({target:target.key,mode,image,partRef:part.id,openingRef:opening.id,camera,url:page.url()});
  }
  // Additional true source hole selection exercises cylindrical patches and
  // portal overlays at the same source position without synthesizing a hole.
  const hole = data.analysis.logical_holes.find(item=>item.owner_ref===part.id && item.portals.some(portal=>portal.position.every((v,i)=>Math.abs(v-opening.geometry.center[i])<1e-5)));
  if(hole) {
    query.delete('opening'); query.set('hole',hole.id);
    await page.goto(origin + '/#explorer?' + query, {timeout:360000});
    await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});
    await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
    await findRuntime();
    const image = `${target.key}-logical-hole.png`;
    await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});
    records.push({target:target.key,mode:'logical-hole',image,partRef:part.id,holeRef:hole.id,camera,url:page.url(),objects:await page.evaluate(()=>{const o=[];window.__geometryRuntime.geometryOverlay?.traverse(n=>o.push({type:n.type,userData:n.userData}));return o;})});
  }
  for(const variant of [{key:'oblique',distance:.045,angle:-.6},{key:'zoom-out',distance:.06,angle:.25}]) {
    query.delete('hole');query.set('opening',opening.id);
    const extraPosition=center.clone().addScaledVector(direction,variant.distance).addScaledVector(tangent,variant.distance*variant.angle);
    const pose=[...extraPosition.toArray(),...center.toArray()];query.set('camera',pose.join(','));
    await page.goto(origin+'/#explorer?'+query,{timeout:360000});
    await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});
    await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
    await findRuntime();
    const actualCamera=await page.evaluate(()=>({position:window.__geometryRuntime.camera.position.toArray(),target:window.__geometryRuntime.controls.target.toArray()}));
    const image=`${target.key}-${variant.key}.png`;
    await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});
    records.push({target:target.key,mode:variant.key,image,partRef:part.id,openingRef:opening.id,camera:pose,actualCamera,url:page.url()});
  }
  console.log(target.key + ': ' + records.filter(r=>r.target===target.key).length + ' images');
}
await browser.close();
fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({phase,origin,snapshot,version:data.meta.packageVersion,digest:data.meta.packageDigest,apiSource:response.url,capturedAtUtc:new Date().toISOString(),sourceCodeSha256:createHash('sha256').update(fs.readFileSync('apps/workbench/src/SceneCanvas.tsx')).digest('hex'),records,errors},null,2));
console.log(JSON.stringify({out,images:records.length,errors}));
