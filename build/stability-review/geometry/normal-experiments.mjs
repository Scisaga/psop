import fs from 'node:fs';import path from 'node:path';
import {chromium} from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
const baseline=JSON.parse(fs.readFileSync('build/stability-review/geometry/before/capture.json'));
const out='build/stability-review/geometry/normal-experiments';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const records=[];
for(const variant of ['angle35','angle60','angle85','area35','area60','area85']){
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
 await context.route('**/api/**',async route=>{const response=await route.fetch({url:route.request().url().replace(':8791/',':8780/')});await route.fulfill({response});});
 await context.route('**/src/source-display-normals.ts*',async route=>{
   const response=await route.fetch();let body=await response.text();
   body=body.replace('DISPLAY_CREASE_DEGREES = 35','DISPLAY_CREASE_DEGREES = '+variant.replace(/\D/g,''));
   if(variant.startsWith('area'))body=body.replace('weight[i] = Math.atan2(', 'weight[i] = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) * Math.atan2(');
   await route.fulfill({response,body});
 });
 const page=await context.newPage();page.on('pageerror',error=>console.log('ERROR',error.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 for(const r of baseline.records.filter(r=>r.mode==='final'&&r.target!=='right-y42-z52')){
   await page.goto(r.url.replace(':8780/',':8791/'),{timeout:360000});
   await page.locator('[data-scene-ready="true"]').waitFor({timeout:60000});
   await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
   const image=`${r.target}-${variant}.png`;await page.locator('.scene-webgl').screenshot({path:path.join(out,image)});
   records.push({target:r.target,variant,image,camera:r.camera,url:page.url()});
 }
 await context.close();console.log(variant);
}
await browser.close();fs.writeFileSync(path.join(out,'experiments.json'),JSON.stringify({records},null,2));
