import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Matrix4,Quaternion,Vector3} from 'three';
import {planAutomaticAssembly,referenceAssemblyTarget,sourceStructureRelations} from './simulate-auto-assembly.mjs';
import {groupsFor,layoutInstances,matrix,occupancyFor,transformedBounds} from './simulate-core.mjs';
import {createSimulationStore,replaceSessionFile} from './simulate-store.mjs';

function fixture(){
 const parts=['a','b','c','d'].map((id,n)=>({id,name:id,body:n<2?'root':'child',meshKey:n===0?'root':id,kind:'structure',group:'torso',groupLabel:'躯干',position:[n*.03,0,.01],quaternion:[0,0,0,1],scale:[1,1,1],geometryUrl:'part.stl',evidenceIds:['xml:'+id]}));
 const scene={meta:{deviceId:'test'},parts,bodies:[{id:'body:root',name:'root',label:'基座',parent:null,partIds:['a','b']},{id:'body:child',name:'child',label:'上部',parent:'root',partIds:['c','d']}]},bounds=Object.fromEntries(parts.map(p=>[p.id,[[-.01,-.01,-.01],[.01,.01,.01]]])),table={width:1,height:.7};
 const session={instances:layoutInstances(parts,bounds),connections:[]};
 function candidate(a,b,port=a+':right'){
  const relative=matrix(parts.find(p=>p.id===b)).invert().multiply(matrix(parts.find(p=>p.id===a)));
  const endpoints=[a,b].map((id,n)=>({instance_id:'instance:'+id,interface_ref:n===0?port:id+':left',interface_name:id+' 接口',member_refs:[id+':member'],resource_keys:['instance:'+id+'|channel:'+(n===0?port:id+':left')]}));
  return {id:'candidate:'+a+b,moving_instance_id:'instance:'+a,target_instance_id:'instance:'+b,endpoints,title:a+' ↔ '+b,mechanism:'reference_fit',member_count:1,member_pairs:[],relative_transform:relative.toArray(),moving_anchor:[.01,0,0],target_anchor:[-.01,0,0],conditions:['保持待核'],source_configuration_label:'原装参考',source_evidence_refs:['source:'+a+b],source_candidate_ref:'source:'+a+b,source_match_ref:'source:'+a+b};
 }
 return {scene,bounds,table,session,candidates:[candidate('a','b'),candidate('b','c'),candidate('c','d')],candidate};
}
const plan=f=>planAutomaticAssembly({...f,now:'2026-11-11T00:00:00Z'});

test('reference target uses published corrections, actual bounds, and preserves all source bytes',()=>{
 const f=fixture(),source=structuredClone(f.scene);f.scene.reference_alignment={configuration_ref:'corrected',placements:[{part_ref:'d',position:[.091,0,.01],quaternion:[0,0,0,1]}]};
 const original=referenceAssemblyTarget(f.scene,f.bounds);assert.equal(original.configuration_ref,'configuration:test:source-qpos0');assert.ok(Math.abs(original.instances[3].position[0]-original.instances[0].position[0]-.09)<1e-12);const target=referenceAssemblyTarget(f.scene,f.bounds,'corrected');assert.equal(target.configuration_ref,'corrected');assert.equal(target.instances.length,4);
 assert.ok(Math.abs(target.bounds.min.z-.0002)<1e-12);assert.ok(target.bounds.getCenter(new Vector3()).x<1e-12);
 assert.ok(Math.abs(target.instances[3].position[0]-target.instances[0].position[0]-.091)<1e-12);assert.deepEqual(f.scene.parts,source.parts);
});

test('correct rigid groups survive arbitrary world rotations; incompatible assembly connections are removed',()=>{
 const f=fixture(),common=new Matrix4().makeRotationZ(.7).setPosition(.1,-.08,.15),correct=f.candidates[0];
 for(const id of ['a','b']){const p=f.scene.parts.find(p=>p.id===id),m=common.clone().multiply(matrix(p)),v=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(v,q,s);Object.assign(f.session.instances.find(p=>p.part_ref===id),{position:v.toArray(),quaternion:q.toArray()});}
 f.session.connections=[{...structuredClone(correct),id:'keep',name:'正确连接',geometry:{status:'clear'},conditions:[],status:'trial'},{...structuredClone(f.candidates[1]),id:'wrong',name:'错误姿态',geometry:{status:'clear'},conditions:[],status:'trial'}];
 const before=structuredClone(f.session),result=plan(f);assert.deepEqual(f.session,before);assert.ok(result.connections.some(c=>c.id==='keep'));assert.ok(!result.connections.some(c=>c.id==='wrong'));
 assert.equal(result.reference_assembly.retained_connection_count,1);assert.equal(result.reference_assembly.removed_connection_count,1);assert.ok(result.operation.steps.some(s=>s.kind==='detach'));assert.equal(groupsFor(result.instances,result.connections).length,1);
 const preserved=result.operation.steps.filter(s=>s.kind==='join').find(s=>s.motions[0].instance_ids.includes('instance:a'));assert.deepEqual(preserved.motions[0].instance_ids,['instance:a','instance:b']);
});

test('explicit ports and alias resources remain exclusive; source structure bindings do not invent ports',()=>{
 const f=fixture();f.candidates=[f.candidate('a','b','shared'),f.candidate('a','c','shared')];const result=plan(f);assert.doesNotThrow(()=>occupancyFor(result.connections));
 assert.equal(result.connections.filter(c=>c.source_kind==='reference_connection').length,1);assert.ok(result.connections.some(c=>c.source_kind==='source_structure'));
 for(const c of result.connections.filter(c=>c.source_kind==='source_structure'))for(const e of c.endpoints){assert.equal(e.interface_ref,null);assert.deepEqual(e.member_refs,[]);assert.deepEqual(e.resource_keys,[]);}
 assert.equal(occupancyFor(result.connections.filter(c=>c.source_kind==='source_structure')).size,0);
});

test('missing member selection and source interference never become geometry-clear claims',()=>{
 const f=fixture();f.candidates[0].unavailable_reason='实际成员未指定';const result=plan(f);
 assert.ok(!result.connections.some(c=>c.candidate_id===f.candidates[0].id));assert.equal(result.reference_assembly.geometry_status,'not_evaluated');
 for(const c of result.connections){assert.equal(c.status,'reference');assert.equal(c.geometry.status,'not_evaluated');assert.equal(c.geometry.checked_pairs,0);assert.ok(c.conditions.length>0);}
});

test('staging and assembly preserve rigid groups and every final part remains above the tabletop',()=>{
 const f=fixture(),result=plan(f),working=new Map(f.session.instances.map(p=>[p.id,structuredClone(p)]));
 for(const step of result.operation.steps)for(const motion of step.motions){const first=motion.poses[0],delta=matrix(first).multiply(matrix(working.get(first.id)).invert());for(const p of motion.poses){const wanted=delta.clone().multiply(matrix(working.get(p.id)));assert.ok(wanted.elements.every((v,n)=>Math.abs(v-matrix(p).elements[n])<1e-9));}for(const p of motion.poses)working.set(p.id,p);}
 assert.deepEqual([...working.values()],result.instances);for(const p of result.instances)assert.ok(transformedBounds(f.bounds[p.part_ref],p).min.z>=0);
 assert.equal(result.operation.total_duration_ms,result.operation.steps.reduce((n,s)=>n+s.duration_ms,0));assert.equal(result.operation.steps.at(-1).kind,'reveal');
});

test('incomplete source coverage and cyclic parent chains fail without changing the session',()=>{
 const f=fixture(),before=structuredClone(f.session);f.scene.bodies[1].partIds=['c'];f.candidates=[];assert.throws(()=>plan(f),/覆盖全部/);assert.deepEqual(f.session,before);
 const cycle=fixture();cycle.scene.bodies[0].parent='child';assert.throws(()=>sourceStructureRelations(cycle.scene),/循环/);
});

function bearingFixture(){
 const f=fixture();f.scene.parts[2].kind='bearing';f.scene.parts[3].kind='shell';
 const seat=f.candidate('c','a');seat.endpoints[0].interface_ref='c:outer_ring';seat.endpoints[1].interface_ref='a:seat';
 const journal=f.candidate('c','b');journal.endpoints[0].interface_ref='c:inner_ring';journal.endpoints[1].interface_ref='b:journal';
 f.candidates=[f.candidate('a','b'),seat,journal,f.candidate('b','d')];
 f.partDetails=new Map([['c',{interfaces:[{id:'c:inner_ring',key:'inner_ring',members:[{id:'c:inner_ring:bore',direction:[0,0,1]}]}]}]]);return f;
}

test('bearing seats are preassembled axially before any main unit or closure, then move as one rigid unit',()=>{
 const f=bearingFixture(),result=plan(f),steps=result.operation.steps,seat=steps.find(s=>s.kind==='preassemble'),firstJoin=steps.findIndex(s=>s.kind==='join');
 assert.ok(seat);assert.ok(steps.indexOf(seat)<firstJoin);assert.deepEqual(seat.focus_ids,['instance:c','instance:a']);
 const m=seat.motions[0];assert.equal(m.insertion.axis_member_ref,'c:inner_ring:bore');assert.equal(m.insertion.seat_interface_ref,'a:seat');assert.deepEqual(m.insertion.axis,[0,0,1]);assert.ok(Math.abs(m.approach_offset_m[2])>=.012);assert.equal(m.approach_offset_m[0],0);assert.equal(m.approach_offset_m[1],0);
 const unit=steps.find(s=>s.kind==='join'&&s.motions[0].instance_ids.includes('instance:c'));assert.deepEqual(unit.motions[0].instance_ids,['instance:a','instance:c']);
 assert.equal(result.reference_assembly.bearing_preassembly_count,1);assert.equal(result.reference_assembly.access_opened_connection_count,0);
 const before=new Map(seat.motions[0].poses.map(p=>[p.id,p])),stage=steps.find(s=>s.kind==='stage');for(const motion of stage.motions)for(const p of motion.poses)if(p.id==='instance:a')before.set(p.id,p);
 const desired=matrix(unit.motions[0].poses[0]).invert().multiply(matrix(unit.motions[0].poses[1])),actual=matrix(before.get('instance:a')).invert().multiply(matrix(before.get('instance:c')));assert.ok(desired.elements.every((v,i)=>Math.abs(v-actual.elements[i])<1e-10));
});

test('closed correct structures open for bearing access in the presentation while retaining their saved connection IDs',()=>{
 const f=bearingFixture(),edge={...structuredClone(f.candidates[0]),id:'correct-closed',name:'closed',status:'trial',geometry:{status:'clear'},conditions:[]};
 for(const id of ['a','b'])Object.assign(f.session.instances.find(p=>p.part_ref===id),structuredClone(f.scene.parts.find(p=>p.id===id)));f.session.instances=f.session.instances.map(p=>({...p,id:'instance:'+p.part_ref}));f.session.connections=[edge];
 const before=structuredClone(f.session),result=plan(f),access=result.operation.steps.find(s=>s.access_opened_connection_ids?.length);
 assert.deepEqual(f.session,before);assert.deepEqual(access.access_opened_connection_ids,['correct-closed']);assert.deepEqual(access.removed_connection_ids,[]);assert.ok(result.connections.some(c=>c.id==='correct-closed'));assert.equal(result.reference_assembly.retained_connection_count,1);assert.equal(result.reference_assembly.removed_connection_count,0);assert.equal(result.reference_assembly.access_opened_connection_count,1);
 const bearing=result.operation.steps.find(s=>s.kind==='preassemble');assert.ok(result.operation.steps.indexOf(access)<result.operation.steps.indexOf(bearing));
});

test('missing bearing axis refuses the presentation instead of inventing an insertion direction',()=>{
 const f=bearingFixture();f.partDetails.clear();const before=structuredClone(f.session);assert.throws(()=>plan(f),/轴承缺少已发布的装入轴线/);assert.deepEqual(f.session,before);
});

async function service(t){
 const f=fixture(),directory=await mkdtemp(path.join(os.tmpdir(),'psop-auto-state-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const stl=Buffer.alloc(134);stl.writeUInt32LE(1,80);for(const [n,v]of [[0,0],[1,0],[2,0],[3,.01],[4,0],[5,0],[6,0],[7,.01],[8,.01]])stl.writeFloatLE(v,96+n*4);
 const assets=new Map([['scene.json',Buffer.from(JSON.stringify(f.scene))],['part.stl',stl]]),bundle={root:directory,manifest:{package_digest:'a'.repeat(64),package_id:'fixture',entrypoints:{scene:'scene.json'}}};let failWrites=false,geometryCalls=0;
 const options={registryFile:path.join(directory,'registry.json'),load:async()=>bundle,read:async(_,p)=>assets.get(p),geometry:{evaluate(){geometryCalls++;throw Error('not a physical check');},close(){}},persist:async(file,value)=>{if(failWrites)throw Object.assign(Error('disk failure'),{status:503});await replaceSessionFile(file,value);}};
 const store=createSimulationStore(options);t.after(()=>store.close());return {store,options,failWrites:value=>{failWrites=value;},geometryCalls:()=>geometryCalls};
}
const send=(f,s,body)=>f.store.command('w','v',s.id,{...body,expected_revision:s.revision,request_id:crypto.randomUUID()});

test('automatic reference assembly saves once, deduplicates retries, and restores exact metadata in persistent history',async t=>{
 const f=await service(t);let s=await f.store.create('w','v',{name:'reference'});const before=structuredClone(s),body={type:'auto_assemble',mode:'reference',expected_revision:s.revision,request_id:crypto.randomUUID()};
 s=await f.store.command('w','v',s.id,body);const final=structuredClone(s);assert.equal(s.groups.length,1);assert.equal(s.history.length,1);assert.equal(f.geometryCalls(),0);assert.deepEqual(await f.store.command('w','v',s.id,body),final);
 await assert.rejects(()=>f.store.command('w','v',s.id,{...body,mode:'other'}),/同一个请求标识/);
 s=await send(f,s,{type:'undo'});assert.deepEqual(s.instances,before.instances);assert.deepEqual(s.connections,before.connections);assert.equal(s.reference_assembly,null);
 s=await send(f,s,{type:'redo'});assert.deepEqual(s.instances,final.instances);assert.deepEqual(s.connections,final.connections);assert.deepEqual(s.reference_assembly,final.reference_assembly);
 const reopened=createSimulationStore(f.options);t.after(()=>reopened.close());const loaded=await reopened.get('w','v',s.id);assert.deepEqual(loaded.reference_assembly,final.reference_assembly);assert.ok(!loaded.operation);const copy=await reopened.create('w','v',{copy_from:s.id});assert.deepEqual(copy.reference_assembly,loaded.reference_assembly);assert.equal(copy.can_undo,false);
});

test('failed save, stale revision, and unsupported modes leave the previous complete state intact',async t=>{
 const f=await service(t),s=await f.store.create('w','v');f.failWrites(true);await assert.rejects(()=>send(f,s,{type:'auto_assemble',mode:'reference'}),/disk failure/);assert.equal((await f.store.get('w','v',s.id)).revision,0);
 f.failWrites(false);await assert.rejects(()=>send(f,s,{type:'auto_assemble',mode:'physical'}),/reference/);
 const next=await send(f,s,{type:'auto_assemble',mode:'reference'});await assert.rejects(()=>send(f,s,{type:'auto_assemble',mode:'reference'}),/场景已更新/);assert.equal((await f.store.get('w','v',s.id)).revision,next.revision);
});

test('editing or resetting a reference product clears completion status; undo restores it',async t=>{
 const f=await service(t);let s=await f.store.create('w','v');s=await send(f,s,{type:'auto_assemble',mode:'reference'});const completed=s.reference_assembly;
 s=await send(f,s,{type:'move',instance_id:s.instances[0].id,pose:{position:s.instances[0].position.map((v,k)=>v+(k===2?.01:0)),quaternion:s.instances[0].quaternion}});assert.equal(s.reference_assembly,null);
 s=await send(f,s,{type:'undo'});assert.deepEqual(s.reference_assembly,completed);s=await send(f,s,{type:'reset'});assert.equal(s.connections.length,0);assert.equal(s.reference_assembly,null);s=await send(f,s,{type:'undo'});assert.deepEqual(s.reference_assembly,completed);
});
