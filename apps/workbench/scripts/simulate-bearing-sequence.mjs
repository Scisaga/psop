import {Box3,Quaternion,Vector3} from 'three';
import {fail,groupsFor,transformedBounds} from './simulate-core.mjs';

const corners=box=>[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>new Vector3(x?box.max.x:box.min.x,y?box.max.y:box.min.y,z?box.max.z:box.min.z))));
const projection=(box,axis)=>corners(box).map(p=>p.dot(axis));

/** Choose an axial entry outside the mating part's envelope, rather than a camera-facing shortcut. */
export function axialApproach(moving,fixed,axis,obstacles=[]){
 const choices=[1,-1].map(sign=>{
  const direction=axis.clone().normalize().multiplyScalar(sign),distance=Math.max(.012,Math.max(...projection(fixed,direction))-Math.min(...projection(moving,direction))+.008),offset=direction.multiplyScalar(distance);
  const entry=moving.clone().translate(offset),sweep=moving.clone().union(entry).expandByScalar(-.0001),blockers=obstacles.filter(p=>sweep.intersectsBox(p.box));
  return {offset,entry,sweep,blockers,distance};
 });
 return choices.sort((a,b)=>a.blockers.length-b.blockers.length||a.distance-b.distance)[0];
}

/** Bearings are seated in open subassemblies before those units enter the main assembly. */
export function bearingAssemblyUnits({scene,bounds,instances,retained,candidates,partDetails=new Map()}){
 const parts=new Map(scene.parts.map(p=>[p.id,p])),wanted=new Map(instances.map(p=>[p.id,p])),initial=groupsFor(instances,retained),initialFor=new Map(initial.flatMap(g=>g.instance_ids.map(id=>[id,g]))),plans=[],openParts=new Set();
 const box=id=>{const p=wanted.get(id);return transformedBounds(bounds[p.part_ref],p,parts.get(p.part_ref).scale);};
 for(const part of scene.parts.filter(p=>p.kind==='bearing')){
  const id='instance:'+part.id,component=initialFor.get(id);if(component.instance_ids.length>1)continue;
  const options=candidates.flatMap(c=>{const endpoint=c.endpoints.find(e=>e.instance_id===id),other=c.endpoints.find(e=>e.instance_id!==id);if(!endpoint||!other||parts.get(wanted.get(other.instance_id)?.part_ref)?.kind==='bearing')return [];return [{candidate:c,endpoint,other}];});
  options.sort((a,b)=>Number(!a.endpoint.interface_ref?.endsWith(':outer_ring'))-Number(!b.endpoint.interface_ref?.endsWith(':outer_ring'))||Number(parts.get(wanted.get(a.other.instance_id).part_ref).body!==part.body)-Number(parts.get(wanted.get(b.other.instance_id).part_ref).body!==part.body)||a.candidate.id.localeCompare(b.candidate.id));
  const chosen=options[0];if(!chosen)fail('轴承缺少有明确成员的成品配合，不能编排装入顺序：'+part.name);
  const interfaces=partDetails.get(part.id)?.interfaces??[],ring=interfaces.find(i=>i.key==='inner_ring')??interfaces.find(i=>i.id===chosen.endpoint.interface_ref),member=ring?.members.find(m=>/:(bore|outer_cylinder)$/.test(m.id))??ring?.members.find(m=>m.direction?.length===3);
  if(!member?.direction||new Vector3().fromArray(member.direction).lengthSq()<.5)fail('轴承缺少已发布的装入轴线：'+part.name);
  const axis=new Vector3().fromArray(member.direction).applyQuaternion(new Quaternion().fromArray(wanted.get(id).quaternion)).normalize(),host=chosen.other.instance_id,hostGroup=initialFor.get(host),mates=[...new Set(options.map(o=>o.other.instance_id))];
  // An already closed, otherwise correct group may need temporary access; its saved edges remain intact.
  const obstacles=hostGroup.instance_ids.filter(other=>other!==host&&other!==id&&parts.get(wanted.get(other).part_ref).kind!=='bearing').map(id=>({id,box:box(id)})),entry=axialApproach(box(id),box(host),axis,obstacles);
  for(const other of mates.filter(other=>other!==host&&hostGroup.instance_ids.includes(other)))openParts.add(other);
  for(const blocker of entry.blockers)openParts.add(blocker.id);
  plans.push({bearing_id:id,host_id:host,axis,axis_interface_ref:ring.id,axis_member_ref:member.id,seat_interface_ref:chosen.other.interface_ref,mates,candidate_id:chosen.candidate.id});
 }
 for(const c of retained){const bearing=c.endpoints.find(e=>parts.get(wanted.get(e.instance_id).part_ref).kind==='bearing'),other=c.endpoints.find(e=>e!==bearing);if(bearing&&openParts.has(other.instance_id))openParts.add(bearing.instance_id);}
 const opened=retained.filter(c=>c.endpoints.some(e=>openParts.has(e.instance_id))&&!c.endpoints.every(e=>openParts.has(e.instance_id))),openedIds=new Set(opened.map(c=>c.id)),components=groupsFor(instances,retained.filter(c=>!openedIds.has(c.id)));
 const unitSets=components.map(g=>new Set(g.instance_ids));
 for(const p of plans){const a=unitSets.find(g=>g.has(p.bearing_id)),b=unitSets.find(g=>g.has(p.host_id));if(a!==b){for(const id of a)b.add(id);unitSets.splice(unitSets.indexOf(a),1);}}
 const units=unitSets.map(ids=>({id:[...ids].sort()[0],instance_ids:instances.map(p=>p.id).filter(id=>ids.has(id)),bearing_plans:plans.filter(p=>ids.has(p.bearing_id))}));
 return {components,units,plans,opened};
}
