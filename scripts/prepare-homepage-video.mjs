/** Cut real Playwright recordings with the browser's native WebM encoder. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'apps/workbench/package.json'));
const {chromium}=require('@playwright/test');
const manifestFile=path.join(root,'docs/html/assets/workbench-capture.json');
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
const args=process.argv.slice(2),segmentIndex=args.indexOf('--segments'),editIndex=args.indexOf('--edit');
const finalFile=path.join(root,'docs/html/assets/workbench-simulate-demo.webm');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function remux(bytes){
 const runtime=path.join(root,'.runtime/homepage-video');await mkdir(runtime,{recursive:true});
 const temporary=path.join(runtime,'browser-encoded.webm');await writeFile(temporary,bytes);
 const core=path.dirname(require.resolve('playwright-core/package.json'));
 const revision=JSON.parse(await readFile(path.join(core,'browsers.json'),'utf8')).browsers.find(b=>b.name==='ffmpeg').revision;
 const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'ms-playwright'):process.platform==='darwin'?path.join(os.homedir(),'Library/Caches/ms-playwright'):path.join(process.env.XDG_CACHE_HOME||path.join(os.homedir(),'.cache'),'ms-playwright'));
 const ffmpeg=process.env.PLAYWRIGHT_FFMPEG_PATH||path.join(cache,'ffmpeg-'+revision,process.platform==='win32'?'ffmpeg-win64.exe':process.platform==='darwin'?'ffmpeg-mac':'ffmpeg-linux');
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',temporary,'-c','copy','-y',finalFile],{windowsHide:true,stdio:'pipe'});
 return readFile(finalFile);
}
if(args.includes('--remux-only')){
 const bytes=await remux(await readFile(finalFile));
 manifest.video.bytes=bytes.length;manifest.video.sha256=sha(bytes);
 await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');console.log('Added seek metadata to the recording.');process.exit(0);
}
if(segmentIndex>=0&&editIndex>=0)throw Error('Choose either --segments or --edit.');
const recipePath=editIndex>=0?args[editIndex+1]:segmentIndex<0?manifest.video?.edit_recipe:undefined;
let sources,segments,recipe;
if(recipePath){
 recipe=JSON.parse(await readFile(path.resolve(root,recipePath),'utf8'));
 if(recipe.schema!=='psop.homepage-video-edit/1')throw Error('Unsupported edit recipe.');
 sources=recipe.sources;segments=recipe.segments;
}else{
 sources=[{id:'original',file:manifest.raw_video,capture:'docs/html/assets/workbench-capture.json'}];
 const selection=segmentIndex>=0?args[segmentIndex+1]:manifest.video_start_seconds+':'+(manifest.video_start_seconds+14)+','+(manifest.video_end_seconds-33)+':'+(manifest.video_end_seconds-25)+','+(manifest.video_end_seconds-9.3)+':'+(manifest.video_end_seconds-1.3);
 segments=selection.split(',').map((pair,index)=>{
  const [from,to]=pair.split(':').map(Number);
  return {source:'original',from,to,label:index===0?'选择 · 连接 · 拆分 · 撤销':'自动还原 · 来源原装构型 · 4×'};
 });
}
if(!sources?.length||!segments?.length||new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Invalid source list.');
for(const segment of segments){
 if(!sources.some(s=>s.id===segment.source)||!Number.isFinite(segment.from)||!Number.isFinite(segment.to)||segment.from<0||segment.to<=segment.from||!segment.label)throw Error('Invalid segment.');
}
const inputs=[];
for(const source of sources){
 const bytes=await readFile(path.resolve(root,source.file)),digest=sha(bytes);
 if(source.sha256&&source.sha256!==digest)throw Error('Source recording changed: '+source.file);
 const capture=JSON.parse(await readFile(path.resolve(root,source.capture),'utf8'));
 if(capture.package_digest!==manifest.package_digest)throw Error('Source snapshot differs: '+source.file);
 inputs.push({...source,sha256:digest,base64:bytes.toString('base64')});
}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('about:blank');
 console.log('Encoding '+segments.length+' excerpts from '+sources.length+' real recordings…');
 const result=await page.evaluate(async({inputs,segments})=>{
  const videos=new Map(),durations={};
  for(const input of inputs){
   const video=document.createElement('video');video.muted=true;video.preload='auto';
   const loaded=new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Cannot decode '+input.id));});
   video.src='data:video/webm;base64,'+input.base64;await loaded;
   videos.set(input.id,video);durations[input.id]=video.duration;
  }
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
  const ctx=canvas.getContext('2d');let currentVideo,label='',drawing=true;
  function draw(){
   if(!drawing)return;
   if(currentVideo?.readyState>=2)ctx.drawImage(currentVideo,0,0,1600,1000);
   ctx.fillStyle='rgba(20,38,46,.9)';ctx.fillRect(420,945,760,38);
   ctx.fillStyle='#e1ebed';ctx.font='18px "Segoe UI", "Microsoft YaHei", sans-serif';ctx.textAlign='center';
   ctx.fillText(label+'  /  实录剪辑',800,970);requestAnimationFrame(draw);
  }
  const stream=canvas.captureStream(20),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2800000});
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  let started=false;
  for(const segment of segments){
   const video=videos.get(segment.source);
   if(segment.to>video.duration+.1)throw Error('Segment exceeds '+segment.source);
   currentVideo=video;label=segment.label;
   if(Math.abs(video.currentTime-segment.from)>.001||video.readyState<2){
    const sought=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
    video.currentTime=segment.from;await sought;
   }
   if(!started){draw();recorder.start(1000);started=true;}else recorder.resume();
   await video.play();
   await new Promise(resolve=>{const tick=()=>video.currentTime>=segment.to?resolve():setTimeout(tick,15);tick();});
   video.pause();recorder.pause();
  }
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await stopped;
  drawing=false;stream.getTracks().forEach(track=>track.stop());
  const blob=new Blob(chunks,{type:'video/webm'});
  const base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
  return {base64,durations};
 },{inputs,segments});
 const bytes=await remux(Buffer.from(result.base64,'base64'));
 manifest.video={file:'workbench-simulate-demo.webm',kind:'actual_workbench_recording',encoding:'WebM / VP9',
  edited_at:new Date().toISOString(),dimensions:[1600,1000],fps:20,
  ...(recipePath?{edit_recipe:path.relative(root,path.resolve(root,recipePath)).replaceAll('\\','/')}:{}),
  ...(recipe?.connection_capture?{connection_capture:recipe.connection_capture}:{}),
  sources:inputs.map(({base64,...source})=>({...source,duration_seconds:result.durations[source.id]})),segments,
  duration_target_seconds:segments.reduce((sum,s)=>sum+s.to-s.from,0),
  editing:recipe?.editing||'Waiting and intermediate assembly footage cut; native automatic-assembly playback 4×. No synthetic scene or motion.',
  bytes:bytes.length,sha256:sha(bytes)};
 await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({file:manifest.video.file,bytes:bytes.length,duration:manifest.video.duration_target_seconds}));
}finally{await browser.close();}
