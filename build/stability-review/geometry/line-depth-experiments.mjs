import fs from 'node:fs';import path from 'node:path';
import {chromium} from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
const baseline=JSON.parse(fs.readFileSync('build/stability-review/geometry/before/capture.json'));
const out='build/stability-review/geometry/line-depth-experiments';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const records=[];
for(const r of baseline.records.filter(r=>r.mode==='final')){
 const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
 await page.goto(r.url,{timeout:360000});await page.locator('[data-scene-ready="true"]').waitFor({timeout:360000});await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
 await page.evaluate(()=>{const host=document.querySelector('.scene-canvas');let f=host[Object.keys(host).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.records instanceof Map){window.__r=h.memoizedState.current;return;}});
 for(const mode of ['baseline','depth-biased','bounded-depth-biased','no-depth']){
  const result=await page.evaluate(mode=>{
   const r=window.__r;
   r.geometryOverlay?.traverse(o=>{if(!o.isLine)return;const m=o.material;m.depthTest=mode!=='no-depth';m.onBeforeCompile=mode.includes('depth-biased')?(shader)=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n'+(mode==='depth-biased'?'gl_Position.z -= 0.000002 * gl_Position.w;':`float overlayViewZ = min(-0.0000001, mvPosition.z + 0.000002);float overlayClipZ = projectionMatrix[2][2] * overlayViewZ + projectionMatrix[3][2];float overlayClipW = projectionMatrix[2][3] * overlayViewZ + projectionMatrix[3][3];gl_Position.z = min(gl_Position.z, overlayClipZ / overlayClipW * gl_Position.w);`));}:()=>{};m.customProgramCacheKey=()=>mode;m.needsUpdate=true;});
   r.renderer.render(r.scene,r.camera);const gl=r.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
   const gold=[];for(let i=0;i<rgba.length;i+=4)if(rgba[i]>140&&rgba[i]>rgba[i+1]*1.1&&rgba[i+1]>rgba[i+2]*1.1)gold.push([i/4%width,height-1-Math.floor(i/4/width),rgba[i],rgba[i+1],rgba[i+2]]);
   return {width,height,goldPixels:gold,position:r.camera.position.toArray(),cameraTarget:r.controls.target.toArray()};
  },mode);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const image=`${r.target}-${mode}.png`;await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});records.push({target:r.target,mode,image,...result});
 }
 await page.close();
}
await browser.close();fs.writeFileSync(path.join(out,'experiment.json'),JSON.stringify({records},null,2));console.log(records.map(r=>({target:r.target,mode:r.mode,goldPixels:r.goldPixels.length})));
