/** Verify published functional-use explanations for every source instance. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.resolve(option('--out',path.join(repo,'build/reference-use-review')));
await fs.mkdir(out,{recursive:true});
async function read(url){const response=await fetch(new URL(url,origin));if(!response.ok)throw new Error(`${response.status}: ${url}`);return response.json();}
const registry=await read('/api/workspaces'),workspace=registry.workspaces.find(w=>w.id==='microduck');
const snapshot=option('--snapshot',workspace.selectedSnapshotId);
const data=await read(`/api/workspaces/microduck/snapshots/${snapshot}/view`);
const index=data.assembly.capability_index;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1560,height:1060},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','420'));
const rows=[],navigation=[];
const owner=id=>'part:microduck:'+id;
const iface=(id,key)=>`interface:assembly:${id}:${key}`;
const url=(id,options={})=>origin+'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:id,labels:'0',explode:'0',...options});
async function settled(){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled',{timeout:15000});
}
async function visit(id,options={}){
  await page.goto(url(id,options));
  await expect(page.locator('.object-id')).toContainText(id);
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
  await expect(page.locator('.capability-loading')).toHaveCount(0);
  await page.getByRole('tab',{name:'原装配',exact:true}).click();
  await expect(page.locator(`[data-reference-use-review="${id}"]`)).toBeVisible();
  await page.getByTitle('适应全部模型',{exact:true}).click();await settled();
}
async function select(id){
  await page.locator(`[data-assembly-interface="${id}"] .assembly-interface-select`).click();
  const detail=page.locator(`[data-active-assembly-interface="${id}"]`);
  await expect(detail).toBeVisible();return detail;
}
async function screenshot(name){await settled();await page.screenshot({path:path.join(out,name+'.png')});}
try{
  for(const part of data.parts){
    const entry=index.parts[part.id].path;
    const detail=await read(entry.startsWith('/')?entry:index.asset_base+entry);
    const review=detail.reference_use_review;
    expect(review,part.id).toBeTruthy();
    await visit(part.id);
    const card=page.locator(`[data-reference-use-review="${part.id}"]`);
    await expect(card).toContainText(review.summary);
    await expect(card.locator('.reference-use-dispositions p')).toHaveCount(review.interface_dispositions.length);
    for(const item of review.open_items)await expect(card.locator('.reference-use-open')).toContainText(item);
    for(const item of review.interface_dispositions)await expect(page.locator(`[data-assembly-interface="${item.interface_ref}"]`)).toHaveCount(1);
    rows.push({owner_ref:part.id,name:part.name,body:part.body,summary:review.summary,interface_count:review.interface_dispositions.length,open_items:review.open_items});
    if(review.open_items.length)await screenshot('unresolved-'+part.id.split(':').at(-1));
    if(rows.length%10===0)console.log(JSON.stringify({stage:'all-part-usage-ui',reviewed:rows.length,total:data.parts.length}));
  }
  const jaw='50f0c376d01bb0c1',support='986b5adf27910138',lower='52fdcacf474a463f';
  const headView={explode:'0.35',hidden:data.parts.filter(p=>![owner(jaw),owner(support),owner(lower)].includes(p.id)).map(p=>p.id).join(',')};
  await visit(owner(jaw),headView);
  await expect(page.locator('.reference-use-summary')).toContainText('承槽');
  await expect(page.locator('.reference-use-summary')).toContainText('下壳');
  await screenshot('jaw-servo-installation-summary');
  const body=await select(iface(jaw,'servo_body_seating'));
  await expect(body.locator(`[data-assembly-peer="${iface(support,'servo_body_'+jaw+'_seat')}"]`)).toContainText('电机支架');
  await expect(body.locator(`[data-assembly-peer="${iface(lower,'servo_body_'+jaw+'_seat')}"]`)).toContainText('头部下壳');
  await body.scrollIntoViewIfNeeded();await screenshot('jaw-servo-casing-interfaces');
  await body.locator(`[data-assembly-peer="${iface(support,'servo_body_'+jaw+'_seat')}"]`).getByRole('button',{name:'查看对端',exact:true}).click();
  await expect(page.locator('.object-id')).toContainText(owner(support));
  await expect(page.locator('.capability-loading')).toHaveCount(0);
  await page.getByRole('tab',{name:'原装配',exact:true}).click();
  await expect(page.locator(`[data-active-assembly-interface="${iface(support,'servo_body_'+jaw+'_seat')}"]`)).toBeVisible();
  navigation.push({from:iface(jaw,'servo_body_seating'),to:iface(support,'servo_body_'+jaw+'_seat'),verified:true});
  await screenshot('support-casing-cradle-detail');
  await visit(owner(support),headView);await screenshot('motor-support-installation-summary');
  const roll='96e22c7fa2b976d3';
  await visit(owner(roll));
  const rollDetail=await select(iface(roll,'servo_body_seating'));
  await expect(rollDetail.locator(`[data-assembly-peer="${iface(support,'servo_body_'+roll+'_seat')}"]`)).toBeVisible();
  await expect(rollDetail.locator(`[data-assembly-peer="${iface(lower,'servo_body_'+roll+'_seat')}"]`)).toBeVisible();
  for(const [leg,servo] of [['638f29b46b322e64','4cf80d5a57c8cb04'],['7f4fefc3c6de90f1','7038a050dbc33fb0']]){
    await visit(owner(leg));const detail=await select(iface(leg,'upper_servo_four_holes'));
    await expect(detail).toContainText('45');
    await expect(detail.locator('[data-assembly-peer]')).toHaveCount(1);
    navigation.push({from:iface(leg,'upper_servo_four_holes'),peer_owner:owner(servo),verified:true});
    await screenshot('knee-reference-'+leg);
  }
  await visit(owner('22f2cd114e324ec5'));
  const speaker=await select(iface('22f2cd114e324ec5','proxy_contact_face'));
  await expect(speaker).toContainText('可能对端');
  await expect(speaker).not.toContainText('已确定对端');
  await screenshot('speaker-unknown-retention');
  expect(errors).toEqual([]);
  const report={schema:'psop.reference-use-ui-review/1',measured_at:new Date().toISOString(),snapshot,version:data.meta.packageVersion,package_digest:data.meta.packageDigest,
    reviewed_part_count:rows.length,functional_interface_count:rows.reduce((n,r)=>n+r.interface_count,0),open_item_count:rows.reduce((n,r)=>n+r.open_items.length,0),rows,navigation,javascript_errors:errors,
    scope:'Published functional-use summaries, interface presence and explicit unresolved items for every input instance; selected peer navigation and source phase conditions; no physical assembly qualification'};
  await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:true,snapshot,version:report.version,parts:rows.length,functional_interfaces:report.functional_interface_count,open_items:report.open_item_count,javascript_errors:errors.length}));
}finally{await browser.close();}
