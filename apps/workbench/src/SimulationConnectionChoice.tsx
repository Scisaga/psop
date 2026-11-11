import {ChevronRight,LoaderCircle,LockKeyhole} from 'lucide-react';
import SimulationConnectionDiagram from './SimulationConnectionDiagram';
import SimulationGeometryDetails from './SimulationGeometryDetails';
import SimulationMechanismDetails from './SimulationMechanismDetails';
import {connectionChoiceTitle,connectionMechanismUnconfirmed,connectionMechanisms,type ConnectionChoiceGroup,type ConnectionPoseChoice} from './simulate-connection-options.mjs';
import type {ConnectionCandidate,ConnectionPreview} from './simulate-types';

type Method=ConnectionChoiceGroup&{chosen:ConnectionPoseChoice};
type Props={method:Method;preview?:{loading:boolean;result?:ConnectionPreview;error?:string};sceneReady:boolean;disabled:boolean;renderThumbnail:(candidate:ConnectionCandidate)=>Promise<string|null>;onPreview:(candidate:ConnectionCandidate,diagnostics?:boolean)=>unknown;onHover:(candidate:ConnectionCandidate|null)=>void;onDirection:(candidate:ConnectionCandidate)=>void;onConnect:(candidate:ConnectionCandidate)=>void};

export default function SimulationConnectionChoice({method,preview:p,sceneReady,disabled,renderThumbnail,onPreview,onHover,onDirection,onConnect}:Props){
 const {candidate:c,alternatives}=method.chosen,ready=p?.result?.status==='ready',title=connectionChoiceTitle(alternatives),unconfirmed=connectionMechanismUnconfirmed(alternatives);
 const inspect=()=>{onHover(c);onPreview(c);};
 return <div className="simulation-method" data-sim-candidates={alternatives.map(c=>c.id).join(' ')} onMouseEnter={inspect} onMouseLeave={()=>onHover(null)}>
  <SimulationConnectionDiagram candidate={c} ready={sceneReady} render={renderThumbnail} label={title}/>
  <div className="simulation-method-body">
   <button className={`simulation-connect-choice ${ready?'is-ready':''}`} data-sim-candidate={c.id} disabled={!ready||disabled} onFocus={inspect} onBlur={()=>onHover(null)} onClick={()=>onConnect(c)}>
    <span><span className="simulation-method-title"><strong>{title}</strong><small>{c.member_count?c.member_count+' 个位置':'位置待指定'}</small></span>
     {c.source_kind==='reference_connection'&&<small className="simulation-reference-label">{c.source_configuration_label??'原装参考'}</small>}
     <small className="simulation-method-interfaces">{c.endpoints[0].interface_name} ↔ {c.endpoints[1].interface_name}</small>
    </span>
    {p?.loading||!p?<LoaderCircle size={13} className="spin"/>:ready?<ChevronRight size={14}/>:<LockKeyhole size={12}/>}
   </button>
   <div className="simulation-method-controls">
    {ready?<p className="simulation-method-status"><span className="simulation-trial-dot"/>{c.source_kind==='reference_connection'?(c.source_configuration_label==='来源原装'?'可连接 · 原装参考':'可连接 · 工程推断'):'可试装'}</p>:p?.loading||!p?<p className="simulation-method-status">检查姿态中…</p>:<p className="simulation-method-status is-blocked">{p.error??p.result?.reason??'当前方式尚不可采用'}</p>}
    {method.options.length>1&&<label className="simulation-method-direction"><select title="安装方向" aria-label={`安装方向 ${c.endpoints.map(e=>e.interface_name).join('与')}`} value={c.id} disabled={disabled} onChange={e=>onDirection(method.options.find(o=>o.candidate.id===e.target.value)!.candidate)}>{method.options.map(({candidate:o,alternatives:choices},n)=><option value={o.id} key={o.id} data-sim-candidates={choices.map(c=>c.id).join(' ')}>{o.source_configuration_label??('姿态 '+(n+1)+' / '+method.options.length)}</option>)}</select></label>}
   </div>
   {p?.result?.table_lift&&<p className="simulation-method-lift">连接时整体抬升 {Number((p.result.table_lift.translation[2]*1000).toFixed(1))} mm</p>}
   {c.interface_adaptation?.surface_conformity==='unconfirmed'&&<p className="simulation-method-status" title={c.conditions.join('；')}>包覆曲面待核定</p>}
   {unconfirmed&&<SimulationMechanismDetails options={connectionMechanisms(alternatives)}/>}
   {p?.result?.geometry&&<SimulationGeometryDetails geometry={p.result.geometry} measuring={p.loading} onMeasure={()=>{onPreview(c,true);}}/>}
  </div>
 </div>;
}
