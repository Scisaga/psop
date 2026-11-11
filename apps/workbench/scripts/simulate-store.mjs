import {readFile,writeFile,mkdir,rename,unlink,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {availableParallelism} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {Matrix4,Quaternion,Vector3} from 'three';
import {findSnapshot,readPackageEntry} from './dkp.mjs';
import {SIMULATION_SCHEMA,CONTACT_EPSILON,fail,clone,validPose,matrix,matrixPose,registrationMatrix,groupsFor,groupFor,occupancyFor,blockedEndpoint,transformedBounds,transformGroup,boundsOverlap,layoutInstances,content,pushHistory,restoreHistory} from './simulate-core.mjs';
import {createSimulationGeometry,stlBounds,defaultGeometryCacheDirectory} from './simulate-geometry.mjs';
import {restingQuaternion,stlSupportAreas} from './simulate-resting-pose.mjs';
import {withReferencePairs,referenceBranches,hasPossibilities} from './simulate-reference.mjs';
import {tableFor,settleDisconnected} from './simulate-placement.mjs';
import {planAutomaticAssembly} from './simulate-auto-assembly.mjs';
import {createAssemblyProcessPool} from './simulate-process-pool.mjs';
import {sourceConfiguration,referenceConfigurations,inferConfiguration,atReferencePose} from './simulate-configuration.mjs';
import {DEFAULT_ASSEMBLY_POLICY,assemblyPolicy,policyDigest,assessAssembly,mechanicsNotEvaluated} from '../../../skills/psop-build/scripts/assembly-judgment.mjs';
import {INTERFACE_CONTACT_METHOD} from '../../../skills/psop-build/scripts/interface-contact.mjs';
import {sameConnectionPose,connectionChoiceTitle,connectionMechanismUnconfirmed,connectionMechanisms} from '../src/simulate-connection-options.mjs';
import {simulationInterfaceAdaptations} from './simulate-interface-adaptations.mjs';
import {INTERFACE_ADAPTATION_METHOD} from '../../../skills/psop-build/scripts/interface-adaptations.mjs';

const hash=v=>createHash('sha256').update(Buffer.isBuffer(v)?v:typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const decode=raw=>JSON.parse((raw[0]===31&&raw[1]===139?gunzipSync(raw):raw).toString('utf8'));
const names={through_fastener:'穿孔紧固',screw_reception:'螺钉承接',shaft_bore:'轴孔配合',pin_hole:'柱孔定位',planar_seating:'平面贴合',snap_fit:'卡扣配合',keyed_profile:'轮廓配合',bearing_seating:'轴承承座'};
const mean=ps=>[0,1,2].map(k=>ps.reduce((v,p)=>v+p[k],0)/ps.length);
const contactGeometry=g=>g.type==='triangle_patch'?{type:g.type,triangles:g.triangles}:g.type==='oriented_box'?{type:g.type,origin:g.origin,axes:g.axes,ranges:g.ranges,basis:g.basis,source_interface_ref:g.source_interface_ref}:{type:g.type,origin:g.origin,axis:g.axis,axial_range_m:g.axial_range_m??[0,g.length_m],...(g.type==='cylinder'?{radius_m:g.radius_m}:{radius_start_m:g.radius_start_m,radius_end_m:g.radius_end_m})};
const contactFor=features=>features?.length===2&&features.every(side=>side.length&&side.every(g=>g&&['cylinder','conical_frustum','triangle_patch','oriented_box'].includes(g.type)))?{features:features.map(side=>side.map(contactGeometry).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))),comparison_margin_m:4e-5}:null;
export async function replaceSessionFile(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{await mkdir(path.dirname(file),{recursive:true});await writeFile(temp,JSON.stringify(value)+'\n',{encoding:'utf8',flag:'wx'});await rename(temp,file);}catch{fail('场景保存失败，已保留上次完整状态，请重试。',503);}finally{await unlink(temp).catch(()=>{});}}
function view(session){return {...Object.fromEntries(Object.entries(session).filter(([k])=>!['past','future','requests','create_request_id'].includes(k))),groups:groupsFor(session.instances,session.connections),can_undo:session.past.length>0,can_redo:session.future.length>0,history:session.past.map((h,i)=>({id:i,label:h.label}))};}
function resourceRefs(detail,interfaceRef,members,features){
  const i=detail.interfaces.find(i=>i.id===interfaceRef);if(!i)fail('候选接口缺少完整定义。');
  const byFeature=new Map(detail.features.map(f=>[f.id,f])),keys=new Set();
  const visit=(ref,seen=new Set())=>{if(seen.has(ref))return;seen.add(ref);const f=byFeature.get(ref);keys.add('feature:'+ref);for(const r of [f?.resource_ref,...(f?.capability?.resource_refs??[])].filter(Boolean))keys.add('resource:'+r);for(const r of f?.replacement_feature_refs??[])visit(r,seen);};
  for(const ref of features)visit(ref);
  if(i.members.every(m=>members.includes(m.id)))for(const r of i.resource_refs??[])keys.add('resource:'+r);
  for(const m of i.members.filter(m=>members.includes(m.id))){if(m.resource_ref)keys.add('resource:'+m.resource_ref);for(const ref of m.feature_refs)visit(ref);}
  return {interface_ref:interfaceRef,interface_name:i.name,member_refs:members,resource_refs:[...keys].sort()};
}

export function createSimulationStore({registryFile,load=findSnapshot,read=readPackageEntry,geometry=createSimulationGeometry({workers:Math.min(4,Math.max(1,availableParallelism()-2)),cacheDirectory:defaultGeometryCacheDirectory}),persist=replaceSessionFile}={}){
  const contexts=new Map(),queues=new Map(),assessments=new Map(),measuredAssessments=new Map(),qualifications=new Map(),processes=createAssemblyProcessPool();
  const present=(ctx,s)=>({...view(s),reference_configurations:referenceConfigurations(ctx.scene)});
  async function context(workspace,snapshot){
    const key=JSON.stringify([workspace,snapshot]);if(contexts.has(key))return contexts.get(key);
    const pending=(async()=>{
      const bundle=await load(workspace,snapshot,registryFile),scene=decode(await read(bundle,bundle.manifest.entrypoints.scene));
      const partMap=new Map(scene.parts.map(p=>[p.id,p])),capability=scene.assembly?.capability_index;
      const index=withReferencePairs(scene,capability?.compatibility?.index_path?decode(await read(bundle,capability.compatibility.index_path)):{pairs:[]});
      const pairsByOwner=new Map();for(const pair of index.pairs.filter(hasPossibilities))for(const owner of pair.owner_refs){if(!pairsByOwner.has(owner))pairsByOwner.set(owner,[]);pairsByOwner.get(owner).push(pair);}
      const meshes=new Map(),bounds={},sources={},orientations={};
      for(const part of scene.parts){
        if(!meshes.has(part.geometryUrl)){const bytes=await read(bundle,part.geometryUrl),local=stlBounds(bytes);meshes.set(part.geometryUrl,{bytes,bounds:local,supportAreas:stlSupportAreas(bytes,local),path:path.join(bundle.root,...part.geometryUrl.split('/')),sha256:hash(bytes)});}
        const m=meshes.get(part.geometryUrl);bounds[part.id]=m.bounds;sources[part.id]={path:m.path,sha256:m.sha256};orientations[part.id]=restingQuaternion(part,m.bounds,m.supportAreas);
      }
      const ctx={bundle,scene,partMap,capability,index,pairsByOwner,bounds,orientations,table:tableFor(scene.parts,bounds,orientations),sources,meshes,details:new Map(),pairs:new Map(),interfaceRows:new Map(),relations:new Map(),workspace,snapshot};
      const adaptations=await simulationInterfaceAdaptations({scene,bundle,read,meshes,...(read!==readPackageEntry?{customRead:owner=>detail(ctx,owner)}:{})});ctx.adaptations=new Map(adaptations.fits.map(f=>[f.id,f]));
      const byOwners=new Map(index.pairs.map(p=>[[...p.owner_refs].sort().join('|'),p]));
      for(const fit of adaptations.fits){const key=[...fit.owner_refs].sort().join('|');let pair=byOwners.get(key);if(!pair){pair={id:'adaptation-pair:'+hash(key),owner_refs:fit.owner_refs,candidate_count:0};index.pairs.push(pair);byOwners.set(key,pair);}if(!pair.interface_adaptations){pair.interface_adaptations=[];if(!hasPossibilities(pair))for(const owner of pair.owner_refs){if(!pairsByOwner.has(owner))pairsByOwner.set(owner,[]);pairsByOwner.get(owner).push(pair);}}pair.interface_adaptations.push(fit.id);}
      return ctx;
    })();contexts.set(key,pending);pending.catch(()=>contexts.delete(key));return pending;
  }
  function directory(ctx){return path.join(path.dirname(registryFile),'state',hash(ctx.workspace),'simulate',hash(ctx.snapshot),ctx.bundle.manifest.package_digest);}
  function location(ctx,id){if(typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id))fail('场景标识无效。');return path.join(directory(ctx),id+'.json');}
  async function locked(key,operation){const previous=queues.get(key)??Promise.resolve();const next=previous.catch(()=>{}).then(operation);queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}}
  async function sessionAt(ctx,id){
    let s;try{s=JSON.parse(await readFile(location(ctx,id),'utf8'));}catch(e){if(e.code==='ENOENT')fail('场景不存在。',404);throw e;}
    if(s.schema!==SIMULATION_SCHEMA||s.package_digest!==ctx.bundle.manifest.package_digest||s.workspace_id!==ctx.workspace||s.snapshot_id!==ctx.snapshot||s.id!==id||!Number.isSafeInteger(s.revision)||!Array.isArray(s.instances)||!Array.isArray(s.connections)||!Array.isArray(s.past)||!Array.isArray(s.future)||!Array.isArray(s.requests))fail('场景数据与当前知识版本不一致。');
    if(s.instances.length!==ctx.scene.parts.length||new Set(s.instances.map(p=>p.id)).size!==s.instances.length||new Set(s.instances.map(p=>p.part_ref)).size!==s.instances.length)fail('场景部件身份或数量无效。');
    for(const p of s.instances){if(!ctx.partMap.has(p.part_ref)||p.id!=='instance:'+p.part_ref)fail('场景引用了未知来源部件。');validPose(p);}
    groupsFor(s.instances,s.connections);occupancyFor(s.connections);
    s.reference_configuration_ref=inferConfiguration(ctx.scene,s);s.assembly_policy=assemblyPolicy(s.assembly_policy??ctx.index.assembly_policy??DEFAULT_ASSEMBLY_POLICY);return s;
  }
  async function detail(ctx,owner){if(!ctx.details.has(owner))ctx.details.set(owner,(async()=>{const entry=ctx.capability?.parts[owner];return entry?decode(await read(ctx.bundle,entry.path)):{features:[],interfaces:[]};})());return ctx.details.get(owner);}
  async function pairBranches(ctx,pair){
    if(ctx.pairs.has(pair.id))return ctx.pairs.get(pair.id);
    const pending=(async()=>{
      const data=pair.path?decode(await read(ctx.bundle,pair.path)):{candidates:[]},details=await Promise.all(pair.owner_refs.map(o=>detail(ctx,o))),branches=[];
      for(const candidate of data.candidates??[])for(const match of candidate.interface_matches??[])for(const option of match.alignment_options??[]){
        if(!option.registration?.whole_part_collision_evaluated||option.assembly_assessment?.decision==='block')continue;
        if(option.interference?.status!=='clear'&&!option.assembly_assessment)continue;
        const pairs=option.member_pairs;if(!pairs?.length)continue;
        const endpoints=['a','b'].map((side,n)=>resourceRefs(details[n],match['interface_'+side+'_ref'],[...new Set(pairs.map(p=>p['member_'+side+'_ref']))],[...new Set(pairs.map(p=>p['feature_'+side+'_ref']))]));
        const mechanism=candidate.template_ref?.split(':')[1]??candidate.kind??'assembly';
        const key=hash([candidate.id,match.id,option.registration,option.member_pairs]);
        branches.push({key,owners:pair.owner_refs,endpoints,mechanism,title:names[mechanism]??candidate.name??'接口连接',member_count:match.member_count,registration:option.registration,
          anchors:['a','b'].map(side=>mean(pairs.map(p=>p['contact_'+side]??p['position_'+side]))),
          marker_points:['a','b'].map(side=>pairs.map(p=>p['contact_'+side]??p['position_'+side])),member_pairs:pairs,
          contact_features:['a','b'].map((side,n)=>[...new Set(pairs.map(p=>p['feature_'+side+'_ref']))].sort().map(ref=>details[n].features.find(f=>f.id===ref)?.geometry)),
          conditions:['保持与承载尚未核定',...((candidate.connector_requirements?.length||mechanism.includes('fastener')||mechanism.includes('screw'))?['标准连接件规格待补充']:[])],
          geometry:option.interference,assembly_assessment:option.assembly_assessment,source_candidate_ref:candidate.id,source_match_ref:match.id,source_evidence_refs:match.evidence_refs??[],source_conditions:candidate.unresolved_conditions??[],connector_requirements:candidate.connector_requirements??[]});
      }
      branches.push(...referenceBranches(ctx.scene,pair,details,resourceRefs));
      for(const id of pair.interface_adaptations??[]){const fit=ctx.adaptations.get(id);branches.push({key:hash([id,fit.registration]),owners:pair.owner_refs,endpoints:fit.endpoints.map((e,n)=>resourceRefs(details[n],e.interface_ref,e.member_refs,details[n].interfaces.find(i=>i.id===e.interface_ref).members.filter(m=>e.member_refs.includes(m.id)).flatMap(m=>m.feature_refs))),mechanism:'interface_adaptation',title:'接口适配 · '+fit.title,member_count:Math.min(...fit.endpoints.map(e=>e.member_refs.length)),registration:fit.registration,anchors:fit.anchors,marker_points:fit.marker_points,member_pairs:fit.member_pairs,contact_features:fit.contact_features,conditions:fit.conditions,source_kind:'compatibility',source_candidate_ref:id,source_match_ref:id,source_evidence_refs:fit.evidence_refs,source_conditions:fit.source_conditions??fit.conditions,interface_adaptation:{method:INTERFACE_ADAPTATION_METHOD,source_connection_refs:fit.source_connection_refs,equivalence_refs:fit.equivalence_refs,...(fit.interface_fit_hypothesis_refs?.length?{interface_fit_hypothesis_refs:fit.interface_fit_hypothesis_refs,adaptation_kind:fit.adaptation_kind,surface_conformity:fit.surface_conformity}:{} )}});}
      return branches;
    })();ctx.pairs.set(pair.id,pending);pending.catch(()=>ctx.pairs.delete(pair.id));return pending;
  }
  function candidateFor(branch,moving,target){
    const movingSide=branch.owners.indexOf(moving.part_ref),targetSide=1-movingSide;
    const transform=registrationMatrix(branch.registration);if(movingSide===0)transform.invert();
    const ends=[moving,target].map((p,n)=>{const e=branch.endpoints[n===0?movingSide:targetSide];return {...e,instance_id:p.id,resource_keys:e.resource_refs.map(r=>p.id+'|'+r)};});
    return {id:'candidate:'+hash([branch.key,moving.id,target.id]),branch_key:branch.key,moving_instance_id:moving.id,target_instance_id:target.id,
      title:branch.title,mechanism:branch.mechanism,geometry:branch.geometry??null,unavailable_reason:branch.unavailable_reason??null,source_configuration_label:branch.source_configuration_label??null,source_alignment_check_refs:branch.source_alignment_check_refs??[],source_kind:branch.source_kind??'compatibility',source_configuration_ref:branch.source_configuration_ref??null,whole_part_collision_evaluated:branch.registration.whole_part_collision_evaluated,member_count:branch.member_count,endpoints:ends,relative_transform:transform.toArray(),
      moving_anchor:branch.anchors[movingSide],target_anchor:branch.anchors[targetSide],marker_points:[branch.marker_points[movingSide],branch.marker_points[targetSide]],
      geometry_source_owner_refs:branch.owners,
      contact_features:contactFor(branch.contact_features?[branch.contact_features[movingSide],branch.contact_features[targetSide]]:undefined)?.features,
      member_pairs:branch.member_pairs.map(p=>({moving_member_ref:p['member_'+(movingSide===0?'a':'b')+'_ref'],target_member_ref:p['member_'+(targetSide===0?'a':'b')+'_ref'],moving_feature_ref:p['feature_'+(movingSide===0?'a':'b')+'_ref'],target_feature_ref:p['feature_'+(targetSide===0?'a':'b')+'_ref']})),conditions:branch.conditions,source_candidate_ref:branch.source_candidate_ref,source_match_ref:branch.source_match_ref,
      source_evidence_refs:branch.source_evidence_refs,source_conditions:branch.source_conditions,connector_requirements:branch.connector_requirements??[],...(branch.interface_adaptation?{interface_adaptation:branch.interface_adaptation}:{}),comparison_margin_m:branch.registration.comparison_margin_m??4e-5};
  }
  async function interfaceRows(ctx,owner){
    if(!ctx.interfaceRows.has(owner))ctx.interfaceRows.set(owner,(async()=>{const d=await detail(ctx,owner);return d.interfaces.map(i=>({id:i.id,name:i.name,member_count:i.members.length,modes:i.modes??[],position:i.members.length?mean(i.members.map(m=>m.position)):[0,0,0],resource_refs:resourceRefs(d,i.id,i.members.map(m=>m.id),[]).resource_refs}));})());
    return ctx.interfaceRows.get(owner);
  }
  async function pairRelations(ctx,pair){
    if(!ctx.relations.has(pair.id))ctx.relations.set(pair.id,(async()=>{
      const relations=new Map();for(const b of await pairBranches(ctx,pair)){
        const endpoints=b.endpoints.map((e,n)=>({...e,instance_id:'instance:'+b.owners[n],resource_keys:e.resource_refs.map(r=>'instance:'+b.owners[n]+'|'+r)})),key=JSON.stringify([b.source_configuration_ref??null,b.unavailable_reason??null,endpoints]);
        if(!relations.has(key))relations.set(key,{endpoints,configuration_ref:b.source_configuration_ref,unavailable_reason:b.unavailable_reason});
      }return [...relations.values()];
    })());return ctx.relations.get(pair.id);
  }
  async function catalog(ctx,s,input,occupied,partInstances){
    const chosen=new Set(groupFor(s,input.instance_id).instance_ids),selectedParts=new Set(s.instances.filter(p=>chosen.has(p.id)).map(p=>p.part_ref)),pairs=[...new Map([...selectedParts].flatMap(o=>ctx.pairsByOwner.get(o)??[]).map(p=>[p.id,p])).values()],targets=new Set(),relations=new Map();
    for(const pair of pairs){
      const a=partInstances.get(pair.owner_refs[0]),b=partInstances.get(pair.owner_refs[1]);if(!a||!b)continue;
      const moving=chosen.has(a.id)?a:b,target=moving===a?b:a;targets.add(target.id);
      if(!input.include_relations)continue;
      for(const relation of await pairRelations(ctx,pair)){
        if(relation.configuration_ref&&relation.configuration_ref!==s.reference_configuration_ref)continue;
        const endpoint=relation.endpoints.find(e=>e.instance_id===moving.id),other=relation.endpoints.find(e=>e.instance_id===target.id),key=endpoint.instance_id+'|'+endpoint.interface_ref,targetKey=other.instance_id+'|'+other.interface_ref;
        if(!relations.has(key))relations.set(key,new Map());const linked=relations.get(key),available=!relation.endpoints.some(e=>blockedEndpoint(e,occupied));
        if(!linked.has(targetKey))linked.set(targetKey,{instance_id:other.instance_id,interface_ref:other.interface_ref,interface_name:other.interface_name,option_count:0,available:false,selection_required:false,qualification:'pending'});
        const record=linked.get(targetKey);record.available ||= available;record.selection_required ||= !!relation.unavailable_reason;
      }
    }
    const interfaces=[];for(const p of s.instances.filter(p=>chosen.has(p.id)))for(const row of await interfaceRows(ctx,p.part_ref)){
      const {resource_refs,...data}=row,endpoint={instance_id:p.id,interface_ref:row.id,resource_keys:resource_refs.map(r=>p.id+'|'+r)};
      interfaces.push({...data,instance_id:p.id,occupied:blockedEndpoint(endpoint,occupied),related:[...(relations.get(p.id+'|'+row.id)?.values()??[])]});
    }
    return {revision:s.revision,complete:true,basis:ctx.adaptations.size?'published_and_derived_interface_index':'published_interface_index',relations_complete:!!input.include_relations,targets:[...targets].map(instance_id=>({instance_id,qualification:'pending'})),interfaces};
  }
  async function qualifyBranch(ctx,b,s){
    const contact=contactFor(b.contact_features);if(b.source_kind==='reference_connection'||b.geometry?.status==='clear'||!contact||b.owners.some(o=>ctx.partMap.get(o).scale?.some(n=>Math.abs(n-1)>1e-10)))return b;
    contact.stop_after_obstruction_m=s.assembly_policy.unrelated_obstacle_depth_m;
    const key=hash([ctx.bundle.manifest.package_digest,b.key,s.reference_configuration_ref,policyDigest(s.assembly_policy)]);
    if(!qualifications.has(key)){
      const pending=(async()=>{
        const observation=b.geometry?.diagnostics?.interface_contact?.method===INTERFACE_CONTACT_METHOD?b.geometry:await geometry.evaluate({a:ctx.sources[b.owners[0]],b:ctx.sources[b.owners[1]],r:b.registration.rotation_b_to_a,t:b.registration.translation_b_to_a,interface_contact:contact,source_observation:b.geometry});
        const assessment=assessAssembly({observation,policy:s.assembly_policy,expected_contact:true,mechanism:b.mechanism,configuration_ref:s.reference_configuration_ref});
        if(observation.status==='unresolved')qualifications.delete(key);
        return {...b,geometry:observation,assembly_assessment:assessment};
      })();qualifications.set(key,pending);if(qualifications.size>2048)qualifications.delete(qualifications.keys().next().value);
    }
    return qualifications.get(key);
  }
  async function selectedBranches(ctx,pair,s){const branches=(await pairBranches(ctx,pair)).filter(b=>!b.source_configuration_ref||b.source_configuration_ref===s.reference_configuration_ref);return (await Promise.all(branches.map(b=>qualifyBranch(ctx,b,s)))).filter(b=>b.assembly_assessment?.decision!=='block');}
  async function findCandidate(ctx,s,input){
    const moving=s.instances.find(p=>p.id===input.moving_instance_id),target=s.instances.find(p=>p.id===input.target_instance_id);if(!moving||!target||moving.id===target.id)fail('请选择两个不同部件的接口。');
    const pair=ctx.index.pairs.find(p=>hasPossibilities(p)&&p.owner_refs.includes(moving.part_ref)&&p.owner_refs.includes(target.part_ref));if(!pair)fail('这两个部件没有可提交的接口姿态。');
    const branches=(await pairBranches(ctx,pair)).filter(b=>!b.source_configuration_ref||b.source_configuration_ref===s.reference_configuration_ref),branch=branches.find(b=>candidateFor(b,moving,target).id===input.candidate_id);if(!branch)fail('连接方式已失效，请重新选择。',409);
    const c=candidateFor(await qualifyBranch(ctx,branch,s),moving,target);
    const occupied=occupancyFor(s.connections);if(c.endpoints.some(e=>blockedEndpoint(e,occupied)))fail('接口或共享孔道已被其他连接使用。',409);return c;
  }
  async function check(ctx,s,c,detailed=false){
    const baseKey=hash([ctx.bundle.manifest.package_digest,s.id,s.revision,s.reference_configuration_ref,policyDigest(s.assembly_policy),c.id,c.mechanism]),key=baseKey+':'+detailed;
    if(!detailed&&measuredAssessments.has(baseKey))return clone(measuredAssessments.get(baseKey));
    if(assessments.has(key))return clone(await assessments.get(key));
    const pending=checkUncached(ctx,s,c,detailed);assessments.set(key,pending);if(assessments.size>2048)assessments.delete(assessments.keys().next().value);
    try{const value=await pending;const incomplete=value.geometry?.status==='unresolved'||value.geometry?.observations?.some(o=>o.diagnostics?.status==='not_evaluated');if(incomplete)assessments.delete(key);else if(detailed){measuredAssessments.set(baseKey,value);if(measuredAssessments.size>512)measuredAssessments.delete(measuredAssessments.keys().next().value);}return clone(value);}catch(error){assessments.delete(key);throw error;}
  }
  async function checkUncached(ctx,s,c,detailed){
    const observations=[];
    const assess=values=>assessAssembly({policy:s.assembly_policy,configuration_ref:s.reference_configuration_ref,mechanism:c.mechanism,...values});
    const reject=(reason,code,status='blocked')=>({status,reason,poses:[],checked_pairs:0,geometry:{status:'not_evaluated',checked_pairs:0,observations},assembly_assessment:assess({independent_block:code}),mechanics:mechanicsNotEvaluated});
    if(c.unavailable_reason)return reject(c.unavailable_reason,'member_selection_required','unresolved');
    const started=performance.now(),moving=s.instances.find(p=>p.id===c.moving_instance_id),target=s.instances.find(p=>p.id===c.target_instance_id),group=groupFor(s,moving.id);
    const wanted=matrix(target).multiply(new Matrix4().fromArray(c.relative_transform));
    let instances;
    if(group.instance_ids.includes(target.id)){
      const actual=matrix(moving),p1=new Vector3(),p2=new Vector3(),q1=new Quaternion(),q2=new Quaternion(),scale=new Vector3();actual.decompose(p1,q1,scale);wanted.decompose(p2,q2,scale);
      if(p1.distanceTo(p2)>c.comparison_margin_m||q1.angleTo(q2)>1e-4)return reject('同一组合内的接口尚未对齐；请先拆开再调整。','inconsistent_loop_closure');
      instances=clone(s.instances);
    }else instances=transformGroup(s,moving.id,wanted.multiply(matrix(moving).invert()));
    const movingIds=new Set(group.instance_ids),targetGroup=groupFor(s,target.id),mergedIds=new Set([...movingIds,...targetGroup.instance_ids]),changed=new Set(movingIds);
    let boxes=new Map(instances.map(p=>[p.id,transformedBounds(ctx.bounds[p.part_ref],p,ctx.partMap.get(p.part_ref).scale)])),tableLift;
    const minZ=Math.min(...[...mergedIds].map(id=>boxes.get(id).min.z));
    if(minZ < -CONTACT_EPSILON){
      // Table placement changes the merged assembly's world pose, never its internal registration.
      const lift=.0002-minZ;
      tableLift={translation:[0,0,lift],instance_ids:[...mergedIds],target_instance_ids:targetGroup.instance_ids.filter(id=>!movingIds.has(id))};
      instances=instances.map(p=>{if(!mergedIds.has(p.id))return p;const next={...p,position:[p.position[0],p.position[1],p.position[2]+lift]};validPose(next);changed.add(p.id);return next;});
      boxes=new Map(instances.map(p=>[p.id,transformedBounds(ctx.bounds[p.part_ref],p,ctx.partMap.get(p.part_ref).scale)]));
    }
    let checked=0,disjoint=0;
    // Both sides may now move. Still check every new relationship across the original groups.
    const pairsToCheck=instances.filter(p=>movingIds.has(p.id)).flatMap(a=>instances.filter(p=>!movingIds.has(p.id)).map(b=>[a,b]));
    if(tableLift)pairsToCheck.push(...instances.filter(p=>mergedIds.has(p.id)&&!movingIds.has(p.id)).flatMap(a=>instances.filter(p=>!mergedIds.has(p.id)).map(b=>[a,b])));
    if(movingIds.has(target.id))pairsToCheck.push([instances.find(p=>p.id===moving.id),instances.find(p=>p.id===target.id)]);
    async function observe(a,b,diagnostics=true,interfaceContact=null){
      if([a,b].some(p=>ctx.partMap.get(p.part_ref).scale?.some(n=>Math.abs(n-1)>1e-10)))return {status:'unresolved',reason:'non_unit_source_scale'};
      const e=matrix(a).invert().multiply(matrix(b)).elements;
      const input={a:ctx.sources[a.part_ref],b:ctx.sources[b.part_ref],r:[[e[0],e[4],e[8]],[e[1],e[5],e[9]],[e[2],e[6],e[10]]],t:[e[12],e[13],e[14]],diagnostics,...(interfaceContact?{interface_contact:interfaceContact}:{})};
      const result=await geometry.evaluate(input);
      if(diagnostics&&!interfaceContact&&result.status==='unresolved'){const raw=await geometry.evaluate({...input,diagnostics:false});if(raw.status!=='unresolved')return {...raw,diagnostics:{schema:'psop.solid-contact-diagnostics/1',status:'not_evaluated',reason:result.reason}};}
      return result;
    }
    for(const [a,b] of pairsToCheck){
      if(!boundsOverlap(boxes.get(a.id),boxes.get(b.id))){disjoint++;continue;}
      const direct=[a.id,b.id].includes(moving.id)&&[a.id,b.id].includes(target.id),reference=c.source_kind==='reference_connection'&&atReferencePose(ctx.scene,s.reference_configuration_ref,a,b);
      const published=direct&&c.whole_part_collision_evaluated&&c.geometry;
      const contact=direct&&!reference?contactFor(a.id===moving.id?c.contact_features:c.contact_features?.slice().reverse()):null,qualified=!contact||c.geometry?.status==='clear'||c.geometry?.diagnostics?.interface_contact?.method===INTERFACE_CONTACT_METHOD;
      if(contact&&!detailed)contact.stop_after_obstruction_m=s.assembly_policy.unrelated_obstacle_depth_m;
      const usePublished=published&&qualified&&(!detailed||c.geometry.status==='clear'),result=usePublished?clone(c.geometry):await observe(a,b,contact?detailed:!reference||detailed,contact);checked++;
      let baseline=null;
      if(!direct&&!reference&&result.status==='interference'){
        const oldA=s.instances.find(p=>p.id===a.id),oldB=s.instances.find(p=>p.id===b.id);
        baseline=boundsOverlap(transformedBounds(ctx.bounds[oldA.part_ref],oldA,ctx.partMap.get(oldA.part_ref).scale),transformedBounds(ctx.bounds[oldB.part_ref],oldB,ctx.partMap.get(oldB.part_ref).scale))?await observe(oldA,oldB):{status:'clear',proof:'disjoint_initial_source_bounds'};
      }
      const assessment=assess({observation:result,reference,expected_contact:direct,baseline});
      observations.push({instance_a:a.id,instance_b:b.id,...result,geometry_source_instance_ids:usePublished?c.geometry_source_owner_refs.map(ref=>'instance:'+ref):[a.id,b.id],assembly_assessment:assessment,...(baseline?{baseline}: {})});
      if(assessment.decision==='block'){
        const outside=assessment.reasons.includes('penetration_outside_interface_contact_region'),depth=outside?result.diagnostics.interface_contact.witnesses[0].depth_m:result.diagnostics.sampled_penetration_depth_m;
        return {...reject(`${ctx.partMap.get(a.part_ref).name} 与 ${ctx.partMap.get(b.part_ref).name} ${outside?'在接口接触区之外发生实体穿入，此安装方向已排除':'新增或加深穿入无关部件'}（采样深度 ${Number((depth*1000).toPrecision(3))} mm）。`,outside?'penetration_outside_interface_contact_region':'new_or_worsened_unrelated_obstacle'),checked_pairs:checked,geometry:{status:result.status,checked_pairs:checked,observations},collision:observations.at(-1)};
      }
    }
    const rawStatus=observations.some(o=>o.status==='interference')?'interference':observations.some(o=>!['clear'].includes(o.status))?'unresolved':'clear';
    const noted=observations.find(o=>o.assembly_assessment.decision==='allow_with_note');
    const assessment=noted?{...noted.assembly_assessment,reasons:[...new Set(observations.flatMap(o=>o.assembly_assessment.reasons))]}:assess({observation:{status:'clear'}});
    return {status:'ready',poses:instances.filter(p=>changed.has(p.id)),...(tableLift?{table_lift:tableLift}:{}),checked_pairs:checked,disjoint_pairs:disjoint,duration_ms:performance.now()-started,conditions:c.conditions,
      geometry:{status:rawStatus,method:'closed-source-solid-interference/2',checked_pairs:checked,disjoint_pairs:disjoint,observations},assembly_assessment:assessment,mechanics:mechanicsNotEvaluated};
  }
  function sameRevision(s,input){if(input.expected_revision!==s.revision)fail('场景已更新，已恢复最新状态，请重新操作。',409);}
  async function list(workspace,snapshot){const ctx=await context(workspace,snapshot);let files;try{files=await readdir(directory(ctx));}catch(e){if(e.code==='ENOENT')return {sessions:[]};throw e;}const sessions=[];for(const file of files.filter(f=>/^[a-z0-9-]+\.json$/i.test(f))){const s=await sessionAt(ctx,file.slice(0,-5));sessions.push({id:s.id,name:s.name,revision:s.revision,updated_at:s.updated_at,created_at:s.created_at,part_count:s.instances.length,connection_count:s.connections.length});}return {sessions:sessions.sort((a,b)=>b.updated_at.localeCompare(a.updated_at))};}
  async function create(workspace,snapshot,input={}){const ctx=await context(workspace,snapshot);return locked(directory(ctx),async()=>{
    const id=input.request_id??randomUUID(),file=location(ctx,id);try{return present(ctx,await sessionAt(ctx,id));}catch(e){if(e.status!==404)throw e;}
    const source=input.copy_from?await sessionAt(ctx,input.copy_from):null,now=new Date().toISOString();
    const name=String(input.name??(source?source.name+' · 副本':'装配方案')).trim();if(!name||name.length>100)fail('场景名称应为 1–100 个字。');
    const s={schema:SIMULATION_SCHEMA,id,name,workspace_id:workspace,snapshot_id:snapshot,package_id:ctx.bundle.manifest.package_id,package_digest:ctx.bundle.manifest.package_digest,revision:0,created_at:now,updated_at:now,
      ...(source?content(source):{instances:layoutInstances(ctx.scene.parts,ctx.bounds,ctx.orientations),connections:[],reference_configuration_ref:sourceConfiguration(ctx.scene),assembly_policy:assemblyPolicy(ctx.index.assembly_policy??DEFAULT_ASSEMBLY_POLICY)}),past:[],future:[],requests:[]};await persist(file,s);return present(ctx,s);
  });}
  async function get(workspace,snapshot,id){const ctx=await context(workspace,snapshot),s=await sessionAt(ctx,id);return {...present(ctx,s),bounds:ctx.bounds,table:ctx.table};}
  async function candidates(workspace,snapshot,id,input){
    const ctx=await context(workspace,snapshot),s=await sessionAt(ctx,id);sameRevision(s,input);const occupied=occupancyFor(s.connections),partInstances=new Map(s.instances.map(p=>[p.part_ref,p]));
    if(input.scope==='catalog')return catalog(ctx,s,input,occupied,partInstances);
    if(input.scope==='scene'){
      if(s.instances.length>1&&groupsFor(s.instances,s.connections).length===1)return {revision:s.revision,complete:true,status:'all_assembled'};
      let pending=false;for(const pair of ctx.index.pairs.filter(hasPossibilities)){const a=partInstances.get(pair.owner_refs[0]),b=partInstances.get(pair.owner_refs[1]);if(!a||!b)continue;const relations=(await pairRelations(ctx,pair)).filter(r=>!r.configuration_ref||r.configuration_ref===s.reference_configuration_ref);if(!relations.length)pending=true;for(const relation of relations)if(!relation.endpoints.some(e=>blockedEndpoint(e,occupied)))return {revision:s.revision,complete:true,status:'potential_connections',basis:'published_interface_index',qualification:'pending'};}
      return {revision:s.revision,complete:true,status:pending?'conditions_pending':'no_available_connections'};
    }
    const selected=groupFor(s,input.instance_id),chosen=new Set(selected.instance_ids);
    const selectedParts=new Set(s.instances.filter(p=>chosen.has(p.id)).map(p=>p.part_ref));
    const pairs=[...new Map([...selectedParts].flatMap(o=>ctx.pairsByOwner.get(o)??[]).map(p=>[p.id,p])).values()];const result=[],relations=new Map();let blocked=0;
    for(const pair of pairs){const a=partInstances.get(pair.owner_refs[0]),b=partInstances.get(pair.owner_refs[1]);if(!a||!b)continue;const moving=chosen.has(a.id)?a:b,target=moving===a?b:a;if(input.target_instance_id&&!groupFor(s,input.target_instance_id).instance_ids.includes(target.id))continue;
      for(const branch of await selectedBranches(ctx,pair,s)){const c=candidateFor(branch,moving,target),available=!c.endpoints.some(e=>blockedEndpoint(e,occupied));
        const endpoint=c.endpoints[0],other=c.endpoints[1],key=endpoint.instance_id+'|'+endpoint.interface_ref;
        if(!relations.has(key))relations.set(key,new Map());const related=relations.get(key),targetKey=other.instance_id+'|'+other.interface_ref;
        if(!related.has(targetKey))related.set(targetKey,{instance_id:other.instance_id,interface_ref:other.interface_ref,interface_name:other.interface_name,option_count:0,available:false,selection_required:false});
        const relation=related.get(targetKey);relation.option_count++;relation.available ||= available;relation.selection_required ||= !!c.unavailable_reason;
        if(!available){blocked++;continue;}result.push(c);}
    }
    const interfaces=[];for(const p of s.instances.filter(p=>chosen.has(p.id))){const d=await detail(ctx,p.part_ref);for(const i of d.interfaces){const refs=resourceRefs(d,i.id,i.members.map(m=>m.id),[]),endpoint={instance_id:p.id,interface_ref:i.id,resource_keys:refs.resource_refs.map(r=>p.id+'|'+r)};interfaces.push({id:i.id,instance_id:p.id,name:i.name,member_count:i.members.length,modes:i.modes??[],related:[...(relations.get(p.id+'|'+i.id)?.values()??[])],occupied:blockedEndpoint(endpoint,occupied),position:i.members.length?mean(i.members.map(m=>m.position)):[0,0,0]});}}
    return {revision:s.revision,complete:true,candidates:result,interfaces,blocked_count:blocked};
  }
  async function preview(workspace,snapshot,id,input){const ctx=await context(workspace,snapshot),s=await sessionAt(ctx,id);sameRevision(s,input);const c=await findCandidate(ctx,s,input);return {revision:s.revision,candidate_id:c.id,...await check(ctx,s,c,input.diagnostics===true)};}
  async function command(workspace,snapshot,id,input){
    const ctx=await context(workspace,snapshot);if(typeof input.request_id!=='string'||input.request_id.length>100||!input.request_id)fail('操作缺少有效请求标识。');
    const file=location(ctx,id);return locked(file,async()=>{
      const s=await sessionAt(ctx,id),signature=hash({...input,expected_revision:undefined}),receipt=s.requests.find(r=>r.id===input.request_id);if(receipt){if(receipt.signature!==signature)fail('同一个请求标识不能用于不同操作。',409);return clone(receipt.result);}
      sameRevision(s,input);const before=content(s);let label,operation;
      if(['move','connect','disconnect','reset'].includes(input.type))s.reference_assembly=null;
      if(input.type==='auto_assemble'){
        if(input.mode!=='reference')fail('自动组装目前提供成品参考演示，请使用 reference 模式。');
        const options=[];
        for(const pair of ctx.index.pairs.filter(p=>p.reference_connections?.length)){
          const definitions=await Promise.all(pair.owner_refs.map(owner=>detail(ctx,owner)));
          for(const branch of referenceBranches(ctx.scene,pair,definitions,resourceRefs)){
            const moving=s.instances.find(p=>p.part_ref===branch.owners[0]),target=s.instances.find(p=>p.part_ref===branch.owners[1]);
            options.push(candidateFor(branch,moving,target));
          }
        }
        const partDetails=new Map(await Promise.all(ctx.scene.parts.map(async p=>[p.id,await detail(ctx,p.id)])));
        const base=planAutomaticAssembly({scene:ctx.scene,bounds:ctx.bounds,table:ctx.table,session:s,candidates:options,partDetails});
        const planned=await processes.optimize({package_digest:ctx.bundle.manifest.package_digest,scene:ctx.scene,table:ctx.table,session:s,planned:base,details:[...partDetails],geometries:[...ctx.meshes].map(([key,m])=>({key,bytes:m.bytes}))});
        s.instances=planned.instances;s.connections=planned.connections;s.reference_assembly=planned.reference_assembly;operation=planned.operation;label='自动组装 · 成品参考演示';
      }else if(input.type==='move'){
        const anchor=s.instances.find(p=>p.id===input.instance_id);if(!anchor)fail('场景部件不存在。');const next=validPose(input.pose),delta=matrix(next).multiply(matrix(anchor).invert());s.instances=transformGroup(s,anchor.id,delta);
        for(const p of s.instances.filter(p=>groupFor(s,anchor.id).instance_ids.includes(p.id)))if(transformedBounds(ctx.bounds[p.part_ref],p,ctx.partMap.get(p.part_ref).scale).min.z < -CONTACT_EPSILON)fail('部件不能放到台面以下，请调整高度。');label='移动 '+ctx.partMap.get(anchor.part_ref).name;
      }else if(input.type==='connect'){
        const c=await findCandidate(ctx,s,input),alternatives=[c];
        if(c.source_kind==='compatibility'){
          const moving=s.instances.find(p=>p.id===c.moving_instance_id),target=s.instances.find(p=>p.id===c.target_instance_id),pair=ctx.index.pairs.find(p=>p.owner_refs.includes(moving.part_ref)&&p.owner_refs.includes(target.part_ref));
          for(const branch of await pairBranches(ctx,pair)){
            if(branch.source_configuration_ref&&branch.source_configuration_ref!==s.reference_configuration_ref)continue;
            const other=candidateFor(branch,moving,target);if(other.id===c.id||!sameConnectionPose(c,other))continue;
            const qualified=await qualifyBranch(ctx,branch,s);if(qualified.assembly_assessment?.decision!=='block')alternatives.push(candidateFor(qualified,moving,target));
          }
        }
        alternatives.sort((a,b)=>a.id.localeCompare(b.id));
        const unconfirmed=connectionMechanismUnconfirmed(alternatives),name=connectionChoiceTitle(alternatives),mechanism=unconfirmed?'unresolved':c.mechanism;
        const result=await check(ctx,s,{...c,mechanism});if(result.status!=='ready')fail(result.reason??'当前姿态尚不可组合。',422);
        const poses=new Map(result.poses.map(p=>[p.id,p]));s.instances=s.instances.map(p=>poses.get(p.id)??p);
        if(result.table_lift)operation={type:'connect',table_lift:result.table_lift};
        s.connections.push({id:randomUUID(),name,mechanism,...(unconfirmed?{mechanism_status:'unconfirmed',mechanism_options:connectionMechanisms(alternatives)}:{}),endpoints:c.endpoints,member_pairs:c.member_pairs,candidate_id:c.id,source_kind:c.source_kind,source_configuration_ref:c.source_configuration_ref,source_alignment_check_refs:c.source_alignment_check_refs,source_candidate_ref:c.source_candidate_ref,source_match_ref:c.source_match_ref,relative_transform:c.relative_transform,anchors:[c.moving_anchor,c.target_anchor],
          conditions:[...new Set(alternatives.flatMap(c=>c.conditions))],source_conditions:[...new Set(alternatives.flatMap(c=>c.source_conditions??[]))],source_evidence_refs:[...new Set(alternatives.flatMap(c=>c.source_evidence_refs??[]))],...(c.interface_adaptation?{interface_adaptation:c.interface_adaptation}:{}),status:c.source_kind==='reference_connection'?'reference':'trial',geometry:result.geometry,assembly_assessment:result.assembly_assessment,mechanics:result.mechanics,created_at:new Date().toISOString()});label='组合 · '+name;
      }else if(input.type==='disconnect'){
        const c=s.connections.find(c=>c.id===input.connection_id);if(!c)fail('连接已拆开或不存在。',409);s.connections=s.connections.filter(x=>x.id!==c.id);const settled=settleDisconnected(s,c,ctx);s.instances=settled.instances;operation=settled.operation;label=(operation.status==='placed'?'拆分归位 · ':'解除连接 · ')+c.name;
      }else if(input.type==='reset'){
        s.instances=layoutInstances(ctx.scene.parts,ctx.bounds,ctx.orientations);s.connections=[];label='恢复初始拆散状态';
      }else if(input.type==='set_reference_configuration'){
        if(!referenceConfigurations(ctx.scene).some(c=>c.id===input.configuration_ref))fail('参考构型不存在。');
        s.reference_configuration_ref=input.configuration_ref;label='选择参考构型';
      }else if(input.type==='set_assembly_policy'){
        try{s.assembly_policy=assemblyPolicy(input.assembly_policy);}catch(error){fail(error.message);}
        label='更新装配判定设置';
      }else if(input.type==='undo'||input.type==='redo'){restoreHistory(s,input.type==='redo');s.reference_configuration_ref=inferConfiguration(ctx.scene,s);s.assembly_policy=assemblyPolicy(s.assembly_policy??ctx.index.assembly_policy??DEFAULT_ASSEMBLY_POLICY);}
      else if(input.type==='rename'){const name=String(input.name??'').trim();if(!name||name.length>100)fail('场景名称应为 1–100 个字。');s.name=name;}
      else fail('不支持的装配操作。');
      occupancyFor(s.connections);if(label)pushHistory(s,label,before);s.revision++;s.updated_at=new Date().toISOString();const result={...present(ctx,s),...(operation?{operation}:{}),table:ctx.table};s.requests=[...s.requests,{id:input.request_id,signature,result}].slice(-100);await persist(file,s);return result;
    });
  }
  return {list,create,get,candidates,preview,command,policy_schema:'psop.assembly-policy/1',assessment_schema:'psop.assembly-assessment/1',supported_commands:['move','connect','disconnect','reset','auto_assemble','set_reference_configuration','set_assembly_policy','undo','redo','rename'],close:async()=>{await geometry.close?.();return processes.close();}};
}

export async function readSimulationRequest(request){
  if(request.headers.origin&&new URL(request.headers.origin).host!==request.headers.host||request.headers['sec-fetch-site']==='cross-site')fail('请求来源与当前工作台不一致。',403);
  if(!String(request.headers['content-type']??'').startsWith('application/json'))fail('请使用 JSON 提交装配操作。',415);
  let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>65536)fail('装配请求内容过长。',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{fail('装配请求不是有效 JSON。',400);}
}
