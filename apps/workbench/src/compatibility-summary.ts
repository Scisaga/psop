import type {AssemblyFeature,CompatibilityCandidate,PrototypeData} from './types';
import {assemblyIndex,featureDimensions,featureLabel} from './assembly-model.ts';

export type PublishedPair={feature_a_ref:string;feature_b_ref:string;check_profile_ref?:number;[key:string]:unknown};
export interface StructureComparison {key:string;featuresA:string[];featuresB:string[];pairs:PublishedPair[];score:number}
const mm=(n:number)=>Number((n*1000).toFixed(3));
export const mechanismKey=(c:CompatibilityCandidate)=>c.template_ref?.split(':')[1]??'';
export const mechanismNames:Record<string,string>={cylindrical_insertion:'轴段与孔段',conical_insertion:'锥形结构',bearing_fit:'轴承配合',through_fastener:'孔组与标准连接件',screw_reception:'通孔与螺钉接收端',keyed_guidance:'键槽与导向',planar_seating:'承托与接触面',latch_engagement:'卡扣结构'};
export function mechanismName(c:CompatibilityCandidate){return mechanismNames[mechanismKey(c)]??'局部连接线索';}
export function physicalKey(data:PrototypeData,ref:string){
  const f=assemblyIndex(data).features.get(ref);
  const resources=f?.capability?.resource_refs;
  return resources?.length?[...resources].sort().join('|'):f?.resource_ref??ref;
}
export function comparisonProfile(c:CompatibilityCandidate,pair:PublishedPair):Record<string,unknown>{
  const profile=c.mapping_family?.check_profiles?.[pair.check_profile_ref??-1];
  return profile&&typeof profile==='object'?profile as Record<string,unknown>:{};
}
export function comparisonMeasurements(c:CompatibilityCandidate,pair:PublishedPair){
  const checks=comparisonProfile(c,pair).checks;
  return (Array.isArray(checks)?checks:[]) as Record<string,unknown>[];
}
export function radialAllowance(c:CompatibilityCandidate,pair:PublishedPair){
  const radial=comparisonMeasurements(c,pair).find(c=>c.kind==='radial_envelope');
  const interval=radial?.possible_radial_clearance_m;
  return Array.isArray(interval)&&interval.length===2&&interval.every(n=>typeof n==='number'&&Number.isFinite(n))?interval as [number,number]:null;
}
function score(c:CompatibilityCandidate,pair:PublishedPair){
  const allowance=radialAllowance(c,pair);
  // Display ordering only. No candidate or correspondence is removed.
  if(allowance)return 100-10*Math.max(0,(allowance[0]+allowance[1])/2*1000);
  return comparisonMeasurements(c,pair).length;
}
export function structureComparisons(data:PrototypeData,candidate:CompatibilityCandidate):StructureComparison[]{
  const groups=new Map<string,StructureComparison>();
  for(const pair of candidate.mapping_family?.pairs??[]){
    const key=JSON.stringify([physicalKey(data,pair.feature_a_ref),physicalKey(data,pair.feature_b_ref),pair.role_a??'',pair.role_b??'']);
    let group=groups.get(key);
    if(!group){group={key,featuresA:[],featuresB:[],pairs:[],score:-Infinity};groups.set(key,group);}
    if(!group.featuresA.includes(pair.feature_a_ref))group.featuresA.push(pair.feature_a_ref);
    if(!group.featuresB.includes(pair.feature_b_ref))group.featuresB.push(pair.feature_b_ref);
    group.pairs.push(pair);group.score=Math.max(group.score,score(candidate,pair));
  }
  return [...groups.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
}
export function featureCaption(data:PrototypeData,ref:string){
  const f=assemblyIndex(data).features.get(ref);
  if(!f)return '几何摘要读取中';
  return `${featureLabel(f)} · ${featureDimensions(f)}`;
}
export function structureCaption(data:PrototypeData,refs:string[]){
  const features=refs.map(ref=>assemblyIndex(data).features.get(ref)).filter((f):f is AssemblyFeature=>!!f);
  const cylinders=features.filter(f=>f.geometry.type==='cylinder');
  if(cylinders.length===features.length&&features.length){
    const diameters=[...new Set(cylinders.map(f=>f.geometry.type==='cylinder'?mm(2*f.geometry.radius_m):0))].sort((a,b)=>a-b);
    const kind=features.every(f=>f.kind==='shaft_wall')?'轴段':'孔段';
    return `${diameters.map(d=>'Ø'+d).join(' / ')} ${diameters.length>1?'分级孔段':kind}`;
  }
  return [...new Set(features.map(featureLabel))].join(' / ')||'摘要读取中';
}
export function measurementRows(data:PrototypeData,c:CompatibilityCandidate,pair:PublishedPair){
  const fs=assemblyIndex(data).features;
  const rows=[{label:'本端结构',value:fs.has(pair.feature_a_ref)?featureCaption(data,pair.feature_a_ref):'摘要读取中'},
    {label:'对端结构',value:fs.has(pair.feature_b_ref)?featureCaption(data,pair.feature_b_ref):'摘要读取中'}];
  const allowance=radialAllowance(c,pair);
  if(allowance)rows.push({label:'单边尺寸余量',value:`约 ${mm((allowance[0]+allowance[1])/2)} mm（按网格）`});
  for(const check of comparisonMeasurements(c,pair)){
    if(check.kind==='finite_segments'&&Array.isArray(check.lengths_m))rows.push({label:'有限段长度',value:check.lengths_m.map(n=>`${mm(Number(n))} mm`).join(' / ')});
    if(check.kind==='cross_section_dimensions'&&check.status)rows.push({label:'截面比较',value:check.status==='compatible'?'已通过局部尺寸条件':'需补齐截面条件'});
  }
  return rows;
}
export function comparisonConclusion(c:CompatibilityCandidate,pair:PublishedPair){
  const type=mechanismKey(c),allowance=radialAllowance(c,pair);
  if(allowance){const nominal=(allowance[0]+allowance[1])/2;
    return nominal>.001?'孔段尺寸可容纳轴段，余量较大；定位与保持方式待核。':'轴孔尺寸通过局部容纳条件；定位与保持方式待核。';
  }
  if(type==='through_fastener')return '保留孔间紧固线索；实际选孔、共同通道及连接件规格待定。';
  if(type==='screw_reception')return '通孔与接收端存在局部线索；接收螺纹或自攻条件待核。';
  if(type==='keyed_guidance')return '局部截面可继续比较；导向方向、接合长度及保持待核。';
  if(type==='conical_insertion')return '锥面轮廓存在局部适配线索；大小端方向、落座及深度待核。';
  if(type==='bearing_fit')return '圈面尺寸存在配合线索；配合等级与轴向保持待核。';
  if(type==='latch_engagement')return '卡扣几何存在对应线索；弹性接合与保持待核。';
  return '有限区域存在局部连接线索，具体放置与保持待核。';
}
export function exploratoryCandidate(c:CompatibilityCandidate){return mechanismKey(c)==='planar_seating'||c.mapping_family?.kind==='cartesian_feature_relation';}
export function sortedCandidates(candidates:CompatibilityCandidate[]){
  const priority:Record<string,number>={cylindrical_insertion:8,bearing_fit:7,through_fastener:6,keyed_guidance:5,conical_insertion:5,latch_engagement:4,screw_reception:3,planar_seating:0};
  return [...candidates].sort((a,b)=>(priority[mechanismKey(b)]??1)-(priority[mechanismKey(a)]??1)||a.id.localeCompare(b.id));
}
/** Bounded presentation of an existing Cartesian relation, with no re-matching. */
export function cartesianComparisonPage(c:CompatibilityCandidate,offset:number,limit:number):PublishedPair[]{
  const a=c.mapping_family?.features_a??[],b=c.mapping_family?.features_b??[];
  if(!b.length)return [];
  const result=[];
  for(let i=offset;i<Math.min(a.length*b.length,offset+limit);i++)result.push({feature_a_ref:a[Math.floor(i/b.length)],feature_b_ref:b[i%b.length]});
  return result;
}
