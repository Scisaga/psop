import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {createSimulationStore,replaceSessionFile,readSimulationRequest} from './simulate-store.mjs';
import {Readable} from 'node:stream';
import {groupsFor,groupFor,occupancyFor,layoutInstances,matrix,registrationMatrix,transformGroup,validPose,transformedBounds} from './simulate-core.mjs';
import {createSimulationGeometry} from './simulate-geometry.mjs';
import {withReferencePairs,referenceBranches} from './simulate-reference.mjs';

const pose=(id,x=0,y=0,z=.01)=>({id,part_ref:id,position:[x,y,z],quaternion:[0,0,0,1]});
test('connection graph splits only disconnected components, preserving cycles and singleton identity',()=>{
 const parts=['a','b','c','d'].map(id=>pose(id));const edge=(id,a,b)=>({id,endpoints:[{instance_id:a},{instance_id:b}]});
 const ab=edge('ab','a','b'),bc=edge('bc','b','c'),ac=edge('ac','a','c');
 assert.deepEqual(groupsFor(parts,[ab,bc]).map(g=>g.instance_ids),[['a','b','c'],['d']]);
 assert.deepEqual(groupsFor(parts,[ab]).map(g=>g.instance_ids),[['a','b'],['c'],['d']]);
 assert.deepEqual(groupsFor(parts,[ab,ac]).map(g=>g.instance_ids),[['a','b','c'],['d']]);
});
test('a common world transform preserves every existing relative pose at arbitrary rotations',()=>{
 const a={...pose('a',.1,.2,.3),quaternion:new Quaternion().setFromAxisAngle(new Vector3(1,1,0).normalize(),.8).toArray()},b={...pose('b',-.1,.08,.2),quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),1.4).toArray()};
 const s={instances:[a,b,pose('c')],connections:[{id:'ab',endpoints:[{instance_id:'a'},{instance_id:'b'}]}]};
 const delta=new Matrix4().makeRotationY(.7).setPosition(.2,-.3,.15),before=matrix(a).invert().multiply(matrix(b));const next=transformGroup(s,'a',delta);const after=matrix(next[0]).invert().multiply(matrix(next[1]));
 assert.ok(before.elements.every((v,i)=>Math.abs(v-after.elements[i])<1e-12));assert.deepEqual(next[2],s.instances[2]);assert.deepEqual(s.instances[0],a);
 assert.throws(()=>validPose({position:[NaN,0,0],quaternion:[0,0,0,1]}));assert.throws(()=>validPose({position:[0,0,0],quaternion:[0,0,0,0]}));
});
test('different interface names cannot reuse the same underlying channel',()=>{
 const end=(i)=>({instance_id:'a',interface_ref:i,resource_keys:['a|channel:one']});
 assert.throws(()=>occupancyFor([{id:'1',endpoints:[end('left')]},{id:'2',endpoints:[end('right')]}]),/重复占用/);
});
function cubeStl(){const b=Buffer.alloc(84+12*50);b.writeUInt32LE(12,80);const vertices=[[-.01,-.01,-.01],[.01,-.01,-.01],[.01,.01,-.01],[-.01,.01,-.01],[-.01,-.01,.01],[.01,-.01,.01],[.01,.01,.01],[-.01,.01,.01]],faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];for(let i=0;i<12;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)b.writeFloatLE(vertices[faces[i][j]][k],84+50*i+12+12*j+4*k);return b;}
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'psop-simulate-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const parts=['a','b','c','d'].map(id=>({...pose(id),name:id,scale:[1,1,1],geometryUrl:'cube.stl'}));
 const assets=new Map([['cube.stl',cubeStl()]]),pairs=[],capability={parts:{},compatibility:{index_path:'compatibility.json'}};
 for(const p of parts){const interfaces=['left','right','alias'].map(side=>({id:p.id+':'+side,name:side,owner_ref:p.id,members:[{id:p.id+':'+side+':member',feature_refs:[p.id+':'+(side==='alias'?'right':side)+':feature'],position:[side==='left'?-.01:.01,0,0],direction:[1,0,0]}]}));const features=['left','right'].map(side=>({id:p.id+':'+side+':feature',capability:{resource_refs:[p.id+':'+side+':channel']}}));const file=p.id+'.json';capability.parts[p.id]={path:file};assets.set(file,Buffer.from(JSON.stringify({interfaces,features})));}
 for(const [a,b,as] of [['a','b','right'],['b','c','right'],['c','d','right'],['a','d','alias']]){
  const id=a+b,file=id+'.json',pa=[.01,0,0],pb=[-.01,0,0],option={registration:{rotation_b_to_a:[[1,0,0],[0,1,0],[0,0,1]],translation_b_to_a:[.02,0,0],whole_part_collision_evaluated:true,comparison_margin_m:4e-5},interference:{status:'clear'},member_pairs:[{member_a_ref:a+':'+as+':member',member_b_ref:b+':left:member',feature_a_ref:a+':right:feature',feature_b_ref:b+':left:feature',position_a:pa,position_b:pb,contact_a:pa,contact_b:pb}]};
  const candidate={id:'candidate:'+id,template_ref:'template:through_fastener',interface_matches:[{id:'match:'+id,interface_a_ref:a+':'+as,interface_b_ref:b+':left',member_count:1,alignment_options:[option]}]};pairs.push({id,owner_refs:[a,b],path:file,candidate_count:1});assets.set(file,Buffer.from(JSON.stringify({candidates:[candidate]})));
 }
 assets.set('scene.json',Buffer.from(JSON.stringify({parts,assembly:{capability_index:capability}})));assets.set('compatibility.json',Buffer.from(JSON.stringify({pairs})));
 const bundle={root:directory,manifest:{package_digest:'a'.repeat(64),package_id:'test',entrypoints:{scene:'scene.json'}}},calls=[];let blocked=false,diagnosticTimeout=false;
 let writeFails=false;const store=createSimulationStore({registryFile:path.join(directory,'registry.json'),load:async()=>bundle,read:async(_,entry)=>{if(!assets.has(entry))throw Error(entry);return assets.get(entry);},persist:async(file,value)=>{if(writeFails)throw Object.assign(Error('simulated disk failure'),{status:503});return replaceSessionFile(file,value);},geometry:{evaluate:async input=>{calls.push(input);if(diagnosticTimeout&&input.diagnostics)return {status:'unresolved',reason:'diagnostic timeout'};return {status:blocked?'interference':'clear',...(blocked?{intersection_volume_m3:1e-9,diagnostics:{sampled_penetration_depth_m:Math.max(0,.02-Math.max(...input.t.map(Math.abs)))}}:{})};},close(){}}});
 t.after(()=>store.close());return {store,directory,assets,parts,calls,block:()=>{blocked=true;},failDiagnostics:()=>{diagnosticTimeout=true;},failWrites:value=>{writeFails=value;}};
}
const input=(s,body)=>({...body,expected_revision:s.revision,request_id:crypto.randomUUID()});
const instance=id=>'instance:'+id;
async function candidate(f,s,moving,target){return (await f.store.candidates('w','v',s.id,{instance_id:instance(moving),target_instance_id:instance(target),expected_revision:s.revision})).candidates.find(c=>c.moving_instance_id===instance(moving)&&c.target_instance_id===instance(target));}
const connectionInput=c=>({type:'connect',candidate_id:c.id,moving_instance_id:c.moving_instance_id,target_instance_id:c.target_instance_id});
test('configuration and policy changes preserve poses, persist, copy and undo atomically; policy invalidates assessments',async t=>{
 const f=await fixture(t),scene=JSON.parse(f.assets.get('scene.json'));scene.meta={deviceId:'fixture'};scene.reference_alignment={configuration_ref:'coordinated',placements:[],presentation:{connections:[]}};f.assets.set('scene.json',Buffer.from(JSON.stringify(scene)));
 let s=await f.store.create('w','v');const before=structuredClone(s.instances);assert.equal(s.reference_configuration_ref,'configuration:fixture:source-qpos0');
 const change=input(s,{type:'set_reference_configuration',configuration_ref:'coordinated'});s=await f.store.command('w','v',s.id,change);assert.deepEqual(s.instances,before);assert.equal(s.reference_configuration_ref,'coordinated');assert.deepEqual(await f.store.command('w','v',s.id,change),s);
 const nextPolicy={...s.assembly_policy,unrelated_obstacle_depth_m:.0002};s=await f.store.command('w','v',s.id,input(s,{type:'set_assembly_policy',assembly_policy:nextPolicy}));const c=await candidate(f,s,'b','a');const p=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:s.revision});assert.equal(p.assembly_assessment.configuration_ref,'coordinated');
 const copy=await f.store.create('w','v',{copy_from:s.id});assert.equal(copy.reference_configuration_ref,'coordinated');assert.deepEqual(copy.assembly_policy,nextPolicy);
 s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.equal(s.assembly_policy.unrelated_obstacle_depth_m,.0001);
 const after=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:s.revision});assert.notEqual(p.assembly_assessment.policy_digest,after.assembly_assessment.policy_digest);
 s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.equal(s.reference_configuration_ref,'configuration:fixture:source-qpos0');assert.deepEqual(s.instances,before);
 s=await f.store.command('w','v',s.id,input(s,{type:'redo'}));assert.equal((await f.store.get('w','v',s.id)).reference_configuration_ref,'coordinated');
 await assert.rejects(f.store.command('w','v',s.id,input(s,{type:'set_assembly_policy',assembly_policy:{...nextPolicy,unrelated_obstacle_depth_m:-1}})),/threshold/);
});
test('multi-part assembly, detach, reuse, persistent undo/redo, rename and copy use one consistent saved state',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v',{name:'one'});assert.equal(s.instances.length,4);assert.equal(s.groups.length,4);
 const ab=await candidate(f,s,'b','a');assert.ok(ab);s=await f.store.command('w','v',s.id,input(s,connectionInput(ab)));assert.equal(s.groups.length,3);assert.equal(s.connections.length,1);assert.deepEqual(s.connections[0].member_pairs,ab.member_pairs);assert.equal(ab.member_pairs.length,1);
 const alias=await candidate(f,s,'d','a');assert.equal(alias,undefined,'alias resource must already be occupied');assert.equal((await f.store.candidates('w','v',s.id,{instance_id:instance('a'),expected_revision:s.revision})).interfaces.find(i=>i.id==='a:alias').occupied,true);
 const bc=await candidate(f,s,'c','b');assert.ok(bc);s=await f.store.command('w','v',s.id,input(s,connectionInput(bc)));assert.equal(s.groups.length,2);assert.equal(s.groups[0].instance_ids.length,3);
 const before=structuredClone(s.instances),edge=s.connections.at(-1);s=await f.store.command('w','v',s.id,input(s,{type:'disconnect',connection_id:edge.id}));assert.equal(s.operation.status,'placed');assert.notDeepEqual(s.instances,before);for(const id of ['a','b','d'])assert.deepEqual(s.instances.find(p=>p.id===instance(id)),before.find(p=>p.id===instance(id)));const settled=structuredClone(s.instances);assert.equal(s.groups.length,3);assert.ok(await candidate(f,s,'c','b'));
 s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.equal(s.connections.length,2);assert.deepEqual(s.instances,before);s=await f.store.command('w','v',s.id,input(s,{type:'redo'}));assert.equal(s.connections.length,1);assert.deepEqual(s.instances,settled);
 const reopened=await f.store.get('w','v',s.id);assert.deepEqual(reopened.instances,s.instances);assert.ok(reopened.can_undo);assert.ok(reopened.bounds);
 s=await f.store.command('w','v',s.id,input(s,{type:'rename',name:'renamed'}));const copy=await f.store.create('w','v',{copy_from:s.id});assert.equal(copy.name,'renamed · 副本');assert.deepEqual(copy.connections,s.connections);assert.equal(copy.can_undo,false);assert.equal((await f.store.list('w','v')).sessions.length,2);
});
test('combining two existing groups moves the whole source group and preserves both internal relations',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v');s=await f.store.command('w','v',s.id,input(s,connectionInput(await candidate(f,s,'b','a'))));s=await f.store.command('w','v',s.id,input(s,connectionInput(await candidate(f,s,'d','c'))));
 const relative=matrix(s.instances.find(p=>p.id===instance('c'))).invert().multiply(matrix(s.instances.find(p=>p.id===instance('d'))));s=await f.store.command('w','v',s.id,input(s,connectionInput(await candidate(f,s,'c','b'))));assert.equal(s.groups.length,1);
 const next=matrix(s.instances.find(p=>p.id===instance('c'))).invert().multiply(matrix(s.instances.find(p=>p.id===instance('d'))));assert.ok(relative.elements.every((v,i)=>Math.abs(v-next.elements[i])<1e-12));
});

test('disconnect and desktop return save atomically, repeat once and undo as a single complete step',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v');s=await f.store.command('w','v',s.id,input(s,connectionInput(await candidate(f,s,'b','a'))));
 const before=structuredClone(s),body=input(s,{type:'disconnect',connection_id:s.connections[0].id});f.failWrites(true);
 await assert.rejects(f.store.command('w','v',s.id,body),e=>e.status===503);const unchanged=await f.store.get('w','v',s.id);assert.deepEqual(unchanged.instances,before.instances);assert.deepEqual(unchanged.connections,before.connections);assert.equal(unchanged.revision,before.revision);
 f.failWrites(false);s=await f.store.command('w','v',s.id,body);assert.equal(s.operation.status,'placed');assert.equal(s.history.length,before.history.length+1);assert.deepEqual(await f.store.command('w','v',s.id,body),s);
 const settled=structuredClone(s.instances);s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.deepEqual(s.instances,before.instances);assert.deepEqual(s.connections,before.connections);s=await f.store.command('w','v',s.id,input(s,{type:'redo'}));assert.deepEqual(s.instances,settled);assert.deepEqual(s.connections,[]);
});
test('idempotent commands, stale revisions and failed commands never leave partial graph or occupancy changes',async t=>{
 const f=await fixture(t);const s=await f.store.create('w','v'),c=await candidate(f,s,'b','a'),body=input(s,connectionInput(c)),once=await f.store.command('w','v',s.id,body),again=await f.store.command('w','v',s.id,body);assert.deepEqual(once,again);assert.equal(again.connections.length,1);
 await assert.rejects(f.store.command('w','v',s.id,input(s,{type:'rename',name:'stale'})),e=>e.status===409);
 await assert.rejects(f.store.command('w','v',s.id,input(once,{type:'move',instance_id:instance('a'),pose:{position:[0,0,-1],quaternion:[0,0,0,1]}})),/台面以下/);
 await assert.rejects(f.store.command('w','v',s.id,input(once,{type:'move',instance_id:instance('a'),pose:{position:[10,0,.1],quaternion:[0,0,0,1]}})),/位置或旋转无效/);
 assert.equal((await f.store.get('w','v',s.id)).revision,once.revision);
});
test('an unrelated scene part obstructing a terminal pose blocks the entire connection',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v');const a=s.instances.find(p=>p.id===instance('a')),obstacle={position:[a.position[0]+.02,a.position[1],a.position[2]],quaternion:[0,0,0,1]};s=await f.store.command('w','v',s.id,input(s,{type:'move',instance_id:instance('c'),pose:obstacle}));f.block();const c=await candidate(f,s,'b','a');
 const result=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:s.revision});assert.equal(result.status,'blocked');assert.ok(f.calls.length);await assert.rejects(f.store.command('w','v',s.id,input(s,connectionInput(c))),/新增或加深穿入/);assert.equal((await f.store.get('w','v',s.id)).connections.length,0);
});
test('initial layout stays above the table and never overlaps even with nonidentity source rotations',()=>{
 const parts=Array.from({length:12},(_,n)=>({...pose('p'+n),scale:[1,1,1],quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),n*.3).toArray()})),bounds=Object.fromEntries(parts.map(p=>[p.id,[[-.01,-.02,-.03],[.01,.02,.03]]]));const placed=layoutInstances(parts,bounds),boxes=placed.map(p=>transformedBounds(bounds[p.part_ref],p));for(let i=0;i<boxes.length;i++){assert.ok(boxes[i].min.z>=0);for(let j=0;j<i;j++)assert.equal(boxes[i].intersectsBox(boxes[j]),false);}
});
test('the actual pinned solid worker distinguishes surface contact, overlap and containment',async t=>{
 const geometry=createSimulationGeometry();t.after(()=>geometry.close());const vertices=[[-.01,-.01,-.01],[.01,-.01,-.01],[.01,.01,-.01],[-.01,.01,-.01],[-.01,-.01,.01],[.01,-.01,.01],[.01,.01,.01],[-.01,.01,.01]],faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],a={sha256:'test-cube',vertices,faces},r=[[1,0,0],[0,1,0],[0,0,1]];
 assert.equal((await geometry.evaluate({a,b:a,r,t:[.02,0,0]})).status,'clear');assert.equal((await geometry.evaluate({a,b:a,r,t:[.01,0,0]})).status,'interference');assert.equal((await geometry.evaluate({a,b:{sha256:'small-cube',vertices:vertices.map(p=>p.map(v=>v*.3)),faces},r,t:[0,0,0]})).status,'interference');
});

test('scenes remain isolated across workspace, snapshot and scene identifiers even when packages share a digest',async t=>{
 const f=await fixture(t),s=await f.store.create('w','v',{request_id:'scene-one'});await f.store.create('w','v',{request_id:'scene-two'});await f.store.create('w','other-v',{request_id:'scene-three'});await f.store.create('other-w','v',{request_id:'scene-four'});
 assert.equal((await f.store.list('w','v')).sessions.length,2);assert.equal((await f.store.list('w','other-v')).sessions.length,1);assert.equal((await f.store.list('other-w','v')).sessions.length,1);
 await assert.rejects(f.store.get('other-w','v',s.id),e=>e.status===404);await assert.rejects(f.store.get('w','other-v',s.id),e=>e.status===404);
});

test('unassessed geometry stays unassessed while a valid interface can be trial assembled',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v');const a=s.instances.find(p=>p.id===instance('a'));s=await f.store.command('w','v',s.id,input(s,{type:'move',instance_id:instance('c'),pose:{position:[a.position[0]+.02,a.position[1],a.position[2]],quaternion:[0,0,0,1]}}));
 // A scaled source cannot be sent to the rigid-solid checker until scale is supported.
 f.parts.find(p=>p.id==='c').scale=[2,2,2];f.assets.set('scene.json',Buffer.from(JSON.stringify({parts:f.parts,assembly:{capability_index:{parts:Object.fromEntries(f.parts.map(p=>[p.id,{path:p.id+'.json'}])),compatibility:{index_path:'compatibility.json'}}}})));
 const reopened=createSimulationStore({registryFile:path.join(f.directory,'registry.json'),load:async()=>({root:f.directory,manifest:{package_digest:'a'.repeat(64),package_id:'test',entrypoints:{scene:'scene.json'}}}),read:async(_,entry)=>f.assets.get(entry),geometry:{evaluate:async()=>({status:'unresolved',reason:'not evaluated'}),close(){}}});t.after(()=>reopened.close());
 const c=await candidate({...f,store:reopened},s,'b','a'),before=await reopened.get('w','v',s.id);const result=await reopened.preview('w','v',s.id,{...connectionInput(c),expected_revision:s.revision});assert.equal(result.status,'ready');assert.equal(result.geometry.status,'unresolved');assert.equal(result.assembly_assessment.decision,'allow_with_note');assert.deepEqual(await reopened.get('w','v',s.id),before);const saved=await reopened.command('w','v',s.id,input(s,connectionInput(c)));assert.equal(saved.connections[0].geometry.status,'unresolved');assert.equal(saved.connections[0].mechanics.status,'not_evaluated');
});

test('only two geometry workers run concurrently, timeouts remain unassessed and are retryable',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'psop-sim-worker-'));t.after(()=>rm(directory,{recursive:true,force:true}));const workerPath=path.join(directory,'slow.mjs');await writeFile(workerPath,"process.stdin.resume();setInterval(()=>{},1000);\n");const geometry=createSimulationGeometry({timeout:60,workerPath});t.after(()=>geometry.close());const shape={sha256:'fake'},r=[[1,0,0],[0,1,0],[0,0,1]],pending=[0,1,2,3].map(n=>geometry.evaluate({a:shape,b:shape,r,t:[n,0,0]}));assert.equal(geometry.stats().workers,2);assert.equal(geometry.stats().pending,2);for(const result of await Promise.all(pending)){assert.equal(result.status,'unresolved');assert.match(result.reason,/超时/);}assert.equal(geometry.stats().cached,0);assert.equal((await geometry.evaluate({a:shape,b:shape,r,t:[0,0,0]})).status,'unresolved');
});

test('a failed atomic write retains poses, graph, revision and the ability to retry the same request',async t=>{
 const f=await fixture(t),s=await f.store.create('w','v'),c=await candidate(f,s,'b','a'),body=input(s,connectionInput(c));f.failWrites(true);await assert.rejects(f.store.command('w','v',s.id,body),e=>e.status===503);const saved=await f.store.get('w','v',s.id);assert.equal(saved.revision,s.revision);assert.deepEqual(saved.instances,s.instances);assert.deepEqual(saved.connections,[]);f.failWrites(false);const committed=await f.store.command('w','v',s.id,body);assert.equal(committed.connections.length,1);assert.deepEqual(await f.store.command('w','v',s.id,body),committed);
});

test('two tabs cannot overwrite each other and the persistent history is limited to 100 complete steps',async t=>{
 const f=await fixture(t);let s=await f.store.create('w','v');const results=await Promise.allSettled(['one','two'].map(name=>f.store.command('w','v',s.id,input(s,{type:'rename',name}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);s=await f.store.get('w','v',s.id);
 for(let n=0;n<105;n++)s=await f.store.command('w','v',s.id,input(s,{type:'move',instance_id:instance('a'),pose:{position:[n*.001,0,.02],quaternion:[0,0,0,1]}}));assert.equal(s.history.length,100);const loaded=await f.store.get('w','v',s.id);assert.equal(loaded.history.length,100);assert.ok(loaded.can_undo);
});

test('simulation writes enforce same origin, JSON and a bounded request body',async()=>{
 const request=(body,headers={})=>Object.assign(Readable.from([Buffer.from(body)]),{headers:{host:'localhost:8791','content-type':'application/json',...headers}});
 assert.deepEqual(await readSimulationRequest(request('{"type":"undo"}')),{type:'undo'});await assert.rejects(readSimulationRequest(request('{}',{origin:'http://another.example'})),e=>e.status===403);await assert.rejects(readSimulationRequest(request('{}',{'sec-fetch-site':'cross-site'})),e=>e.status===403);await assert.rejects(readSimulationRequest(request('{}',{'content-type':'text/plain'})),e=>e.status===415);await assert.rejects(readSimulationRequest(request('[]')),e=>e.status===400);await assert.rejects(readSimulationRequest(request(' '.repeat(65537))),e=>e.status===413);
});

test('scene progress does not mistake an isolated selected part for exhaustion of all known connections',async t=>{
 const f=await fixture(t),index=JSON.parse(f.assets.get('compatibility.json'));index.pairs=index.pairs.filter(p=>p.id==='ab');f.assets.set('compatibility.json',Buffer.from(JSON.stringify(index)));let s=await f.store.create('w','v');const summary=()=>f.store.candidates('w','v',s.id,{scope:'scene',expected_revision:s.revision});assert.equal((await summary()).status,'connections_available');assert.equal((await f.store.candidates('w','v',s.id,{instance_id:instance('d'),expected_revision:s.revision})).candidates.length,0);s=await f.store.command('w','v',s.id,input(s,connectionInput(await candidate(f,s,'b','a'))));assert.equal((await summary()).status,'no_available_connections');s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.equal((await summary()).status,'connections_available');
});

test('published reference interfaces with zero template candidates are discoverable and require their own solid check',async t=>{
 const f=await fixture(t),scene=JSON.parse(f.assets.get('scene.json'));scene.meta={deviceId:'fixture'};scene.parts.find(p=>p.id==='b').position=[.019,0,.01];
 const details=['a','b'].map(id=>JSON.parse(f.assets.get(id+'.json'))),ends=details.map((d,n)=>({interface_ref:d.interfaces[n===0?1:0].id,member_refs:[d.interfaces[n===0?1:0].members[0].id]}));
 details[0].interfaces[1].resource_refs=['declared-surface-resource'];
 const reference={id:'reference:ab',name:'复合参考连接',basis:'source_fit',configuration_ref:'configuration:fixture:source-qpos0',assessment_scope:'source_reference_configuration',endpoints:ends};
 details.forEach((d,n)=>{d.reference_connections=[reference];f.assets.set(['a','b'][n]+'.json',Buffer.from(JSON.stringify(d)));});
 scene.assembly.interfaces=details.flatMap(d=>d.interfaces);scene.assembly.connections=[reference,{...reference,id:'excluded',basis:'incompatible'}];
 f.assets.set('scene.json',Buffer.from(JSON.stringify(scene)));f.assets.set('compatibility.json',Buffer.from(JSON.stringify({pairs:[{id:'ab',owner_refs:['a','b'],candidate_count:0}]})));
 const s=await f.store.create('w','v'),c=await candidate(f,s,'b','a');assert.ok(c);assert.equal(c.source_kind,'reference_connection');assert.equal(c.source_configuration_ref,reference.configuration_ref);assert.equal(c.whole_part_collision_evaluated,false);
 assert.ok(c.endpoints.some(e=>e.resource_keys.some(r=>r.endsWith('resource:declared-surface-resource'))));
 const result=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:s.revision});assert.equal(result.status,'ready');assert.equal(f.calls.length,1,'reference endpoint pair must retain its rigid observation');assert.equal(f.calls[0].diagnostics,false,'detailed contact sampling must not gate a source connection');
 f.block();const changed=await f.store.command('w','v',s.id,input(s,{type:'rename',name:'fresh observation'}));const measured=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:changed.revision});assert.equal(measured.status,'ready');assert.equal(measured.geometry.status,'interference');f.failDiagnostics();const detail=await f.store.preview('w','v',s.id,{...connectionInput(c),expected_revision:changed.revision,diagnostics:true});assert.equal(detail.status,'ready');assert.equal(detail.geometry.status,'interference');assert.equal(detail.geometry.observations[0].diagnostics.status,'not_evaluated');const saved=await f.store.command('w','v',s.id,input(changed,connectionInput(c)));assert.equal(saved.connections.length,1);assert.equal(saved.connections[0].geometry.status,'interference');assert.equal(saved.connections[0].assembly_assessment.decision,'allow_with_note');
});

test('a published reconciled configuration can qualify a previously excluded reference without altering its source pose',()=>{
 const members=id=>[{id:id+':member',position:[0,0,0],feature_refs:[id+':feature']}],interfaces=['a','b'].map(id=>({id:id+':fit',owner_ref:id,name:id,members:members(id+':fit')}));
 const reference={id:'reference:fit',basis:'incompatible',assessment_scope:'source_reference_configuration',configuration_ref:'configuration:fixture:source-qpos0',endpoints:interfaces.map(i=>({interface_ref:i.id,member_refs:i.members.map(m=>m.id)}))};
 const scene={meta:{deviceId:'fixture'},parts:[pose('a'),pose('b')],assembly:{interfaces,connections:[reference]},reference_alignment:{configuration_ref:'configuration:fixture:reconciled-qpos0',placements:[{part_ref:'b',position:[.0002,0,.01],quaternion:[0,0,0,1]}],presentation:{connections:[{connection_ref:reference.id,basis:'inferred_fit',check_refs:['fit-alignment']}]}}};
 const details=interfaces.map(i=>({interfaces:[i],reference_connections:[reference]})),pair=withReferencePairs(scene,{pairs:[]}).pairs[0],branches=referenceBranches(scene,pair,details,(_,id,members)=>({interface_ref:id,member_refs:members,resource_refs:[]}));
 assert.equal(branches.length,1);assert.equal(branches[0].source_configuration_label,'几何协调 · 工程推断');assert.equal(branches[0].registration.translation_b_to_a[0],.0002);assert.equal(branches[0].registration.whole_part_collision_evaluated,false);assert.deepEqual(branches[0].source_alignment_check_refs,['fit-alignment']);assert.deepEqual(scene.parts[1].position,[0,0,.01]);
 const noCorrection=structuredClone(scene);delete noCorrection.reference_alignment;assert.equal(withReferencePairs(noCorrection,{pairs:[]}).pairs.length,0);
});

test('reference relations without a published member selection stay visible and cannot be submitted',()=>{
 const interfaces=['a','b'].map(id=>({id:id+':fit',owner_ref:id,members:[{id:id+':member',position:[0,0,0],feature_refs:[id+':feature']}]})),reference={id:'reference:selection',basis:'declared',assessment_scope:'source_reference_configuration',configuration_ref:'configuration:fixture:source-qpos0',endpoints:interfaces.map(i=>({interface_ref:i.id,member_refs:[]}))};
 const scene={meta:{deviceId:'fixture'},parts:[pose('a'),pose('b')],assembly:{interfaces,connections:[reference]}},details=interfaces.map(i=>({interfaces:[i],reference_connections:[reference]}));
 const branches=referenceBranches(scene,withReferencePairs(scene,{pairs:[]}).pairs[0],details,(_,id,members)=>({interface_ref:id,member_refs:members,resource_refs:[]}));assert.equal(branches.length,1);assert.match(branches[0].unavailable_reason,/选孔/);assert.ok(branches[0].endpoints.every(e=>e.member_refs.length===0));
});



test('reset restores the canonical loose layout, releases all resources and persists as one undoable operation',async t=>{
 const f=await fixture(t),initial=await f.store.create('w','v');let s=await f.store.command('w','v',initial.id,input(initial,connectionInput(await candidate(f,initial,'b','a'))));
 s=await f.store.command('w','v',s.id,input(s,{type:'move',instance_id:instance('a'),pose:{position:[.1,.12,.04],quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.7).toArray()}}));
 s=await f.store.command('w','v',s.id,input(s,{type:'move',instance_id:instance('c'),pose:{position:[-.2,.1,.03],quaternion:[0,0,0,1]}}));
 const edited=structuredClone(s),body=input(s,{type:'reset'});f.failWrites(true);await assert.rejects(f.store.command('w','v',s.id,body),e=>e.status===503);
 assert.deepEqual((await f.store.get('w','v',s.id)).instances,edited.instances);assert.equal((await f.store.get('w','v',s.id)).connections.length,1);f.failWrites(false);
 s=await f.store.command('w','v',s.id,body);assert.deepEqual(s.instances,initial.instances);assert.deepEqual(s.connections,[]);assert.equal(s.groups.length,initial.instances.length);assert.equal(occupancyFor(s.connections).size,0);assert.equal(s.history.length,edited.history.length+1);assert.equal(s.history.at(-1).label,'恢复初始拆散状态');assert.equal(s.id,edited.id);assert.equal(s.name,edited.name);assert.equal(s.revision,edited.revision+1);
 assert.deepEqual(await f.store.command('w','v',s.id,body),s);assert.deepEqual((await f.store.get('w','v',s.id)).instances,initial.instances);
 s=await f.store.command('w','v',s.id,input(s,{type:'undo'}));assert.deepEqual(s.instances,edited.instances);assert.deepEqual(s.connections,edited.connections);
 s=await f.store.command('w','v',s.id,input(s,{type:'redo'}));assert.deepEqual(s.instances,initial.instances);assert.deepEqual(s.connections,[]);
 const copy=await f.store.create('w','v',{copy_from:s.id});assert.deepEqual(copy.instances,initial.instances);assert.equal(copy.can_undo,false);assert.equal((await candidate(f,s,'b','a')).moving_instance_id,instance('b'));
});
