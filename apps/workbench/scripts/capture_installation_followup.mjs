/** Verify newly reviewed original installation members, source focus and peers. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(repo,'build/installation-followup-review/ui');
await fs.mkdir(out,{recursive:true});
const revision=JSON.parse(await fs.readFile(path.join(repo,'build/installation-followup-review/catalog-revision.json'),'utf8'));
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
const registry=await(await fetch(origin+'/api/workspaces')).json();
const workspace=registry.workspaces.find(w=>w.id==='microduck');
const snapshot=workspace.selectedSnapshotId;
const data=await(await fetch(`${origin}/api/workspaces/microduck/snapshots/${snapshot}/view`)).json();
expect(data.meta.packageVersion).toBe('2.0.0-capabilities.9');
const geometryOnly=process.argv.includes('--geometry-only');
const previous=geometryOnly?JSON.parse(await fs.readFile(path.join(out,'audit.json'),'utf8')):null;
if(previous){expect(previous.snapshot).toBe(snapshot);expect(previous.package_digest).toBe(data.meta.packageDigest);}
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=previous?.interfaces??[],navigation=previous?.navigation??[],associations=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1560,height:1060},reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','440'));
 page.on('pageerror',error=>errors.push(error.message));
 for(const item of geometryOnly?[]:revision.new_interfaces){
  const url=origin+'/#explorer?'+new URLSearchParams({workspace:workspace.id,snapshot,part:item.owner_ref,detail:'interfaces',labels:'0',explode:'0'});
  await page.goto(url);await page.reload();
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:60000});
  await expect(page.locator('.object-id')).toContainText(item.owner_ref);
  await expect(page.locator('.capability-loading')).toHaveCount(0);
  await page.getByRole('tab',{name:'原装配',exact:true}).click();
  await page.locator(`[data-assembly-interface="${item.id}"] .assembly-interface-select`).click();
  const detail=page.locator(`[data-active-assembly-interface="${item.id}"]`);
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-assembly-member]')).toHaveCount(item.member_count);
  const relations=revision.new_connections.filter(c=>c.endpoints.some(e=>e.interface_ref===item.id));
  for(const relation of relations){
   const peer=relation.endpoints.find(e=>e.interface_ref!==item.id).interface_ref;
   await expect(detail.locator(`[data-assembly-peer="${peer}"]`)).toBeVisible();
   if(relation.basis==='incompatible'){
    await expect(detail).toContainText('来源冲突对端');await expect(detail).toContainText('0.5mm');
    await expect(detail).not.toContainText('已确定对端');
   }
  }
  if(!relations.length)await expect(detail).toContainText('此接口可选用');
  if(item.id.endsWith(':eye_three_tabs')){
   await expect(detail).toContainText('保持方式仍待补充');await expect(detail).toContainText('穿出约0.2mm');
  }
  await detail.getByRole('button',{name:'定位本端',exact:true}).click();
  const scene=page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-camera-flight','settled',{timeout:20000});
  await expect(scene).toHaveAttribute('data-inspection-active','true');
  const filename=item.id.split(':').slice(-2).join('-')+'.png';
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const highlighted=Number(await scene.getAttribute('data-highlighted-source-faces'));
  const witnesses=Number(await scene.getAttribute('data-witness-markers'));
  expect(highlighted+witnesses,item.id+' original source facets or witnesses').toBeGreaterThan(0);
  // Interfaces use an axis frame; the single-Feature visibility sampler does
  // not run on this path. Check the actual rendered source-facet colour too.
  const pixels=await scene.screenshot();
  const visibleGold=await page.evaluate(async base64=>{
   const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   const data=context.getImageData(0,0,canvas.width,canvas.height).data;let count=0;
   for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(r>130&&g>85&&g<220&&b<140&&r>g*1.12&&g>b*1.3)count++;}
   return count;
  },pixels.toString('base64'));
  expect(visibleGold,item.id+' rendered source highlight').toBeGreaterThan(4);
  await detail.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,filename)});
  rows.push({interface_ref:item.id,owner_ref:item.owner_ref,member_count:item.member_count,relation_count:relations.length,highlighted_source_faces:highlighted,source_witnesses:witnesses,visible_gold_pixels:visibleGold,image:filename,url:page.url()});
  for(const relation of relations){
   const peer=relation.endpoints.find(e=>e.interface_ref!==item.id).interface_ref;
   await detail.locator(`[data-assembly-peer="${peer}"]`).getByRole('button',{name:'查看对端',exact:true}).click();
   await expect(page.locator('.capability-loading')).toHaveCount(0);
   await page.getByRole('tab',{name:'原装配',exact:true}).click();
   await expect(page.locator(`[data-active-assembly-interface="${peer}"]`)).toBeVisible();
   navigation.push({from:item.id,to:peer,connection_ref:relation.id,source_conflict:relation.basis==='incompatible',verified:true});
  }
  console.log(JSON.stringify({stage:'new-installation-ui',reviewed:rows.length,total:revision.new_interfaces.length}));
 }
 for(const [owner,feature,label] of [
  ['55970da91992f38c','feature:73de4a7931432d81390d:geometry:84530ebce6a93b73e437','髋连接件与支承片双孔安装'],
  ['986b5adf27910138','feature:235863d91c3a953cf25b:geometry:71085be1b816cc33630d','驱动侧横滚轴承局部承座'],
 ]){
  await page.goto(origin+'/#explorer?'+new URLSearchParams({workspace:workspace.id,snapshot,part:'part:microduck:'+owner,feature,detail:'interfaces',labels:'0',explode:'0'}));await page.reload();
  const active=page.locator(`[data-active-capability-feature="${feature}"]`);
  await expect(active).toBeVisible({timeout:60000});await expect(active).toContainText('关联功能接口：'+label);
  const scene=page.locator('.scene-canvas');await expect(scene).toHaveAttribute('data-scene-ready','true',{timeout:60000});
  await active.getByRole('button',{name:'定位本件几何',exact:true}).click();
  await expect(scene).toHaveAttribute('data-camera-flight','settled',{timeout:20000});
  await expect(scene).toHaveAttribute('data-inspection-active','true');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const visible=Number(await scene.getAttribute('data-focus-visible-source-samples'));
  if(!visible){await page.screenshot({path:path.join(out,'association-failure.png')});console.log(JSON.stringify({feature,attributes:await scene.evaluate(el=>Object.fromEntries([...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])))}));}
  expect(visible).toBeGreaterThan(0);
  const filename='geometry-association-'+owner+'.png';await page.screenshot({path:path.join(out,filename)});
  associations.push({feature_ref:feature,functional_interface_label:label,visible_source_samples:visible,image:filename,verified:true});
 }
 expect(errors).toEqual([]);
 await fs.writeFile(path.join(out,'audit.json'),JSON.stringify({schema:'psop.installation-followup-ui/1',snapshot,version:data.meta.packageVersion,package_digest:data.meta.packageDigest,interfaces:rows,navigation,geometry_associations:associations,javascript_errors:errors},null,2)+'\n');
 console.log(JSON.stringify({ok:true,interfaces:rows.length,navigation:navigation.length,javascript_errors:errors.length}));
}finally{await browser.close();}
