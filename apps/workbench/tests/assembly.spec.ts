import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {readRegistry} from '../scripts/dkp.mjs';
import {interfacesForPart,selectionForInterface,selectedAssemblyMembers,peerEndpoints,connectionsForInterface} from '../src/assembly-model';
import {resolveGeometry,pickedInterfaces} from '../src/mechanics-model';
import type {PrototypeData,AssemblyInterface} from '../src/types';

const workspace=(await readRegistry()).workspaces.find((w:{id:string})=>w.id==='microduck');
const snapshot=process.env.PSOP_TEST_SNAPSHOT||workspace.selectedSnapshotId;
const servo='part:microduck:0820b4025f26a004';
const out=path.resolve('../../build/connection-view-review/regression');fs.mkdirSync(out,{recursive:true});
let data:PrototypeData;
test.beforeAll(async()=>{test.setTimeout(360000);const response=await fetch(`http://127.0.0.1:8780/api/workspaces/microduck/snapshots/${snapshot}/view`);expect(response.ok).toBe(true);data=await response.json();expect(data.meta.validation?.profile).toBe('psop.hardware.source-model/1.14');});
const url=(part:string,extra:Record<string,string>={})=>'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part,detail:'interfaces',labels:'0',grid:'0',camera:'0.30,-0.32,0.23,0,0,0.105',...extra});
async function ready(page:Page){await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({timeout:335000});await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled');}
async function exported(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出视图',exact:true}).click();return JSON.parse(fs.readFileSync((await(await event).path())!,'utf8'));}
function sameCamera(actual:any,expected:any){for(const key of ['position','target'])for(let i=0;i<3;i++)expect(Math.abs(actual[key][i]-expected[key][i])).toBeLessThan(1e-10);}
async function record(page:Page,name:string){await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled');await page.screenshot({path:path.join(out,name+'.png')});return{name,url:page.url(),view:await page.getByRole('dialog').count()?null:await exported(page),scene:await page.locator('.scene-canvas').evaluate(e=>({...((e as HTMLElement).dataset)}))};}
const row=(page:Page,item:AssemblyInterface)=>page.locator(`[data-assembly-interface="${item.id}"]`);

test('局部身份、同部件对多部位、独立成员及证据用途',async()=>{
  const items=interfacesForPart(data,servo),ports=items.filter(i=>['servo_end_minus','servo_end_plus','servo_housing_a','servo_housing_b'].some(key=>i.key===key));
  expect(ports).toHaveLength(4);
  for(const item of ports)expect(item.members).toHaveLength(4);
  for(const item of ports){const selection=selectionForInterface(item,[item.members[0].id]);expect(selectedAssemblyMembers(data,item,selection)).toEqual([item.members[0]]);expect(resolveGeometry(data,selection)!.featureRefs.sort()).toEqual([...new Set(item.members[0].feature_refs)].sort());}
  const a=ports.find(i=>i.key==='servo_housing_a')!,b=ports.find(i=>i.key==='servo_housing_b')!;
  expect(a.id).not.toBe(b.id);expect(a.members.flatMap(m=>m.resource_ref).sort()).toEqual(b.members.flatMap(m=>m.resource_ref).sort());
  expect(a.geometry_summary).not.toContain('PCD 34');expect(a.selection.allowed_pairs).toHaveLength(4);
  const ids=ports.map(i=>i.id).sort();const edited=structuredClone(data);edited.assembly!.interfaces.reverse();edited.assembly!.connections.reverse();edited.assembly!.interfaces.forEach(i=>{i.name+='修改';i.note='文案变化';});
  expect(interfacesForPart(edited,servo).filter(i=>ports.some(p=>p.id===i.id)).map(i=>i.id).sort()).toEqual(ids);
  const f=data.assembly!.features.find(f=>f.id===a.members[0].feature_refs[0])!;
  const candidates=pickedInterfaces(data,servo,f.geometry.triangle_indices[0]);expect(candidates.some(c=>c.interface.id===a.id)).toBe(true);expect(candidates.some(c=>c.interface.id===b.id)).toBe(true);
  const byPair=new Map<string,Set<string>>();for(const c of data.assembly!.connections){const endpoints=c.endpoints.map(e=>data.assembly!.interfaces.find(i=>i.id===e.interface_ref)!);if(endpoints.length!==2)continue;const key=endpoints.map(i=>i.owner_ref).sort().join('|');const set=byPair.get(key)||new Set();set.add(c.endpoints.map(e=>e.interface_ref).sort().join('|'));byPair.set(key,set);}
  expect([...byPair.values()].some(s=>s.size>1)).toBe(true);
  for(const c of data.assembly!.connections)for(const ref of c.evidence_refs){const e=data.evidence.find(e=>e.id===ref);expect(e,ref).toBeTruthy();const source=data.sources.find(s=>s.id===e!.sourceId)!;expect(source.path).not.toMatch(/(?:BOM|README)/i);}
  expect(data).not.toHaveProperty('analysis');expect(data.sources.some(s=>s.text)).toBe(false);
  for(const owner of ['part:microduck:fa9ee2f71faafb88','part:microduck:c7eeeac0a640d191']){
    const sites=interfacesForPart(data,owner);for(const key of ['source_x_four_holes','source_y_four_holes','source_x_bearing_support','source_y_bearing_support'])expect(sites.find(i=>i.key===key),key).toBeTruthy();
    for(const item of sites.filter(i=>i.key.endsWith('four_holes'))){expect(item.members).toHaveLength(4);const refs=resolveGeometry(data,selectionForInterface(item))!.featureRefs;expect(refs.every(ref=>data.assembly!.features.find(f=>f.id===ref)!.kind==='bore_wall')).toBe(true);}
  }
  const unknown=data.assembly!.connections.find(c=>c.endpoints.some(e=>e.member_refs.length===0));expect(unknown).toBeTruthy();const endpoint=unknown!.endpoints.find(e=>!e.member_refs.length)!;const item=data.assembly!.interfaces.find(i=>i.id===endpoint.interface_ref)!;const selection=selectionForInterface(item,[],unknown!.id);expect(selectedAssemblyMembers(data,item,selection)).toEqual([]);expect(resolveGeometry(data,selection)!.featureRefs).toEqual([]);
});

test('1600×900 / 360px 四个舵机孔组在默认目录中可辨认，窄布局相同',async({page})=>{
  await page.setViewportSize({width:1600,height:900});await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));
  await page.goto(url(servo));await ready(page);
  for(const key of ['servo_end_minus','servo_end_plus','servo_housing_a','servo_housing_b']){const item=interfacesForPart(data,servo).find(i=>i.key===key)!;await expect(row(page,item)).toBeInViewport();await expect(row(page,item)).toContainText(item.geometry_summary);}
  await expect(page.locator('.assembly-detail')).toHaveCount(0);await expect(page.locator('.assembly-evidence[open]')).toHaveCount(0);
  await page.screenshot({path:path.join(out,'default-1600x900.png')});
  await page.setViewportSize({width:1100,height:800});for(const key of ['servo_end_minus','servo_end_plus','servo_housing_a','servo_housing_b'])await expect(row(page,interfacesForPart(data,servo).find(i=>i.key===key)!)).toBeVisible();
  await page.screenshot({path:path.join(out,'default-1100x800.png')});
});

test('舵机逐孔→相邻孔对→定位本端→对应连杆→返回→具体证据与分享',async({page,context})=>{
  test.setTimeout(180000);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1600,height:900});await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));await context.grantPermissions(['clipboard-read','clipboard-write']);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url(servo));await ready(page);const records=[];const initial=await exported(page),scene=page.locator('.scene-canvas');
  const item=interfacesForPart(data,servo).find(i=>i.key==='servo_housing_b')!;await row(page,item).locator('.assembly-interface-select').click();
  for(const member of item.members){await page.locator(`[data-assembly-member="${member.id}"]`).click();const current=await exported(page);sameCamera(current.camera,initial.camera);expect(current.inspection.active).toBe(false);expect(current.inspection.translucentPartIds).toEqual([]);await expect(scene).toHaveAttribute('data-selected-features',[...new Set(member.feature_refs)].join(','));}
  const pair=item.selection.allowed_pairs![0];await page.locator(`[data-assembly-pair="${pair.join('|')}"]`).click();await expect(scene).toHaveAttribute('data-member-refs',pair.join(','));records.push(await record(page,'servo-adjacent-pair'));
  await page.getByRole('button',{name:'复制视图链接',exact:true}).click();const link=await page.evaluate(()=>navigator.clipboard.readText());await page.goto(link);await ready(page);await expect(scene).toHaveAttribute('data-interface-id',item.id);await expect(scene).toHaveAttribute('data-member-refs',pair.join(','));
  await page.getByRole('button',{name:'定位本端',exact:true}).click();await expect(scene).toHaveAttribute('data-inspection-active','true');records.push(await record(page,'servo-housing-focus'));
  const original=await exported(page);const connection=connectionsForInterface(data,item.id).find(c=>peerEndpoints(data,item,c).some(p=>p.target.owner_ref==='part:microduck:7f4fefc3c6de90f1'))!;expect(connection).toBeTruthy();
  const target=peerEndpoints(data,item,connection).find(p=>p.target.owner_ref==='part:microduck:7f4fefc3c6de90f1')!;
  await page.locator(`[data-assembly-peer="${target.target.id}"]`).getByRole('button',{name:'定位对端',exact:true}).click();await expect(scene).toHaveAttribute('data-interface-id',target.target.id);records.push(await record(page,'servo-to-leg'));
  await page.getByRole('button',{name:'返回原接口',exact:true}).click();await expect(scene).toHaveAttribute('data-interface-id',item.id);sameCamera((await exported(page)).camera,original.camera);records.push(await record(page,'servo-return'));
  await page.locator('.assembly-evidence summary').first().click();await page.locator('.assembly-evidence button').first().click();await expect(page.getByRole('dialog')).toBeVisible();records.push(await record(page,'servo-evidence'));await page.keyboard.press('Escape');await expect(scene).toHaveAttribute('data-interface-id',item.id);
  fs.writeFileSync(path.join(out,'servo-operations.json'),JSON.stringify(records,null,2));expect(errors).toEqual([]);
});

for(const owner of ['part:microduck:fa9ee2f71faafb88','part:microduck:c7eeeac0a640d191','part:microduck:f9955f19a691a1f4','part:microduck:2f557a24b2729755','part:microduck:d924e1596ffb042a','part:microduck:e196235810184adf'])test(`实际接口与对端往返：${owner}`,async({page})=>{
  test.setTimeout(120000);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1600,height:900});await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));await page.goto(url(owner));await ready(page);const records=[];
  const items=interfacesForPart(data,owner);expect(items.length).toBeGreaterThan(0);
  for(const item of items){await row(page,item).locator('.assembly-interface-select').click();await expect(page.locator('[data-active-assembly-interface]')).toHaveAttribute('data-active-assembly-interface',item.id);
    const memberSelections=[];
    if(['part:microduck:fa9ee2f71faafb88','part:microduck:c7eeeac0a640d191'].includes(owner)){
      const before=await exported(page);
      for(const member of item.members){await page.locator(`[data-assembly-member="${member.id}"]`).click();const current=await exported(page);sameCamera(current.camera,before.camera);expect(current.inspection.translucentPartIds).toEqual(before.inspection.translucentPartIds);await expect(page.locator('.scene-canvas')).toHaveAttribute('data-selected-features',[...new Set(member.feature_refs)].join(','));memberSelections.push({member:member.id,view:current});}
      await page.screenshot({path:path.join(out,owner.slice(-4)+'-'+item.key+'-single-member.png')});
      await page.getByRole('button',{name:'选择整个接口',exact:true}).click();
    }
    await page.getByRole('button',{name:'定位本端',exact:true}).click();records.push({...await record(page,owner.slice(-4)+'-'+item.key),memberSelections});
    const peer=page.locator('.assembly-peer').first();if(await peer.count()){await peer.getByRole('button',{name:'定位对端',exact:true}).click();await expect(page.getByRole('button',{name:'返回原接口',exact:true})).toBeVisible();await page.getByRole('button',{name:'返回原接口',exact:true}).click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-interface-id',item.id);}
    await page.getByRole('button',{name:'本件接口',exact:true}).click();
  }
  fs.writeFileSync(path.join(out,owner.slice(-4)+'-operations.json'),JSON.stringify(records,null,2));
});

test('历史研究深链读取原记录，不静默选择首个新接口',async({page})=>{
  const historical={...data,assembly:undefined,analysis:{installation_hypotheses:[{id:'installation-hypothesis:archived-test',title:'指定的历史研究',participants:[{part_ref:servo}],mechanism:'原始说明保留'}]}};
  await page.route('**/api/workspaces/*/snapshots/*/view',route=>route.fulfill({json:historical}));
  await page.goto(url(servo,{hypothesis:'installation-hypothesis:archived-test'}));await ready(page);await expect(page.locator('.assembly-archive pre')).toContainText('原始说明保留');await expect(page.locator('.scene-canvas')).toHaveAttribute('data-interface-id','');
});
