import type {AssemblyGeometry} from './simulate-types';

const number=(n:number)=>Number(n.toPrecision(5));
export default function SimulationGeometryDetails({geometry,onMeasure,measuring=false}:{geometry:AssemblyGeometry;onMeasure?:()=>void;measuring?:boolean}){
 const observations=geometry.observations??[geometry],overlaps=observations.filter(o=>o.status==='interference');
 const minor=overlaps.length>0&&overlaps.every(o=>o.assembly_assessment?.reasons.includes('minor_contact_display_filter'));
 return <details className="simulation-geometry-details" onToggle={e=>{if(e.currentTarget.open&&overlaps.some(o=>!Number.isFinite(o.diagnostics?.sampled_penetration_depth_m)))onMeasure?.();}}><summary>几何记录{minor?' · 轻微接触已记录':overlaps.length?` · ${overlaps.length} 处重叠`:geometry.status==='clear'?' · 已测量':' · 未完成测量'}</summary>
   {observations.filter(o=>o.status!=='clear').map((o,n)=><div key={n}>
    <p>{o.intersection_volume_m3!==undefined?`实体重叠 ${number(o.intersection_volume_m3*1e9)} mm³`:'几何测量未完成'}</p>
    {Number.isFinite(o.diagnostics?.sampled_penetration_depth_m)&&<><p>表面采样穿入深度 {number(o.diagnostics!.sampled_penetration_depth_m!*1000)} mm · {o.diagnostics!.components?.length??0} 个交集分量</p><small>有限采样估计，非精确最大穿入深度。</small></>}
   </div>)}
   {onMeasure&&overlaps.some(o=>!Number.isFinite(o.diagnostics?.sampled_penetration_depth_m))&&<button type="button" disabled={measuring} onClick={onMeasure}>{measuring?'测量接触深度…':'测量接触深度'}</button>}
   <small>刚性几何观测单独记录。力学状态：未计算。</small>
 </details>;
}
