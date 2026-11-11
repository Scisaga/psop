/** Capture the real workbench without changing the user's registry or saved scenes. */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash, randomUUID} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'apps/workbench/package.json'));
const {chromium, expect} = require('@playwright/test');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const port = Number(option('--port', '8795'));
const base = `http://127.0.0.1:${port}`;
const runtime = path.join(root, '.runtime/homepage-capture');
const output = path.join(root, 'docs/html/assets');
const sourceRegistry = path.join(root, 'workspaces/registry.json');
const registry = JSON.parse(await readFile(sourceRegistry, 'utf8'));
for (const workspace of registry.workspaces) for (const snapshot of workspace.snapshots)
  snapshot.path = path.resolve(path.dirname(sourceRegistry), snapshot.path);
await mkdir(runtime, {recursive:true});
await mkdir(output, {recursive:true});
const registryFile = path.join(runtime, 'registry.json');
await writeFile(registryFile, JSON.stringify(registry, null, 2));
const service = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port), '--registry', registryFile],
  {cwd:path.join(root, 'apps/workbench'), windowsHide:true, stdio:['ignore','pipe','pipe']});
let serviceError = '';
let serviceReady = false;
service.stdout.on('data', chunk => { if (chunk.toString().includes(base + '/')) serviceReady = true; });
service.stderr.on('data', chunk => { serviceError += chunk; });
service.on('error', error => { serviceError += error.message; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let browser, context;
const record = {schema:'psop.homepage-capture/1',captured_at:new Date().toISOString(),
  timezone:'Asia/Shanghai',viewport:{width:1600,height:1000},isolation:{registry:'.runtime/homepage-capture/registry.json',user_scenes_modified:false},
  source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  source_dirty:!!execFileSync('git',['status','--porcelain','--','apps/workbench'],{cwd:root,encoding:'utf8'}).trim(),
  images:[],operations:[],browser_errors:[]};
async function api(url, body) {
  let response;
  for(let attempt=0;attempt<3;attempt++){
    try{response = await fetch(base + url, {signal:AbortSignal.timeout(180000),headers:{connection:'close',...(body?{'content-type':'application/json'}:{})},
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {})});break;}
    catch(error){if(body||attempt===2)throw error;await sleep(250);}
  }
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return response.json();
}
try {
  for (let i=0;i<100;i++) {
    if (service.exitCode !== null) throw new Error(serviceError || 'Capture service exited.');
    if (serviceReady && await fetch(base+'/health').then(r=>r.ok).catch(()=>false)) break;
    if (i===99) throw new Error('Capture service did not become ready.');
    await sleep(250);
  }
  console.log('Reading the isolated Microduck snapshot…');
  const catalog = await api('/api/workspaces');
  const workspace = catalog.workspaces.find(w=>w.deviceId==='microduck');
  if (!workspace) throw new Error('Register the Microduck DKP before capturing.');
  const snapshot = workspace.selectedSnapshotId;
  const endpoint = `/api/workspaces/${workspace.id}/snapshots/${snapshot}`;
  const data = await api(endpoint+'/view');
  Object.assign(record,{device_id:workspace.deviceId,snapshot_id:snapshot,
    package_version:data.meta.packageVersion,package_digest:data.meta.packageDigest,
    counts:{parts:data.parts.length,geometries:data.meta.counts.geometries,sources:data.sources.length},
    reference_configuration:'source_original'});
  browser = await chromium.launch({channel:'chrome',headless:true});
  context = await browser.newContext({viewport:record.viewport,deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light',
    recordVideo:args.includes('--video')?{dir:runtime,size:record.viewport}:undefined});
  await context.addInitScript(()=>{
    localStorage.setItem('psop.workbench.inspector-width','400');
    localStorage.setItem('psop.simulate.quality','balanced');
  });
  const recordingStarted = Date.now();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror',e=>record.browser_errors.push(e.message));
  async function capture(name, purpose) {
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw new Error('Overflow: '+name);
    const png = await page.screenshot({animations:'disabled'});
    const base64 = await page.evaluate(async input=>{
      const image = new Image();image.src='data:image/png;base64,'+input;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/webp',.94).split(',')[1];
    },png.toString('base64'));
    const bytes=Buffer.from(base64,'base64'),file=name+'.webp';
    await writeFile(path.join(output,file),bytes);
    record.images.push({file,purpose,kind:'actual_workbench_capture',route:new URL(page.url()).hash,
      dimensions:[1600,1000],bytes:bytes.length,sha256:digest(bytes)});
    console.log(`Captured ${file} (${Math.round(bytes.length/1024)} KB)`);
  }
  const explorer = (part, extra={}) => base+'/#explorer?'+new URLSearchParams({workspace:workspace.id,snapshot,part,labels:'0',explode:'0',...extra});
  async function settled() {
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-scene-ready','true',{timeout:90000});
    await page.waitForFunction(()=>!document.querySelector('.scene-canvas')?.dataset.cameraFlight||document.querySelector('.scene-canvas').dataset.cameraFlight==='settled');
    await page.waitForTimeout(450);
  }
  const thigh=data.parts.find(p=>p.meshKey==='upper_leg_right');
  const support=data.parts.find(p=>p.meshKey==='motor_support');
  const servo=data.parts.find(p=>p.kind==='actuator');
  if (!thigh||!support||!servo) throw new Error('Missing illustrated source parts.');
  await page.goto(explorer(thigh.id,{detail:'overview'}));await settled();
  await page.getByRole('button',{name:'适应全部模型',exact:true}).click();await settled();
  await capture('workbench-overview','Current workspace, source assembly, structure tree and object details');
  await page.goto(explorer(servo.id,{detail:'interfaces'}));await settled();
  await capture('workbench-interfaces','Actual part interfaces and source-reference connections');
  await page.goto(explorer(support.id));await settled();
  await page.getByRole('combobox',{name:'对象详情分类'}).selectOption('evidence');
  await page.locator('.evidence-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('robot_walk.xml');
  await page.getByRole('dialog').locator('.bp-document-line.is-evidence').first().scrollIntoViewIfNeeded();
  await capture('workbench-evidence','Original XML and cited evidence lines');
  for (const mode of ['build','compile']) {
    await page.goto(base+'/#'+mode+'?'+new URLSearchParams({workspace:workspace.id,snapshot}));
    await expect(page.locator('.cap-page')).toBeVisible();
    if(mode==='compile') await expect(page.locator('.cap-state')).toContainText('执行服务未接入');
    await capture('workbench-'+mode,mode==='build'?'Published snapshot, provenance and capability declarations':'Current Compile page: execution service not connected');
  }
  let scene=await api(endpoint+'/simulate/sessions',{request_id:randomUUID(),name:'官网素材 · 独立原装构型'});
  const sessions=endpoint+'/simulate/sessions/'+scene.id;
  record.scene_id=scene.id;
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(base+'/#simulate?'+new URLSearchParams({workspace:workspace.id,snapshot,session:scene.id}));
  const host=page.locator('.simulation-canvas');
  await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:120000});
  await expect(host).toHaveAttribute('data-sim-background-ready','true',{timeout:120000});
  await page.waitForTimeout(1500);
  await capture('workbench-simulate','Current immersive assembly workshop, initial loose parts');
  const anchor=scene.instances.find(i=>i.part_ref===servo.id);
  const query=await api(sessions+'/candidates',{instance_id:anchor.id,expected_revision:scene.revision});
  let choice;
  for (const c of query.candidates.sort((a,b)=>Number(b.reference_original)-Number(a.reference_original)||b.member_count-a.member_count)) {
    const preview=await api(sessions+'/preview',{candidate_id:c.id,moving_instance_id:c.moving_instance_id,target_instance_id:c.target_instance_id,expected_revision:scene.revision});
    if(preview.status==='ready'){choice=c;break;}
  }
  if(!choice) throw new Error('No eligible connection for the capture.');
  record.video_start_seconds=(Date.now()-recordingStarted)/1000;
  await page.getByRole('button',{name:'场景目录',exact:true}).click();
  await page.locator(`[data-sim-object="${anchor.id}"] .simulation-object-select`).click();
  await page.getByRole('button',{name:'候选对象',exact:true}).click();
  const target=scene.groups.find(g=>g.instance_ids.includes(choice.target_instance_id));
  await page.locator(`[data-sim-target="${target.id}"]`).click();
  const direction=page.locator('.simulation-method-direction select').filter({has:page.locator(`option[value="${choice.id}"]`)});
  if(await direction.count()) await direction.selectOption(choice.id);
  const connect=page.locator(`[data-sim-candidate="${choice.id}"]`);
  await expect(connect).toBeEnabled({timeout:90000});
  await connect.hover();await page.waitForTimeout(800);
  await capture('workbench-connection','Real eligible reference connection card with geometric records');
  let previousRevision=scene.revision;
  await connect.click();
  await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(previousRevision+1));
  await expect(host).toHaveAttribute('data-sim-animating','false',{timeout:30000});
  scene=await api(sessions);record.operations.push({type:'connect',revision:scene.revision,candidate_id:choice.id});
  await page.waitForTimeout(1500);
  previousRevision=scene.revision;
  await page.locator('[data-sim-connection-label]').first().click();
  await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(previousRevision+1));
  await expect(host).toHaveAttribute('data-sim-animating','false');
  scene=await api(sessions);record.operations.push({type:'disconnect',revision:scene.revision});
  await page.waitForTimeout(1000);
  previousRevision=scene.revision;
  await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();
  await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(previousRevision+1));
  await page.waitForTimeout(900);
  scene=await api(sessions);record.operations.push({type:'undo',revision:scene.revision});
  previousRevision=scene.revision;
  await page.getByRole('button',{name:'恢复初始拆散状态',exact:true}).click();
  await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(previousRevision+1));
  await expect(page.getByRole('status',{name:'已保存',exact:true})).toBeVisible();
  scene=await api(sessions);record.operations.push({type:'reset',revision:scene.revision});
  await page.waitForTimeout(700);
  await page.getByRole('button',{name:'自动组装',exact:true}).click();
  await expect(page.getByRole('region',{name:'自动组装进度',exact:true})).toBeVisible({timeout:180000});
  record.auto_started_seconds=(Date.now()-recordingStarted)/1000;
  const speed=page.getByRole('button',{name:'动画播放速度',exact:true});
  await speed.click();await speed.click();
  await page.getByRole('button',{name:'跟随装配视角',exact:true}).click();
  await expect(page.getByRole('region',{name:'自动组装进度',exact:true})).toHaveAttribute('data-auto-phase','reveal',{timeout:180000});
  record.auto_reveal_seconds=(Date.now()-recordingStarted)/1000;
  await page.waitForTimeout(1800);
  await capture('workbench-simulate-poster','Completed source-original reference assembly in the real workshop');
  scene=await api(sessions);record.operations.push({type:'auto_assemble',revision:scene.revision,configuration:scene.reference_configuration_ref,speed:4});
  record.video_end_seconds=(Date.now()-recordingStarted)/1000;
  if(args.includes('--video')){
    const video=page.video();await context.close();context=null;
    record.raw_video=path.relative(root,await video.path()).split(path.sep).join('/');
  }
  if(record.browser_errors.length) throw new Error(record.browser_errors.join('\n'));
  await writeFile(path.join(output,'workbench-capture.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({result:'captured',snapshot:record.package_version,images:record.images.length,video:record.raw_video,
    start:record.video_start_seconds,end:record.video_end_seconds}));
} catch(error) {
  console.error('Capture failed:',error.message,serviceError.slice(-3500));
  throw error;
} finally {
  if(context) await context.close();
  if(browser) await browser.close();
  service.kill();
}
