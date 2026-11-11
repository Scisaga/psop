/** Read-only acceptance of every bearing's independent reference interfaces. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.resolve(option('--out',path.join(repo,'build/bearing-reference-review')));
await fs.mkdir(out,{recursive:true});
async function read(url){const response=await fetch(new URL(url,origin));if(!response.ok)throw new Error(`${response.status}: ${url}`);return response.json();}
const registry=await read('/api/workspaces'),workspace=registry.workspaces.find(w=>w.id==='microduck');
const snapshot=option('--snapshot',workspace.selectedSnapshotId);
const data=await read(`/api/workspaces/microduck/snapshots/${snapshot}/view`);
const bearings=data.parts.filter(p=>p.kind==='bearing');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','380'));
const rows=[];
const journal='interface:assembly:328011951ac11ee7:jaw_bearing_journal';
const head='part:microduck:a0775b54397eb21e';
const url=(owner)=>origin+'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:owner,labels:'0',explode:'0'});
try{
  for(const bearing of bearings){
    await page.goto(url(bearing.id));
    await expect(page.locator('.object-id')).toContainText(bearing.id);
    await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:30000});
    await expect(page.locator('.capability-loading')).toHaveCount(0);
    await page.getByRole('tab',{name:'原装配',exact:true}).click();
    const prefix='interface:assembly:'+bearing.id.split(':').at(-1)+':';
    const inner=page.locator(`[data-assembly-interface="${prefix}inner_ring"]`),outer=page.locator(`[data-assembly-interface="${prefix}outer_ring"]`);
    await expect(inner).toBeVisible();await expect(outer).toBeVisible();
    await expect(page.locator('[aria-label="来源装配关系"] [data-assembly-interface]')).toHaveCount(2);
    const row={part_ref:bearing.id,body:bearing.body,mesh_key:bearing.meshKey,inner_text:await inner.innerText(),outer_text:await outer.innerText()};
    rows.push(row);
    if(bearing.id===head){
      await expect(inner).toContainText('喙部件');
      await expect(outer).toContainText('头部下壳');
      await expect(outer).toContainText('电机支架（待确认）');
      await page.screenshot({path:path.join(out,'head-bearing-interfaces.png')});
      await inner.locator('.assembly-interface-select').click();
      const peer=page.locator(`[data-assembly-peer="${journal}"]`);
      await expect(peer).toContainText('喙部件');
      await expect(page.locator('[data-active-assembly-interface]')).toContainText('0.2 mm');
      await peer.getByRole('button',{name:'查看对端',exact:true}).click();
      await expect(page.locator('.object-id')).toContainText('part:microduck:328011951ac11ee7');
      await expect(page.locator('.capability-loading')).toHaveCount(0);
      await page.getByRole('tab',{name:'原装配',exact:true}).click();
      await expect(page.locator(`[data-active-assembly-interface="${journal}"]`)).toBeVisible();
      await expect(page.locator('[data-assembly-peer]')).toContainText('轴承外形');
      await page.screenshot({path:path.join(out,'jaw-bearing-reference.png')});
    }
    if(bearing.id==='part:microduck:6b884b140f6e283c'){
      await expect(outer).toContainText('原装配对端待确认');
      await page.screenshot({path:path.join(out,'unresolved-outer-ring-retained.png')});
    }
  }
  expect(errors).toEqual([]);
  const report={schema:'psop.bearing-reference-ui-review/1',measured_at:new Date().toISOString(),snapshot,version:data.meta.packageVersion,package_digest:data.meta.packageDigest,bearing_count:bearings.length,visible_ring_interface_count:rows.length*2,rows,javascript_errors:errors,scope:'Reference interfaces and peer navigation; unknown peers and source-pose conflicts retained, no physical assembly qualification'};
  await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:true,snapshot,version:report.version,bearings:bearings.length,ring_interfaces:rows.length*2,javascript_errors:errors.length}));
}finally{await browser.close();}
