import {Box,Pause,Play,RotateCcw,X} from 'lucide-react';
import type {CompatibilityPreviewRequest} from './compatibility-preview';

export function CompatibilityPreviewControls({request,names,progress,playing,transparent,error,onPlay,onSeek,onTransparent,onClose}:{request:CompatibilityPreviewRequest;names:string[];progress:number;playing:boolean;transparent:boolean;error:string;onPlay:()=>void;onSeek:(value:number)=>void;onTransparent:(value:boolean)=>void;onClose:()=>void}){
  const hole=['through_fastener','screw_reception'].includes(request.mechanism);
  const checked=!!request.interfaceMatch?.alignment_options.length&&request.interfaceMatch.alignment_options.every(o=>o.interference?.status==='clear');
  return <>
    <section className="scene-compatibility-heading" aria-label="当前装配示意">
      <div><strong><Box size={14}/>装配示意</strong><button onClick={onClose}>返回整机<X size={12}/></button></div>
      <h3>{request.title}</h3>
      <div className="scene-compatibility-legend"><span><i/>{names[0]}</span><span><i/>{names[1]}</span></div>
      <p>{checked?'固定姿态已检查整件干涉；装入路径与紧固仍待验证。':request.interfaceMatch?hole?`${request.interfaceMatch.member_count}/${request.interfaceMatch.member_count} 孔位按同一姿态对齐；整体干涉与紧固待验证。`:'按完整配合部位对位；整体干涉与保持待验证。':hole?'仅演示单处孔位对齐；选孔组合、干涉与紧固待验证。':'仅演示局部对位；安装方向、干涉与保持待验证。'}</p>
      {error&&<p role="alert">{error}</p>}
    </section>
    {!error&&<section className="scene-compatibility-transport" aria-label="装配示意播放控制">
      <button className="scene-compatibility-play" aria-label={playing?'暂停装配示意':progress>=1?'重播装配示意':'播放装配示意'} onClick={onPlay}>{playing?<Pause size={16}/>:progress>=1?<RotateCcw size={16}/>:<Play size={16}/>}</button>
      <div className="scene-compatibility-timeline"><div><button onClick={()=>onSeek(0)}>分开</button><span>{progress>=1?'已对位':progress>0?'对位中':'准备对位'}</span><button onClick={()=>onSeek(1)}>对位</button></div><input type="range" min="0" max="100" value={Math.round(progress*100)} aria-label="装配示意进度" onChange={e=>onSeek(Number(e.target.value)/100)}/></div>
      <label><input type="checkbox" checked={transparent} onChange={e=>onTransparent(e.target.checked)}/>透视结构</label>
    </section>}
  </>;
}
