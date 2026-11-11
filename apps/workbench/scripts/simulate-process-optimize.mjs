import {Box3,Quaternion,Vector3} from 'three';
import {groupsFor,matrix,matrixPose} from './simulate-core.mjs';
import {nearestTablePosition,tableReservations} from './simulate-placement.mjs';
import {firstClearExit,processDirections,planAssemblyProcess} from './simulate-assembly-process.mjs';
import {motionWorldBounds} from './simulate-process-audit.mjs';
import {routeAroundBoxes,timedWaypoints} from './simulate-process-routes.mjs';

const v=a=>new Vector3().fromArray(a),pose=p=>({position:[...p.position],quaternion:[...p.quaternion]});
const shifted=(p,delta)=>({...p,position:v(p.position).add(delta).toArray()});

/** Author every transport and insertion on the server; the canvas plays these exact waypoints. */
export function optimizeAssemblyPresentation({scene,table,session,planned,details,geometry,process}){
 const parts=new Map(scene.parts.map(p=>[p.id,p])),wanted=new Map(planned.instances.map(p=>[p.id,p])),working=new Map(session.instances.map(p=>[p.id,structuredClone(p)])),steps=[],conditions=[],routeChecks=[];
 const retained=session.connections.filter(c=>planned.connections.some(p=>p.id===c.id)),units=groupsFor(planned.instances,retained).map(g=>g.instance_ids);
 process??=planAssemblyProcess({scene,instances:planned.instances,details,geometry,initialUnits:units});
 geometry.setReference(planned.instances);
 const boxFor=(ids,map=working)=>{const box=new Box3();for(const id of ids)box.union(motionWorldBounds(geometry,map.get(id)));return box;};
 const allIds=planned.instances.map(p=>p.id),targetBox=boxFor(allIds,wanted),tools=tableReservations(table).map(b=>new Box3(new Vector3(b.min.x,b.min.y,0),new Vector3(b.max.x,b.max.y,.13)));
 const treeEntries=(t,depth=0)=>t.removals.flatMap(r=>[{...r,depth},...(r.children?treeEntries(r.children,depth+1):[])]),entries=treeEntries(process.tree),mainReservation=targetBox.clone().expandByScalar(.014);
 // Reserve the actual swept footprint of the largest subassembly, including lower entries.
 const subEntries=entries.filter(r=>r.children),bayShape=new Box3();
 for(const r of subEntries){const b=boxFor(r.ids,wanted),center=b.getCenter(new Vector3());b.translate(new Vector3(-center.x,-center.y,-b.min.z));bayShape.union(b);for(const child of treeEntries(r.children)){const cb=boxFor(child.ids,wanted).translate(new Vector3(-center.x,-center.y,-boxFor(r.ids,wanted).min.z));for(const offset of child.path_offsets)bayShape.union(cb.clone().translate(v(offset)));}}
 if(bayShape.isEmpty())bayShape.set(new Vector3(-.04,-.04,0),new Vector3(.04,.04,.08));
 bayShape.expandByVector(new Vector3(.012,.012,.012));
 const baySpot=nearestTablePosition(bayShape,[mainReservation,...tools],table,.015);if(!baySpot)throw Error('桌面没有足够的子组合装配空间，请先整理台面。');
 const bayCenter=new Vector3(baySpot.x,baySpot.y,0),bayReservation=bayShape.clone().translate(bayCenter),reserved=[mainReservation,bayReservation,...tools],bays=[bayCenter];
 const maxDepth=Math.max(0,...subEntries.map(r=>r.depth));
 for(let depth=1;depth<=maxDepth;depth++){const shape=new Box3();for(const r of subEntries.filter(r=>r.depth===depth)){const box=boxFor(r.ids,wanted),center=box.getCenter(new Vector3());shape.union(box.translate(new Vector3(-center.x,-center.y,-box.min.z)));}shape.expandByScalar(.025);const spot=nearestTablePosition(shape,reserved,table,.008);if(!spot)throw Error('嵌套预装需要额外的桌面空间。');const center=new Vector3(spot.x,spot.y,0);bays.push(center);reserved.push(shape.translate(center));}
 const physicalObstacles=ids=>{const own=new Set(ids);return [...working].filter(([id])=>!own.has(id)).map(([id,p])=>({id,pose:p,box:motionWorldBounds(geometry,p)}));};
 function checkTranslation(ids,fromMap,offset,obstacles){
  const sweep=boxFor(ids,fromMap),end=sweep.clone().translate(offset);sweep.union(end);
  for(const other of obstacles){if(!sweep.intersectsBox(other.box))continue;for(const id of ids){const hit=geometry.sweep(fromMap.get(id),other.pose,offset.toArray());if(hit.blocked)return {id,other_id:other.id,...hit};}}return null;
 }
 function departure(ids,obstacles){
  const box=boxFor(ids),anchor=working.get(ids[0]),position=v(anchor.position),locals=box.clone().translate(position.clone().negate()),others=obstacles.map(o=>o.box);
  if(!others.some(o=>box.clone().expandByScalar(.0016).intersectsBox(o)))return {poses:[pose(anchor)],end:pose(anchor)};
  const directions=[{vector:new Vector3(0,0,1),basis:'table_lift'},...processDirections(ids,{parts,instances:working,details,allowDiagonal:true})];
  for(const direction of directions){const offset=firstClearExit(box,others,direction.vector,.003),end={...pose(anchor),position:position.clone().add(offset).toArray()};if(end.position[2]+locals.min.z<.0001)continue;const hit=checkTranslation(ids,working,offset,obstacles);if(!hit)return {poses:[pose(anchor),end],end,basis:direction.basis};}
  return {poses:[pose(anchor)],end:pose(anchor),conditional:true};
 }
 function transport(ids,to,{entry,entryPath=[],symbolic=false}={}){
  const obstacles=physicalObstacles(ids),from=working.get(ids[0]),target=to[0],fromBox=boxFor(ids),toMap=new Map(to.map(p=>[p.id,p])),toBox=boxFor(ids,toMap),fromLocal=fromBox.clone().translate(v(from.position).negate()),toLocal=toBox.clone().translate(v(target.position).negate()),fixed=[...obstacles.map(o=>o.box),...tools],start=departure(ids,obstacles),route=[...start.poses];
  let conditional=symbolic||start.conditional,reason=start.conditional?'当前构型未找到刚性退出路径；拆分以参考示意显示。':undefined;
  const radius=Math.max(...[fromBox,toBox].flatMap((b,n)=>[b.min.x,b.max.x].flatMap(x=>[b.min.y,b.max.y].flatMap(y=>[b.min.z,b.max.z].map(z=>new Vector3(x,y,z).distanceTo(v(n?target.position:from.position))))))),height=Math.max(...fixed.map(b=>b.max.z),from.position[2],target.position[2])+radius+.025;
  const raised={position:[start.end.position[0],start.end.position[1],height],quaternion:from.quaternion},up=routeAroundBoxes(start.end.position,raised.position,fromLocal,fixed);
  if(!up){conditional=true;reason='当前退出通道未核定；以参考归位示意显示。';}
  else route.push(...up.slice(1).map(position=>({position,quaternion:from.quaternion})));
  const aligned={position:[...raised.position],quaternion:target.quaternion};route.push(aligned);
  const destination=entry??pose(target),high={position:[destination.position[0],destination.position[1],height],quaternion:target.quaternion};route.push(high);
  const down=routeAroundBoxes(high.position,destination.position,toLocal,fixed);
  if(!down){conditional=true;reason='转运入口仍被占据；装入通道待核。';}
  else route.push(...down.slice(1).map(position=>({position,quaternion:target.quaternion})));
  if(conditional){
   // Explicit reference handoff: fade out at a clear staging pose, then show the
   // source result. There is no opaque interpolation through a captured solid.
   const clearPose=down?destination:high;
   const safeRoute=up?route.slice(0,route.findIndex(p=>p===high)+1):[pose(from)];
   if(down)safeRoute.push(...down.slice(1).map(position=>({position,quaternion:target.quaternion})));
   conditions.push({instance_ids:ids,reason:reason??'来源限形关系保留；刚性装入和保持工艺待核。'});
   return {instance_ids:ids,poses:to,lift_m:0,waypoints:timedWaypoints(safeRoute.length?safeRoute:[clearPose]),presentation:'reference_handoff',path_check:{status:'reference_only',reason:conditions.at(-1).reason}};
  }
  route.push(...entryPath);
  const waypoints=timedWaypoints(route,{insertionStart:entry}),definition={instance_ids:ids,poses:to,lift_m:0,waypoints,path_check:{status:'sampled_clear',method:process.method,spacing_m:process.spacing_m,contact_margin_m:process.contact_margin_m}};
  routeChecks.push({instance_ids:ids,waypoint_count:waypoints.length});return definition;
 }
 function append(kind,chapter,label,ids,to,options={},extra={}){
  const motion=transport(ids,to,options),duration=kind==='stage'?550:motion.presentation?1800:kind==='preassemble'?1550:1450;
  steps.push({kind,chapter:motion.presentation?'装入工艺待核':chapter,label:motion.presentation?label+' · 参考构型示意':label,duration_ms:duration,focus_ids:kind==='stage'?allIds:[...ids,...(extra.fixed_ids??[])],motions:[motion],...extra});for(const p of to)working.set(p.id,p);return motion;
 }
 steps.push({kind:'establish',chapter:'装配过程检查',label:'核对全部 '+allIds.length+' 个部件 · 接口方向与装入顺序',duration_ms:1200,focus_ids:allIds,motions:[]});
 // Only retained components that actually obstruct the reverse plan are opened.
 const opened=new Set(process.opened_instance_ids),components=units.flatMap(ids=>ids.some(id=>opened.has(id))?ids.map(id=>[id]):[ids]),removed=session.connections.filter(c=>!retained.some(r=>r.id===c.id));
 if(removed.length||opened.size)steps.push({kind:'detach',chapter:removed.length?'连接纠正':'打开装入空间',label:removed.length?'解除 '+removed.length+' 条与成品参考不一致的连接':'临时打开遮挡装入的组合，完成预装后合回',duration_ms:1100,focus_ids:allIds,motions:[],removed_connection_ids:removed.map(c=>c.id),access_opened_connection_ids:retained.filter(c=>c.endpoints.some(e=>opened.has(e.instance_id))).map(c=>c.id)});
 // Sequential staging: allocate against the *current* inventory, not a future
 // parking layout. Already clear pieces stay put; nothing crosses in a swarm.
 for(const ids of components.sort((a,b)=>boxFor(b).getSize(new Vector3()).length()-boxFor(a).getSize(new Vector3()).length())){
  const box=boxFor(ids);if(!reserved.some(r=>box.clone().expandByScalar(.003).intersectsBox(r)))continue;
  const obstacles=[...reserved,...physicalObstacles(ids).map(o=>o.box)],spot=nearestTablePosition(box,obstacles,table,.004);if(!spot)throw Error('没有足够的零件暂存位置，请扩大或整理工作台。');
  const center=box.getCenter(new Vector3()),delta=new Vector3(spot.x-center.x,spot.y-center.y,spot.z),to=ids.map(id=>shifted(working.get(id),delta));append('stage','空间整理','逐件避让 · '+parts.get(to[0].part_ref).name,ids,to);
 }
 const makePoses=(ids,shift)=>ids.map(id=>shifted(wanted.get(id),shift));
 function assemble(tree,shift,depth=0){
  const root=tree.root_ids,rootTo=makePoses(root,shift);append(depth?'preassemble':'join',depth?'子组合预装':'建立总成基准',parts.get(wanted.get(root[0]).part_ref).name+' · 定位基准',root,rootTo);
  const placed=[...root];
  for(const r of tree.removals){
   if(r.children){const ownBox=boxFor(r.ids,wanted),center=ownBox.getCenter(new Vector3()),bay=bays[depth]??bayCenter,subShift=new Vector3(bay.x-center.x,bay.y-center.y,.09-ownBox.min.z);assemble(r.children,subShift,depth+1);}
   const to=makePoses(r.ids,shift),anchor=to[0],entryPath=[...r.path_offsets].reverse().slice(1).map(offset=>({...pose(anchor),position:v(anchor.position).add(v(offset)).toArray()}));entryPath.push(pose(anchor));
   const entry={...pose(anchor),position:v(anchor.position).add(v(r.offset)).toArray()},bearing=r.ids.length===1&&parts.get(anchor.part_ref).kind==='bearing',name=r.ids.length>1?'安装预装组合 · '+r.ids.length+' 个部件':parts.get(anchor.part_ref).name;
   const motion=append(depth?'preassemble':'join',bearing?'轴承装入':depth?'子组合预装':parts.get(anchor.part_ref).groupLabel??'精密装配',name,r.ids,to,{entry,entryPath,symbolic:r.path_status==='reference_handoff'},{fixed_ids:placed.slice(-2),process:{direction_basis:r.direction_basis,direction_refs:r.direction_refs,extraction_offsets_m:r.path_offsets,path_status:r.path_status??'sampled_clear',checked_obstacle_ids:r.checked_obstacle_ids}});
   if(bearing){const bearingBox=motionWorldBounds(geometry,anchor).expandByScalar(.003),host=placed.filter(id=>bearingBox.intersectsBox(motionWorldBounds(geometry,working.get(id)))).sort((a,b)=>v(working.get(a).position).distanceTo(v(anchor.position))-v(working.get(b).position).distanceTo(v(anchor.position)))[0]??placed.at(-1);motion.approach_offset_m=r.path_offsets[0];motion.insertion={kind:'bearing_axial',bearing_instance_id:r.ids[0],host_instance_id:host,axis:r.direction,axis_interface_ref:r.direction_refs[0],axis_member_ref:r.direction_refs[1]};}
   placed.push(...r.ids);
  }
 }
 assemble(process.tree,new Vector3());
 steps.push({kind:'reveal',chapter:'成品参考',label:conditions.length?'参考构型完成 · '+conditions.length+' 步装入工艺待核':'ASSEMBLY COMPLETE',duration_ms:4800,focus_ids:allIds,motions:[]});
 const report={...planned.reference_assembly,process_version:'source-process/2',bearing_preassembly_count:scene.parts.filter(p=>p.kind==='bearing').length,access_opened_connection_count:retained.filter(c=>c.endpoints.some(e=>opened.has(e.instance_id))).length,process_check:{method:process.method,surface_spacing_m:process.spacing_m,contact_margin_m:process.contact_margin_m,part_count:allIds.length,ordered_insertion_count:entries.length,subassembly_count:subEntries.length,checked_motion_count:routeChecks.length,reference_handoff_count:conditions.length,conditions,proxy_parts:geometry.stats.proxy_parts,physics_status:'not_evaluated',scope:'Finite source-surface sweeps, conservative box transport; source nominal contacts preserved.'}};
 return {...planned,reference_assembly:report,operation:{...planned.operation,report,steps,total_duration_ms:steps.reduce((n,s)=>n+s.duration_ms,0)}};
}
