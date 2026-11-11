/** Film a legible source-original head-shell connection in an isolated scene. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'apps/workbench/package.json'));
const {chromium,expect}=require('@playwright/test');
const {STLLoader}=await import(pathToFileURL(path.join(root,'apps/workbench/node_modules/three/examples/jsm/loaders/STLLoader.js')));
const runtime=path.join(root,'.runtime/homepage-connection'),output=path.join(root,'docs/html/assets');
await mkdir(runtime,{recursive:true});
const original=JSON.parse(await readFile(path.join(output,'workbench-capture.json'),'utf8'));
const registry=JSON.parse(await readFile(path.join(root,'workspaces/registry.json'),'utf8'));
for(const workspace of registry.workspaces)for(const snapshot of workspace.snapshots)snapshot.path=path.resolve(root,'workspaces',snapshot.path);
const registryFile=path.join(runtime,'registry.json');await writeFile(registryFile,JSON.stringify(registry));
const args=process.argv.slice(2),portIndex=args.indexOf('--port'),port=Number(portIndex<0?'8798':args[portIndex+1]),base=`http://127.0.0.1:${port}`;
const service=spawn(process.execPath,['scripts/serve.mjs','--port',String(port),'--registry',registryFile],{cwd:path.join(root,'apps/workbench'),windowsHide:true,stdio:['ignore','pipe','pipe']});
let ready=false,stderr='';service.stdout.on('data',chunk=>{if(chunk.toString().includes(base+'/'))ready=true;});service.stderr.on('data',chunk=>{stderr+=chunk;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record={schema:'psop.homepage-connection-capture/1',captured_at:new Date().toISOString(),timezone:'Asia/Shanghai',
 package_version:original.package_version,package_digest:original.package_digest,snapshot_id:original.snapshot_id,
 isolation:{registry:'.runtime/homepage-connection/registry.json',user_scenes_modified:false},
 viewport:{width:1600,height:1000},preparation:[],operations:[],images:[],events:{},
 events_time_basis:'Wall-clock seconds since page creation begins. Raw-video timecodes must be selected by inspecting decoded frames; recording initialization is not included in the video.',
 browser_errors:[]};
let browser,context;
async function api(url,body){const response=await fetch(base+url,{signal:AbortSignal.timeout(90000),headers:{'content-type':'application/json',connection:'close'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(await response.text());return response.json();}
try{
 for(let i=0;i<100;i++){if(service.exitCode!==null)throw Error(stderr||'Isolated service exited.');if(ready)break;if(i===99)throw Error('Isolated service did not start.');await delay(200);}
 const endpoint=`/api/workspaces/microduck/snapshots/${original.snapshot_id}`;
 const data=await api(endpoint+'/view');if(data.meta.packageDigest!==original.package_digest)throw Error('Snapshot differs from existing footage.');
 const upper=data.parts.find(p=>p.meshKey==='top_head_shell'),lower=data.parts.find(p=>p.meshKey==='bottom_head_shell');
 if(!upper||!lower)throw Error('The illustrated head shells are missing.');
 let scene=await api(endpoint+'/simulate/sessions',{request_id:randomUUID(),name:'官网近景 · 头部外壳合拢'});
 const session=endpoint+'/simulate/sessions/'+scene.id;
 const moving=scene.instances.find(i=>i.part_ref===upper.id),target=scene.instances.find(i=>i.part_ref===lower.id);
 record.scene_id=scene.id;
 // Arrange loose parts on a clear tabletop patch. Source shapes and mating transform stay intact.
 for(const [part,instance,y] of [[lower,target,0],[upper,moving,-.15]]){
  const geometry=new STLLoader().parse(await(await fetch(base+part.geometryUrl)).arrayBuffer());geometry.computeBoundingBox();
  const pose={position:[.3,y,-geometry.boundingBox.min.z+.0004],quaternion:part.quaternion};
  scene=await api(session+'/commands',{type:'move',instance_id:instance.id,pose,expected_revision:scene.revision,request_id:randomUUID()});
  record.preparation.push({type:'move',part:part.name,instance_id:instance.id,pose,revision:scene.revision});geometry.dispose();
 }
 const options=(await api(session+'/candidates',{instance_id:moving.id,expected_revision:scene.revision})).candidates;
 const choice=options.find(c=>c.target_instance_id===target.id&&c.source_kind==='reference_connection'&&c.source_configuration_ref==='configuration:microduck:source-qpos0'&&c.member_count===3);
 if(!choice)throw Error('Missing source-original three-point head closure.');
 const preview=await api(session+'/preview',{candidate_id:choice.id,moving_instance_id:moving.id,target_instance_id:target.id,expected_revision:scene.revision});
 if(preview.status!=='ready')throw Error('Head closure is not eligible: '+preview.reason);
 record.demonstration={moving_part:upper.name,target_part:lower.name,candidate_id:choice.id,title:choice.title,
  source_kind:choice.source_kind,configuration_ref:choice.source_configuration_ref,visible_instances:[moving.id,target.id],hidden_other_instances:scene.instances.length-2,
  staging:'Loose parts placed on the tabletop in their source orientations; original meshes and mating transform unchanged.',preview_status:preview.status};
 console.log('Filming white upper shell + orange lower shell, with 68 other parts hidden.');
 browser=await chromium.launch({channel:'chrome',headless:true});
 context=await browser.newContext({viewport:record.viewport,deviceScaleFactor:1,recordVideo:{dir:runtime,size:record.viewport}});
 await context.addInitScript(()=>localStorage.setItem('psop.simulate.quality','balanced'));
 const clock=Date.now(),page=await context.newPage(),time=()=>Number(((Date.now()-clock)/1000).toFixed(3));
 page.setDefaultTimeout(30000);page.on('pageerror',error=>record.browser_errors.push(error.message));
 await page.goto(base+'/#simulate?'+new URLSearchParams({workspace:'microduck',snapshot:original.snapshot_id,session:scene.id}));
 const host=page.locator('.simulation-canvas');await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:90000});await expect(host).toHaveAttribute('data-sim-background-ready','true',{timeout:90000});
 await page.getByRole('button',{name:'场景目录',exact:true}).click();
 await page.locator('[data-sim-object]').evaluateAll((elements,visible)=>{for(const element of elements)if(!visible.includes(element.dataset.simObject))element.querySelector('.simulation-object-visibility').click();},[moving.id,target.id]);
 await page.locator(`[data-sim-object="${moving.id}"] .simulation-object-select`).click();
 async function focus(){await page.getByRole('button',{name:'聚焦选中对象',exact:true}).click();await page.waitForTimeout(500);}
 async function framePair(){
  await focus();const box=await host.boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.wheel(0,530);await page.waitForTimeout(500);
  for(let pass=0;pass<3;pass++){
   const points=JSON.parse(await host.getAttribute('data-sim-projections')),a=points[moving.id],b=points[target.id];
   if(!a||!b)throw Error('Expected exactly the two visible shell instances.');
   const dx=box.width*.43-(a[0]+b[0])/2,dy=box.height*.48-(a[1]+b[1])/2;
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.5+dx,box.y+box.height*.5+dy,{steps:10});await page.mouse.up({button:'right'});await page.waitForTimeout(300);
  }
 }
 async function still(file,purpose){
  const png=await page.screenshot();
  const encoded=await page.evaluate(async input=>{const image=new Image();image.src='data:image/png;base64,'+input;await image.decode();const c=document.createElement('canvas');c.width=1600;c.height=1000;c.getContext('2d').drawImage(image,0,0);return c.toDataURL('image/webp',.94).split(',')[1];},png.toString('base64'));
  const bytes=Buffer.from(encoded,'base64');await writeFile(path.join(output,file),bytes);record.images.push({file,purpose,kind:'actual_workbench_capture',dimensions:[1600,1000],bytes:bytes.length,sha256:sha(bytes)});
 }
 await framePair();
 record.events.start=time();await still('workbench-head-before.webp','Only the white upper head shell and orange lower shell, separated on the tabletop');await page.waitForTimeout(1400);
 await page.getByRole('button',{name:'候选对象',exact:true}).click();
 await page.locator(`[data-sim-target="${target.id}"]`).click();
 const more=page.locator('.simulation-more-methods');if(await more.count())await more.click();
 const direction=page.locator('.simulation-method-direction select').filter({has:page.locator(`option[value="${choice.id}"]`)});
 if(await direction.count())await direction.selectOption(choice.id);
 const button=page.locator(`[data-sim-candidate="${choice.id}"]`);await expect(button).toBeEnabled();
 record.events.connect_start=time();await button.click();
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(scene.revision+1));await expect(host).toHaveAttribute('data-sim-animating','false');
 scene=await api(session);record.operations.push({type:'connect',revision:scene.revision,connections:scene.connections.length,candidate_id:choice.id});
 await focus();record.events.connected=time();await still('workbench-head-after.webp','Source-original upper and lower shells joined into a clearly recognizable head housing');await page.waitForTimeout(2400);
 record.events.disconnect_start=time();await page.locator('[data-sim-connection-label]').first().click();
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(scene.revision+1));await expect(host).toHaveAttribute('data-sim-animating','false');
 scene=await api(session);record.operations.push({type:'disconnect',revision:scene.revision,connections:scene.connections.length});record.events.disconnected=time();
 await framePair();await page.waitForTimeout(1000);
 record.events.undo_start=time();await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(scene.revision+1));scene=await api(session);record.operations.push({type:'undo',revision:scene.revision,connections:scene.connections.length});
 await focus();record.events.restored=time();await page.waitForTimeout(1300);record.events.end=time();
 record.visible_projection_count=Object.keys(JSON.parse(await host.getAttribute('data-sim-projections'))).length;
 const video=page.video();await context.close();context=null;record.raw_video=path.relative(root,await video.path()).split(path.sep).join('/');
 record.raw_sha256=sha(await readFile(path.join(root,record.raw_video)));
 if(record.browser_errors.length||record.visible_projection_count!==2)throw Error('Unexpected canvas content or browser errors.');
 await writeFile(path.join(output,'workbench-connection-capture.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({result:'captured',events:record.events,raw_video:record.raw_video}));
}finally{if(context)await context.close();if(browser)await browser.close();service.kill();}
