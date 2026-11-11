import type {ConnectionMechanismOption} from './simulate-types';
import {isFastenerMechanism} from './simulate-connection-options.mjs';

const labels:Record<string,string>={screw_reception:'螺钉旋入',through_fastener:'螺栓＋螺母'};
const conditions:Record<string,string>={receiving_thread_or_self_tapping_specification_unknown:'接收端螺纹或自攻规格待确认',connector_specification_and_length_unresolved:'紧固件规格与长度待确认',head_seat_and_tool_access_unknown:'头部支承与工具空间待确认',nut_seat_and_multilayer_stack_unresolved:'螺母座与夹持厚度待确认',full_passage_continuity_unverified:'孔道贯通性待确认',bearing_fit_class_and_axial_retention_unknown:'配合等级与轴向保持待确认',manufacturing_fit_unknown:'制造配合待确认'};
export default function SimulationMechanismDetails({options}:{options:ConnectionMechanismOption[]}){
 const grouped=new Map<string,{title:string;pending:Set<string>}>();
 for(const option of options){
  if(!grouped.has(option.mechanism))grouped.set(option.mechanism,{title:labels[option.mechanism]??option.title,pending:new Set()});
  const pending=grouped.get(option.mechanism)!.pending;
  for(const code of option.source_conditions)if(conditions[code])pending.add(conditions[code]);
  if(option.connector_requirements.some(r=>r.specification_status==='unresolved'))pending.add('紧固件规格与长度待确认');
 }
 const fastening=options.every(o=>isFastenerMechanism(o.mechanism));
 return <details className="simulation-mechanism-details"><summary>{fastening?'紧固方式':'连接机制'}待确认 · {grouped.size} 项假设</summary>
  <ul>{[...grouped].map(([kind,option])=><li key={kind}><strong>{option.title}</strong>
   {kind==='screw_reception'&&<p>穿过一侧零件，拧入另一侧的螺纹孔或嵌件。</p>}
   {kind==='through_fastener'&&<p>穿过两侧零件，由背面的螺母夹紧。</p>}
   <p>{[...option.pending].join('；')||'保持方式与承载能力待确认'}</p>
  </li>)}</ul>
  <small>可先试装此姿态，具体{fastening?'紧固方式':'连接机制'}仍待确认。</small>
 </details>;
}
