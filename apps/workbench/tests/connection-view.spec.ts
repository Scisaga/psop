import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Box3,Matrix4,PerspectiveCamera,Quaternion,Vector3} from 'three';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {readRegistry} from '../scripts/dkp.mjs';
import type {PrototypeData} from '../src/types';

const require=createRequire(import.meta.url);
const {PNG}=require('playwright-core/lib/utilsBundle');
const out=path.resolve('../../build/connection-view-review');fs.mkdirSync(out,{recursive:true});
const workspace=(await readRegistry()).workspaces.find((w:{id:string})=>w.id==='microduck');
const snapshot=process.env.PSOP_TEST_SNAPSHOT||workspace.selectedSnapshotId;
const jaw='part:microduck:328011951ac11ee7';
const drive=`interface:assembly:328011951ac11ee7:jaw_drive`;
const cover=`interface:assembly:328011951ac11ee7:soft_cover_support`;
let data:PrototypeData;

test.use({viewport:{width:1600,height:900}});
test.beforeAll(async()=>{
  test.setTimeout(360000);
  const response=await fetch(`http://127.0.0.1:8780/api/workspaces/microduck/snapshots/${snapshot}/view`);
  expect(response.ok).toBe(true);data=await response.json();
  expect(data.meta.validation?.profile).toBe('psop.hardware.source-model/1.14');
});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));
  await page.emulateMedia({reducedMotion:'reduce'});
});

const url=(part:string,extra:Record<string,string>={})=>'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part,detail:'interfaces',explode:'0',labels:'0',grid:'1',camera:'0.30,-0.32,0.23,0,0,0.105',...extra});
async function ready(page:Page){await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({timeout:335000});await settled(page);}
async function settled(page:Page){await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled');}
async function exported(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出视图',exact:true}).click();return JSON.parse(fs.readFileSync((await(await event).path())!,'utf8'));}
function sameVector(actual:number[],expected:number[],tolerance=1e-9){actual.forEach((value,index)=>expect(Math.abs(value-expected[index])).toBeLessThan(tolerance));}
function sameCamera(actual:any,expected:any){sameVector(actual.position,expected.position);sameVector(actual.target,expected.target);}
async function capture(page:Page,name:string){
  await settled(page);await page.screenshot({path:path.join(out,name+'.png')});
  const record={name,url:page.url(),view:await exported(page),scene:await page.locator('.scene-canvas').evaluate(e=>({...((e as HTMLElement).dataset)}))};
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(record,null,2)+'\n');return record;
}
function cameraFor(pose:any,width:number,height:number){const camera=new PerspectiveCamera(34,width/height,.0001,4);camera.up.set(0,0,1);camera.position.fromArray(pose.position);camera.lookAt(new Vector3().fromArray(pose.target));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return camera;}
function axialCheck(reference:any){
  const entry=new Vector3().fromArray(reference.entry),head=new Vector3().fromArray(reference.head),receiver=new Vector3().fromArray(reference.receiver),axis=new Vector3().fromArray(reference.axis);
  expect(Math.abs(axis.length()-1)).toBeLessThan(1e-10);
  expect(head.clone().sub(entry).cross(axis).length()).toBeLessThan(1e-8);
  expect(receiver.clone().sub(entry).cross(axis).length()).toBeLessThan(1e-8);
  expect(head.clone().sub(entry).dot(axis)).toBeLessThan(-.00001);
  expect(receiver.clone().sub(entry).dot(axis)).toBeGreaterThan(0);
  return reference;
}

test('已确定喙部接口保留真实未知项，普通选孔只显示一条示意且不移动相机',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url(jaw));await ready(page);
  const row=page.locator(`[data-assembly-interface="${drive}"]`);await expect(row).toContainText('已确定');await expect(row).not.toContainText('可能');
  const before=await exported(page);await row.locator('.assembly-interface-select').click();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','0');
  await expect(page.locator('[data-assembly-member]')).toHaveCount(4);
  await expect(page.locator('.assembly-detail')).toContainText('实际');await expect(page.locator('.assembly-detail')).toContainText('待核');
  sameCamera((await exported(page)).camera,before.camera);
  await page.locator('[data-assembly-member]').first().click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','1');
  const selected=await capture(page,'jaw-explicit-one-member');sameCamera(selected.view.camera,before.camera);expect(selected.view.inspection.translucentPartIds).toEqual(before.inspection.translucentPartIds);
  expect(selected.view.inspection.referenceFasteners).toHaveLength(1);expect(selected.view.inspection.referenceFasteners[0].representation).toBe('schematic');
  const selectedConnection=data.assembly!.connections.find(connection=>connection.fastener_paths?.some(path=>path.id===selected.view.inspection.referenceFasteners[0].pathRef));expect(selectedConnection?.basis).toBe('declared');
  expect(data.assembly!.connections.find(c=>c.id==='connection:assembly:328011951ac11ee7:jaw_drive')!.endpoints.every(endpoint=>endpoint.member_refs.length===0)).toBe(true);
  expect(errors).toEqual([]);
});

test('曲面见证在原相机下没有碎三角铺色，四孔仍是原面着色',async({page})=>{
  const records=[];const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const key of ['soft_cover_support','jaw_drive']){
    const before=JSON.parse(fs.readFileSync(path.join(out,`before-${key}.json`),'utf8'));
    await page.goto(url(jaw,{interface:key==='jaw_drive'?drive:cover,inspection:'1',camera:[...before.view.camera.position,...before.view.camera.target].join(',')}));await ready(page);
    const scene=page.locator('.scene-canvas');
    await expect(scene).toHaveAttribute('data-highlight-mode',key==='jaw_drive'?'source_facet_colors':'source_witness');
    await expect(scene).toHaveAttribute('data-highlighted-source-faces',key==='jaw_drive'?'720':'0');
    await expect(scene).toHaveAttribute('data-witness-markers',key==='jaw_drive'?'0':'1');
    const after=await capture(page,'after-'+key);sameCamera(after.view.camera,before.view.camera);expect((await page.locator('.inspector').boundingBox())!.width).toBeCloseTo(360,0);records.push(after);
  }
  fs.writeFileSync(path.join(out,'highlight-comparison.json'),JSON.stringify(records,null,2)+'\n');expect(errors).toEqual([]);
});

test('共享舵机源网格仅当前实例着色，另一实例画面保持原色',async({page})=>{
  test.setTimeout(90000);
  const owner='part:microduck:a682dc3620df43f5',other='part:microduck:09cb390e38430c1e';
  const item=data.assembly!.interfaces.find(item=>item.owner_ref===owner&&item.key==='servo_end_plus')!;
  const hidden=data.parts.filter(part=>![owner,other].includes(part.id)).map(part=>part.id).join(',');
  await page.goto(url(owner,{hidden,grid:'0',camera:'.09,-.11,.26,.006,0,.13'}));await ready(page);
  const before=await capture(page,'shared-instance-before');
  const part=data.parts.find(part=>part.id===other)!;
  expect(data.parts.find(part=>part.id===owner)!.geometryUrl).toBe(part.geometryUrl);
  const response=await fetch('http://127.0.0.1:8780'+part.geometryUrl);const geometry=new STLLoader().parse(await response.arrayBuffer());geometry.computeBoundingBox();
  const matrix=new Matrix4().compose(new Vector3().fromArray(part.position),new Quaternion().fromArray(part.quaternion),new Vector3().fromArray(part.scale));
  const box=geometry.boundingBox!.clone().applyMatrix4(matrix),canvas=(await page.locator('canvas.scene-webgl').boundingBox())!,camera=cameraFor(before.view.camera,canvas.width,canvas.height);
  const projected=[box.min.x,box.max.x].flatMap(x=>[box.min.y,box.max.y].flatMap(y=>[box.min.z,box.max.z].map(z=>new Vector3(x,y,z).project(camera))));
  const clip={x:Math.max(canvas.x,Math.floor(canvas.x+(Math.min(...projected.map(p=>p.x))+1)/2*canvas.width)),y:Math.max(canvas.y,Math.floor(canvas.y+(1-Math.max(...projected.map(p=>p.y)))/2*canvas.height)),width:1,height:1};
  clip.width=Math.min(canvas.x+canvas.width-clip.x,Math.ceil((Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x)))/2*canvas.width));
  clip.height=Math.min(canvas.y+canvas.height-clip.y,Math.ceil((Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)))/2*canvas.height));
  expect(clip.width).toBeGreaterThan(30);expect(clip.height).toBeGreaterThan(30);
  const beforePixels=PNG.sync.read(await page.screenshot({path:path.join(out,'shared-unselected-before.png'),clip}));
  await page.locator(`[data-assembly-interface="${item.id}"] .assembly-interface-select`).click();await page.locator('[data-assembly-member]').first().click();
  const after=await capture(page,'shared-instance-after');sameCamera(after.view.camera,before.view.camera);
  const afterPixels=PNG.sync.read(await page.screenshot({path:path.join(out,'shared-unselected-after.png'),clip}));
  expect(afterPixels.width).toBe(beforePixels.width);expect(afterPixels.height).toBe(beforePixels.height);
  let changed=0;for(let at=0;at<afterPixels.data.length;at+=4)if([0,1,2].some(offset=>Math.abs(afterPixels.data[at+offset]-beforePixels.data[at+offset])>12))changed++;
  const fraction=changed/(afterPixels.width*afterPixels.height);expect(fraction).toBeLessThan(.005);
  fs.writeFileSync(path.join(out,'shared-instance-check.json'),JSON.stringify({owner,other,geometryUrl:part.geometryUrl,clip,changedPixels:changed,pixelCount:afterPixels.width*afterPixels.height,changedFraction:fraction,before:before.view,after:after.view},null,2)+'\n');geometry.dispose();
});

test('参考路径沿轴拆出、三维拾取、对端返回及分享刷新保持同一连接',async({page,context})=>{
  test.setTimeout(150000);await context.grantPermissions(['clipboard-read','clipboard-write']);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const connection=data.assembly!.connections.find(connection=>connection.id==='connection:assembly:328011951ac11ee7:jaw_drive')!,pathRecord=connection.fastener_paths![0];
  const peer=data.assembly!.interfaces.find(item=>item.id===pathRecord.receiver.interface_ref)!;
  const records=[];await page.goto(url(jaw,{interface:drive}));await ready(page);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','0');
  await page.locator('.assembly-fasteners details summary').click();
  await page.locator(`[data-fastener-path="${pathRecord.id}"]`).getByRole('button',{name:'路径 1 · 螺钉示意',exact:true}).click();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','1');
  await page.locator('.assembly-reference-focus').click();await settled(page);
  const assembled=await capture(page,'connection-assembled');records.push(assembled);
  expect(assembled.view.inspection.mode).toBe('connection');expect(assembled.view.inspection.visiblePartIds.sort()).toEqual([jaw,peer.owner_ref].sort());
  expect(assembled.view.geometrySelection.fastenerRef).toBe(pathRecord.id);axialCheck(assembled.view.inspection.referenceFasteners[0]);
  const slider=page.getByRole('slider',{name:'爆炸展开程度'});await slider.focus();await page.keyboard.press('End');await expect(slider).toHaveValue('100');await settled(page);
  const exploded=await capture(page,'connection-exploded');records.push(exploded);const reference=axialCheck(exploded.view.inspection.referenceFasteners[0]);
  expect(new Vector3().fromArray(reference.head).distanceTo(new Vector3().fromArray(reference.entry))).toBeGreaterThan(.01);
  // Clear only the visual fastener selection while retaining this explicit hole
  // and connection view, then hit the actual 3D head, rather than a DOM proxy.
  await page.locator(`[data-assembly-member="${pathRecord.entry.member_ref}"]`).click();
  const beforePick=await exported(page);expect(beforePick.geometrySelection.fastenerRef).toBeUndefined();expect(beforePick.inspection.referenceFasteners).toHaveLength(1);
  const canvas=(await page.locator('canvas.scene-webgl').boundingBox())!,projection=cameraFor(beforePick.camera,canvas.width,canvas.height),point=new Vector3().fromArray(beforePick.inspection.referenceFasteners[0].head).project(projection);
  expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1);
  const click={x:canvas.x+(point.x+1)/2*canvas.width,y:canvas.y+(1-point.y)/2*canvas.height};await page.mouse.click(click.x,click.y);
  await expect.poll(async()=>(await exported(page)).geometrySelection.fastenerRef).toBe(pathRecord.id);
  const picked=await capture(page,'connection-canvas-picked');records.push({...picked,click,beforePick:beforePick.geometrySelection});
  await slider.focus();await page.keyboard.press('Home');await expect(slider).toHaveValue('0');await settled(page);
  const restored=await capture(page,'connection-restored');records.push(restored);const restoredReference=axialCheck(restored.view.inspection.referenceFasteners[0]);
  for(const key of ['entry','head','receiver','axis'])sameVector(restoredReference[key],assembled.view.inspection.referenceFasteners[0][key]);
  const beforePeer=await exported(page);
  await page.locator(`[data-assembly-peer="${peer.id}"]`).getByRole('button',{name:'定位对端',exact:true}).click();await settled(page);
  const peerRecord=await capture(page,'connection-receiver');records.push(peerRecord);expect(peerRecord.view.selectedId).toBe(peer.owner_ref);expect(peerRecord.view.geometrySelection.id).toBe(peer.id);expect(peerRecord.view.geometrySelection.memberRef).toBe(pathRecord.receiver.member_ref);
  await page.getByRole('button',{name:'返回原接口',exact:true}).click();await settled(page);
  const returned=await capture(page,'connection-returned');records.push(returned);sameCamera(returned.view.camera,beforePeer.camera);expect(returned.view.inspection.mode).toBe('connection');expect(returned.view.geometrySelection.fastenerRef).toBe(pathRecord.id);
  await page.getByRole('button',{name:'复制视图链接',exact:true}).click();const shared=await page.evaluate(()=>navigator.clipboard.readText());
  await page.goto(shared);await ready(page);const refreshed=await capture(page,'connection-shared-refreshed');records.push(refreshed);
  expect(refreshed.view.inspection.mode).toBe('connection');expect(refreshed.view.geometrySelection.fastenerRef).toBe(pathRecord.id);sameCamera(refreshed.view.camera,returned.view.camera);expect(refreshed.view.inspection.visiblePartIds.sort()).toEqual([jaw,peer.owner_ref].sort());
  const toggle=page.getByRole('button',{name:'切换连接件示意',exact:true});await toggle.click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','0');expect((await exported(page)).inspection.referenceFasteners).toEqual([]);
  const hidden=await capture(page,'connection-hidden');records.push(hidden);
  await page.locator(`[data-assembly-peer="${peer.id}"]`).getByRole('button',{name:'定位对端',exact:true}).click();await settled(page);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','0');await expect(toggle).toHaveAttribute('aria-pressed','false');records.push(await capture(page,'connection-hidden-receiver'));
  await page.getByRole('button',{name:'返回原接口',exact:true}).click();await settled(page);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','0');await expect(toggle).toHaveAttribute('aria-pressed','false');
  const hiddenReturned=await capture(page,'connection-hidden-returned');records.push(hiddenReturned);expect(hiddenReturned.view.inspection.mode).toBe('connection');sameCamera(hiddenReturned.view.camera,hidden.view.camera);
  await toggle.click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-fastener-count','1');records.push(await capture(page,'connection-visible-again'));
  fs.writeFileSync(path.join(out,'connection-operations.json'),JSON.stringify({snapshot,pathRef:pathRecord.id,records,errors},null,2)+'\n');expect(errors).toEqual([]);
});
