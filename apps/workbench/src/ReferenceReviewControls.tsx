import {useEffect,useState} from 'react';
import type {AssemblyConnection,AssemblyInterface,PartCapabilities,PrototypeData,ReferenceUseReview} from './types';
import {assemblyPartName} from './assembly-model';
import {loadPartCapabilities} from './capability-data';
import {activeReferenceDecisions,referenceConfiguration,targetForConnection,type ReferenceReviewController} from './reference-decisions';

export function ReferenceUseSummary({review,onOpenSource}:{review:ReferenceUseReview;onOpenSource:(source:string)=>void}){
  const [expanded,setExpanded]=useState(false);
  return <div className="reference-use-summary" data-reference-use-review={review.owner_ref}>
    <h3>原装配用法</h3><p className={expanded?'is-expanded':'is-compact'}>{review.summary}</p>
    {review.summary.length>90&&<button className="reference-use-expand" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起用法':'展开完整用法'}</button>}
    {!!review.open_items.length&&<details className="reference-use-open" open><summary>来源待核实项 · {review.open_items.length} 项</summary>{review.open_items.map(item=><p key={item}>{item}</p>)}</details>}
    <details className="reference-use-dispositions"><summary>来源记录与依据</summary>{review.interface_dispositions.map(item=><p key={item.interface_ref}><span>{item.name}</span><small>{({reference_use_recorded:'已登记参考用法',reference_conflict_recorded:'原位置冲突已记录',not_observed_used_in_input:'输入配置未观察到使用',use_unresolved:'具体用法待核实'})[item.status]}</small></p>)}<button onClick={()=>onOpenSource(review.source_ref)}>查看审查依据</button></details>
  </div>;
}

export function ReviewToolbar({review}:{review?:ReferenceReviewController}){
  if(!review)return null;
  if(!review.loading&&!review.error&&!review.ledger?.events.length)return null;
  return <div className="reference-review-toolbar">
    {review.loading?<span>读取人工记录…</span>:review.error?<><span role="alert">{review.error}</span><button onClick={review.refresh}>重新读取</button></>:<>
      <span>人工判断 · {activeReferenceDecisions(review.ledger).length} 项</span>
      {!!review.ledger?.events.length&&<a href={review.exportUrl} download>导出记录</a>}
    </>}
  </div>;
}

export function ConnectionReviewControls({data,connection,review}:{data:PrototypeData;connection:AssemblyConnection;review?:ReferenceReviewController}){
  const [action,setAction]=useState<'confirm'|'reject'|null>(null),[note,setNote]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setAction(null);setNote('');setError('');},[connection.id,connection.manual_decision?.id]);
  if(!review)return null;
  const decision=connection.manual_decision;
  const disabled=review.loading||review.saving||!review.ledger;
  const submit=async()=>{try{setError('');if(!action)return;await review.save({action,target:targetForConnection(data,connection),note});setAction(null);}catch(e){setError(e instanceof Error?e.message:'保存失败');}};
  return <div className="reference-review-controls" data-reference-review={connection.id}>
    {decision?<><p className={`reference-review-result is-${decision.status}`}><strong>{decision.status==='confirmed'?'人工确认':'人工排除'}</strong><time dateTime={decision.created_at}>{new Date(decision.created_at).toLocaleString('zh-CN',{hour12:false})}</time></p>{decision.note&&<p>{decision.note}</p>}<button disabled={disabled} onClick={async()=>{try{setError('');await review.save({action:'undo',decision_ref:decision.id});}catch(e){setError(e instanceof Error?e.message:'撤销失败');}}}>撤销人工判断</button></>:!action?<div className="reference-review-actions"><button disabled={disabled} onClick={()=>setAction('confirm')}>确认原装配关系</button><button disabled={disabled} onClick={()=>setAction('reject')}>排除此对应</button></div>:null}
    {action&&<div className="reference-review-form"><label>{action==='confirm'?'确认依据或说明（选填）':'排除此对应的理由'}<textarea aria-label={action==='confirm'?'确认依据或说明':'排除理由'} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder={action==='confirm'?'例如：已核对实物或装配资料':'说明为什么不是这两个接口的对应关系'}/></label><p>记录这两个接口在当前参考配置中的关系。</p><div className="reference-review-actions"><button disabled={disabled||(action==='reject'&&!note.trim())} onClick={submit}>{review.saving?'正在保存…':action==='confirm'?'保存确认':'保存排除'}</button><button disabled={review.saving} onClick={()=>setAction(null)}>取消</button></div></div>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}

export function ChooseReferencePeer({data,item,review,onHydratePart}:{data:PrototypeData;item:AssemblyInterface;review?:ReferenceReviewController;onHydratePart?:(detail:PartCapabilities)=>void}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[owner,setOwner]=useState(''),[target,setTarget]=useState(''),[detail,setDetail]=useState<PartCapabilities|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[ours,setOurs]=useState<string[]>([]),[theirs,setTheirs]=useState<string[]>([]);
  useEffect(()=>{setOpen(false);setOwner('');setTarget('');setDetail(null);setOurs([]);setTheirs([]);setError('');setNote('');setQuery('');},[item.id]);
  useEffect(()=>{
    const controller=new AbortController();setDetail(null);setTarget('');setTheirs([]);setError('');
    if(!owner)return()=>controller.abort();
    setLoading(true);loadPartCapabilities(data,owner,controller.signal).then(result=>{if(!controller.signal.aborted){setDetail(result);if(result)onHydratePart?.(result);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // The package and chosen owner, rather than hydration, identify this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,data.meta.packageDigest]);
  if(!review)return null;
  const parts=data.parts.filter(p=>p.id!==item.owner_ref&&(`${assemblyPartName(data,p.id)} ${p.id} ${p.body}`).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const interfaces=detail?.interfaces??(data.assembly?.interfaces??[]).filter(i=>i.owner_ref===owner);
  const peer=interfaces.find(i=>i.id===target);
  const members=(entry:AssemblyInterface,selected:string[],change:(values:string[])=>void,label:string)=><details className="reference-member-picker"><summary>{label} · {selected.length?`已选 ${selected.length} 项`:'未指定具体成员'}</summary>{entry.members.map(m=><label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>change(e.target.checked?[...selected,m.id]:selected.filter(id=>id!==m.id))}/>{m.label}</label>)}</details>;
  return <div className="reference-peer-picker">
    {!open?<button onClick={()=>setOpen(true)}>选择原装配对端</button>:<div className="reference-review-form"><h4>补充原装配对应</h4>
      <label>查找部件<input aria-label="查找对端部件" value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称、位置或 ID"/></label>
      <label>对端部件<select aria-label="对端部件" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">选择部件</option>{parts.map(p=><option key={p.id} value={p.id}>{assemblyPartName(data,p.id)}</option>)}</select></label>
      {loading?<p>读取对端接口…</p>:owner&&<label>对端接口<select aria-label="对端接口" value={target} onChange={e=>{setTarget(e.target.value);setTheirs([]);}}><option value="">选择具体接口</option>{interfaces.map(i=><option key={i.id} value={i.id}>{i.name} · {i.geometry_summary}</option>)}</select></label>}
      {members(item,ours,setOurs,'本端成员')}{peer&&members(peer,theirs,setTheirs,'对端成员')}
      <label>对应关系说明<textarea aria-label="对应关系说明" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="例如：该安装孔组与支架孔组连接"/></label>
      <div className="reference-review-actions"><button disabled={!peer||loading||review.saving||!review.ledger} onClick={async()=>{try{setError('');await review.save({action:'confirm',note,target:{configuration_ref:referenceConfiguration(data),connection_ref:null,endpoints:[{owner_ref:item.owner_ref,interface_ref:item.id,member_refs:ours},{owner_ref:owner,interface_ref:peer!.id,member_refs:theirs}]}});setOpen(false);}catch(e){setError(e instanceof Error?e.message:'保存失败');}}}>{review.saving?'正在保存…':'保存为人工确认'}</button><button disabled={review.saving} onClick={()=>setOpen(false)}>取消</button></div>
      {error&&<p role="alert">{error}</p>}
    </div>}
  </div>;
}
