const sorted=values=>[...new Set(values??[])].sort();
export const isFastenerMechanism=kind=>kind==='screw_reception'||kind==='through_fastener';

// Interface identity and occupied resources remain distinct even at an identical pose.
export function connectionBindingKey(c){
 const reference=c.source_kind==='reference_connection';
 return JSON.stringify([c.moving_instance_id,c.target_instance_id,c.source_kind??'compatibility',c.source_configuration_ref??null,reference?c.source_match_ref:null,c.unavailable_reason??null,c.member_count,
  c.endpoints.map(e=>[e.instance_id,e.interface_ref,sorted(e.member_refs),sorted(e.resource_keys)])]);
}
const memberMapping=c=>JSON.stringify(c.member_pairs.map(p=>[p.moving_member_ref,p.target_member_ref,p.moving_feature_ref,p.target_feature_ref]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function sameConnectionPose(a,b){
 return connectionBindingKey(a)===connectionBindingKey(b)&&memberMapping(a)===memberMapping(b)&&a.relative_transform.length===16&&b.relative_transform.length===16&&a.relative_transform.every((v,k)=>Number.isFinite(v)&&Number.isFinite(b.relative_transform[k])&&Math.abs(v-b.relative_transform[k])<=1e-10);
}
export function groupConnectionChoices(candidates){
 const groups=new Map();
 for(const c of [...candidates].sort((a,b)=>a.id.localeCompare(b.id))){
  const key=connectionBindingKey(c);if(!groups.has(key))groups.set(key,{key,options:[]});
  const group=groups.get(key),pose=group.options.find(o=>sameConnectionPose(o.candidate,c));
  if(pose){if(!pose.alternatives.some(a=>a.id===c.id))pose.alternatives.push(c);}
  else group.options.push({candidate:c,alternatives:[c]});
 }
 return [...groups.values()];
}
export const connectionPoseCount=candidates=>groupConnectionChoices(candidates).reduce((n,g)=>n+g.options.length,0);
export function connectionChoiceTitle(candidates){
 if(candidates[0].source_kind==='reference_connection')return candidates[0].title;
 if(candidates.every(c=>isFastenerMechanism(c.mechanism)))return '孔组连接';
 return new Set(candidates.map(c=>c.mechanism)).size>1?'接口配合':candidates[0].title;
}
export const connectionMechanismUnconfirmed=candidates=>candidates[0].source_kind!=='reference_connection'&&(candidates.some(c=>isFastenerMechanism(c.mechanism))||new Set(candidates.map(c=>c.mechanism)).size>1);
export const connectionMechanisms=candidates=>candidates.map(c=>({candidate_id:c.id,title:c.title,mechanism:c.mechanism,source_candidate_ref:c.source_candidate_ref,source_match_ref:c.source_match_ref,conditions:c.conditions,source_conditions:c.source_conditions??[],connector_requirements:c.connector_requirements??[],source_evidence_refs:c.source_evidence_refs??[]}));
