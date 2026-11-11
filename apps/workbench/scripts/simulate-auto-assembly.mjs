import {randomUUID} from 'node:crypto';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {blockedEndpoint,clone,fail,groupsFor,matrix,matrixPose,occupancyFor,transformedBounds,validPose} from './simulate-core.mjs';
import {nearestTablePosition,tableReservations} from './simulate-placement.mjs';
import {axialApproach,bearingAssemblyUnits} from './simulate-bearing-sequence.mjs';
import {configurationPoses,referenceConfigurations,sourceConfiguration} from './simulate-configuration.mjs';
import {assessAssembly,mechanicsNotEvaluated} from '../../../skills/psop-build/scripts/assembly-judgment.mjs';

const poseTolerance=.00005,angleTolerance=.0005;
const near=(a,b)=>new Vector3().fromArray(a.position).distanceTo(new Vector3().fromArray(b.position))<=poseTolerance&&new Quaternion().fromArray(a.quaternion).angleTo(new Quaternion().fromArray(b.quaternion))<=angleTolerance;
const relative=(a,b)=>matrixPose(matrix(a).invert().multiply(matrix(b)));
const pairKey=(a,b)=>[a,b].sort().join('|');
const endpointKey=e=>e.instance_id+'|'+e.interface_ref;
const refCondition='成品参考演示；完整实体干涉、保持、装入路径与承载尚未核定。';

/** Source poses are authoritative for presentation only. They never become a geometry-clear claim. */
export function referenceAssemblyTarget(scene,bounds,configuration=sourceConfiguration(scene)){
  if(!scene.parts?.length||!scene.bodies?.length)fail('当前 DKP 缺少完整的来源构型，暂不能自动组装。');
  const poses=configurationPoses(scene,configuration),box=new Box3();
  const instances=scene.parts.map(p=>{const instance={id:'instance:'+p.id,part_ref:p.id,...validPose(poses.get(p.id))};box.union(transformedBounds(bounds[p.id],instance,p.scale));return instance;});
  const center=box.getCenter(new Vector3()),delta=[-center.x,-center.y,.0002-box.min.z];
  for(const p of instances)p.position=p.position.map((v,n)=>v+delta[n]);
  box.translate(new Vector3().fromArray(delta));
  return {instances,bounds:box,configuration_ref:configuration,label:referenceConfigurations(scene).find(c=>c.id===configuration).label};
}

/** Rigid source nodes and their explicit parent chain provide structural references, not invented ports. */
export function sourceStructureRelations(scene){
  const parts=new Map(scene.parts.map(p=>[p.id,p])),bodies=new Map(scene.bodies.map(b=>[b.name,b])),relations=[],anchors=new Map();
  for(const body of scene.bodies){let current=body;const seen=new Set();while(current){if(seen.has(current.name))fail('来源模型结构存在循环，不能自动组装。');seen.add(current.name);current=bodies.get(current.parent);}}
  for(const body of scene.bodies){
    const members=(body.partIds??[]).filter(id=>parts.has(id));
    if(!members.length)continue;
    const anchor=members.find(id=>parts.get(id).kind==='structure')??members[0];anchors.set(body.name,anchor);
    for(const id of members)if(id!==anchor)relations.push({id:'source-structure:'+body.id+':'+id,owners:[anchor,id],body_refs:[body.id],label:body.label??body.name});
  }
  for(const body of scene.bodies){
    if(!anchors.has(body.name))continue;let parent=body.parent;const seen=new Set([body.name]),chain=[body.id];
    while(parent){if(seen.has(parent))fail('来源模型结构存在循环，不能自动组装。');seen.add(parent);const ancestor=bodies.get(parent);if(!ancestor)break;chain.push(ancestor.id);
      if(anchors.has(parent)){relations.push({id:'source-structure:'+body.id+':parent:'+ancestor.id,owners:[anchors.get(parent),anchors.get(body.name)],body_refs:chain,label:body.label??body.name});break;}parent=ancestor.parent;
    }
  }
  return relations;
}

/** Build and save one complete reference result; the client only performs its reversible presentation. */
export function planAutomaticAssembly({scene,bounds,table,session,candidates,partDetails=new Map(),now=new Date().toISOString()}){
  const target=referenceAssemblyTarget(scene,bounds,session.reference_configuration_ref),wanted=new Map(target.instances.map(p=>[p.id,p])),current=new Map(session.instances.map(p=>[p.id,p])),parts=new Map(scene.parts.map(p=>[p.id,p]));
  if(current.size!==wanted.size||[...current].some(([id,p])=>wanted.get(id)?.part_ref!==p.part_ref))fail('场景库存与成品参考不一致。');
  const structures=sourceStructureRelations(scene),structureById=new Map(structures.map(s=>[s.id,s]));
  const matches=new Map();
  for(const c of candidates){
    if(c.unavailable_reason||c.source_configuration_ref&&c.source_configuration_ref!==target.configuration_ref)continue;const a=wanted.get(c.moving_instance_id),b=wanted.get(c.target_instance_id);if(!a||!b)continue;
    const expected=relative(b,a),published=matrixPose(new Matrix4().fromArray(c.relative_transform));
    if(!near(expected,published))continue;
    const key=pairKey(a.id,b.id);if(!matches.has(key))matches.set(key,[]);matches.get(key).push(c);
  }
  function agrees(c){
    if(c.endpoints?.length!==2)return false;const [a,b]=c.endpoints.map(e=>current.get(e.instance_id));if(!a||!b)return false;
    if(!near(relative(a,b),relative(wanted.get(a.id),wanted.get(b.id))))return false;
    if(c.source_structure_ref){const ref=structureById.get(c.source_structure_ref);return !!ref&&pairKey(...ref.owners.map(id=>'instance:'+id))===pairKey(a.id,b.id);}
    return (matches.get(pairKey(a.id,b.id))??[]).some(option=>option.endpoints.every(e=>c.endpoints.some(old=>endpointKey(old)===endpointKey(e)&&old.member_refs?.length===e.member_refs.length&&old.member_refs.every(m=>e.member_refs.includes(m)))));
  }
  const retained=session.connections.filter(agrees),removed=session.connections.filter(c=>!agrees(c)),connections=clone(retained);
  let groups=groupsFor(target.instances,connections),occupied=occupancyFor(connections);
  const joined=(a,b)=>groups.some(g=>g.instance_ids.includes(a)&&g.instance_ids.includes(b));
  const add=c=>{c.assembly_assessment=assessAssembly({observation:c.geometry,reference:true,policy:session.assembly_policy,configuration_ref:target.configuration_ref,mechanism:c.mechanism});c.mechanics=mechanicsNotEvaluated;connections.push(c);occupied=occupancyFor(connections);groups=groupsFor(target.instances,connections);};
  const options=[...matches.values()].flat().sort((a,b)=>b.member_count-a.member_count||a.id.localeCompare(b.id));
  for(const c of options){
    if(joined(c.moving_instance_id,c.target_instance_id)||c.endpoints.some(e=>blockedEndpoint(e,occupied)))continue;
    add({id:randomUUID(),name:c.title,mechanism:c.mechanism,status:'reference',endpoints:clone(c.endpoints),member_pairs:clone(c.member_pairs),candidate_id:c.id,relative_transform:c.relative_transform,anchors:[c.moving_anchor,c.target_anchor],
      source_kind:'reference_connection',source_configuration_ref:target.configuration_ref,source_candidate_ref:c.source_candidate_ref,source_match_ref:c.source_match_ref,source_alignment_check_refs:c.source_alignment_check_refs??[],source_evidence_refs:c.source_evidence_refs??[],
      conditions:[refCondition,...c.conditions],source_conditions:c.source_conditions??[],geometry:{status:'not_evaluated',method:'source-reference-presentation/1',checked_pairs:0},created_at:now});
  }
  for(const relation of structures){
    const ids=relation.owners.map(id=>'instance:'+id);if(joined(...ids))continue;
    const [a,b]=ids.map(id=>wanted.get(id));
    add({id:randomUUID(),name:relation.label+' · 来源结构参考',mechanism:'source_structure',status:'reference',source_kind:'source_structure',source_structure_ref:relation.id,source_body_refs:relation.body_refs,source_configuration_ref:target.configuration_ref,
      endpoints:ids.map(id=>({instance_id:id,interface_ref:null,interface_name:'来源模型结构',member_refs:[],resource_keys:[]})),member_pairs:[],relative_transform:matrix(b).invert().multiply(matrix(a)).toArray(),
      conditions:[refCondition,'仅按来源模型的刚性节点或父子层级归位，实际机械接口仍待补充。'],source_evidence_refs:relation.owners.flatMap(id=>parts.get(id).evidenceIds??[]),geometry:{status:'not_evaluated',method:'source-model-hierarchy/1',checked_pairs:0},created_at:now});
  }
  if(groups.length!==1)fail('当前 DKP 的来源结构未覆盖全部部件，不能生成完整成品演示。');
  const workflow=bearingAssemblyUnits({scene,bounds,instances:target.instances,retained,candidates:[...matches.values()].flat(),partDetails}),{components,units}=workflow;
  const componentFor=new Map(units.flatMap(g=>g.instance_ids.map(id=>[id,g]))),rootBody=scene.bodies.find(b=>!b.parent),rootPart=scene.parts.find(p=>p.body===rootBody?.name&&p.meshKey===rootBody?.name)??scene.parts.find(p=>p.body===rootBody?.name&&p.kind==='structure')??scene.parts[0],root=componentFor.get('instance:'+rootPart.id);
  const rank=g=>(g.bearing_plans.length?-1000000:0)+Math.min(...g.instance_ids.map(id=>{const p=parts.get(current.get(id).part_ref);return (p.kind==='shell'?1000000:0)+({torso:0,'left-leg':1,'right-leg':2,neck:3,head:4}[p.group]??5)*10000+({structure:0,actuator:1,bearing:2,electronics:3,shell:4}[p.kind]??5)*100+scene.parts.indexOf(p);}));
  const ordered=[root],placed=new Set(root.instance_ids);
  while(ordered.length<units.length){
    const frontier=units.filter(g=>!ordered.includes(g)&&connections.some(c=>c.endpoints.some(e=>g.instance_ids.includes(e.instance_id))&&c.endpoints.some(e=>placed.has(e.instance_id)))).sort((a,b)=>rank(a)-rank(b));
    if(!frontier.length)fail('成品参考关系不连续。');const next=frontier[0];ordered.push(next);for(const id of next.instance_ids)placed.add(id);
  }
  const working=new Map(clone(session.instances).map(p=>[p.id,p])),steps=[];
  const boxFor=(ids,map)=>{const box=new Box3();for(const id of ids){const p=map.get(id);box.union(transformedBounds(bounds[p.part_ref],p,parts.get(p.part_ref).scale));}return box;};
  const motion=(group,to,lift=.03)=>({instance_ids:group.instance_ids,poses:to,lift_m:lift});
  steps.push({kind:'establish',chapter:'装配序列',label:'扫描当前装配 · '+session.instances.length+' 个部件',duration_ms:1300,focus_ids:session.instances.map(p=>p.id),motions:[]});
  if(removed.length||workflow.opened.length){
    const involved=new Set([...removed,...workflow.opened].flatMap(c=>c.endpoints.map(e=>e.instance_id))),motions=[];
    const separated=components.filter(g=>g.instance_ids.some(id=>involved.has(id)));
    for(const [n,g]of separated.entries()){
      const angle=n/Math.max(1,separated.length)*Math.PI*2,delta=[Math.cos(angle)*.045,Math.sin(angle)*.045,.018],to=g.instance_ids.map(id=>{const p=working.get(id);return {...p,position:p.position.map((v,k)=>v+delta[k])};});motions.push(motion(g,to,.025));for(const p of to)working.set(p.id,p);
    }
    steps.push({kind:'detach',chapter:removed.length?'连接纠正':'打开装入空间',label:removed.length?'拆开 '+removed.length+' 条与成品参考不一致的连接':'临时打开遮挡轴承装入的结构，预装后合回',duration_ms:1600,focus_ids:[...involved],removed_connection_ids:removed.map(c=>c.id),access_opened_connection_ids:workflow.opened.map(c=>c.id),motions});
  }
  const footprint=target.bounds.clone().expandByVector(new Vector3(.028,.028,0)),obstacles=[footprint,...tableReservations(table)],staging=[],stations=new Map(),entries=new Map(),pending=new Set(workflow.plans.map(p=>p.bearing_id));let overflow=0;
  const parking=box=>{const center=box.getCenter(new Vector3()),spot=nearestTablePosition(box,obstacles,table,.008),delta=spot?new Vector3(spot.x-center.x,spot.y-center.y,spot.z):new Vector3(table.width*.6+(overflow%4)*.12-center.x,Math.floor(overflow++/4)*.12-center.y,.05-box.min.z);obstacles.push(box.clone().translate(delta));return delta;};
  const shifted=(ids,delta)=>ids.map(id=>{const p=wanted.get(id);return {...p,position:new Vector3().fromArray(p.position).add(delta).toArray()};});
  for(const g of [...units].sort((a,b)=>boxFor(b.instance_ids,wanted).getSize(new Vector3()).length()-boxFor(a.instance_ids,wanted).getSize(new Vector3()).length())){
    const reserve=boxFor(g.instance_ids,wanted);for(const p of g.bearing_plans){const entry=axialApproach(boxFor([p.bearing_id],wanted),boxFor([p.host_id],wanted),p.axis);entries.set(p.bearing_id,entry);reserve.union(entry.sweep);}
    const delta=parking(reserve);if(g.bearing_plans.length)delta.z+=.025;stations.set(g.id,delta);
    for(const component of components.filter(c=>g.instance_ids.includes(c.instance_ids[0])&&!pending.has(c.instance_ids[0]))){const to=shifted(component.instance_ids,delta);staging.push(motion(component,to,.045));for(const p of to)working.set(p.id,p);}
  }
  for(const p of workflow.plans){const component=components.find(g=>g.instance_ids.includes(p.bearing_id)),box=boxFor(component.instance_ids,working),delta=parking(box),to=component.instance_ids.map(id=>{const pose=working.get(id);return {...pose,position:new Vector3().fromArray(pose.position).add(delta).toArray()};});staging.push(motion(component,to,.045));for(const pose of to)working.set(pose.id,pose);}
  steps.push({kind:'stage',chapter:'装配准备',label:'展开承座与轴端 · 预留轴承装入空间',duration_ms:1800,focus_ids:session.instances.map(p=>p.id),motions:staging});
  for(const p of workflow.plans){
    const g=componentFor.get(p.bearing_id),to=shifted([p.bearing_id],stations.get(g.id)),bearing=parts.get(wanted.get(p.bearing_id).part_ref),host=parts.get(wanted.get(p.host_id).part_ref);
    steps.push({kind:'preassemble',chapter:'轴承预装',label:host.name+' · 同轴对准，沿轴线装入'+bearing.name,duration_ms:1450,focus_ids:[p.bearing_id,p.host_id],motions:[{...motion({instance_ids:[p.bearing_id]},to,.04),approach_offset_m:entries.get(p.bearing_id).offset.toArray(),insertion:{kind:'bearing_axial',bearing_instance_id:p.bearing_id,host_instance_id:p.host_id,axis:p.axis.toArray(),axis_interface_ref:p.axis_interface_ref,axis_member_ref:p.axis_member_ref,seat_interface_ref:p.seat_interface_ref,candidate_id:p.candidate_id}}]});
    for(const pose of to)working.set(pose.id,pose);
  }
  const assembled=new Set();
  for(const [n,g]of ordered.entries()){
    const part=parts.get(current.get(g.instance_ids.find(id=>parts.get(current.get(id).part_ref).kind!=='bearing')??g.instance_ids[0]).part_ref),bridge=connections.find(c=>c.endpoints.some(e=>g.instance_ids.includes(e.instance_id))&&c.endpoints.some(e=>assembled.has(e.instance_id))),fixed=bridge?.endpoints.find(e=>assembled.has(e.instance_id))?.instance_id;
    const to=g.instance_ids.map(id=>wanted.get(id));
    const axial=g.bearing_plans.find(p=>p.mates.some(id=>assembled.has(id))),mate=axial?.mates.find(id=>assembled.has(id)),entry=axial?axialApproach(boxFor(g.instance_ids,wanted),boxFor([mate],wanted),axial.axis):null;
    steps.push({kind:'join',chapter:part.groupLabel??'精密装配',label:g.bearing_plans.length?'安装轴承预装组合 · '+g.instance_ids.length+' 个部件':g.instance_ids.length>1?'安装已有组合 · '+g.instance_ids.length+' 个部件':'安装 · '+part.name,duration_ms:n===0?1200:Math.min(1500,900+g.instance_ids.length*55),focus_ids:[...g.instance_ids,...(fixed?[fixed]:[])],...(bridge?{connection_id:bridge.id}:{}),motions:[{...motion(g,to,.04),...(entry?{approach_offset_m:entry.offset.toArray(),approach_host_instance_id:mate}:{})}]});
    for(const id of g.instance_ids)assembled.add(id);
  }
  steps.push({kind:'reveal',chapter:'成品参考',label:'ASSEMBLY COMPLETE',duration_ms:4800,focus_ids:target.instances.map(p=>p.id),motions:[]});
  const report={mode:'reference',configuration_ref:target.configuration_ref,configuration_label:target.label,part_count:target.instances.length,retained_connection_count:retained.length,removed_connection_count:removed.length,bearing_preassembly_count:workflow.plans.length,access_opened_connection_count:workflow.opened.length,reference_connection_count:connections.filter(c=>c.status==='reference').length,structure_binding_count:connections.filter(c=>c.source_kind==='source_structure').length,geometry_status:'not_evaluated',completed_at:now};
  return {instances:target.instances,connections,reference_assembly:report,operation:{type:'auto_assemble',mode:'reference',steps,total_duration_ms:steps.reduce((n,s)=>n+s.duration_ms,0),report}};
}
