import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Crosshair, FileText, Focus, LoaderCircle, Search } from 'lucide-react';
import type { AssemblyInspectorProps } from './AssemblyInspector';
import type { AssemblyFeature, CompatibilityPairSummary, GeometrySelection, PartCapabilities, PrototypeData } from './types';
import { assemblyIndex, assemblyPartName, assemblySources, featureDimensions, featureLabel, featuresForPart, interfaceFeatureRefs, interfacesForSelection, selectionForFeature } from './assembly-model';
import { loadCompatibilityIndex, loadPartCapabilities, mergePartCapabilities } from './capability-data';
import {capabilityRoleLabel,compatibilityConditionLabel,compatibilityTemplateLabel} from './compatibility-presentation';
import {ReviewToolbar,ReferenceUseSummary} from './ReferenceReviewControls';
import {CompatibilityPairView} from './CompatibilityDetail';
import type {CompatibilityPreviewRequest} from './compatibility-preview';

type Hydrate = (detail: PartCapabilities) => void;
type CandidateNavigation = {data:PrototypeData;onHydratePart?:Hydrate;onSelectGeometry:(selection:GeometrySelection)=>void;onCompatibilityPairChange?:(pair:CompatibilityPairSummary|null)=>void;compatibilityPreview?:CompatibilityPreviewRequest|null;onPreviewCompatibility?:(request:CompatibilityPreviewRequest|null)=>void};

function Failure({message,retry}:{message:string;retry:()=>void}) {
  return <div className="capability-error" role="alert"><p>{message}</p><button onClick={retry}>重新读取</button></div>;
}

function Evidence({data,refs,featureRefs,onOpenSource}:{data:PrototypeData;refs:string[];featureRefs:string[];onOpenSource?:AssemblyInspectorProps['onOpenSource']}) {
  const sources = assemblySources(data,refs,featureRefs);
  return sources.length && onOpenSource ? <details className="assembly-evidence"><summary><FileText size={12}/>查看依据</summary><div>{sources.map(source=><button key={source.evidenceId||source.sourceId} onClick={()=>onOpenSource(source.sourceId,source.evidenceId)}>{source.title}<ChevronRight size={12}/></button>)}</div></details> : null;
}

function GeometryRecord({title,value}:{title:string;value:unknown}) {
  const [open,setOpen]=useState(false);
  return <details className="capability-witness" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{title}</summary>{open&&<pre>{JSON.stringify(value,null,2)}</pre>}</details>;
}

function FeaturePotential({feature,onExplore}:{feature:AssemblyFeature;onExplore:(templateRef:string)=>void}) {
  const ability=feature.capability;if(!ability)return null;
  return <section className="capability-feature-potential" aria-label="本件几何潜能"><h4>潜在方式<span>几何潜能</span></h4><p>{capabilityRoleLabel(ability.role)}</p>
    {ability.template_refs.length?<div className="capability-mode-labels">{ability.template_refs.map(ref=><button key={ref} onClick={()=>onExplore(ref)} aria-label={`查找${compatibilityTemplateLabel(ref)}候选`}>{compatibilityTemplateLabel(ref)}<ChevronRight size={10}/></button>)}</div>:<p>当前保留有限几何，尚未提出具体连接方式。</p>}
    {!!ability.complementary_requirements.length&&<ul>{ability.complementary_requirements.map((condition,index)=><li key={index}>{compatibilityConditionLabel(condition)}</li>)}</ul>}
    {!!ability.unresolved_conditions.length&&<p className="capability-condition">{ability.unresolved_conditions.map(compatibilityConditionLabel).join('；')}</p>}
    <p className="capability-condition">使用本条有限区域；多孔组合仍须按布局和共同条件检查。</p>
  </section>;
}

function PairList({pairs,data,onChoose,query}:{pairs:CompatibilityPairSummary[];data:PrototypeData;onChoose:(pair:CompatibilityPairSummary)=>void;query:string}) {
  const [limit,setLimit]=useState(30);
  useEffect(()=>setLimit(30),[query,pairs]);
  const filtered=useMemo(()=>pairs.filter(pair=>pair.candidate_count>0&&`${pair.owner_refs.map(owner=>assemblyPartName(data,owner)).join(' ')} ${Object.keys(pair.template_counts??{}).map(compatibilityTemplateLabel).join(' ')} ${pair.summary??''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[pairs,data,query]);
  return <div className="capability-pair-list"><p className="capability-count">{filtered.length} 个含候选的部件对</p>{filtered.slice(0,limit).map(pair=><button className="capability-pair-row" key={pair.id} onClick={()=>onChoose(pair)} data-compatibility-pair-row={pair.id}><span><strong>{pair.owner_refs.map(owner=>assemblyPartName(data,owner)).join(' ↔ ')}</strong><small>{pair.interface_match_count!==undefined?`${pair.candidate_count} 类连接方式`:`${pair.candidate_count} 类连接线索`}</small></span><ChevronRight size={13}/></button>)}
    {filtered.length>limit&&<button className="capability-more" onClick={()=>setLimit(value=>value+30)}>继续查看 · 余 {filtered.length-limit} 对</button>}
    {!filtered.length&&<p className="assembly-empty">{pairs.some(p=>p.placement_evaluated)?'当前筛选下没有同时通过完整接口匹配和整件干涉检查的对端。':pairs.some(p=>p.interface_match_count!==undefined)?'当前筛选下没有满足完整接口规则的对端。单孔或普通面接触不会单独计为兼容接口。':'当前筛选下没有兼容候选。未匹配只限定本次已发布的检查范围。'}</p>}
  </div>;
}

export function PartCapabilityInspector({legacyInterfaces,referenceInterfaces,...props}:AssemblyInspectorProps&{legacyInterfaces:ReactNode;referenceInterfaces:ReactNode}) {
  const {capabilityTab:tab,onCapabilityTabChange:setTab}=props;
  const [detail,setDetail]=useState<PartCapabilities|null>(null);
  const [failure,setFailure]=useState('');
  const [retry,setRetry]=useState(0);
  const [query,setQuery]=useState('');
  const [candidateQuery,setCandidateQuery]=useState('');
  const [limit,setLimit]=useState(48);
  const [localPair,setLocalPair]=useState<CompatibilityPairSummary|null>(null);
  const pair=props.onCompatibilityPairChange?props.compatibilityPair??null:localPair;
  const setPair=props.onCompatibilityPairChange??setLocalPair;
  const hydrateRef=useRef(props.onHydratePart);hydrateRef.current=props.onHydratePart;
  const entry=props.data.assembly?.capability_index?.parts[props.part.id];
  useEffect(()=>{
    const controller=new AbortController();setDetail(null);setFailure('');setQuery('');setCandidateQuery('');setLimit(48);if(pair&&!pair.owner_refs.includes(props.part.id))setPair(null);
    loadPartCapabilities(props.data,props.part.id,controller.signal).then(result=>{if(!controller.signal.aborted){setDetail(result);if(result)hydrateRef.current?.(result);}}).catch(error=>{if(error.name!=='AbortError')setFailure(error.message);});
    return()=>controller.abort();
  },[props.part.id,props.data.meta.packageDigest,entry?.path,retry,setTab]);
  const data=detail?mergePartCapabilities(props.data,detail):props.data;
  const features=featuresForPart(data,props.part.id);
  const active=props.selection?.kind==='feature'?features.find(feature=>feature.id===props.selection!.id):undefined;
  const localInterfaces=(data.assembly?.interfaces??[]).filter(item=>item.owner_ref===props.part.id);
  const linked=new Set(localInterfaces.filter(item=>item.capability_basis!=='geometry_hypothesis').flatMap(item=>interfaceFeatureRefs(data,item)));
  const hypotheses=new Set(localInterfaces.filter(item=>item.capability_basis==='geometry_hypothesis').flatMap(item=>interfaceFeatureRefs(data,item)));
  const filtered=features.filter(feature=>`${featureLabel(feature)} ${featureDimensions(feature)} ${feature.id} ${feature.capability?capabilityRoleLabel(feature.capability.role):''} ${(feature.capability?.template_refs??[]).map(compatibilityTemplateLabel).join(' ')} ${linked.has(feature.id)?'接口':'用途待确认'}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const sources=active?interfacesForSelection(data,selectionForFeature(active)):[];
  const activeResources=active?(detail?.resources??[]).filter(resource=>Array.isArray(resource.feature_refs)&&resource.feature_refs.includes(active.id)):[];
  const activeFrame=active?(detail?.frames??[]).find(frame=>frame.id===active.frame_ref):undefined;
  return <div className="assembly-inspector capability-inspector">
    {failure&&<Failure message={failure} retry={()=>setRetry(value=>value+1)}/>}
    {!detail&&entry&&!failure&&<p className="capability-loading"><LoaderCircle size={14}/>读取本件完整几何…</p>}
    {tab==='geometry'&&<section className="capability-geometry" aria-label="全部有限几何">
      {pair&&<button className="assembly-back" onClick={()=>setTab('candidates')}><ArrowLeft size={12}/>返回这两个部件的兼容线索</button>}
      <label className="assembly-search capability-search"><Search size={13}/><input aria-label="查找本件几何" placeholder="孔径、轴、平面、用途待确认…" value={query} onChange={event=>{setQuery(event.target.value);setLimit(48);}}/></label>
      <p className="capability-count">{entry?.feature_count??features.length} 条有限几何记录 · {features.filter(feature=>!linked.has(feature.id)).length} 条未绑定已确认功能接口</p>
      {active&&<div className="capability-active-feature" data-active-capability-feature={active.id}><h3>{featureLabel(active)}</h3><p className="assembly-dimensions">{featureDimensions(active)}</p><p className="capability-scope-note">{linked.has(active.id)?`关联功能接口：${sources.filter(item=>item.capability_basis!=='geometry_hypothesis').map(item=>item.name).join('、')}`:'几何已识别；具体用途和连接方式待确认。'}{hypotheses.has(active.id)?' 已形成几何布局假设。':''}</p><button className="capability-locate" onClick={()=>props.onFocusGeometry?.(selectionForFeature(active))}><Focus size={13}/>定位本件几何</button><FeaturePotential feature={active} onExplore={ref=>{setCandidateQuery(compatibilityTemplateLabel(ref));setPair(null);setTab('candidates');}}/>{active.note&&<p className="assembly-specific-note">{active.note}</p>}{active.measurement&&<p className="capability-condition">网格实测尺寸与拟合误差分别记录；制造公差尚不能从网格推定。</p>}<GeometryRecord title="测量、边界与坐标归属" value={{measurement:active.measurement,tolerances:active.tolerances,resources:activeResources,frame:activeFrame,source:active.geometry_source_ref,triangles:active.geometry.triangle_indices.length}}/><Evidence data={data} refs={active.evidence_refs??[]} featureRefs={[active.id]} onOpenSource={props.onOpenSource}/></div>}
      <div className="capability-feature-list">{filtered.slice(0,limit).map((feature,index)=><div className={`capability-feature-row ${active?.id===feature.id?'is-selected':''}`} key={feature.id} data-capability-feature={feature.id}><button onClick={()=>props.onSelectGeometry(selectionForFeature(feature))}><Crosshair size={13}/><span><strong>{index+1} · {featureLabel(feature)}</strong><small>{featureDimensions(feature)}</small><small>{linked.has(feature.id)?'已有功能接口':hypotheses.has(feature.id)?'几何布局假设 · 用途待确认':'用途待确认'}</small></span></button><button aria-label={`定位${featureLabel(feature)} ${index+1}`} onClick={()=>{props.onSelectGeometry(selectionForFeature(feature));props.onFocusGeometry?.(selectionForFeature(feature));}}><Focus size={13}/></button></div>)}</div>
      {filtered.length>limit&&<button className="capability-more" onClick={()=>setLimit(value=>value+48)}>继续查看 · 余 {filtered.length-limit} 处</button>}
      {!filtered.length&&detail&&<p className="assembly-empty">当前筛选下没有几何记录。</p>}
      {(data.assembly?.interfaces??[]).some(item=>item.owner_ref===props.part.id)&&<details className="capability-interface-details" open={props.selection?.kind==='interface'}><summary>功能接口与成员选择</summary>{legacyInterfaces}</details>}
    </section>}
    {tab==='reference'&&<section aria-label="来源装配关系">{detail?.reference_use_review&&<ReferenceUseSummary key={props.part.id} review={detail.reference_use_review} onOpenSource={props.onOpenSource}/>}<ReviewToolbar review={props.referenceReview}/>{referenceInterfaces}</section>}
    {tab==='candidates'&&<section aria-label="本件兼容候选">{pair?<CompatibilityPairView data={data} pair={pair} onBack={()=>setPair(null)} onHydratePart={props.onHydratePart} onSelectGeometry={props.onSelectGeometry} onOpenSource={props.onOpenSource} compatibilityPreview={props.compatibilityPreview} onPreviewCompatibility={props.onPreviewCompatibility}/>:<><p className="capability-scope-note">按完整接口与已知选孔规则查找对端。</p><label className="assembly-search capability-search"><Search size={13}/><input aria-label="筛选兼容对端" placeholder="查找部件或连接方式" value={candidateQuery} onChange={event=>setCandidateQuery(event.target.value)}/></label>{detail&&<PairList data={data} pairs={detail.compatibility_pairs??[]} onChoose={setPair} query={candidateQuery}/>}</>}</section>}
  </div>;
}

export function CapabilityConnectionsPage(props:CandidateNavigation&{onOpenSource?:AssemblyInspectorProps['onOpenSource']}) {
  const [pairs,setPairs]=useState<CompatibilityPairSummary[]|null>(null);
  const [selected,setSelected]=useState<CompatibilityPairSummary|null>(null);
  const [failure,setFailure]=useState('');
  const [query,setQuery]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setPairs(null);setSelected(null);setFailure('');
    loadCompatibilityIndex(props.data,controller.signal).then(index=>{if(!controller.signal.aborted)setPairs(index?.pairs??[]);}).catch(error=>{if(error.name!=='AbortError')setFailure(error.message);});
    return()=>controller.abort();
  },[props.data.meta.packageDigest,retry]);
  return <div className="assembly-connections-page capability-connections-page"><header><div><h2>部件兼容候选</h2><p className="capability-scope-note">按完整接口几何与已知选孔规则筛选部件对。</p></div>{!selected&&<label className="assembly-search"><Search size={14}/><input aria-label="查找兼容候选" placeholder="部件名称或连接方式" value={query} onChange={event=>setQuery(event.target.value)}/></label>}</header>
    {failure?<Failure message={failure} retry={()=>setRetry(value=>value+1)}/>:selected?<CompatibilityPairView {...props} pair={selected} onBack={()=>setSelected(null)}/>:pairs?<PairList data={props.data} pairs={pairs} query={query} onChoose={pair=>{setSelected(pair);props.onCompatibilityPairChange?.(pair);}}/>:<p className="capability-loading"><LoaderCircle size={15}/>读取兼容候选目录…</p>}
  </div>;
}
