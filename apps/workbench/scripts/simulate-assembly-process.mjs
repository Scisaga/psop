import {Box3,Quaternion,Vector3} from 'three';

const cardinal=[[1,0,0],[0,1,0],[0,0,1]],diagonal=[[1,1,0],[1,-1,0],[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1],[1,-1,1],[-1,1,1],[-1,-1,1]];
const removalRank={shell:0,electronics:1,structure:2,actuator:3,bearing:4};
const clean=v=>v.map(n=>Math.abs(n)<1e-7?0:n);

/** First AABB-free exit, stopping before a distant obstacle instead of crossing the whole model. */
export function firstClearExit(moving,obstacles,direction,gap=.004){
 const intervals=[];
 for(const box of obstacles){let lo=-Infinity,hi=Infinity;for(let k=0;k<3;k++){const axis=['x','y','z'][k],v=direction.getComponent(k),a=box.min[axis]-gap-moving.max[axis],b=box.max[axis]+gap-moving.min[axis];if(Math.abs(v)<1e-8){if(a>0||b<0){hi=-Infinity;break;}}else{lo=Math.max(lo,Math.min(a/v,b/v));hi=Math.min(hi,Math.max(a/v,b/v));}}if(hi>=Math.max(0,lo))intervals.push([Math.max(0,lo),hi]);}
 intervals.sort((a,b)=>a[0]-b[0]);let distance=.008;
 for(const [lo,hi]of intervals){if(lo>distance+.0005)break;if(hi>=distance)distance=hi+.001;}
 return direction.clone().multiplyScalar(distance);
}

export function processDirections(ids,{parts,instances,details,allowDiagonal=false}){
 const values=[],add=(axis,basis,refs=[])=>{if(axis.lengthSq()<.5)return;axis.normalize();for(const sign of [1,-1]){const vector=axis.clone().multiplyScalar(sign);if(!values.some(v=>v.vector.dot(vector)>1-1e-6))values.push({vector,basis,refs});}};
 const lone=ids.length===1?parts.get(instances.get(ids[0]).part_ref):null;
 for(const id of ids){const p=instances.get(id),part=parts.get(p.part_ref),q=new Quaternion().fromArray(p.quaternion),interfaces=details.get(part.id)?.interfaces??[];
  if(lone?.kind==='bearing'){const ring=interfaces.find(i=>i.key==='inner_ring')??interfaces.find(i=>i.key==='outer_ring'),member=ring?.members.find(m=>/:(bore|outer_cylinder)$/.test(m.id))??ring?.members.find(m=>m.direction);if(member)add(new Vector3().fromArray(member.direction).applyQuaternion(q),'published_bearing_axis',[ring.id,member.id]);continue;}
  for(const i of interfaces)for(const member of i.members??[])if(member.direction)add(new Vector3().fromArray(member.direction).applyQuaternion(q),'published_interface_member',[i.id,member.id]);
 }
 if(lone?.kind==='bearing')return values;
 const q=new Quaternion().fromArray(instances.get(ids[0]).quaternion);
 for(const axis of cardinal)add(new Vector3().fromArray(axis).applyQuaternion(q),'source_part_frame');
 if(allowDiagonal)for(const axis of diagonal)add(new Vector3().fromArray(axis).applyQuaternion(q),'geometric_clearance_search');
 return values;
}

/** Reverse disassembly exposes blockers and closed loops before forward animation is authored. */
export function planAssemblyProcess({scene,instances,details,geometry,initialUnits,rootId,onProgress=()=>{}}){
 geometry.setReference(instances);
 const parts=new Map(scene.parts.map(p=>[p.id,p])),poses=new Map(instances.map(p=>[p.id,p])),boxes=new Map(instances.map(p=>{const local=geometry.shape(p.part_ref).bounds.clone();local.min.multiplyScalar(.001);local.max.multiplyScalar(.001);const q=new Quaternion().fromArray(p.quaternion),box=new Box3();for(const x of [local.min.x,local.max.x])for(const y of [local.min.y,local.max.y])for(const z of [local.min.z,local.max.z])box.expandByPoint(new Vector3(x,y,z).applyQuaternion(q).add(new Vector3().fromArray(p.position)));return [p.id,box];}));
 const cache=new Map(),attempts=[],opened=new Set();let searches=0;
 const boxFor=ids=>{const box=new Box3();for(const id of ids)box.union(boxes.get(id));return box;};
 function translate(ids,others,shift,offset){
  const moving=boxFor(ids).translate(shift),sweep=moving.clone().union(moving.clone().translate(offset)),nearby=others.filter(id=>sweep.intersectsBox(boxes.get(id)));
  for(const id of ids)for(const other of nearby){const key=[id,other,...shift.toArray().map(n=>Math.round(n*1e7)),...offset.toArray().map(n=>Math.round(n*1e7))].join('|');let result=cache.get(key);if(!result){const from=poses.get(id);result=geometry.sweep({...from,position:new Vector3().fromArray(from.position).add(shift).toArray()},poses.get(other),offset.toArray());cache.set(key,result);searches++;}if(result.blocked)return {instance_id:id,blocker_id:other,...result};}
  return {blocked:false,checked_obstacle_ids:nearby};
 }
 function inspect(ids,remaining,allowDiagonal=false,raisedSubassembly=false){
  const own=new Set(ids),moving=boxFor(ids),others=[...remaining].filter(id=>!own.has(id)),failures=[];
  for(const direction of processDirections(ids,{parts,instances:poses,details,allowDiagonal})){
   const offset=firstClearExit(moving,others.map(id=>boxes.get(id)),direction.vector),end=moving.clone().translate(offset);if(!raisedSubassembly&&end.min.z<-.00005)continue;
   const hit=translate(ids,others,new Vector3(),offset);
   if(!hit.blocked)return {ids:[...ids],offset:clean(offset.toArray()),path_offsets:[clean(offset.toArray())],direction:clean(direction.vector.toArray()),direction_basis:direction.basis,direction_refs:direction.refs,checked_obstacle_ids:hit.checked_obstacle_ids};
   failures.push({direction:clean(direction.vector.toArray()),...hit});
  }
  return {blocked:true,ids:[...ids],failures};
 }
 function dogleg(ids,remaining,raisedSubassembly){
  const own=new Set(ids),others=[...remaining].filter(id=>!own.has(id)),moving=boxFor(ids),secondary=[new Vector3(0,0,1),...cardinal.flatMap(axis=>[new Vector3().fromArray(axis),new Vector3().fromArray(axis).negate()])];
  for(const direction of processDirections(ids,{parts,instances:poses,details}))for(const distance of [.002,.004,.008,.014,.024,.04]){
   const first=direction.vector.clone().multiplyScalar(distance),at=moving.clone().translate(first);if(!raisedSubassembly&&at.min.z<-.00005)break;
   const initial=translate(ids,others,new Vector3(),first);if(initial.blocked)break;
   for(const redirect of secondary){if(Math.abs(direction.vector.dot(redirect))>.99)continue;const next=firstClearExit(at,others.map(id=>boxes.get(id)),redirect),end=at.clone().translate(next);if(!raisedSubassembly&&end.min.z<-.00005)continue;const later=translate(ids,others,first,next);if(later.blocked)continue;
    return {ids:[...ids],offset:clean(first.clone().add(next).toArray()),path_offsets:[clean(first.toArray()),clean(first.clone().add(next).toArray())],direction:clean(direction.vector.toArray()),direction_basis:direction.basis,direction_refs:direction.refs,redirect_basis:'checked_clearance_leg',checked_obstacle_ids:[...new Set([...initial.checked_obstacle_ids,...later.checked_obstacle_ids])]};
   }
  }
  return null;
 }
 function anchor(ids){return ids.find(id=>{const p=parts.get(poses.get(id).part_ref);return p.kind==='structure'&&p.meshKey===p.body;})??ids.find(id=>parts.get(poses.get(id).part_ref).kind==='structure')??ids.find(id=>parts.get(poses.get(id).part_ref).kind!=='bearing')??ids[0];}
 function solve(ids,units,root,depth=0){
  if(depth>12)throw Error('装配子组合层级过深，路径仍待检查。');const remaining=new Set(ids),removals=[];let active=units.map(u=>[...u]),rootUnit=active.find(u=>u.includes(root));
  while(active.length>1){let chosen,sets=[];
   const candidates=active.filter(u=>u!==rootUnit).sort((a,b)=>Math.min(...a.map(id=>removalRank[parts.get(poses.get(id).part_ref).kind]??5))-Math.min(...b.map(id=>removalRank[parts.get(poses.get(id).part_ref).kind]??5))||a.length-b.length);
   for(const unit of candidates){const attempt=inspect(unit,remaining,false,depth>0);if(!attempt.blocked){chosen={...attempt,leaves:[unit]};break;}attempts.push({phase:'individual',depth,...attempt});}
   if(!chosen){
    for(const body of scene.bodies){const descendants=new Set([body.name]);let size=-1;while(size!==descendants.size){size=descendants.size;for(const b of scene.bodies)if(descendants.has(b.parent))descendants.add(b.name);}for(const names of [new Set([body.name]),descendants]){const matched=active.filter(u=>u.some(id=>names.has(parts.get(poses.get(id).part_ref).body))),merged=matched.flat();if(matched.length>1&&!merged.includes(root)&&!sets.some(s=>s.ids.length===merged.length&&s.ids.every(id=>merged.includes(id))))sets.push({ids:merged,leaves:matched,body_ref:body.id});}}
    // Explicit connected pairs can require preassembly even when they span source body boundaries.
    const owners=new Map((scene.assembly?.interfaces??[]).map(i=>[i.id,i.owner_ref]));
    for(const connection of scene.assembly?.connections??[]){const ownerIds=connection.endpoints?.map(e=>'instance:'+owners.get(e.interface_ref))??[],matched=active.filter(u=>u.some(id=>ownerIds.includes(id))),merged=matched.flat();if(matched.length===2&&!merged.includes(root)&&!sets.some(s=>s.ids.length===merged.length&&s.ids.every(id=>merged.includes(id))))sets.push({ids:merged,leaves:matched,connection_ref:connection.id});}
    sets.sort((a,b)=>a.ids.length-b.ids.length);
    for(const set of sets){const attempt=inspect(set.ids,remaining,false,depth>0);if(!attempt.blocked){chosen={...attempt,...set};break;}attempts.push({phase:'subassembly',depth,...attempt});}
   }
   if(!chosen){for(const unit of candidates){const attempt=inspect(unit,remaining,true,depth>0);if(!attempt.blocked){chosen={...attempt,leaves:[unit]};break;}}}
   if(!chosen){for(const unit of candidates){const attempt=dogleg(unit,remaining,depth>0);if(attempt){chosen={...attempt,leaves:[unit]};break;}}}
   if(!chosen){for(const set of sets){const attempt=dogleg(set.ids,remaining,depth>0);if(attempt){chosen={...attempt,...set};break;}}}
   if(!chosen){const splittable=active.filter(u=>u.length>1);if(splittable.length){for(const unit of splittable)for(const id of unit)opened.add(id);active=active.flatMap(u=>u.map(id=>[id]));rootUnit=active.find(u=>u.includes(root));continue;}
    // A captured source pair is still a valid reference assembly. Do not invent
    // a rigid insertion or infer a material/strain from a geometric observation.
    // Its presentation is explicitly symbolic, and excluded from clear-path claims.
    const unit=candidates[0],own=new Set(unit),others=[...remaining].filter(id=>!own.has(id)),vector=new Vector3(0,0,1),offset=firstClearExit(boxFor(unit),others.map(id=>boxes.get(id)),vector);
    const witnesses=attempts.filter(a=>a.depth===depth&&a.ids.length===unit.length&&a.ids.every(id=>unit.includes(id))).slice(-1).flatMap(a=>a.failures??[]);
    chosen={ids:[...unit],leaves:[unit],offset:clean(offset.toArray()),path_offsets:[clean(offset.toArray())],direction:[0,0,1],direction_basis:'reference_only',direction_refs:[],checked_obstacle_ids:others,
     path_status:'reference_handoff',conditions:['未找到有依据的刚性装入路径；仅示意来源构型，装入与保持工艺待核。'],blocking_observations:witnesses.slice(0,6)};
   }
   if(chosen.leaves.length>1)chosen.children=solve(chosen.ids,chosen.leaves,anchor(chosen.ids),depth+1);
   removals.push(chosen);for(const id of chosen.ids)remaining.delete(id);active=active.filter(u=>!u.some(id=>chosen.ids.includes(id)));onProgress({remaining:remaining.size,depth,searches});
  }
  return {root_ids:active[0],removals:removals.reverse()};
 }
 const tree=solve(instances.map(p=>p.id),initialUnits??instances.map(p=>[p.id]),rootId??anchor(instances.map(p=>p.id)));
 return {tree,attempts,opened_instance_ids:[...opened],searches,boxes,geometry_stats:{...geometry.stats},method:'source-surface-swept-translation/1',spacing_m:geometry.spacing_m,contact_margin_m:geometry.contact_margin_m};
}
