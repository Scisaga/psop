import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {axialRoute,rigidMotion,waypointMotion} from '../src/simulate-motion.ts';
import {matrix,matrixPose} from './simulate-core.mjs';

export function motionWorldBounds(geometry,p){const local=geometry.shape(p.part_ref).bounds.clone();local.min.multiplyScalar(.001);local.max.multiplyScalar(.001);return local.applyMatrix4(matrix(p));}

/** Replay the same transforms used by the canvas; distinguish new transit intrusion from nominal contact. */
export function auditSimulationProcess({scene,initial,operation,geometry,fractions=[.2,.4,.6,.8,.95],sampleWaypoints=false,onProgress=()=>{}}){
 const parts=new Map(scene.parts.map(p=>[p.id,p])),working=new Map(initial.map(p=>[p.id,structuredClone(p)])),issues=[],steps=[];let samples=0,pairChecks=0;
 for(const [index,step]of operation.steps.entries()){
  const starts=step.motions.map(def=>{
   const anchor=def.poses[0],from=working.get(anchor.id),to={position:anchor.position,quaternion:anchor.quaternion},matrices=new Map(def.instance_ids.map(id=>[id,matrix(working.get(id))])),direction=new Vector3().fromArray(from.position).sub(new Vector3().fromArray(to.position));direction.z=Math.max(.2*direction.length(),direction.z);if(direction.length()<.001)direction.set(.1,-.3,1);direction.normalize();const approach={position:new Vector3().fromArray(to.position).addScaledVector(direction,.025).toArray(),quaternion:to.quaternion};
   let route=def.waypoints?.map(w=>({at:w.at,pose:{position:w.position,quaternion:w.quaternion}}));
   if(!route&&def.approach_offset_m){const hostId=def.insertion?.host_instance_id??def.approach_host_instance_id,host=hostId?motionWorldBounds(geometry,working.get(hostId)):undefined,moving=new Box3(),current=new Box3();for(const p of def.poses)moving.union(motionWorldBounds(geometry,p));for(const id of def.instance_ids)current.union(motionWorldBounds(geometry,working.get(id)));moving.translate(new Vector3().fromArray(to.position).negate());route=axialRoute(from,to,def.approach_offset_m,Math.max(def.lift_m,current.max.z-from.position[2]+.025),host,moving);}
   return {def,from,to,matrices,approach,route,approachMatrices:rigidMotion(from,approach,matrices,1)};
  });
  const visited=new Set(),own=new Map(starts.flatMap((m,n)=>m.def.instance_ids.map(id=>[id,n]))),movingIds=[...own.keys()],stepIssues=[];
  const checkpoints=new Set(fractions);
  if(sampleWaypoints)for(const m of starts)if(m.route){for(let n=1;n<m.route.length;n++)for(const fraction of [0,.25,.5,.75,1]){const t=m.route[n-1].at+(m.route[n].at-m.route[n-1].at)*fraction;checkpoints.add(m.def.presentation==='reference_handoff'?t*.6:t);}if(m.def.presentation==='reference_handoff')checkpoints.add(.9);}
  for(const progress of movingIds.length?[...checkpoints].sort((a,b)=>a-b):[]){
   const frame=new Map(working);
   for(const [n,m]of starts.entries()){const delay=step.kind==='stage'&&!m.def.waypoints?n/Math.max(1,starts.length)*.2:0,t=Math.max(0,Math.min(1,(progress-delay)/(1-delay))),transforms=m.def.presentation==='reference_handoff'?(t<.75?waypointMotion(m.route,m.matrices,Math.min(1,t/.6)):rigidMotion(m.from,m.to,m.matrices,1)):m.route?waypointMotion(m.route,m.matrices,t):step.kind==='join'?(t<.72?rigidMotion(m.from,m.approach,m.matrices,t/.72,new Vector3(),m.def.lift_m):rigidMotion(m.approach,m.to,m.approachMatrices,(t-.72)/.28)):rigidMotion(m.from,m.to,m.matrices,t,new Vector3(),m.def.lift_m);for(const [id,transform]of transforms)frame.set(id,{...working.get(id),...matrixPose(transform)});}
   const boxes=new Map([...frame].map(([id,p])=>[id,motionWorldBounds(geometry,p)]));samples++;
   for(const id of movingIds){const p=frame.get(id),box=boxes.get(id);if(box.min.z<-.0002&&!visited.has('floor:'+id)){visited.add('floor:'+id);stepIssues.push({kind:'table_crossing',fraction:progress,moving_id:id,moving_name:parts.get(p.part_ref).name,minimum_z_m:box.min.z});}
    for(const [other,q]of frame){const key=[id,other].sort().join('|');if(id===other||own.has(other)&&own.get(id)===own.get(other)||visited.has(key)||!box.intersectsBox(boxes.get(other)))continue;pairChecks++;const hit=geometry.overlap(p,q)??geometry.overlap(q,p);if(hit){visited.add(key);stepIssues.push({kind:'transit_intrusion',fraction:progress,moving_id:id,moving_name:parts.get(p.part_ref).name,other_id:other,other_name:parts.get(q.part_ref).name,...hit});}}
   }
  }
  for(const def of step.motions)for(const p of def.poses)working.set(p.id,structuredClone(p));
  steps.push({index,kind:step.kind,label:step.label,moving_ids:movingIds,reference_handoff:step.motions.some(m=>m.presentation==='reference_handoff'),issue_count:stepIssues.length});for(const issue of stepIssues)issues.push({step:index,label:step.label,phase:step.kind,...issue});if(index%10===0)onProgress({step:index,total:operation.steps.length,issues:issues.length});
 }
 return {method:'sampled-source-mesh-transit-audit/1',sample_fractions:fractions,waypoint_samples:sampleWaypoints,snapshot_count:samples,pair_checks:pairChecks,step_count:operation.steps.length,moving_step_count:steps.filter(s=>s.moving_ids.length).length,reference_handoff_count:steps.filter(s=>s.reference_handoff).length,continuous_rigid_path_status:'not_certified',issues,steps,nominal_contacts:geometry.referenceObservations(),geometry_stats:{...geometry.stats}};
}
