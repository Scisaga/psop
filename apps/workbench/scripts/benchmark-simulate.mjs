import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),option=(key,fallback)=>{const index=args.indexOf(key);return index<0?fallback:args[index+1];};
const base=option('--base',process.env.PSOP_CAPTURE_BASE_URL??'http://127.0.0.1:8780'),output=path.resolve(option('--output',fileURLToPath(new URL('../.runtime/simulate-benchmark',import.meta.url)))),uncapped=args.includes('--uncapped'),headed=args.includes('--headed'),duration=Number(option('--duration','10'));
if(!Number.isFinite(duration)||duration<3||duration>120)throw Error('Use a duration between 3 and 120 seconds.');
const quality=option('--quality','high,balanced,performance').split(','),scenarios=option('--scenarios','overview,selection,drag').split(',');
if(quality.some(q=>!['high','balanced','performance'].includes(q))||scenarios.some(s=>!['overview','selection','drag'].includes(s)))throw Error('Invalid quality or scenario.');
await mkdir(output,{recursive:true});
const interactive=headed&&args.includes('--keep-open');
const browser=await chromium.launch({channel:'chrome',headless:!headed,args:[...(uncapped?['--disable-gpu-vsync','--disable-frame-rate-limit']:[]),...(interactive?['--start-maximized']:[])]});
try{
 const page=await browser.newPage(interactive?{viewport:null}:{viewport:{width:1920,height:1080},deviceScaleFactor:1});const catalog=await(await page.request.get(base+'/api/workspaces')).json(),workspace=catalog.workspaces.find(w=>w.id===option('--workspace','microduck'))??catalog.workspaces[0],snapshot=option('--snapshot',workspace.selectedSnapshotId),endpoint=`${base}/api/workspaces/${workspace.id}/snapshots/${snapshot}`;
 const source=option('--session',null),response=await page.request.post(endpoint+'/simulate/sessions',{data:{request_id:crypto.randomUUID(),name:option('--name','性能验证 '+new Date().toISOString().slice(0,19)),...(source?{copy_from:source}:{})}});if(!response.ok())throw Error(await response.text());const scene=await response.json(),data=await(await page.request.get(endpoint+'/view')).json(),servo=data.parts.find(p=>p.kind==='actuator')??data.parts[0],id='instance:'+servo.id;
 await page.goto(`${base}/#simulate?workspace=${workspace.id}&snapshot=${snapshot}&session=${scene.id}`);const host=page.locator('.simulation-canvas');await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:120000});
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('.simulation-webgl').getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}),samples=[];
 const nvidia=()=>{try{return execFileSync('nvidia-smi',['--query-gpu=name,clocks.current.graphics,pstate,utilization.gpu,power.draw','--format=csv,noheader'],{encoding:'utf8',timeout:3000,windowsHide:true}).trim();}catch{return null;}};
 for(const q of quality)for(const scenario of scenarios){
   await page.getByRole('button',{name:'环境与画质',exact:true}).click();await page.getByRole('combobox',{name:'渲染画质'}).selectOption(q);await page.getByRole('button',{name:'关闭画质设置',exact:true}).click();
   let candidate_loading_ms=null;
   if(scenario==='overview'){await page.reload();await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:60000});}
   else{const group=scene.groups.find(g=>g.instance_ids.includes(id)),started=performance.now();await page.getByRole('button',{name:'场景目录',exact:true}).click();await page.locator(`[data-sim-object="${group.id}"] .simulation-object-select`).click();const facts=page.locator('.simulation-selection-facts');await expect(facts).toBeVisible();await expect(facts).not.toContainText('检索中',{timeout:60000});await expect(facts).not.toContainText('读取失败');candidate_loading_ms=performance.now()-started;}
   await page.locator('.simulation-viewport-top').getByRole('button',{name:'显示全部',exact:true}).click();if(scenario==='drag')await page.getByRole('button',{name:'聚焦选中对象',exact:true}).click();await page.waitForTimeout(850);
   const rectangle=await host.boundingBox(),projected=scenario==='drag'?JSON.parse(await host.getAttribute('data-sim-projections'))[id]:[rectangle.width/2,rectangle.height/2],point={x:rectangle.x+projected[0],y:rectangle.y+projected[1]},button=scenario==='drag'?'left':'right';await page.mouse.move(point.x,point.y);await page.mouse.down({button});
   const clocks=nvidia(),result=await page.evaluate(async({point,scenario,duration})=>{
     const host=document.querySelector('.simulation-canvas'),canvas=host.querySelector('canvas'),raf=[],renders=[],cpu=[];let start=performance.now(),last=start,lastRender=start,count=Number(host.dataset.simRenders),observed=0;
     return new Promise(resolve=>{function frame(now){const elapsed=(now-start)/1000;canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:point.x+Math.sin(elapsed*1.3)*28,clientY:point.y+Math.cos(elapsed*1.3)*12,pointerId:1,pointerType:'mouse',buttons:scenario==='drag'?1:2,button:-1}));const next=Number(host.dataset.simRenders);if(elapsed>1){raf.push(now-last);if(next!==count){renders.push(now-lastRender);cpu.push(Number(host.dataset.simRenderMs));observed++;}}if(next!==count)lastRender=now;count=next;last=now;
       if(elapsed<duration+1)requestAnimationFrame(frame);else{const p95=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)]??0;resolve({rendered_frames:observed,fps:observed/((now-start-1000)/1000),frame_p95_ms:p95(renders),raf_p95_ms:p95(raf),cpu_submit_p95_ms:p95(cpu),draw_calls:Number(host.dataset.simDrawCalls),dragging:host.dataset.simDragging,triangles:JSON.parse(host.dataset.simMetrics).triangles,geometries:JSON.parse(host.dataset.simMetrics).geometries});}}
       requestAnimationFrame(frame);
     });
   },{point,scenario,duration});
   if(scenario==='drag')await page.keyboard.press('Escape');await page.mouse.up({button});const sample={quality:q,scenario,candidate_loading_ms,window:await page.evaluate(()=>[innerWidth,innerHeight]),viewport:[Math.round(rectangle.width),Math.round(rectangle.height)],gpu_state:clocks,...result};samples.push(sample);console.log(JSON.stringify(sample));
 }
 await page.waitForTimeout(1600);const idle=Number(await host.getAttribute('data-sim-renders'));await page.waitForTimeout(1000);const report={date:new Date().toISOString(),browser:browser.version(),platform:process.platform,gpu,headless:!headed,viewport_mode:interactive?'native-window':'fixed-benchmark',uncapped,flags:uncapped?['--disable-gpu-vsync','--disable-frame-rate-limit']:[],note:'Uncapped mode measures rendering throughput; it does not certify visible-window refresh pacing.',workspace:workspace.id,snapshot,package_digest:data.meta.packageDigest,scene:scene.id,duration_seconds:duration,samples,idle_render_delta:Number(await host.getAttribute('data-sim-renders'))-idle};await writeFile(path.join(output,'performance.json'),JSON.stringify(report,null,2));console.log('Saved '+path.join(output,'performance.json'));
 if(headed&&args.includes('--keep-open')){await page.locator('.simulation-viewport-top').getByRole('button',{name:'显示全部',exact:true}).click();console.log('The interactive workbench remains open for review.');await new Promise(resolve=>browser.once('disconnected',resolve));}
}finally{await browser.close();}
