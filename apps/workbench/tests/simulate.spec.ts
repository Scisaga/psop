import {test,expect,chromium,type APIRequestContext,type Page} from '@playwright/test';
import {readRegistry} from '../scripts/dkp.mjs';
import type {PrototypeData} from '../src/types';
import type {SimulationSession,ConnectionCandidate,CandidateResult,ConnectionPreview} from '../src/simulate-types';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';

const workspace=(await readRegistry(process.env.PSOP_TEST_REGISTRY)).workspaces.find((w:{id:string})=>w.id==='microduck'),snapshot=workspace.selectedSnapshotId,base=`/api/workspaces/microduck/snapshots/${snapshot}`,sessions=base+'/simulate/sessions';
async function post<T>(request:APIRequestContext,url:string,data:unknown):Promise<T>{const response=await request.post(url,{data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
const hostFor=(page:Page)=>page.locator('.simulation-canvas');
const read=(request:APIRequestContext,id:string)=>request.get(sessions+'/'+id,{maxRetries:2}).then(r=>r.json()) as Promise<SimulationSession>;
const command=(request:APIRequestContext,s:SimulationSession,body:Record<string,unknown>)=>post<SimulationSession>(request,sessions+'/'+s.id+'/commands',{...body,expected_revision:s.revision,request_id:crypto.randomUUID()});
async function open(page:Page,s:SimulationSession){await page.goto(`/#simulate?workspace=microduck&snapshot=${snapshot}&session=${s.id}`);await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-ready','true',{timeout:60000});}

async function directory(page:Page){if(!await page.locator('.simulation-tree').count())await page.getByRole('button',{name:'场景目录',exact:true}).click();}
async function selectObject(page:Page,id:string){await directory(page);await page.locator('[data-sim-object="'+id+'"] .simulation-object-select').click();}
async function selectAt(page:Page,n:number){await directory(page);await page.locator('.simulation-object-select').nth(n).click();}
async function panel(page:Page,kind:'object'|'interfaces'|'connections'|'targets'){const names={object:'精确变换',interfaces:'查看接口',connections:'查看连接',targets:'候选对象'},tabs={object:'变换',interfaces:'接口',connections:'连接',targets:'候选'};if(await page.locator('.simulation-inspector').count())await page.getByRole('tab',{name:tabs[kind],exact:true}).click();else await page.getByRole('button',{name:names[kind],exact:true}).click();}
async function sceneMenu(page:Page){if(!await page.locator('.simulation-session-menu').count())await page.getByRole('button',{name:'方案菜单',exact:true}).click();}
async function quality(page:Page,q:string){if(!await page.locator('.simulation-settings').count())await page.getByRole('button',{name:'环境与画质',exact:true}).click();await page.getByRole('combobox',{name:'渲染画质'}).selectOption(q);await page.getByRole('button',{name:'关闭画质设置',exact:true}).click();}

async function chooseMethod(page:Page,s:SimulationSession,c:ConnectionCandidate){
 const group=s.groups.find(g=>g.instance_ids.includes(c.moving_instance_id))!,target=s.groups.find(g=>g.instance_ids.includes(c.target_instance_id))!;
 await selectObject(page,group.id);await panel(page,'targets');await page.locator(`[data-sim-target="${target.id}"]`).click({timeout:15000});
 const more=page.locator('.simulation-more-methods');if(await more.count())await more.click();
 const selector=page.locator('.simulation-method-direction select').filter({has:page.locator(`option[value="${c.id}"]`)});if(await selector.count())await selector.selectOption(c.id);
 const choice=page.locator(`[data-sim-candidate="${c.id}"]`);await expect(choice).toBeEnabled({timeout:30000});return choice;
}

test('initial desktop lays thin parts flat and reset preserves edited poses through undo',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{name:'E2E 平放布局'}),state=await read(request,s.id);
 const response=await request.get(base+'/view'),data=await response.json() as PrototypeData;
 const parts=new Map(data.parts.map(p=>[p.id,p]));
 for(const instance of state.instances){
  const part=parts.get(instance.part_ref)!,local=state.bounds![instance.part_ref],box=new Box3(new Vector3().fromArray(local[0]),new Vector3().fromArray(local[1])).applyMatrix4(new Matrix4().compose(new Vector3().fromArray(instance.position),new Quaternion().fromArray(instance.quaternion),new Vector3().fromArray(part.scale)));
  const expected=Math.min(...local[1].map((v,k)=>(v-local[0][k])*Math.abs(part.scale[k])));
  expect(box.getSize(new Vector3()).z).toBeLessThanOrEqual(expected+1e-7);expect(box.min.z).toBeCloseTo(.0002,7);
 }
 await open(page,state);await page.screenshot({path:'.runtime/simulate-review/desktop-flat-layout.png'});
 const first=state.instances[0],edited=await command(request,state,{type:'move',instance_id:first.id,pose:{position:first.position.map((v,k)=>v+(k===2?.03:0)),quaternion:first.quaternion}});
 await page.reload();await expect(hostFor(page)).toHaveAttribute('data-sim-ready','true',{timeout:60000});
 expect((await read(request,s.id)).instances).toEqual(edited.instances);
 const reset=await command(request,edited,{type:'reset'});expect(reset.instances).toEqual(state.instances);
 const undo=await command(request,reset,{type:'undo'});expect(undo.instances).toEqual(edited.instances);
});

test('原装与协调头壳共用全局构型，重叠保留在详情并可直接连接',async({page,request})=>{
 let s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'头壳构型与重叠验收'});
 const upper='instance:part:microduck:82d68e991b23c2a3',lower='instance:part:microduck:52fdcacf474a463f';
 expect(s.reference_configuration_ref).toContain('source-qpos0');s=await command(request,s,{type:'move',instance_id:lower,pose:{position:[0,0,.3],quaternion:s.instances.find(p=>p.id===lower)!.quaternion}});await open(page,s);
 let candidates=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:upper,target_instance_id:lower,expected_revision:s.revision});
 let candidate=candidates.candidates.find(c=>c.source_kind==='reference_connection'&&c.source_match_ref.endsWith('head_shell_seam'))!,choice=await chooseMethod(page,s,candidate),method=choice.locator('..');
 await expect(method).toContainText('可连接 · 原装参考');await method.locator('.simulation-geometry-details summary').click();await expect(method).toContainText('67.894');await page.screenshot({path:'.runtime/simulate-review/head-shell-source-policy.png'});
 const original=structuredClone(s.instances),coordinated=s.reference_configurations.find(c=>c.kind==='coordinated')!;await sceneMenu(page);await page.getByRole('combobox',{name:'参考构型',exact:true}).selectOption(coordinated.id);
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));s=await read(request,s.id);expect(s.instances).toEqual(original);await page.getByRole('button',{name:'方案菜单',exact:true}).click();
 candidates=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:upper,target_instance_id:lower,expected_revision:s.revision});candidate=candidates.candidates.find(c=>c.source_kind==='reference_connection'&&c.source_match_ref.endsWith('head_shell_seam'))!;choice=await chooseMethod(page,s,candidate);method=choice.locator('..');await expect(choice).toBeEnabled();
 if((await method.locator('.simulation-geometry-details').getAttribute('open'))===null)await method.locator('.simulation-geometry-details summary').click();await expect(method).toContainText('0.0030544');await expect(method).toContainText('工程推断');await page.screenshot({path:'.runtime/simulate-review/head-shell-coordinated-policy.png'});
 await choice.click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));await page.keyboard.press('Escape');const saved=await read(request,s.id);expect(saved.connections).toHaveLength(1);expect(saved.connections[0].geometry.status).toBe('interference');expect(saved.connections[0].assembly_assessment?.decision).toBe('allow_with_note');
});

test('方案判定设置可保存、撤销和重载，构型选择不改变当前位姿',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'装配判定设置验收'});await open(page,s);await page.getByRole('button',{name:'环境与画质',exact:true}).click();await page.locator('.simulation-policy-settings summary').click();
 await page.getByRole('spinbutton',{name:'轻微接触显示筛选',exact:true}).fill('0.02');await page.getByRole('spinbutton',{name:'无关障碍穿入深度',exact:true}).fill('0.2');await page.getByRole('button',{name:'保存判定设置',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision','1');
 const saved=await read(request,s.id);expect(saved.assembly_policy.minor_contact_volume_mm3).toBe(.02);expect(saved.assembly_policy.unrelated_obstacle_depth_m).toBe(.0002);expect(saved.instances).toEqual(s.instances);
 await page.getByRole('button',{name:'关闭画质设置',exact:true}).click();await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision','2');expect((await read(request,s.id)).assembly_policy).toEqual(s.assembly_policy);
 await page.reload();await expect(hostFor(page)).toHaveAttribute('data-sim-ready','true',{timeout:60000});expect((await read(request,s.id)).instances).toEqual(s.instances);
});

test('左下场景操作与提示横向排布，窄窗口按钮保持完整可点击',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'左下操作布局验收'});await open(page,s);
 const dock=page.getByRole('toolbar',{name:'场景操作'}),auto=page.getByRole('button',{name:'自动组装',exact:true}),reset=page.getByRole('button',{name:'恢复初始拆散状态',exact:true}),hint=page.locator('.simulation-welcome');
 const measurements=[];
 for(const [width,height]of [[1920,1080],[1600,1000],[1280,800],[999,925],[900,700],[690,640],[360,640]]){
  await page.setViewportSize({width,height});await expect(dock).toBeVisible();await expect(auto).toBeInViewport({ratio:1});await expect(reset).toBeInViewport({ratio:1});
  const a=(await auto.boundingBox())!,r=(await reset.boundingBox())!,stats=(await page.locator('.simulation-corner-info').boundingBox())!;
  expect(a.x-r.x-r.width).toBeGreaterThanOrEqual(7.5);expect(Math.abs(a.y-r.y)).toBeLessThan(1);expect(a.x+a.width).toBeLessThanOrEqual(stats.x-8);
  expect(await auto.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
  if(width>900){await expect(hint).toBeVisible();const h=(await hint.boundingBox())!;expect(h.x-a.x-a.width).toBeGreaterThanOrEqual(7.5);expect(Math.abs(h.y-a.y)).toBeLessThan(1);expect(h.x+h.width).toBeLessThanOrEqual(stats.x-8);measurements.push({width,height,reset:r,auto:a,hint:h,stats});}
  else{await expect(hint).toBeHidden();measurements.push({width,height,reset:r,auto:a,stats});}
 }
 await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'.runtime/simulate-review/auto-controls-layout-1600.png'});
 await test.info().attach('bottom-controls-layout',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});expect((await read(request,s.id)).revision).toBe(s.revision);
});

test('自动组装先核对服务能力，旧后端不写草稿或命令，服务恢复后正常播放',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'自动组装服务能力验收'}),errors:string[]=[],submitted:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/commands'))submitted.push(r.postDataJSON()?.type);});await open(page,s);
 await page.route('**/health',route=>route.fulfill({json:{app:'psop-workbench',mode:'local',dkpSchema:'psop.dkp/2.0-draft.1'}}));
 await page.getByRole('button',{name:'自动组装',exact:true}).click();await expect(page.locator('.simulation-error')).toContainText('当前装配服务版本尚未支持此操作');
 expect(submitted).toEqual([]);const unchanged=await read(request,s.id);expect(unchanged.revision).toBe(s.revision);expect(unchanged.instances).toEqual(s.instances);expect(unchanged.connections).toEqual(s.connections);expect(unchanged.history).toEqual(s.history);
 expect(await page.evaluate(key=>localStorage.getItem(key),'psop.simulate.draft:'+sessions+'/'+s.id)).toBeNull();await expect(page.getByRole('region',{name:'自动组装进度',exact:true})).toHaveCount(0);
 await page.reload();await expect(hostFor(page)).toHaveAttribute('data-sim-ready','true',{timeout:60000});await expect(page.locator('.simulation-error')).toHaveCount(0);await page.unroute('**/health');
 const health=await(await request.get('/health')).json();expect(health.simulate.commands).toContain('auto_assemble');await page.getByRole('button',{name:'自动组装',exact:true}).click();await expect(page.getByRole('region',{name:'自动组装进度',exact:true})).toBeVisible({timeout:65000});await page.keyboard.press('Escape');await expect(hostFor(page)).toHaveAttribute('data-sim-animating','false');
 const assembled=await read(request,s.id);expect(submitted).toEqual(['auto_assemble']);expect(assembled.revision).toBe(s.revision+1);expect(assembled.groups).toHaveLength(1);expect(assembled.instances).toHaveLength(70);expect(assembled.reference_assembly).toBeTruthy();await expect(page.locator('.simulation-error')).toHaveCount(0);expect(errors).toEqual([]);
});

test('默认工作台内自动组装，鼠标自由观察、暂停加速、跳过、撤销和刷新保持一致',async({page,request})=>{
 test.setTimeout(210000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const data:PrototypeData=await(await request.get(base+'/view')).json();let s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'自动组装演出验收'});
 const moving=s.instances.find(i=>data.parts.find(p=>p.id===i.part_ref)?.kind==='actuator')!;
 s=await command(request,s,{type:'move',instance_id:moving.id,pose:{position:[.3,0,.22],quaternion:moving.quaternion}});
 const options=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:moving.id,expected_revision:s.revision});let incorrect:ConnectionCandidate|undefined;
 for(const c of options.candidates.filter(c=>c.moving_instance_id===moving.id&&data.parts.find(p=>p.id===s.instances.find(i=>i.id===c.target_instance_id)?.part_ref)?.kind==='actuator')){
  const a=data.parts.find(p=>p.id===moving.part_ref)!,b=data.parts.find(p=>p.id===s.instances.find(i=>i.id===c.target_instance_id)?.part_ref)!;
  const reference=new Matrix4().compose(new Vector3().fromArray(b.position),new Quaternion().fromArray(b.quaternion),new Vector3(1,1,1)).invert().multiply(new Matrix4().compose(new Vector3().fromArray(a.position),new Quaternion().fromArray(a.quaternion),new Vector3(1,1,1)));
  if(reference.elements.every((v,n)=>Math.abs(v-c.relative_transform[n])<1e-4))continue;
  const target=s.instances.find(i=>i.id===c.target_instance_id)!;s=await command(request,s,{type:'move',instance_id:target.id,pose:{position:[-.15,0,.22],quaternion:target.quaternion}});
  const checked=await post<ConnectionPreview>(request,sessions+'/'+s.id+'/preview',{candidate_id:c.id,moving_instance_id:c.moving_instance_id,target_instance_id:c.target_instance_id,expected_revision:s.revision});if(checked.status==='ready'){incorrect=c;break;}
 }
 expect(incorrect).toBeTruthy();s=await command(request,s,{type:'connect',candidate_id:incorrect!.id,moving_instance_id:incorrect!.moving_instance_id,target_instance_id:incorrect!.target_instance_id});const before=s;
 await open(page,s);await page.waitForTimeout(350);const auto=page.getByRole('button',{name:'自动组装',exact:true});await expect(auto).toBeInViewport({ratio:1});const autoResponse=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().postDataJSON()?.type==='auto_assemble',{timeout:190000});await auto.click();
 const planned:SimulationSession=await(await autoResponse).json();expect(planned.operation?.type).toBe('auto_assemble');if(planned.operation?.type!=='auto_assemble')throw Error('Missing automatic operation');const seats=planned.operation.steps.filter(step=>step.motions.some(m=>m.insertion));expect(seats).toHaveLength(14);expect(planned.reference_assembly?.process_check?.audit?.new_intrusion_observations).toBe(0);expect(planned.reference_assembly?.process_check?.reference_handoff_count).toBe(5);for(const step of seats){expect(step.motions[0].insertion?.axis_member_ref).toBeTruthy();expect(step.motions[0].waypoints!.length).toBeGreaterThan(2);}
 const movie=page.getByRole('region',{name:'自动组装进度',exact:true}),host=hostFor(page);await expect(movie).toBeVisible();await expect(movie).toHaveAttribute('data-auto-phase','detach',{timeout:15000});await expect(page.getByRole('button',{name:'俯视',exact:true})).toBeVisible();await expect(page.locator('.simulation-scene-capsule')).toBeVisible();expect(await page.locator('.simulation-viewport').evaluate(e=>getComputedStyle(e,'::before').content)).toBe('none');
 await page.getByRole('button',{name:'暂停自动组装动画'}).click();await expect(movie).toHaveAttribute('data-auto-paused','true');await page.waitForTimeout(100);const camera=new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number));await page.waitForTimeout(300);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(camera)).toBeLessThan(1e-10);
 const follow=page.getByRole('button',{name:'跟随装配视角',exact:true});await expect(follow).toHaveAttribute('aria-pressed','false');await follow.click();await expect(follow).toHaveAttribute('aria-pressed','true');await page.mouse.move(800,430);await page.mouse.down();await page.mouse.move(905,470,{steps:8});await page.mouse.up();await expect(follow).toHaveAttribute('aria-pressed','false');await expect.poll(async()=>new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(camera)).toBeGreaterThan(.001);const rotated=(await host.getAttribute('data-sim-camera'))!,panTarget=(await host.getAttribute('data-sim-camera-target'))!;await page.mouse.move(800,430);await page.mouse.down({button:'right'});await page.mouse.move(835,440,{steps:5});await page.mouse.up({button:'right'});await expect.poll(()=>host.getAttribute('data-sim-camera-target')).not.toBe(panTarget);await page.mouse.wheel(0,180);await expect.poll(()=>host.getAttribute('data-sim-camera')).not.toBe(rotated);expect((await read(request,s.id)).revision).toBe(planned.revision);await expect(movie).not.toContainText('待核');
 await page.screenshot({path:'.runtime/simulate-review/auto-assembly-detach-1600.png'});
 for(const [width,height]of [[1280,800],[1600,1000]]){await page.setViewportSize({width,height});const controls=(await page.locator('.simulation-auto-controls').boundingBox())!;expect(controls.x).toBeGreaterThan(0);expect(controls.x+controls.width).toBeLessThan(width);expect(controls.y+controls.height).toBeLessThan(height);await expect(page.getByRole('button',{name:'跳过自动组装动画'})).toBeInViewport({ratio:1});}
 await page.keyboard.press('f');await page.keyboard.press('/');await expect(movie).toBeVisible();await expect(page.locator('.simulation-tree')).toHaveCount(0);
 await page.getByRole('button',{name:'继续自动组装动画'}).click();await page.getByRole('button',{name:'俯视',exact:true}).click();await expect(movie).toBeVisible();await expect(host).toHaveAttribute('data-sim-animating','true');await expect(movie).toHaveAttribute('data-auto-phase','preassemble',{timeout:30000});await expect.poll(async()=>Number(await movie.getAttribute('data-auto-step-progress')),{intervals:[50]}).toBeGreaterThan(.72);await page.getByRole('button',{name:'暂停自动组装动画'}).click();await expect(movie).toHaveAttribute('data-auto-phase','preassemble');await expect(movie).not.toContainText('待核');await page.screenshot({path:'.runtime/simulate-review/auto-process-preassembly-1600.png'});
 await page.getByRole('button',{name:'动画播放速度'}).click();await page.getByRole('button',{name:'动画播放速度'}).click();await expect(page.getByRole('button',{name:'动画播放速度'})).toHaveText('4×');await page.getByRole('button',{name:'继续自动组装动画'}).click();
 await expect(movie).toHaveAttribute('data-auto-phase','join');await page.waitForTimeout(1800);await page.getByRole('button',{name:'暂停自动组装动画'}).click();await page.screenshot({path:'.runtime/simulate-review/auto-assembly-join-1600.png'});await page.keyboard.press('Space');
 await expect(movie).toHaveCount(0,{timeout:65000});await expect(host).toHaveAttribute('data-sim-animating','false');const completed=await read(request,s.id);
 expect(completed.groups).toHaveLength(1);expect(completed.instances).toHaveLength(70);expect(completed.reference_assembly?.removed_connection_count).toBeGreaterThanOrEqual(1);expect(completed.reference_assembly?.structure_binding_count).toBeGreaterThan(0);expect(completed.history).toHaveLength(before.history.length+1);
 for(const c of completed.connections.filter(c=>c.status==='reference'))expect(c.geometry.status).toBe('not_evaluated');await expect(page.getByRole('region',{name:'当前对象信息'})).toContainText('成品参考');await page.screenshot({path:'.runtime/simulate-review/auto-assembly-complete-1600.png'});
 await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(completed.revision+1));let recovered=await read(request,s.id);expect(recovered.instances).toEqual(before.instances);expect(recovered.connections).toEqual(before.connections);expect(recovered.reference_assembly).toBeNull();
 await page.getByRole('button',{name:'重做装配操作',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(completed.revision+2));recovered=await read(request,s.id);expect(recovered.instances).toEqual(completed.instances);expect(recovered.connections).toEqual(completed.connections);
 await page.reload();await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:60000});await expect(movie).toHaveCount(0);expect((await read(request,s.id)).reference_assembly).toEqual(completed.reference_assembly);
 await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(completed.revision+3));await auto.click();await expect(movie).toBeVisible({timeout:65000});await page.keyboard.press('Escape');await expect(movie).toHaveCount(0);expect((await read(request,s.id)).instances).toEqual(completed.instances);
 await page.getByRole('button',{name:'撤销装配操作',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});await expect(auto).toBeEnabled();await auto.click();await expect(page.getByRole('region',{name:'当前对象信息'})).toContainText('成品参考',{timeout:65000});await expect(movie).toHaveCount(0);expect((await read(request,s.id)).instances).toEqual(completed.instances);expect(errors).toEqual([]);
});

test('真实部件连接、预览取消、拆开、历史、刷新和复制',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const data:PrototypeData=await(await request.get(base+'/view',{timeout:60000})).json();let s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'操作验收'});const anchor=s.instances.find(i=>data.parts.find(p=>p.id===i.part_ref)?.name.includes('XL330'))!;
 let result=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:anchor.id,expected_revision:s.revision});let chosen:ConnectionCandidate|undefined;
 // Stage the fixed target above the table so UI checks do not depend on inventory orientation.
 const initial=result.candidates.find(c=>!c.unavailable_reason)!;expect(initial).toBeTruthy();const target=s.instances.find(p=>p.id===initial.target_instance_id)!;
 s=await command(request,s,{type:'move',instance_id:target.id,pose:{position:[.2,-.1,.24],quaternion:target.quaternion}});
 result=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:anchor.id,target_instance_id:target.id,expected_revision:s.revision});
 for(const c of result.candidates){const preview=await post<ConnectionPreview>(request,sessions+'/'+s.id+'/preview',{candidate_id:c.id,moving_instance_id:c.moving_instance_id,target_instance_id:c.target_instance_id,expected_revision:s.revision});if(preview.status==='ready'){chosen=c;break;}}expect(chosen).toBeTruthy();
 await open(page,s);let choice=await chooseMethod(page,s,chosen!);await choice.hover();expect((await read(request,s.id)).revision).toBe(s.revision);await page.getByRole('button',{name:'关闭连接卡片'}).click();expect((await read(request,s.id)).connections).toHaveLength(0);
 choice=await chooseMethod(page,s,chosen!);await page.waitForTimeout(650);const host=page.locator('.simulation-canvas'),camera=await host.getAttribute('data-sim-camera'),cameraTarget=await host.getAttribute('data-sim-camera-target');
 await choice.dblclick();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));await expect(host).toHaveAttribute('data-sim-presentation','connect');await page.waitForTimeout(480);expect(await host.getAttribute('data-sim-camera')).not.toBe(camera);
 await expect(host).toHaveAttribute('data-sim-animating','false');expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(camera!.split(',').map(Number)))).toBeLessThan(1e-10);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera-target'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(cameraTarget!.split(',').map(Number)))).toBeLessThan(1e-10);
 await expect(page.locator('.simulation-performance-hint')).toHaveCount(0);s=await read(request,s.id);expect(s.connections).toHaveLength(1);expect(s.groups.find(g=>g.instance_ids.includes(anchor.id))!.instance_ids).toHaveLength(2);
 const group=s.groups.find(g=>g.instance_ids.includes(anchor.id))!,info=page.getByRole('region',{name:'当前对象信息'});await expect(info).toContainText('2 个部件 · 1 条连接');
 await expect.poll(async()=>JSON.parse((await host.getAttribute('data-sim-selection-outlines'))!)).toEqual([...group.instance_ids]);
 const nextOptions=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:group.id,expected_revision:s.revision});
 const targetMembers=[...new Set(nextOptions.candidates.flatMap(c=>s.groups.find(g=>g.instance_ids.includes(c.target_instance_id))!.instance_ids).filter(id=>!group.instance_ids.includes(id)))].sort();
 await expect.poll(async()=>JSON.parse((await host.getAttribute('data-sim-compatible-outlines'))!).sort()).toEqual(targetMembers);await expect(host).toHaveAttribute('data-sim-compatibility-markers','none');
 const other=nextOptions.candidates.find(c=>!group.instance_ids.includes(c.target_instance_id));expect(other).toBeTruthy();await selectObject(page,s.groups.find(g=>g.instance_ids.includes(other!.target_instance_id))!.id);
 await expect.poll(async()=>{const outlined=JSON.parse((await host.getAttribute('data-sim-compatible-outlines'))!);return group.instance_ids.every(id=>outlined.includes(id));}).toBe(true);
 await selectObject(page,group.id);await expect(info).toContainText('2 个部件 · 1 条连接');
 const poses=structuredClone(s.instances),fixed=chosen!.target_instance_id,moving=chosen!.moving_instance_id;
 const label=page.locator('[data-sim-connection-label]').first();await expect(label).toBeVisible();const splitResponse=page.waitForResponse(response=>response.url().endsWith('/commands')&&response.request().postDataJSON()?.type==='disconnect');await label.click();const splitResult:SimulationSession=await(await splitResponse).json();
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));await expect(host).toHaveAttribute('data-sim-presentation','settle');s=await read(request,s.id);expect(splitResult.operation?.status).toBe('placed');expect(s.instances.find(i=>i.id===fixed)).toEqual(poses.find(i=>i.id===fixed));expect(s.instances.find(i=>i.id===moving)).not.toEqual(poses.find(i=>i.id===moving));expect(s.connections).toHaveLength(0);
 const settled=structuredClone(s.instances);await expect(host).toHaveAttribute('data-sim-animating','false');
 await page.keyboard.press('Control+z');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));s=await read(request,s.id);expect(s.connections).toHaveLength(1);expect(s.instances).toEqual(poses);
 await page.keyboard.press('Control+Shift+z');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));s=await read(request,s.id);expect(s.connections).toHaveLength(0);expect(s.instances).toEqual(settled);
 choice=await chooseMethod(page,s,chosen!);await page.waitForTimeout(550);const skipCamera=(await host.getAttribute('data-sim-camera'))!.split(',').map(Number);await choice.click();await expect(host).toHaveAttribute('data-sim-presentation','connect');await page.keyboard.press('Escape');await expect(host).toHaveAttribute('data-sim-animating','false');s=await read(request,s.id);expect(s.connections).toHaveLength(1);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(skipCamera))).toBeLessThan(1e-10);
 await page.reload();await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-ready','true',{timeout:60000});await sceneMenu(page);await expect(page.getByRole('combobox',{name:'选择装配方案'})).toHaveValue(s.id);expect((await read(request,s.id)).instances).toEqual(s.instances);
 await page.getByRole('button',{name:'复制',exact:true}).click();await expect(page.locator('.simulate-page')).not.toHaveAttribute('data-sim-session',s.id);const copy=await read(request,(await page.locator('.simulate-page').getAttribute('data-sim-session'))!);expect(copy.instances).toEqual(s.instances);expect(copy.can_undo).toBe(false);expect(errors).toEqual([]);
});

test('鼠标拖拽只保存一步，Esc 取消，输入框快捷键隔离，窄窗口和手动画质',async({page,request})=>{
 let s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'操控验收'});const data:PrototypeData=await(await request.get(base+'/view')).json();const id='instance:'+data.parts.find(p=>p.kind==='actuator')!.id;await open(page,s);await selectObject(page,id);await page.getByRole('button',{name:'聚焦选中对象',exact:true}).click();await page.waitForTimeout(650);const host=page.locator('.simulation-canvas'),box=(await host.boundingBox())!;
 const point=JSON.parse((await host.getAttribute('data-sim-projections'))!)[id];await page.mouse.move(box.x+point[0],box.y+point[1]);await page.mouse.down();await page.mouse.move(box.x+point[0]+30,box.y+point[1]+12,{steps:8});await page.mouse.up();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));s=await read(request,s.id);expect(s.history).toHaveLength(1);
 const projected=JSON.parse((await host.getAttribute('data-sim-projections'))!)[id];await page.mouse.move(box.x+projected[0],box.y+projected[1]);await page.mouse.down();await page.mouse.move(box.x+projected[0]+20,box.y+projected[1]+10,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(200);expect((await read(request,s.id)).revision).toBe(s.revision);
 await panel(page,'object');const field=page.getByRole('spinbutton',{name:'位置 X',exact:true});await field.focus();await page.keyboard.press('e');await expect(page.getByRole('button',{name:'旋转',exact:true})).toHaveAttribute('aria-pressed','false');await page.keyboard.press('Escape');await page.locator('.simulation-pane-heading').last().click();
 await quality(page,'performance');await expect(host).toHaveAttribute('data-sim-quality','performance');await page.waitForTimeout(850);const camera=await host.getAttribute('data-sim-camera');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width/2+1,box.y+box.height/2);await page.mouse.up({button:'right'});await expect(host).not.toHaveAttribute('data-sim-camera',camera!,{timeout:500});
 for(const [width,height] of [[1920,1080],[1600,1000],[1280,800]]){await page.setViewportSize({width,height});await expect(host).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await quality(page,'high');await expect(host).toHaveAttribute('data-sim-quality','high');
});

test('断线后的操作草稿跨刷新重试，候选读取期间不出现无结果文案',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'恢复验收'});await open(page,s);let release:()=>void=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});await page.route('**/simulate/sessions/*/candidates',async route=>{await hold;await route.continue();});await selectAt(page,0);await panel(page,'targets');await expect(page.getByText('正在检索可用接口…',{exact:true})).toBeVisible();await expect(page.getByText(/当前已知规则下没有可用连接/)).toHaveCount(0);release();await expect(page.getByText('正在检索可用接口…',{exact:true})).toHaveCount(0);
 await page.route('**/simulate/sessions/*/commands',route=>route.abort('internetdisconnected'));await panel(page,'object');const field=page.getByRole('spinbutton',{name:'位置 X',exact:true}),value=Number(await field.inputValue());await field.fill(String(value+12));await field.press('Enter');await expect(page.locator('.simulation-error')).toBeVisible();expect((await read(request,s.id)).revision).toBe(s.revision);
 await page.reload();await expect(page.locator('.simulation-error')).toContainText('上次操作的保存结果尚未确认');await page.unroute('**/simulate/sessions/*/commands');await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));expect((await read(request,s.id)).history).toHaveLength(1);await expect(page.locator('.simulation-error')).toHaveCount(0);
 const latest=await read(request,s.id),external=await command(request,latest,{type:'rename',name:'另一标签页的名称'});await selectAt(page,1);await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(external.revision));await sceneMenu(page);await expect(page.getByRole('combobox',{name:'选择装配方案'})).toContainText('另一标签页的名称');
});

test('实际靠近才弹卡片，悬停后移远仍关闭，矮窗口完整显示，切换方案释放画布',async({page,request})=>{
 test.setTimeout(180000);
 const data:PrototypeData=await(await request.get(base+'/view')).json();let s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'邻近与紧凑卡片验收'});
 const servos=s.instances.filter(i=>data.parts.find(p=>p.id===i.part_ref)?.kind==='actuator'),a=servos[0],b=servos[1];
 const part=data.parts.find(p=>p.id===a.part_ref)!,bytes=await(await request.get(part.geometryUrl)).body(),geometry=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);geometry.computeBoundingBox();
 const matrix=new Matrix4().compose(new Vector3(),new Quaternion().fromArray(a.quaternion),new Vector3().fromArray(part.scale)),bounds=geometry.boundingBox!.clone().applyMatrix4(matrix),spacing=bounds.max.x-bounds.min.x+.003;geometry.dispose();
 s=await command(request,s,{type:'move',instance_id:a.id,pose:{position:[0,0,.25],quaternion:a.quaternion}});
 s=await command(request,s,{type:'move',instance_id:b.id,pose:{position:[spacing,0,.25],quaternion:a.quaternion}});
 const options=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:b.id,target_instance_id:a.id,expected_revision:s.revision});expect(options.candidates.length).toBeGreaterThan(0);
 const world=(point:number[],id:string)=>{const p=s.instances.find(i=>i.id===id)!;return new Vector3().fromArray(point).applyQuaternion(new Quaternion().fromArray(p.quaternion)).add(new Vector3().fromArray(p.position));};
 expect(Math.min(...options.candidates.map(c=>world(c.moving_anchor,b.id).distanceTo(world(c.target_anchor,a.id))))).toBeGreaterThan(.002);
 await open(page,s);
 await directory(page);await page.locator('.simulation-object').evaluateAll((objects,keep)=>{for(const object of objects)if(!keep.includes(object.getAttribute('data-sim-object')!))(object.querySelector('.simulation-object-visibility') as HTMLButtonElement).click();},[a.id,b.id]);
 await selectObject(page,b.id);await page.getByRole('button',{name:'显示全部',exact:true}).click();await page.waitForTimeout(400);
 await expect(page.getByRole('region',{name:'当前对象信息'})).toContainText('1 个部件 · 0 条连接');
 const card=page.getByRole('region',{name:'选择连接方式'});await expect(card).toHaveCount(0);await page.keyboard.press('ArrowRight');
 await expect(card).toBeVisible({timeout:15000});await expect(page.getByRole('combobox',{name:'切换连接目标'})).toHaveValue(a.id);
 const more=page.locator('.simulation-more-methods');if(await more.count())await more.click();for(const title of [...new Set(options.candidates.map(c=>c.title))])await expect(card.getByText(title,{exact:true}).first()).toBeVisible();expect((await read(request,s.id)).connections).toHaveLength(0);
 const footer=page.locator('.simulation-card-footer'),list=page.locator('.simulation-card-methods');
 for(const [width,height] of [[1600,1000],[1280,800],[999,925],[1000,700],[900,450],[854,360]]){
  await page.setViewportSize({width,height});await expect(footer).toBeInViewport({ratio:1});const bounds=(await card.boundingBox())!,viewport=(await page.locator('.simulation-viewport').boundingBox())!;expect(bounds.y).toBeGreaterThanOrEqual(viewport.y+71);expect(bounds.y+bounds.height).toBeLessThanOrEqual(Math.min(height,viewport.y+viewport.height)-19);expect(await card.evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur');expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);const info=(await page.getByRole('region',{name:'当前对象信息'}).boundingBox())!;expect(bounds.x+bounds.width<=info.x||bounds.y>=info.y+info.height).toBe(true);
 }
 expect(await list.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await list.evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect(card.locator('.simulation-method').last()).toBeInViewport();await expect(footer).toBeInViewport({ratio:1});
 await page.setViewportSize({width:1600,height:1000});const before=await card.boundingBox(),prior=await read(request,s.id);await card.hover();await page.keyboard.press('ArrowRight');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(prior.revision+1));await page.waitForTimeout(450);await expect(card).toBeVisible();const after=await card.boundingBox();expect(Math.abs(before!.x-after!.x)).toBeLessThan(1);expect(Math.abs(before!.y+before!.height-after!.y-after!.height)).toBeLessThan(1);
 s=await read(request,s.id);
 for(let step=0;step<4;step++){await page.keyboard.press('Shift+ArrowRight');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));s=await read(request,s.id);}
 await expect(card).toHaveCount(0);await expect(hostFor(page)).toHaveAttribute('data-sim-near','');
 // Explicit browsing can open a distant target, but its next movement restores proximity-based dismissal.
 await panel(page,'targets');await page.locator('[data-sim-target="'+a.id+'"]').click();await expect(card).toBeVisible();await card.hover();await page.keyboard.press('ArrowRight');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(s.revision+1));await expect(card).toHaveCount(0);s=await read(request,s.id);
 await expect(hostFor(page)).toHaveAttribute('data-sim-environment','stark-research-workshop');await expect(hostFor(page)).toHaveAttribute('data-sim-background-ready','true');
 const copy=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),copy_from:s.id,name:'画布释放验收'}),sizes:number[]=[];await page.reload();await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-ready','true',{timeout:60000});
 for(const id of [copy.id,s.id,copy.id,s.id]){await sceneMenu(page);await page.getByRole('combobox',{name:'选择装配方案'}).selectOption(id);await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-session',id);await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-ready','true',{timeout:60000});await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-metrics',/geometries/);expect(await page.locator('.simulation-webgl').count()).toBe(1);const metrics=JSON.parse((await page.locator('.simulation-canvas').getAttribute('data-sim-metrics'))!);sizes.push(metrics.geometries);}
 expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThanOrEqual(2);
});

test('复合、包覆和承座接口显示关联对象，右脚原装姿态如实报告实体干涉',async({page,request})=>{
 const data:PrototypeData=await(await request.get(base+'/view')).json(),s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'全部接口入口验收'});await open(page,s);
 for(const name of ['右脚部件','喙部软质件','NP-F970 电池外形']){
  const part=data.parts.find(p=>p.name===name)!;await selectObject(page,'instance:'+part.id);await panel(page,'interfaces');await expect(page.locator('.simulation-interface-targets button').first()).toBeVisible({timeout:15000});
 }
 const foot=data.parts.find(p=>p.name==='右脚部件')!,sole=data.parts.find(p=>p.name==='右脚底')!;
 await selectObject(page,'instance:'+foot.id);await panel(page,'interfaces');await expect(page.getByRole('button',{name:'与右脚底组装',exact:true})).toBeVisible();await page.getByRole('button',{name:'与右脚底组装',exact:true}).click();
 const card=page.getByRole('region',{name:'选择连接方式'});await expect(card).toContainText('脚与脚底的杯形包覆套合');await expect(card).toContainText('可连接 · 原装参考',{timeout:30000});await card.locator('.simulation-geometry-details summary').click();await expect(card).toContainText('实体重叠');await expect(card.locator('.simulation-connect-choice')).toBeEnabled();await card.locator('.simulation-connect-choice').click();await page.keyboard.press('Escape');const saved=await read(request,s.id);expect(saved.connections).toHaveLength(1);expect(saved.connections[0].geometry.status).toBe('interference');expect(saved.connections[0].assembly_assessment?.decision).toBe('allow_with_note');
 await post(request,sessions+'/'+s.id+'/commands',{type:'undo',request_id:crypto.randomUUID(),expected_revision:saved.revision});const restored=await read(request,s.id);const query=await post<CandidateResult>(request,sessions+'/'+s.id+'/candidates',{instance_id:'instance:'+sole.id,expected_revision:restored.revision});expect(query.candidates.some(c=>c.target_instance_id==='instance:'+foot.id)).toBe(true);
});


test('高清环境加载失败可重试，完整就绪后才开放场景',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'高清环境恢复验收'});
 await page.route('**/concrete-color-4k*.jpg',route=>route.abort('failed'));
 await page.goto('/#simulate?workspace=microduck&snapshot='+snapshot+'&session='+s.id);
 const host=hostFor(page);await expect(page.locator('.simulation-load-error')).toBeVisible({timeout:60000});await expect(host).toHaveAttribute('data-sim-ready','false');await expect(host).toHaveAttribute('data-sim-background-ready','false');
 await page.unroute('**/concrete-color-4k*.jpg');await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:60000});await expect(host).toHaveAttribute('data-sim-background-resolution','native-3d');await expect(page.locator('.simulation-loading')).toHaveCount(0);
 const restored=await read(request,s.id);expect(restored.revision).toBe(s.revision);expect(restored.instances).toEqual(s.instances);expect(restored.connections).toHaveLength(0);
 await page.route('**/precision-assistant-*.glb',route=>route.abort('failed'));await page.reload();await expect(page.locator('.simulation-load-error')).toBeVisible({timeout:60000});await expect(host).toHaveAttribute('data-sim-ready','false');
 await page.unroute('**/precision-assistant-*.glb');await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:60000});expect((await read(request,s.id)).instances).toEqual(s.instances);
 await page.route('**/private-workshop-bay-window-*.png',route=>route.abort('failed'));await page.reload();await expect(page.locator('.simulation-load-error')).toBeVisible({timeout:60000});await expect(host).toHaveAttribute('data-sim-ready','false');
 await page.unroute('**/private-workshop-bay-window-*.png');await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(host).toHaveAttribute('data-sim-ready','true',{timeout:60000});expect((await read(request,s.id)).instances).toEqual(s.instances);
});


test('沉浸布局保留完整视口，目录、精确工具和方案菜单按需展开',async({page,request})=>{
 const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'沉浸界面验收'});await open(page,s);await page.waitForTimeout(350);const host=hostFor(page),rect=(await host.boundingBox())!,camera=await host.getAttribute('data-sim-camera');
 expect(rect.x).toBe(0);expect(rect.y).toBe(0);expect(rect.width).toBe(1600);expect(rect.height).toBe(1000);
 await expect(page.locator('.simulation-tree')).toHaveCount(0);await expect(page.locator('.simulation-inspector')).toHaveCount(0);await expect(page.locator('.sidebar')).not.toBeVisible();await expect(page.locator('.topbar')).not.toBeVisible();
 await page.getByRole('button',{name:'环顾工坊',exact:true}).click();await expect(host).toHaveAttribute('data-sim-fov','55');await page.waitForTimeout(350);expect(await host.boundingBox()).toEqual(rect);expect((await read(request,s.id)).revision).toBe(s.revision);
 await page.getByRole('button',{name:'透视',exact:true}).click();await expect(host).toHaveAttribute('data-sim-fov','34');await page.waitForTimeout(350);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(camera!.split(',').map(Number)))).toBeLessThan(1e-10);
 await page.keyboard.press('/');const search=page.getByRole('textbox',{name:'搜索场景部件'});await expect(search).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(0);await search.fill('右脚部件');await expect(page.locator('.simulation-object-select')).toHaveCount(1);expect(await host.boundingBox()).toEqual(rect);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(camera!.split(',').map(Number)))).toBeLessThan(1e-10);
 await page.locator('.simulation-object-select').click();await expect(page.locator('.simulation-tree')).toHaveCount(0);await expect(page.locator('.simulation-selection-hud')).toContainText('右脚部件');const info=page.getByRole('region',{name:'当前对象信息'}),infoRect=(await info.boundingBox())!;expect(infoRect.x).toBeGreaterThan(rect.width-300);expect(infoRect.width).toBeLessThanOrEqual(280);expect(infoRect.height).toBeLessThan(180);await expect(info).toContainText('可用接口');await expect(host).toHaveAttribute('data-sim-compatibility-markers','none');
 await panel(page,'object');await expect(page.getByRole('spinbutton',{name:'位置 X',exact:true})).toBeVisible();expect(await host.boundingBox()).toEqual(rect);expect(new Vector3().fromArray((await host.getAttribute('data-sim-camera'))!.split(',').map(Number)).distanceTo(new Vector3().fromArray(camera!.split(',').map(Number)))).toBeLessThan(1e-10);await page.getByRole('button',{name:'关闭对象工具',exact:true}).click();
 await page.getByRole('button',{name:'全屏',exact:true}).click();await expect(page.getByRole('button',{name:'退出全屏',exact:true})).toBeVisible();await page.getByRole('button',{name:'退出全屏',exact:true}).click();
 await page.getByRole('button',{name:'全屏',exact:true}).click();await sceneMenu(page);await page.locator('.simulation-menu-context button').click();await expect(page.getByRole('dialog',{name:'设备知识版本',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-session',s.id);
 await sceneMenu(page);await page.getByRole('button',{name:'重命名方案',exact:true}).click();await page.getByRole('textbox',{name:'方案名称'}).fill('私人研发工坊验收');await page.getByRole('button',{name:'保存名称',exact:true}).click();await expect(page.getByRole('button',{name:'方案菜单',exact:true})).toContainText('私人研发工坊验收');expect((await read(request,s.id)).connections).toHaveLength(0);
 await page.getByRole('button',{name:'返回工作台',exact:true}).click();await expect(page.locator('.nav-item').filter({hasText:'Simulate'})).toBeVisible();expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('snapshot')).toBe(snapshot);
});


test('恢复初始拆散状态只保存一步，并可撤销、重做和刷新',async({page,request})=>{
 test.setTimeout(120000);
 const data:PrototypeData=await(await request.get(base+'/view',{timeout:60000})).json(),initial=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'恢复初始拆散验收'});
 const actuator=initial.instances.find(i=>data.parts.find(p=>p.id===i.part_ref)?.kind==='actuator')!,options=await post<CandidateResult>(request,sessions+'/'+initial.id+'/candidates',{instance_id:actuator.id,expected_revision:initial.revision});let chosen:ConnectionCandidate|undefined;
 for(const c of options.candidates){const preview=await post<ConnectionPreview>(request,sessions+'/'+initial.id+'/preview',{candidate_id:c.id,moving_instance_id:c.moving_instance_id,target_instance_id:c.target_instance_id,expected_revision:initial.revision});if(preview.status==='ready'){chosen=c;break;}}
 expect(chosen).toBeTruthy();const edited=await command(request,initial,{type:'connect',candidate_id:chosen!.id,moving_instance_id:chosen!.moving_instance_id,target_instance_id:chosen!.target_instance_id});await open(page,edited);
 await selectObject(page,edited.groups.find(g=>g.instance_ids.includes(actuator.id))!.id);await directory(page);await page.locator('.simulation-object-visibility').last().evaluate((e:HTMLButtonElement)=>e.click());
 const reset=page.getByRole('button',{name:'恢复初始拆散状态',exact:true}),rect=(await reset.boundingBox())!;expect(rect.x).toBe(20);expect(rect.y+rect.height).toBeLessThanOrEqual(980);await reset.click();
 await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(edited.revision+1));let current=await read(request,initial.id);expect(current.instances).toEqual(initial.instances);expect(current.connections).toEqual([]);expect(current.groups).toHaveLength(70);expect(current.history).toHaveLength(edited.history.length+1);expect(current.history.at(-1)!.label).toBe('恢复初始拆散状态');await expect(page.getByRole('region',{name:'当前对象信息'})).toHaveCount(0);await expect.poll(async()=>Object.keys(JSON.parse((await hostFor(page).getAttribute('data-sim-projections'))!)).length).toBe(70);
 await page.keyboard.press('Control+z');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(current.revision+1));current=await read(request,initial.id);expect(current.instances).toEqual(edited.instances);expect(current.connections).toEqual(edited.connections);
 await page.keyboard.press('Control+Shift+z');await expect(page.locator('.simulate-page')).toHaveAttribute('data-sim-revision',String(current.revision+1));current=await read(request,initial.id);expect(current.instances).toEqual(initial.instances);expect(current.connections).toEqual([]);
 await page.reload();await expect(hostFor(page)).toHaveAttribute('data-sim-ready','true',{timeout:60000});current=await read(request,initial.id);expect(current.instances).toEqual(initial.instances);expect(current.can_undo).toBe(true);
});

test('金色轮廓的实际深度遮挡在不同视角连续，仍正确遮住被其他对象挡住的部分',async({page},testInfo)=>{
 const root=path.resolve('node_modules/three'),helper=ts.transpileModule(await readFile('src/simulate-outline.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,html=await readFile('tests/fixtures/simulate-outline.html','utf8'),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__outline-regression/**',async route=>{const pathname=new URL(route.request().url()).pathname;if(pathname.endsWith('/index.html')){await route.fulfill({contentType:'text/html',body:html});return;}if(pathname.endsWith('/helper.js')){await route.fulfill({contentType:'text/javascript',body:helper});return;}const relative=pathname.split('/three/')[1],file=path.resolve(root,relative??'');if(!file.startsWith(root+path.sep)){await route.abort();return;}await route.fulfill({contentType:'text/javascript',body:await readFile(file)});});
 await page.goto('/__outline-regression/index.html');type Coverage={position:number[];visible:number;occluded:number;false_occluded:number;false_visible:number};
 await expect.poll(()=>page.evaluate(()=>((window as unknown as {outlineCoverage?:unknown[]}).outlineCoverage?.length??0))).toBe(3);
 const coverage=await page.evaluate(()=>(window as unknown as {outlineCoverage:Coverage[]}).outlineCoverage);expect(errors).toEqual([]);
 for(const sample of coverage){expect(sample.visible).toBeGreaterThan(50);expect(sample.occluded).toBeGreaterThan(0);expect(sample.false_occluded/sample.visible).toBeLessThan(.01);expect(sample.false_visible/sample.occluded).toBeLessThan(.01);}
 await testInfo.attach('outline-depth-coverage',{body:JSON.stringify(coverage,null,2),contentType:'application/json'});
});

test.describe('原生浏览器窗口',()=>{
 test('连接卡片跟随真实窗口客户区，不使用固定1080像素模拟高度',async({request},testInfo)=>{
  const browser=await chromium.launch({channel:'chrome',headless:false});try{const page=await browser.newPage({viewport:null,baseURL:'http://127.0.0.1:8792'});
  const s=await post<SimulationSession>(request,sessions,{request_id:crypto.randomUUID(),name:'原生窗口验收'}),data:PrototypeData=await(await request.get(base+'/view',{timeout:60000})).json(),part=data.parts.find(p=>p.kind==='actuator')!;
  await open(page,s);expect(page.viewportSize()).toBeNull();await selectObject(page,'instance:'+part.id);await panel(page,'targets');await page.locator('[data-sim-target]').first().click();const card=page.getByRole('region',{name:'选择连接方式'});await expect(card).toBeVisible();
  const cdp=await page.context().newCDPSession(page),{windowId}=await cdp.send('Browser.getWindowForTarget'),records=[];
  await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
  for(const [width,height] of [[1280,800],[1600,1000],[1000,700]]){
   await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left:40,top:30,width,height}});await page.waitForTimeout(300);await expect(page.locator('.simulation-card-footer')).toBeInViewport({ratio:1});
   const dimensions=await page.evaluate(()=>({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],canvas:document.querySelector('.simulation-canvas')!.getBoundingClientRect().height})),bounds=(await card.boundingBox())!;expect(dimensions.inner[1]).toBeLessThan(dimensions.outer[1]);expect(dimensions.canvas).toBe(dimensions.inner[1]);expect(bounds.y+bounds.height).toBeLessThanOrEqual(dimensions.inner[1]-19);
   records.push({window:[width,height],...dimensions,card:bounds});await page.screenshot({path:testInfo.outputPath('native-window-'+width+'.png')});
  }
  await testInfo.attach('native-window-bounds',{body:JSON.stringify(records,null,2),contentType:'application/json'});expect((await read(request,s.id)).revision).toBe(s.revision);await cdp.detach();}finally{await browser.close();}
 });
});
