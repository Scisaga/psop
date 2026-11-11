import {matrix,fail} from './simulate-core.mjs';

export const sourceConfiguration=scene=>scene.reference_alignment?.source_configuration_ref??'configuration:'+scene.meta?.deviceId+':source-qpos0';
export function referenceConfigurations(scene){
  return [{id:sourceConfiguration(scene),label:'来源原装',kind:'source'},...(scene.reference_alignment?.configuration_ref?[{id:scene.reference_alignment.configuration_ref,label:'几何协调 · 工程推断',kind:'coordinated'}]:[])];
}
export function configurationPoses(scene,ref=sourceConfiguration(scene)){
  if(!referenceConfigurations(scene).some(c=>c.id===ref))fail('参考构型不存在。');
  const overrides=new Map((ref===sourceConfiguration(scene)?[]:scene.reference_alignment.placements).map(p=>[p.part_ref,p]));
  return new Map(scene.parts.map(p=>[p.id,{...p,...overrides.get(p.id)}]));
}
export function inferConfiguration(scene,session){
  const ids=new Set(referenceConfigurations(scene).map(c=>c.id));
  if(ids.has(session.reference_configuration_ref))return session.reference_configuration_ref;
  if(ids.has(session.reference_assembly?.configuration_ref))return session.reference_assembly.configuration_ref;
  const refs=[...new Set(session.connections.map(c=>c.source_configuration_ref).filter(r=>ids.has(r)))];
  return refs.length===1?refs[0]:sourceConfiguration(scene);
}
/** Compare relative transforms, so common world rotation/translation never changes reference status. */
export function atReferencePose(scene,configuration,a,b,positionTolerance=4e-5,angleTolerance=1e-4){
  const poses=configurationPoses(scene,configuration),pa=poses.get(a.part_ref),pb=poses.get(b.part_ref);
  if(!pa||!pb)return false;
  const expected=matrix(pa).invert().multiply(matrix(pb)),actual=matrix(a).invert().multiply(matrix(b));
  const e=expected.clone().invert().multiply(actual).elements;
  return Math.hypot(e[12],e[13],e[14])<=positionTolerance&&Math.acos(Math.max(-1,Math.min(1,(e[0]+e[5]+e[10]-1)/2)))<=angleTolerance;
}
