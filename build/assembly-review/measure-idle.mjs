import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/workbench/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const catalog=await(await fetch('http://127.0.0.1:8780/api/workspaces')).json();
const snapshot=catalog.workspaces.find(w=>w.id==='microduck').selectedSnapshotId;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.goto('http://127.0.0.1:8780/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:'part:microduck:0820b4025f26a004',detail:'interfaces',explode:'1'}));
 const scene=page.locator('.scene-canvas');
 await page.waitForSelector('[data-scene-ready="true"]');await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.cameraFlight==='settled');
 await page.waitForTimeout(500);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const start=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const rendersBefore=Number(await scene.getAttribute('data-render-count'));
 await page.waitForTimeout(2000);
 const end=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const rendersAfter=Number(await scene.getAttribute('data-render-count'));
 const result={snapshot,seconds:2,rendersBefore,rendersAfter,idleRenderCount:rendersAfter-rendersBefore,taskSeconds:end.TaskDuration-start.TaskDuration,heapMiB:end.JSHeapUsedSize/1048576};
 fs.writeFileSync(new URL('./settled-idle.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
