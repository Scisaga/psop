import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/workbench/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const name of ['after-curve','connection-exploded']){
  const saved=JSON.parse(fs.readFileSync(new URL(`./${name}.json`,import.meta.url),'utf8'));
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));
  await page.goto(saved.url);await page.waitForSelector('[data-scene-ready="true"]');
  await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
  await page.waitForTimeout(700);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const before=await metrics(),rendersBefore=Number(await page.locator('.scene-canvas').getAttribute('data-render-count'));
  await page.waitForTimeout(2000);
  const after=await metrics(),rendersAfter=Number(await page.locator('.scene-canvas').getAttribute('data-render-count'));
  results.push({name,url:page.url(),idleSeconds:2,idleRenders:rendersAfter-rendersBefore,taskSeconds:after.TaskDuration-before.TaskDuration,heapMiB:after.JSHeapUsedSize/1048576,viewBytes:await page.evaluate(()=>performance.getEntriesByType('resource').find(r=>r.name.endsWith('/view'))?.decodedBodySize),scene:await page.locator('.scene-canvas').evaluate(e=>({...e.dataset}))});
  await page.close();
 }
 fs.writeFileSync(new URL('./idle-performance.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results.map(({name,idleRenders,taskSeconds,heapMiB,viewBytes})=>({name,idleRenders,taskSeconds,heapMiB,viewBytes}))));
}finally{await browser.close();}
