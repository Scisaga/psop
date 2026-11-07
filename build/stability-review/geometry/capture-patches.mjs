import fs from 'node:fs';import path from 'node:path';import {chromium} from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
const baseline=JSON.parse(fs.readFileSync('build/stability-review/geometry/after-dev/capture.json'));
const out='build/stability-review/geometry/patch-layers';fs.mkdirSync(out,{recursive:true});
const selections=[
 {target:'right-y42-z52',kind:'hole',id:'logical-hole:microduck:9d70b219a5533bf1:95b5a917f9b9c50c'},
 {target:'right-x25-y9',kind:'structure',id:'structure:7af674db6217c5ccd32c'},
 {target:'right-x25-y9',kind:'structure',id:'structure:8ef7de9c559016befede'},
 {target:'hip-x17-z6',kind:'feature',id:'feature:microduck:fa9ee2f71faafb88:plane-5da8ab6659b8'},
];
// Resolve the actual source hole, rather than hard-coding a content hash.
selections[0].id=baseline.records.find(r=>r.target==='right-y42-z52'&&r.mode==='logical-hole').holeRef;
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),records=[];
await page.route('**/api/**',async route=>{const response=await route.fetch({url:route.request().url().replace(':8791/',':8780/')});await route.fulfill({response});});
for(const selection of selections){
 const r=baseline.records.find(r=>r.target===selection.target&&r.mode==='final'),url=new URL(r.url),query=new URLSearchParams(url.hash.split('?')[1]);query.delete('opening');query.set(selection.kind,selection.id);
 await page.goto(url.origin+'/#explorer?'+query,{timeout:360000});await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
 const meta=await page.evaluate(()=>{const host=document.querySelector('.scene-canvas');let f=host[Object.keys(host).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.records instanceof Map){const r=h.memoizedState.current;window.__r=r;const objects=[];r.geometryOverlay?.traverse(o=>{if(!o.material)return;objects.push({type:o.type,userData:o.userData,triangles:o.geometry?.getAttribute('position')?.count/3,material:{wireframe:o.material.wireframe,depthWrite:o.material.depthWrite,depthTest:o.material.depthTest,polygonOffset:o.material.polygonOffset,polygonOffsetFactor:o.material.polygonOffsetFactor,polygonOffsetUnits:o.material.polygonOffsetUnits}});});return {camera:{position:r.camera.position.toArray(),target:r.controls.target.toArray()},objects};}});
 for(const mode of ['source-only','patch-and-boundaries']){
  await page.evaluate(mode=>{window.__r.geometryOverlay.visible=mode!=='source-only';},mode);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const image=`${selection.target}-${selection.id.split(':').at(-1)}-${mode}.png`;await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});records.push({...selection,mode,image,url:page.url(),...meta});
 }
}
await browser.close();fs.writeFileSync(path.join(out,'patch-layers.json'),JSON.stringify({records},null,2));console.log(JSON.stringify({images:records.length}));
