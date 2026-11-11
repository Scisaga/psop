/** Behavioural regression checks for both file:// and static HTTP delivery. */
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Script} from 'node:vm';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'docs/html'),runtime=path.join(root,'.runtime/homepage-verification');
await mkdir(runtime,{recursive:true});
const require=createRequire(path.join(root,'apps/workbench/package.json'));
const {chromium,expect}=require('@playwright/test');
const args=process.argv.slice(2),baseIndex=args.indexOf('--base');
const base=baseIndex>=0?args[baseIndex+1]:'http://127.0.0.1:8797/';
const report={schema:'psop.homepage-validation/2',checked_at:new Date().toISOString(),timezone:'Asia/Shanghai',result:'running',checks:{},protocols:{},viewports:[],previews:[],errors:[]};
let service,browser;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function check(name,fn){console.log('Checking '+name+'…');try{const value=await fn();report.checks[name]=value??'passed';}catch(error){report.checks[name]='failed';throw new Error(name+': '+error.message);}}
try{
 const html=await readFile(path.join(directory,'index.html'),'utf8');
 await check('static_integrity',async()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  if(new Set(ids).size!==ids.length)throw Error('Duplicate HTML IDs.');
  const paths=new Set([...html.matchAll(/\b(?:src|href|poster|data-src)="([^"]+)"/g)].map(m=>m[1]).filter(p=>!p.startsWith('#')&&!/^[a-z]+:/i.test(p)));
  for(const item of paths)await stat(path.join(directory,item.split(/[?#]/)[0]));
  for(const anchor of ['top','workspace','knowledge','assembly','solutions','research','execution','field','evidence','start'])if(!ids.includes(anchor))throw Error('Missing anchor '+anchor);
  if(/COMPILE TASKS|编译任务|COMPILE → RUNTIME|完整方案|brand-dot/.test(html))throw Error('Old product or brand copy remains.');
  for(const file of ['main.js','demos.js','microduck-3d.js'])new Script(await readFile(path.join(directory,'scripts',file),'utf8'),{filename:file});
  const source=await readFile(path.join(root,'assets/brand/psop-mark.svg'));
  for(const name of ['psop-mark.svg','psop-favicon.svg'])if(sha(await readFile(path.join(directory,'assets/brand',name)))!==sha(source))throw Error('Brand master differs: '+name);
  return {local_paths:paths.size,duplicate_ids:false,legacy_anchors:10,javascript_syntax:'passed',brand_master:'identical'};
 });
 if(baseIndex<0){
  service=spawn(process.execPath,[path.join(root,'scripts/serve-homepage.mjs'),'--port','8797'],{cwd:root,windowsHide:true,stdio:'ignore'});
  for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok).catch(()=>false))break;if(i===59)throw Error('Preview service unavailable.');await new Promise(r=>setTimeout(r,200));}
 }
 browser=await chromium.launch({channel:'chrome',headless:true});
 const urls={file:pathToFileURL(path.join(directory,'index.html')).href,http:base};
 for(const [protocol,url] of Object.entries(urls)){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],failed=[],requests=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('request',r=>requests.push(r.url()));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const result=report.protocols[protocol]={};
  await check(protocol+'_delivery',async()=>{
   const response=await page.goto(url);if(protocol==='http'&&response.status()!==200)throw Error('Non-200 response.');
   await expect(page.getByRole('heading',{level:1})).toHaveText('读懂设备，开始装配。');
   await page.evaluate(()=>document.fonts.ready);
   result.initial_media_requests=requests.filter(u=>/\.(?:webm|mp4|pdf)(?:\?|$)/.test(u)).length;
   if(result.initial_media_requests)throw Error('Video or PDF requested before interaction.');
   result.external_requests=requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(new URL(base).origin)).length;
   if(result.external_requests)throw Error('External network dependency.');
  });
  await check(protocol+'_tabs_and_image_dialog',async()=>{
   const tab=page.getByRole('tab',{name:'Build 知识构建'});await tab.focus();
   await page.keyboard.press('ArrowRight');await expect(page.locator('#tab-simulate')).toBeFocused();
   await page.keyboard.press('End');await expect(page.locator('#tab-compile')).toBeFocused();
   await expect(page.locator('#panel-compile')).toContainText('执行服务未接入');
   await page.keyboard.press('Home');await expect(tab).toBeFocused();
   await page.locator('.hero [data-preview]').click();
   await expect(page.locator('#image-modal')).toBeVisible();await expect(page.locator('#image-title')).toHaveText('设备总览');
   await page.locator('#image-fit').click();await expect(page.locator('#image-fit')).toHaveAttribute('aria-pressed','true');
   await page.locator('#image-detail').click();await expect(page.locator('#image-preview')).toHaveJSProperty('naturalWidth',1600);
   await page.keyboard.press('Escape');await expect(page.locator('.hero [data-preview]')).toBeFocused();
   await page.locator('#open-sources').click();await expect(page.locator('#sources-modal')).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.locator('#open-sources')).toBeFocused();
  });
  await check(protocol+'_three_dimensional_view',async()=>{
   await page.locator('#microduck-viewer').scrollIntoViewIfNeeded();
   await expect(page.locator('#microduck-viewer')).toHaveClass(/is-3d-ready/,{timeout:60000});
   let state=await page.evaluate(()=>document.getElementById('microduck-viewer')._psop3d.getState());
   if(state.meshCount!==70||state.source.mesh_count!==38||!state.sourceMatricesPreserved||state.explosion!==0||!state.manual)throw Error('Source geometry or default pose differs.');
   await page.locator('#explode-toggle').click();await expect(page.locator('#explode-toggle')).toHaveAttribute('aria-pressed','true');
   await expect(page.locator('#explode-range')).toHaveValue('100');
   await page.locator('#explode-range').fill('40');await page.locator('#explode-range').dispatchEvent('input');
   await expect(page.locator('#microduck-viewer')).toHaveAttribute('data-explode','0.400');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.emulateMedia({reducedMotion:'reduce'});
   await expect(page.locator('#explode-range')).toHaveValue('40');
   await page.locator('#microduck-canvas').focus();await page.keyboard.press('ArrowLeft');
   const rotated=await page.evaluate(()=>document.getElementById('microduck-viewer')._psop3d.getState().azimuth);
   if(rotated===state.azimuth)throw Error('Keyboard rotation failed.');
   await page.locator('#model-reset').click();await expect(page.locator('#explode-range')).toHaveValue('0');
   result.geometry={source_meshes:38,instances:70,source_matrices_preserved:true,manual_initial_pose:true,renderer:state.renderer};
  });
  await check(protocol+'_legacy_research_links',async()=>{
   await page.goto(url+'#execution');await expect(page.locator('#execution')).toHaveAttribute('open','');
   await expect(page.locator('#eg-graph [data-eg-node]')).toHaveCount(13);
   await expect(page.locator('#eg-graph .eg-edges > path')).toHaveCount(13);
   await page.locator('#eg-play').click();await expect(page.locator('#eg-demo')).toHaveAttribute('data-eg-state','waiting',{timeout:30000});
   await expect(page.locator('#eg-demo')).toHaveAttribute('data-eg-join-fired','false');
   await page.locator('#eg-evidence').click();await expect(page.locator('#eg-demo')).toHaveAttribute('data-eg-state','complete',{timeout:30000});
   await expect(page.locator('#eg-demo')).toHaveAttribute('data-eg-join-fired','true');
   await page.locator('#eg-reset').click();await expect(page.locator('#eg-demo')).toHaveAttribute('data-eg-state','ready');
   await page.goto(url+'#field');await expect(page.locator('#field')).toHaveAttribute('open','');
   await page.locator('[data-ar-step="2"]').click();await expect(page.locator('#ar-demo')).toHaveAttribute('data-ar-state','waiting');
   await page.locator('#play-ar-video').click();await expect(page.locator('#video-modal')).toBeVisible();
   await page.waitForFunction(()=>document.getElementById('ar-video').readyState>=2);
   await page.locator('#close-video').click();await expect(page.locator('#ar-video')).toHaveJSProperty('paused',true);
   await expect(page.locator('#play-ar-video')).toBeFocused();
  });
  await check(protocol+'_assembly_recording',async()=>{
   await page.goto(url+'#assembly');
   await expect(page.locator('#assembly-video')).not.toHaveAttribute('src',/./);
   await page.locator('#play-assembly-video').click();
   await page.waitForFunction(()=>document.getElementById('assembly-video').currentTime>.1,{},{timeout:30000});
   const info=await page.locator('#assembly-video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message}));
   if(info.error||info.duration<28||info.duration>35||info.width!==1600)throw Error('Recording metadata invalid: '+JSON.stringify(info));
   await page.locator('#assembly-video').evaluate(video=>{video.pause();video.currentTime=10;});
   await page.waitForFunction(()=>{const video=document.getElementById('assembly-video');return !video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-10)<.1;});
   result.recording={...info,seek_to_ten_seconds:'passed'};
   await page.locator('#assembly-video').evaluate(video=>video.play());
   await page.locator('#top').scrollIntoViewIfNeeded();await expect(page.locator('#assembly-video')).toHaveJSProperty('paused',true);
  });
  await check(protocol+'_responsive_layout',async()=>{
   for(const width of [1920,1440,1024,768,390,360]){
    await page.setViewportSize({width,height:width<700?844:1000});
    await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);});
    await page.waitForTimeout(100);
    const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    if(dimensions.document>width+1||dimensions.body>width+1)throw Error('Horizontal overflow: '+JSON.stringify(dimensions));
    report.viewports.push({protocol,...dimensions});
   }
   await page.locator('#top').scrollIntoViewIfNeeded();
   await page.getByRole('button',{name:'打开导航',exact:true}).click();await expect(page.locator('#mobile-nav')).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'打开导航',exact:true})).toBeFocused();
   await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.locator('#mobile-nav a[href="#knowledge"]').click();await expect(page.locator('#mobile-nav')).toBeHidden();
  });
  await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=false));
  await page.setViewportSize({width:1440,height:1000});await page.goto(url);await page.evaluate(()=>document.fonts.ready);
  if(protocol==='http'){
   // Load below-fold imagery and render the manual canvas before exporting a full-page preview.
   await page.evaluate(()=>Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode().catch(()=>{});})));
   await page.locator('#microduck-viewer').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.getElementById('microduck-viewer')._psop3d?.getState().frames>0);
   await page.locator('#top').scrollIntoViewIfNeeded();
   await page.waitForTimeout(120);
   for(const [file,width,height,fullPage] of [['preview.png',1440,1000,false],['preview-mobile.png',390,844,false],['preview-full.png',1440,1000,true]]){
    await page.setViewportSize({width,height});
    if(fullPage){
     await page.locator('#microduck-viewer').scrollIntoViewIfNeeded();
     await page.waitForTimeout(250);
     await page.locator('#top').scrollIntoViewIfNeeded();
     await page.waitForTimeout(100);
    }
    await page.screenshot({path:path.join(directory,file),fullPage,animations:'disabled'});
    report.previews.push({file,width,height,full_page:fullPage,sha256:sha(await readFile(path.join(directory,file)))});
   }
   await page.setViewportSize({width:1440,height:1000});await page.goto(url+'#execution');
   await page.locator('#eg-demo').screenshot({path:path.join(directory,'eg-preview.png'),animations:'disabled'});
   await page.goto(url);await page.locator('.brand').first().screenshot({path:path.join(directory,'brand-preview.png')});
  }
  const requestFailures=failed.filter(r=>!r.error?.includes('ERR_ABORTED'));
  if(errors.length||requestFailures.length)throw Error(protocol+' browser errors: '+JSON.stringify({errors,failed:requestFailures}));
  result.console_errors=errors;result.failed_requests=requestFailures;result.status='passed';
  await context.close();
 }
 await check('degraded_access',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
  const page=await context.newPage();await page.goto(urls.file);
  for(const mode of ['build','simulate','compile'])await expect(page.locator('#panel-'+mode)).toBeVisible();
  await page.locator('#field summary').click();await expect(page.locator('#ar-demo')).toBeVisible();
  await expect(page.locator('#model-fallback')).toBeVisible();await context.close();
  const disabled=await browser.newContext({reducedMotion:'reduce'});await disabled.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};
  });
  const fallback=await disabled.newPage();await fallback.goto(urls.file+'#knowledge');
  await fallback.locator('#microduck-viewer').scrollIntoViewIfNeeded();
  await expect(fallback.locator('#microduck-viewer')).toHaveClass(/is-3d-fallback/,{timeout:30000});
  await expect(fallback.locator('#model-fallback')).toBeVisible();await fallback.locator('#explode-toggle').click();
  await expect(fallback.locator('#model-fallback')).toHaveAttribute('src',/microduck-exploded/);await disabled.close();
  const failedContext=await browser.newContext({reducedMotion:'reduce'});await failedContext.route('**/assets/3d/three.min.js',route=>route.abort('failed'));
  const failedPage=await failedContext.newPage();await failedPage.goto(base+'#knowledge');await failedPage.locator('#microduck-viewer').scrollIntoViewIfNeeded();
  await expect(failedPage.locator('#microduck-viewer')).toHaveClass(/is-3d-fallback/,{timeout:30000});await expect(failedPage.locator('#model-fallback')).toBeVisible();await failedContext.close();
  return {javascript_disabled:'passed',webgl_disabled:'passed',dependency_failure:'passed',reduced_motion:'passed'};
 });
 await check('asset_provenance',async()=>{
  const manifest=JSON.parse(await readFile(path.join(directory,'assets/workbench-capture.json'),'utf8'));
  if(manifest.package_version!=='2.0.0-capabilities.10'||manifest.counts.parts!==70||manifest.counts.geometries!==38)throw Error('Wrong product snapshot.');
  if(manifest.operations.length!==5||manifest.operations.some((operation,index)=>operation.revision!==index+1))throw Error('Incomplete saved operation sequence.');
  for(const entry of [...manifest.images,manifest.video]){
   const bytes=await readFile(path.join(directory,'assets',entry.file));if(sha(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('Capture digest mismatch: '+entry.file);
  }
  const connection=JSON.parse(await readFile(path.resolve(root,manifest.video.connection_capture),'utf8'));
  if(connection.package_digest!==manifest.package_digest||connection.isolation.user_scenes_modified!==false||connection.browser_errors.length)throw Error('Close-up capture basis differs.');
  if(connection.demonstration.source_kind!=='reference_connection'||connection.demonstration.configuration_ref!=='configuration:microduck:source-qpos0'||connection.demonstration.preview_status!=='ready')throw Error('Close-up does not use an eligible source-original connection.');
  if(connection.visible_projection_count!==2||connection.demonstration.hidden_other_instances!==68||connection.demonstration.visible_instances.length!==2)throw Error('Close-up contains unexpected objects.');
  if(connection.operations.length!==3||connection.operations.some((operation,index)=>operation.type!==['connect','disconnect','undo'][index]||operation.revision!==index+3||operation.connections!==[1,0,1][index]))throw Error('Close-up command sequence incomplete.');
  for(const entry of connection.images){
   const bytes=await readFile(path.join(directory,'assets',entry.file));if(sha(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('Close-up screenshot differs: '+entry.file);
  }
  const recipe=JSON.parse(await readFile(path.resolve(root,manifest.video.edit_recipe),'utf8'));
  if(recipe.schema!=='psop.homepage-video-edit/1'||JSON.stringify(recipe.segments)!==JSON.stringify(manifest.video.segments))throw Error('Movie differs from its edit recipe.');
  for(const source of recipe.sources){
   const encoded=manifest.video.sources.find(item=>item.id===source.id);
   if(!encoded||encoded.sha256!==source.sha256||encoded.file!==source.file||encoded.capture!==source.capture)throw Error('Movie source differs: '+source.id);
  }
  const closeUpSource=recipe.sources.find(source=>source.capture===manifest.video.connection_capture);
  if(!closeUpSource||closeUpSource.file!==connection.raw_video||closeUpSource.sha256!==connection.raw_sha256)throw Error('Close-up recording digest differs.');
  const tenSecondSegment=recipe.segments.reduce((result,segment)=>{
   const end=result.elapsed+segment.to-segment.from;
   return {elapsed:end,segment:result.segment||(result.elapsed<=10&&end>10?segment:null)};
  },{elapsed:0,segment:null}).segment;
  if(tenSecondSegment?.source!==closeUpSource.id||!tenSecondSegment.label.startsWith('拆分'))throw Error('Ten-second example is not the clear head-shell split.');
  const sources=JSON.parse(await readFile(path.join(directory,'assets/sources.json'),'utf8'));
  for(const entry of sources.assets){const bytes=await readFile(path.join(directory,'assets',entry.file));if(sha(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('Resource manifest mismatch: '+entry.file);}
  const hero=manifest.images.find(i=>i.file==='workbench-overview.webp');if(hero.bytes>600*1024)throw Error('Hero screenshot exceeds 600 KB.');
  const response=await fetch(new URL('assets/workbench-simulate-demo.webm',base),{headers:{range:'bytes=0-127'}});
  if(response.status!==206||(await response.arrayBuffer()).byteLength!==128)throw Error('Video byte ranges failed.');
  return {snapshot:manifest.package_version,images:manifest.images.length+connection.images.length,video:'verified',head_shell_close_up:{source_original:true,visible_instances:2,hidden_instances:68,commands:'connect / disconnect / undo',ten_second_segment:'split head shells'},hero_bytes:hero.bytes,hashes:'matched',http_byte_ranges:'passed'};
 });
 report.result='passed';
}catch(error){report.result='failed';report.errors.push(error.stack||error.message);console.error(error.message);}
finally{
 if(browser)await browser.close();if(service)service.kill();
 await writeFile(path.join(directory,'validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:report.result,checks:Object.keys(report.checks).length,errors:report.errors.length}));
 if(report.result!=='passed')process.exitCode=1;
}
