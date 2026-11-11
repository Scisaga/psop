import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readRegistry} from '../scripts/dkp.mjs';
import type {Part,PrototypeData} from '../src/types';

const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const workspace=(await readRegistry()).workspaces.find((item:{id:string})=>item.id==='microduck');
let data:PrototypeData;
test.use({reducedMotion:'reduce'});
test.beforeAll(async({request})=>{
 const response=await request.get(`/api/workspaces/microduck/snapshots/${workspace.selectedSnapshotId}/view`);
 expect(response.ok()).toBe(true);data=await response.json();
});
const url=(part:Part)=>'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot:workspace.selectedSnapshotId,part:part.id});

test('每份源模型都有可辨认的三维缩略图，切换时复用渲染器且保持主视图',async({page},testInfo)=>{
 testInfo.setTimeout(120000);
 const errors:string[]=[],requests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('request',request=>{if(request.url().endsWith('.stl'))requests.push(request.url());});
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext,seen=new WeakSet<HTMLCanvasElement>();
  (window as any).__thumbnailWebGLContexts=0;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:any[]){
   const context=(original as any).apply(this,args);
   if(context&&String(args[0]).startsWith('webgl')&&!seen.has(this)){seen.add(this);(window as any).__thumbnailWebGLContexts++;}
   return context;
  } as typeof original;
 });
 const motor=data.parts.find(part=>part.id==='part:microduck:a682dc3620df43f5')!;
 await page.goto(url(motor));
 const scene=page.locator('.scene-canvas'),thumbnail=page.locator('.object-thumbnail img');
 await expect(scene).toHaveAttribute('data-scene-ready','true',{timeout:60000});
 await expect(scene).toHaveAttribute('data-camera-flight','settled');
 await expect(thumbnail).toBeVisible();
 const sourceCount=requests.length,main=page.locator('canvas.scene-webgl');
 await main.evaluate(canvas=>canvas.setAttribute('data-original-renderer','true'));
 const cameraBefore=[await scene.getAttribute('data-camera-position'),await scene.getAttribute('data-camera-target')];
 const originals=new Map<string,Part>();for(const part of [motor,...data.parts])if(!originals.has(part.geometryUrl))originals.set(part.geometryUrl,part);
 const previews=new Map<string,string>();
 // Source previews must remain complete while the assembly is clipped and transparent.
 await page.getByRole('button',{name:'切换剖切',exact:true}).click();
 await page.getByRole('button',{name:'切换透明显示',exact:true}).click();
 for(const part of originals.values()){
  await page.getByRole('textbox',{name:'查找部件或 ID',exact:true}).fill(part.id);
  await page.locator('.tree-select').click();
  await expect(thumbnail).toHaveAttribute('alt',`${part.name}的三维缩略图`);
  await expect.poll(()=>thumbnail.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth)).toBe(192);
  const imageUrl=(await thumbnail.getAttribute('src'))!;previews.set(part.geometryUrl,imageUrl);
  const image=PNG.sync.read(Buffer.from(imageUrl.split(',')[1],'base64'));
  let foreground=0,edge=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   const offset=(y*image.width+x)*4;
   const difference=Math.max(...[0,1,2].map(channel=>Math.abs(image.data[offset+channel]-image.data[channel])));
   if(difference>18){foreground++;if(x<3||y<3||x>=image.width-3||y>=image.height-3)edge++;}
  }
  expect(foreground,`${part.name}应有可辨认的模型轮廓`).toBeGreaterThan(150);
  expect(edge,`${part.name}应完整显示，不能被卡片边缘裁切`).toBe(0);
  if(part.id===motor.id||part.meshKey==='foot'||part.meshKey==='neck'){
   await page.locator('.object-heading').screenshot({path:testInfo.outputPath(`${part.meshKey}-heading.png`)});
   await thumbnail.screenshot({path:testInfo.outputPath(`${part.meshKey}-thumbnail.png`)});
  }
 }
 expect(new Set(previews.values()).size).toBe(originals.size);
 await expect(main).toHaveAttribute('data-original-renderer','true');
 expect(await page.evaluate(()=>(window as any).__thumbnailWebGLContexts)).toBe(1);
 expect(requests.length).toBe(sourceCount);
 const cameraAfter=[await scene.getAttribute('data-camera-position'),await scene.getAttribute('data-camera-target')];
 for(let vector=0;vector<2;vector++){
  const before=cameraBefore[vector]!.split(',').map(Number),after=cameraAfter[vector]!.split(',').map(Number);
  for(let axis=0;axis<3;axis++)expect(Math.abs(before[axis]-after[axis])).toBeLessThan(1e-10);
 }
 await page.getByRole('textbox',{name:'查找部件或 ID',exact:true}).fill(motor.id);
 await page.locator('.tree-select').click();
 await expect(thumbnail).toHaveAttribute('src',previews.get(motor.geometryUrl)!);
 expect(errors).toEqual([]);
});

test('窄屏中三维缩略图和部件名称完整显示',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const part=data.parts.find(part=>part.kind==='shell')!;
 await page.goto(url(part));
 const thumbnail=page.getByRole('img',{name:`${part.name}的三维缩略图`,exact:true});
 await expect(thumbnail).toBeVisible({timeout:60000});
 await page.locator('.object-heading').scrollIntoViewIfNeeded();
 await expect(thumbnail).toBeInViewport();await expect(page.locator('.object-heading h2')).toBeInViewport();
 const box=(await page.locator('.object-thumbnail').boundingBox())!;expect(box.width).toBe(64);expect(box.height).toBe(64);
 expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
});
