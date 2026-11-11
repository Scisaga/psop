import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAssembly,assemblyPolicy,policyDigest} from '../../../skills/psop-build/scripts/assembly-judgment.mjs';
import {createSimulationGeometry} from './simulate-geometry.mjs';
import {referenceBranches,withReferencePairs} from './simulate-reference.mjs';
import {configurationPoses,atReferencePose} from './simulate-configuration.mjs';

test('source overlaps of 0.00305 and 67.9 mm³ are allowed with unchanged rigid observations and uncomputed mechanics',()=>{
 for(const volume of [.00305,67.9]){
  const observation={status:'interference',intersection_volume_m3:volume/1e9},before=structuredClone(observation);
  const assessment=assessAssembly({observation,reference:true,configuration_ref:'source'});
  assert.equal(assessment.decision,'allow_with_note');assert.deepEqual(observation,before);assert.equal(assessment.mechanics.status,'not_evaluated');
 }
 for(const mechanism of ['interference_fit','flexible_fit','preload_fit'])assert.equal(assessAssembly({observation:{status:'unresolved'},expected_contact:true,mechanism}).decision,'allow_with_note');
});
test('unrelated obstacle needs new/deeper sampled penetration, independently of volume and material availability',()=>{
 const observation={status:'interference',intersection_volume_m3:1e-15,diagnostics:{sampled_penetration_depth_m:.001}};
 assert.equal(assessAssembly({observation,baseline:{status:'clear'}}).decision,'block');
 assert.equal(assessAssembly({observation,baseline:observation}).decision,'allow_with_note');
 assert.equal(assessAssembly({observation:{status:'interference'},baseline:{status:'clear'}}).decision,'allow_with_note');
 assert.equal(assessAssembly({observation,expected_contact:true}).decision,'allow_with_note');
 assert.equal(assessAssembly({independent_block:'wrong_diameter'}).decision,'block');
 assert.notEqual(policyDigest(assemblyPolicy()),policyDigest({...assemblyPolicy(),unrelated_obstacle_depth_m:.002}));
 assert.equal(assessAssembly({observation,baseline:{status:'clear'},policy:{...assemblyPolicy(),unrelated_obstacle_depth_m:.002}}).decision,'allow_with_note');
});
test('every relation resolves from the same global configuration even without a per-connection presentation override',()=>{
 const parts=['a','b'].map(id=>({id,position:[id==='a'?0:.02,0,.1],quaternion:[0,0,0,1]})),interfaces=parts.map(p=>({id:p.id+':fit',owner_ref:p.id,members:[{id:p.id+':fit:point',position:[0,0,0],feature_refs:[p.id+':face']}]}));
 const connections=['seam','closure'].map(id=>({id,name:id,basis:'source_fit',assessment_scope:'source_reference_configuration',endpoints:interfaces.map(i=>({interface_ref:i.id,member_refs:i.members.map(m=>m.id)}))}));
 const scene={meta:{deviceId:'test'},parts,assembly:{interfaces,connections},reference_alignment:{configuration_ref:'coordinated',placements:[{part_ref:'b',position:[.0198,0,.1],quaternion:[0,0,0,1]}],presentation:{connections:[{connection_ref:'seam',basis:'inferred_fit'}]}}};
 const pair=withReferencePairs(scene,{pairs:[]}).pairs[0],details=interfaces.map(i=>({interfaces:[i],reference_connections:connections}));
 const branches=referenceBranches(scene,pair,details,(_,ref,members)=>({interface_ref:ref,member_refs:members,resource_refs:[]}));
 assert.equal(branches.length,4);const coordinated=branches.filter(b=>b.source_configuration_ref==='coordinated');assert.equal(coordinated.length,2);assert.deepEqual(coordinated[0].registration,coordinated[1].registration);
 const selected=[...configurationPoses(scene,'coordinated').values()].map(p=>({...p,part_ref:p.id}));assert.equal(atReferencePose(scene,'coordinated',...selected),true);assert.deepEqual(scene.parts[1].position,[.02,0,.1]);
});
test('real source sampling finds deep penetration in a tiny volume and preserves source triangle witnesses',async t=>{
 const geometry=createSimulationGeometry();t.after(()=>geometry.close());
 const vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
 const a={sha256:'diagnostic-outer',vertices:vertices.map(p=>p.map(v=>v*.01)),faces},b={sha256:'diagnostic-small',vertices:vertices.map(p=>p.map((v,k)=>v*(k===2?.0002:.000002))),faces};
 const result=await geometry.evaluate({a,b,r:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0],diagnostics:true});
 assert.equal(result.status,'interference');assert.ok(result.intersection_volume_m3*1e9<.01);assert.ok(result.diagnostics.sampled_penetration_depth_m>.0001);assert.ok(result.diagnostics.witnesses.every(w=>Number.isInteger(w.source_triangle)&&Number.isInteger(w.opposing_triangle)));assert.equal(assessAssembly({observation:result,baseline:{status:'clear'}}).decision,'block');
 const reversed=await geometry.evaluate({a:b,b:a,r:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0],diagnostics:true});assert.ok(Math.abs(result.intersection_volume_m3-reversed.intersection_volume_m3)<1e-18);assert.equal(assessAssembly({observation:reversed,baseline:{status:'clear'}}).decision,'block');
});

test('contact qualification separates deep expected contact from penetration outside the selected finite features',async t=>{
 const geometry=createSimulationGeometry();t.after(()=>geometry.close());const vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],a={sha256:'contact-host',vertices:vertices.map(p=>p.map(v=>v*.01)),faces},b={sha256:'contact-insert',vertices:vertices.map(p=>p.map(v=>v*.002)),faces},r=[[1,0,0],[0,1,0],[0,0,1]],g={type:'cylinder',origin:[0,0,0],axis:[0,0,1],radius_m:.004,axial_range_m:[-.004,.004]};
 const intended=await geometry.evaluate({a,b,r,t:[0,0,0],interface_contact:{features:[[g],[g]],comparison_margin_m:.00004,stop_after_obstruction_m:.0001}});assert.equal(intended.status,'interference');assert.ok(intended.diagnostics.sampled_penetration_depth_m>.001);assert.equal(intended.diagnostics.interface_contact.witnesses.length,0);assert.equal(assessAssembly({observation:intended,expected_contact:true,mechanism:'interference_fit'}).decision,'allow_with_note');
 const remote={...g,origin:[.04,0,0]},outside=await geometry.evaluate({a,b,r,t:[0,0,0],interface_contact:{features:[[remote],[remote]],comparison_margin_m:.00004,stop_after_obstruction_m:.0001}});assert.equal(outside.status,'interference');assert.equal(outside.intersection_volume_m3,intended.intersection_volume_m3);assert.ok(outside.diagnostics.interface_contact.witnesses[0].outside_contact_distance_m>.001);assert.equal(assessAssembly({observation:outside,expected_contact:true,mechanism:'screw_reception'}).decision,'block');assert.equal(assessAssembly({observation:outside,expected_contact:true,reference:true}).decision,'allow_with_note');
 const reused=await geometry.evaluate({a,b,r,t:[0,0,0],source_observation:intended,interface_contact:{features:[[remote],[remote]],comparison_margin_m:.00004,stop_after_obstruction_m:.0001}});assert.equal(reused.intersection_volume_m3,outside.intersection_volume_m3);assert.deepEqual(reused.diagnostics.interface_contact,outside.diagnostics.interface_contact);assert.equal(reused.diagnostics.component_scope,'not_recomputed_for_interface_qualification');assert.equal(assessAssembly({observation:reused,expected_contact:true}).decision,'block');
 const rotated=await geometry.evaluate({a,b,r:[[0,-1,0],[1,0,0],[0,0,1]],t:[.003,.001,0],interface_contact:{features:[[remote],[remote]]}});assert.equal(assessAssembly({observation:rotated,expected_contact:true}).decision,'block');
 for(const witness of rotated.diagnostics.interface_contact.witnesses){assert.equal(witness.source_side,'b');const expected=Math.min(...witness.point_m.map(v=>.01-Math.abs(v)));assert.ok(Math.abs(witness.depth_m-expected)<1e-10);assert.ok(Math.abs(Math.hypot(...witness.point_m.map((v,k)=>v-witness.nearest_surface_point_m[k]))-expected)<1e-10);}
 assert.equal(assessAssembly({observation:outside,expected_contact:true,policy:{...assemblyPolicy(),unrelated_obstacle_depth_m:.02}}).decision,'allow_with_note');
 const missing=await geometry.evaluate({a,b,r,t:[0,0,0],interface_contact:{features:[[],[]]}});assert.equal(missing.diagnostics.interface_contact.status,'not_evaluated');assert.equal(assessAssembly({observation:missing,expected_contact:true}).decision,'allow_with_note');
 const reversed=await geometry.evaluate({a:b,b:a,r,t:[0,0,0],interface_contact:{features:[[remote],[remote]],stop_after_obstruction_m:.0001}});assert.equal(assessAssembly({observation:reversed,expected_contact:true}).decision,'block');assert.ok(reversed.diagnostics.interface_contact.witnesses.every(w=>Number.isInteger(w.source_triangle)&&Number.isInteger(w.opposing_triangle)));
 for(const [origin,decision]of [[[0,0,0],'allow_with_note'],[[.04,0,0],'block']]){const box={type:'oriented_box',origin,axes:r,ranges:[[-.004,.004],[-.004,.004],[-.004,.004]]},observation=await geometry.evaluate({a,b,r,t:[0,0,0],interface_contact:{features:[[box],[box]],comparison_margin_m:.00004,stop_after_obstruction_m:.0001}});assert.equal(observation.status,'interference');assert.equal(observation.intersection_volume_m3,intended.intersection_volume_m3);assert.equal(assessAssembly({observation,expected_contact:true}).decision,decision);assert.equal(observation.diagnostics.interface_contact.regions[0].type,'oriented_box');}
});
