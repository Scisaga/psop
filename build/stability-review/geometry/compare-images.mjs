import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {chromium} from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
const before='build/stability-review/geometry/before-final',after=process.argv[2]||'build/stability-review/geometry/after-dev';
const beforeCapture=JSON.parse(fs.readFileSync(path.join(before,'capture.json'))),afterCapture=JSON.parse(fs.readFileSync(path.join(after,'capture.json')));
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();await page.setContent('<canvas></canvas>');const records=[];
for(const r of beforeCapture.records.filter(r=>['source-facets','display-normals','opening-outline','all-overlays','final','oblique','zoom-out'].includes(r.mode))){
 const b=fs.readFileSync(path.join(before,r.image)),a=fs.readFileSync(path.join(after,r.image));
 const result=await page.evaluate(async({before,after,save})=>{
   async function pixels(src){const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return {im,rgba:ctx.getImageData(0,0,c.width,c.height).data};}
   const b=await pixels(before),a=await pixels(after);if(b.im.width!==a.im.width||b.im.height!==a.im.height)throw Error('Viewport differs');
   const width=b.im.width,height=b.im.height;let changed=0,changedOver10=0,totalDelta=0,goldBefore=0,goldAfter=0;
   let xmin=width,xmax=0,ymin=height,ymax=0;const delta=document.createElement('canvas');delta.width=width;delta.height=height;const dc=delta.getContext('2d'),dp=dc.createImageData(width,height);
   const gold=(p,i)=>p[i]>140&&p[i]>p[i+1]*1.1&&p[i+1]>p[i+2]*1.1;
   for(let i=0;i<a.rgba.length;i+=4){const d=Math.max(...[0,1,2].map(c=>Math.abs(a.rgba[i+c]-b.rgba[i+c])));if(d>0)changed++;if(d>10){changedOver10++;const x=i/4%width,y=Math.floor(i/4/width);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}totalDelta+=d;if(gold(b.rgba,i))goldBefore++;if(gold(a.rgba,i))goldAfter++;dp.data[i]=d>10?220:245;dp.data[i+1]=d>10?30:245;dp.data[i+2]=d>10?150:245;dp.data[i+3]=255;}
   dc.putImageData(dp,0,0);
   let comparison;
   if(save){const crop={x:320,y:340,w:180,h:180};const c=document.createElement('canvas');c.width=crop.w*3*3;c.height=crop.h*3+32;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.font='20px sans-serif';ctx.fillStyle='#222';for(const [j,label,im]of[[0,'BEFORE',b.im],[1,'AFTER',a.im],[2,'PIXEL DELTA',delta]]){ctx.fillText(label,j*crop.w*3+12,24);ctx.imageSmoothingEnabled=false;ctx.drawImage(im,crop.x,crop.y,crop.w,crop.h,j*crop.w*3,32,crop.w*3,crop.h*3);}comparison=c.toDataURL('image/png').split(',')[1];}
   return{width,height,changedPixels:changed,changedOver10Pixels:changedOver10,meanMaximumChannelDifference:totalDelta/(width*height),changedBounds:changedOver10?{xmin,xmax,ymin,ymax}:null,goldBefore,goldAfter,comparison};
 },{before:b.toString('base64'),after:a.toString('base64'),save:r.mode==='final'});
 if(result.comparison){fs.writeFileSync(path.join(after,`${r.target}-comparison.png`),Buffer.from(result.comparison,'base64'));delete result.comparison;}
 const ar=afterCapture.records.find(x=>x.target===r.target&&x.mode===r.mode);
 records.push({target:r.target,mode:r.mode,...result,sourcePositionSha256Before:r.sourcePositionSha256,sourcePositionSha256After:ar?.sourcePositionSha256,sourcePositionsEqual:r.sourcePositionSha256===ar?.sourcePositionSha256,cameraBefore:r.actualCamera||r.camera,cameraAfter:ar?.actualCamera||ar?.camera,beforePngSha256:createHash('sha256').update(b).digest('hex'),afterPngSha256:createHash('sha256').update(a).digest('hex')});
}
await browser.close();fs.writeFileSync(path.join(after,'pixel-comparison.json'),JSON.stringify({before,after,records},null,2));console.log(JSON.stringify(records.map(r=>({target:r.target,mode:r.mode,changed:r.changedOver10Pixels,gold:[r.goldBefore,r.goldAfter],sourcePositionsEqual:r.sourcePositionsEqual})),null,2));
