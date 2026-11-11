import {createHash} from 'node:crypto';
import {matrix} from './simulate-core.mjs';
import {configurationPoses,referenceConfigurations,sourceConfiguration} from './simulate-configuration.mjs';

const allowedBases=new Set(['source_fit','hypothesis','declared','source_assembly','inferred_fit']);
const mean=points=>[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length);
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);

/** Reference connections are a second published source of possibilities, independent of hole templates. */
export function withReferencePairs(scene,index){
  const owners=new Map((scene.assembly?.interfaces??[]).map(i=>[i.id,i.owner_ref]));
  const pairs=index.pairs.map(p=>({...p,reference_connections:[]}));
  const byOwners=new Map(pairs.map(p=>[[...p.owner_refs].sort().join('|'),p]));
  for(const connection of scene.assembly?.connections??[]){
    const corrected=scene.reference_alignment?.presentation?.connections?.find(c=>c.connection_ref===connection.id);
    if((!allowedBases.has(connection.basis)&&!allowedBases.has(corrected?.basis))||connection.endpoints?.length!==2)continue;
    const refs=connection.endpoints.map(e=>owners.get(e.interface_ref));
    if(refs.some(r=>!r)||refs[0]===refs[1])continue;
    const key=[...refs].sort().join('|');let pair=byOwners.get(key);
    if(!pair){pair={id:'reference-pair:'+createHash('sha256').update(key).digest('hex'),owner_refs:[...refs].sort(),candidate_count:0,reference_connections:[]};pairs.push(pair);byOwners.set(key,pair);}
    pair.reference_connections.push(connection.id);
  }
  return {...index,pairs};
}

export const hasPossibilities=pair=>pair.candidate_count>0||pair.reference_connections?.length>0||pair.interface_adaptations?.length>0;

/** Recover a relative pose from its explicit configuration, never from animation or spatial adjacency. */
export function referenceBranches(scene,pair,details,resources){
  const branches=[],parts=new Map(scene.parts.map(p=>[p.id,p]));
  for(const id of pair.reference_connections??[]){
    const original=details.flatMap(d=>d.reference_connections??[]).find(c=>c.id===id);
    if(!original||original.assessment_scope!=='source_reference_configuration')continue;
    const adjustment=scene.reference_alignment?.presentation?.connections?.find(c=>c.connection_ref===id);
    const configurations=referenceConfigurations(scene).filter(c=>c.kind==='source'?allowedBases.has(original.basis):allowedBases.has(adjustment?.basis??original.basis)).map(c=>({...original,configuration_ref:c.id,
      ...(c.kind==='coordinated'?{basis:adjustment?.basis??original.basis,note:adjustment?.note??original.note,alignment_check_refs:adjustment?.check_refs??[]}: {})}));
    for(const connection of configurations){
    const sourceRef=sourceConfiguration(scene);
    const configuration=connection.configuration_ref;
    const map=configurationPoses(scene,configuration),poses=pair.owner_refs.map(ref=>map.get(ref));
    if(poses.some(p=>!p))continue;
    const interfaces=details.map(d=>d.interfaces.find(i=>connection.endpoints.some(e=>e.interface_ref===i.id)));
    if(interfaces.some(i=>!i))continue;
    const members=interfaces.map(i=>{const endpoint=connection.endpoints.find(e=>e.interface_ref===i.id);return endpoint.member_refs.map(ref=>i.members.find(m=>m.id===ref));});
    if(members.some(ms=>ms.some(m=>!m||!finitePoint(m.position))))continue;
    const selectionRequired=members.some(ms=>!ms.length);
    const anchorMembers=members.map((ms,n)=>ms.length?ms:interfaces[n].members.filter(m=>finitePoint(m.position)));
    if(anchorMembers.some(ms=>!ms.length))continue;
    const endpoints=interfaces.map((i,n)=>resources(details[n],i.id,members[n].map(m=>m.id),members[n].flatMap(m=>m.feature_refs)));
    // Shared semantic member keys are explicit counterparts; do not invent an ordered mapping.
    const memberPairs=[];
    for(const a of members[0]){
      const matches=members[1].filter(b=>b.id.slice(interfaces[1].id.length)===a.id.slice(interfaces[0].id.length));
      if(matches.length!==1||!a.feature_refs?.length||!matches[0].feature_refs?.length)continue;
      const b=matches[0];memberPairs.push({member_a_ref:a.id,member_b_ref:b.id,feature_a_ref:a.feature_refs[0],feature_b_ref:b.feature_refs[0],position_a:a.position,position_b:b.position});
    }
    const e=matrix(poses[0]).invert().multiply(matrix(poses[1])).elements;
    const registration={rotation_b_to_a:[[e[0],e[4],e[8]],[e[1],e[5],e[9]],[e[2],e[6],e[10]]],translation_b_to_a:[e[12],e[13],e[14]],whole_part_collision_evaluated:false,comparison_margin_m:4e-5};
    branches.push({key:createHash('sha256').update(JSON.stringify([id,configuration,registration])).digest('hex'),owners:pair.owner_refs,endpoints,
      mechanism:'reference_fit',title:connection.name,member_count:Math.min(...members.map(ms=>ms.length)),registration,
      anchors:anchorMembers.map(ms=>mean(ms.map(m=>m.position))),marker_points:memberPairs.length?['a','b'].map(side=>memberPairs.map(p=>p['position_'+side])):[[],[]],member_pairs:memberPairs,
      unavailable_reason:selectionRequired?'原装关联已记录，但实际选孔或接口成员尚未指定。请先补充成员选择。':null,
      conditions:['参考配合；力学状态单独记录'],source_kind:'reference_connection',source_configuration_ref:configuration,source_configuration_label:configuration===sourceRef?'来源原装':'几何协调 · 工程推断',source_alignment_check_refs:connection.alignment_check_refs??[],
      source_candidate_ref:id,source_match_ref:id,source_evidence_refs:connection.evidence_refs??[],
      source_conditions:[connection.note,...interfaces.flatMap(i=>i.unresolved_conditions??[])].filter(Boolean)});
    }
  }
  return branches;
}
