import {useEffect,useState} from 'react';
import type {AssemblyPolicy} from './simulate-types';

export default function SimulationPolicySettings({policy,disabled,onSave}:{policy:AssemblyPolicy;disabled:boolean;onSave:(policy:AssemblyPolicy)=>void}){
 const [volume,setVolume]=useState(String(policy.minor_contact_volume_mm3)),[depth,setDepth]=useState(String(policy.unrelated_obstacle_depth_m*1000));
 useEffect(()=>{setVolume(String(policy.minor_contact_volume_mm3));setDepth(String(policy.unrelated_obstacle_depth_m*1000));},[policy]);
 const v=Number(volume),d=Number(depth),valid=volume!==''&&depth!==''&&Number.isFinite(v)&&Number.isFinite(d)&&v>=0&&d>=0;
 return <details className="simulation-policy-settings"><summary>装配判定设置</summary><form onSubmit={e=>{e.preventDefault();if(valid)onSave({...policy,minor_contact_volume_mm3:v,unrelated_obstacle_depth_m:d/1000});}}>
  <label>轻微接触显示筛选（mm³）<input aria-label="轻微接触显示筛选" type="number" min="0" step="any" value={volume} onChange={e=>setVolume(e.target.value)} disabled={disabled}/></label>
  <label>无关障碍穿入深度（mm）<input aria-label="无关障碍穿入深度" type="number" min="0" step="any" value={depth} onChange={e=>setDepth(e.target.value)} disabled={disabled}/></label>
  <p>体积仅筛选接触记录；障碍按新增或加深的采样穿入判断。</p><button disabled={disabled||!valid}>保存判定设置</button>
 </form></details>;
}
