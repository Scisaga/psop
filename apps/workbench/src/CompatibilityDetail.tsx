import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Box,ChevronRight,FileText,LoaderCircle,Play} from 'lucide-react';
import type {AssemblyInspectorProps} from './AssemblyInspector';
import type {AssemblyFeature,CompatibilityCandidate,CompatibilityInterfaceMatch,CompatibilityPairDetail,CompatibilityPairSummary,GeometrySelection,PartCapabilities,PrototypeData} from './types';
import {assemblyIndex,assemblyPartName,assemblySources} from './assembly-model';
import {loadCompatibilityPair,loadPartCapabilities,mergePartCapabilities} from './capability-data';
import {compatibilityConditionLabel,compatibilityPatternLabel} from './compatibility-presentation';
import {cartesianComparisonPage,comparisonConclusion,exploratoryCandidate,measurementRows,mechanismKey,mechanismName,mechanismNames,radialAllowance,sortedCandidates,structureCaption,structureComparisons,type PublishedPair} from './compatibility-summary';
import type {CompatibilityPreviewRequest} from './compatibility-preview';

type Props={data:PrototypeData;onHydratePart?:(detail:PartCapabilities)=>void;onSelectGeometry:(selection:GeometrySelection)=>void;onOpenSource?:AssemblyInspectorProps['onOpenSource'];compatibilityPreview?:CompatibilityPreviewRequest|null;onPreviewCompatibility?:(request:CompatibilityPreviewRequest|null)=>void};

function PreviewButton({candidate,pair,...props}:Props&{candidate:CompatibilityCandidate;pair:PublishedPair}){
  const index=assemblyIndex(props.data),a=index.features.get(pair.feature_a_ref),b=index.features.get(pair.feature_b_ref);
  if(!props.onPreviewCompatibility||!a||!b||a.owner_ref===b.owner_ref)return null;
  const key=[candidate.id,a.id,b.id].join('|'),active=props.compatibilityPreview?.key===key;
  return <button className={`compatibility-preview-button ${active?'is-active':''}`} aria-pressed={active} onClick={()=>props.onPreviewCompatibility?.({key,candidateId:candidate.id,mechanism:mechanismKey(candidate),title:`${structureCaption(props.data,[a.id])} ↔ ${structureCaption(props.data,[b.id])}`,features:[a,b]})}><Play size={12}/>{active?'正在左侧查看':'装配示意'}</button>;
}

function Comparison({candidate,pair,...props}:Props&{candidate:CompatibilityCandidate;pair:PublishedPair}){
  const a=assemblyIndex(props.data).features.get(pair.feature_a_ref),b=assemblyIndex(props.data).features.get(pair.feature_b_ref);
  return <div className="compatibility-comparison" data-comparison-refs={pair.feature_a_ref+'|'+pair.feature_b_ref}>
    <dl>{measurementRows(props.data,candidate,pair).map((row,i)=><div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    <p className="compatibility-conclusion">{comparisonConclusion(candidate,pair)}</p>
    <div className="assembly-actions"><button disabled={!a} onClick={()=>a&&props.onSelectGeometry({kind:'feature',id:a.id,ownerRef:a.owner_ref})}>查看本端<ChevronRight size={12}/></button><button disabled={!b} onClick={()=>b&&props.onSelectGeometry({kind:'feature',id:b.id,ownerRef:b.owner_ref})}>查看对端<ChevronRight size={12}/></button><PreviewButton {...props} candidate={candidate} pair={pair}/></div>
  </div>;
}

function PatternFamilies({candidate,data}:{candidate:CompatibilityCandidate;data:PrototypeData}){
  const [limit,setLimit]=useState(6);
  const patterns=candidate.mapping_family?.pattern_families;
  if(!Array.isArray(patterns)||!patterns.length)return null;
  return <details className="compatibility-patterns"><summary>{patterns.length} 组孔组布局线索</summary><p>按孔距、轴向与成员对应约束保留；具体选孔和共同放置待定。</p>{patterns.slice(0,limit).map((raw,i)=>{
    const p=raw as Record<string,unknown>,a=p.a as Record<string,unknown>,b=p.b as Record<string,unknown>;
    const title=(side:Record<string,unknown>)=>assemblyIndex(data).interfaces.get(String(side.interface_ref??side.id))?.name??'孔组';
    return <p key={i}>{i+1} · {title(a)} ↔ {title(b)} · 至少比较 {String(p.minimum_members??2)} 个成员</p>;
  })}{patterns.length>limit&&<button className="capability-more" onClick={()=>setLimit(v=>v+6)}>继续查看 · 余 {patterns.length-limit} 组</button>}</details>;
}

function CandidateCard({candidate,initiallyOpen,...props}:Props&{candidate:CompatibilityCandidate;initiallyOpen:boolean}){
  const [open,setOpen]=useState(initiallyOpen),[limit,setLimit]=useState(3),[rawOpen,setRawOpen]=useState(false),[planeLimit,setPlaneLimit]=useState(6);
  const groups=useMemo(()=>structureComparisons(props.data,candidate),[props.data,candidate]);
  const total=candidate.mapping_family?.kind==='cartesian_feature_relation'?(candidate.mapping_family.features_a?.length??0)*(candidate.mapping_family.features_b?.length??0):candidate.mapping_family?.pairs?.length??0;
  const sources=assemblySources(props.data,candidate.evidence_refs??[],(candidate.endpoints??[]).flatMap(e=>e.feature_refs));
  const kind=mechanismKey(candidate);
  const requirement=kind==='through_fastener'?'可能需要穿层螺栓、螺母及按需垫圈；规格按实际选孔确定。':kind==='screw_reception'?'可能需要螺钉及合适接收端；接收螺纹和规格待核。':null;
  return <details className="capability-candidate compatibility-method" open={open} onToggle={e=>setOpen(e.currentTarget.open)} data-compatibility-candidate={candidate.id}>
    <summary><span><strong>{mechanismName(candidate)}</strong><small>{groups.length?`${groups.length} 处结构可比较`:`${total} 处潜在面比较`}</small></span><span className="assembly-use-state is-possible">待验证</span></summary>
    {open&&<>
      {groups.slice(0,limit).map((group,number)=>{
        const lead=[...group.pairs].sort((a,b)=>{
          const av=radialAllowance(candidate,a),bv=radialAllowance(candidate,b);
          return (av?(av[0]+av[1])/2:Infinity)-(bv?(bv[0]+bv[1])/2:Infinity);
        })[0];
        const active=props.compatibilityPreview?.candidateId===candidate.id&&group.pairs.some(p=>props.compatibilityPreview?.key===[candidate.id,p.feature_a_ref,p.feature_b_ref].join('|'));
        return <article className={`compatibility-structure ${active?'is-preview':''}`} key={group.key} data-structure-comparison={group.key}>
          <h4><small>{String(number+1).padStart(2,'0')}</small>{structureCaption(props.data,group.featuresA)} <span>↔</span> {structureCaption(props.data,group.featuresB)}</h4>
          <div className="compatibility-structure-actions"><PreviewButton {...props} candidate={candidate} pair={lead}/><span>{group.pairs.length>1?`${group.pairs.length} 个孔段`:'单处结构'}</span></div>
          <details className="compatibility-measurements"><summary>尺寸与比较详情</summary><Comparison {...props} candidate={candidate} pair={lead}/>
            {group.pairs.length>1&&<details className="compatibility-segments"><summary>全部 {group.pairs.length} 次分段比较</summary>{group.pairs.map((pair,i)=><Comparison {...props} key={i} candidate={candidate} pair={pair}/>)}</details>}
          </details>
        </article>;
      })}
      {groups.length>limit&&<button className="capability-more" onClick={()=>setLimit(v=>v+4)}>继续查看 · 余 {groups.length-limit} 组结构线索</button>}
      {!groups.length&&candidate.mapping_family?.kind==='cartesian_feature_relation'&&<>
        <p className="compatibility-conclusion">本端 {candidate.mapping_family.features_a?.length??0} 处面区、对端 {candidate.mapping_family.features_b?.length??0} 处面区，保留 {total} 次潜在比较。实际相向重叠待求解。</p>
        <details className="compatibility-segments"><summary>查看有限面比较</summary>{cartesianComparisonPage(candidate,0,planeLimit).map((pair,i)=><Comparison {...props} key={i} candidate={candidate} pair={pair}/>)}{total>planeLimit&&<button className="capability-more" onClick={()=>setPlaneLimit(v=>v+6)}>继续查看 · 余 {total-planeLimit} 次</button>}</details>
      </>}
      <PatternFamilies candidate={candidate} data={props.data}/>
      <details className="compatibility-conditions"><summary>条件与依据</summary>
        {requirement&&<p className="compatibility-requirement">{requirement}</p>}
        {!!candidate.unresolved_conditions?.length&&<ul>{candidate.unresolved_conditions.map((c,i)=><li key={i}>{compatibilityConditionLabel(c)}</li>)}</ul>}
        {!!candidate.assumptions?.length&&<details><summary>适用假设</summary>{candidate.assumptions.map((c,i)=><p key={i}>{compatibilityConditionLabel(c)}</p>)}</details>}
        {props.onOpenSource&&sources.map(s=><button key={s.evidenceId??s.sourceId} onClick={()=>props.onOpenSource?.(s.sourceId,s.evidenceId)}><FileText size={12}/>{s.title}<ChevronRight size={12}/></button>)}
        <details onToggle={e=>setRawOpen(e.currentTarget.open)}><summary>原始检查数据</summary>{rawOpen&&<pre>{JSON.stringify({geometric_witness:candidate.geometric_witness,mapping_family:candidate.mapping_family,connector_requirements:candidate.connector_requirements},null,2)}</pre>}</details>
      </details>
    </>}
  </details>;
}

function CompleteInterfaceCard({candidate,initiallyOpen,...props}:Props&{candidate:CompatibilityCandidate;initiallyOpen:boolean}){
  const [open,setOpen]=useState(initiallyOpen),[limit,setLimit]=useState(3);
  const matches=useMemo(()=>[...candidate.interface_matches??[]].sort((a,b)=>b.member_count-a.member_count||a.id.localeCompare(b.id)),[candidate]);
  const index=assemblyIndex(props.data);
  const checked=candidate.whole_part_collision_evaluated===true;
  function groups(match:CompatibilityInterfaceMatch):[AssemblyFeature[],AssemblyFeature[]]{
    return (['a','b'] as const).map(side=>[...new Set(match.alignment_options.flatMap(option=>option.member_pairs.map(p=>side==='a'?p.feature_a_ref:p.feature_b_ref)))].map(ref=>index.features.get(ref)).filter((f):f is AssemblyFeature=>!!f)) as [AssemblyFeature[],AssemblyFeature[]];
  }
  function preview(match:CompatibilityInterfaceMatch){
    const featureGroups=groups(match);if(!featureGroups[0].length||!featureGroups[1].length)return;
    props.onPreviewCompatibility?.({key:candidate.id+'|'+match.id,candidateId:candidate.id,mechanism:mechanismKey(candidate),title:match.member_count>1?`${match.member_count}/${match.member_count} 孔位匹配 · ${compatibilityPatternLabel(match)}`:compatibilityPatternLabel(match)==='局部支承'?'局部支承对位':'有限配合区对位',features:[featureGroups[0][0],featureGroups[1][0]],featureGroups,interfaceMatch:match});
  }
  return <details className="capability-candidate compatibility-method" open={open} onToggle={event=>setOpen(event.currentTarget.open)} data-compatibility-candidate={candidate.id}>
    <summary><span><strong>{mechanismName(candidate)}</strong><small>{matches.length} 组接口匹配</small></span><span className={`assembly-use-state ${checked?'is-supported':'is-possible'}`}>{checked?'干涉已检查':'干涉待验证'}</span></summary>
    {open&&<>{matches.slice(0,limit).map((match,n)=>{
      const [fa,fb]=groups(match),a=index.interfaces.get(match.interface_a_ref),b=index.interfaces.get(match.interface_b_ref),active=props.compatibilityPreview?.key===candidate.id+'|'+match.id;
      return <article key={match.id} className={`compatibility-structure compatibility-complete-interface ${active?'is-preview':''}`} data-interface-match={match.id} data-matched-member-count={match.member_count}>
        <h4><small>{String(n+1).padStart(2,'0')}</small>{match.member_count>1?`${match.member_count}/${match.member_count} 孔位匹配`:'有限配合区匹配'}<span className="compatibility-pattern-state">{compatibilityPatternLabel(match)}</span></h4>
        {compatibilityPatternLabel(match)==='局部支承'&&<p className="compatibility-conclusion">局部支承候选，实际接触与轴向保持待核实。</p>}
        <p className="compatibility-interface-dimensions">{structureCaption(props.data,fa.map(f=>f.id))}<span> ↔ </span>{structureCaption(props.data,fb.map(f=>f.id))}</p>
        <div className="compatibility-structure-actions"><button className={`compatibility-preview-button ${active?'is-active':''}`} aria-pressed={active} onClick={()=>preview(match)}><Play size={12}/>{active?'正在左侧查看':'整组装配示意'}</button><span>{match.alignment_count} {checked?'种无干涉姿态':'种对位方向'}</span></div>
        <details className="compatibility-measurements"><summary>孔位、尺寸与依据</summary>
          <p>{a?.name} ↔ {b?.name}</p>
          <p>{match.member_count} 处对应由同一个姿态满足。{compatibilityPatternLabel(match)==='相邻双孔'?'成员按已声明的相邻双孔规则选择。':compatibilityPatternLabel(match)==='指定孔组'?'匹配有依据的指定孔组，其他备用孔不参与。':match.member_count>1?'整组参与匹配，不拆成单孔候选。':'有限配合范围按声明条件检查。'}</p>
          {match.member_pairs.map((pair,i)=><div className="compatibility-member-comparison" key={pair.member_a_ref}><strong>对应 {i+1}</strong><dl>{measurementRows(props.data,candidate,{...pair}).map((row,j)=><div key={j}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></div>)}
          <div className="assembly-actions"><button disabled={!a} onClick={()=>a&&props.onSelectGeometry({kind:'interface',id:a.id,ownerRef:a.owner_ref,memberRefs:match.member_pairs.map(p=>p.member_a_ref)})}>查看本端接口<ChevronRight size={12}/></button><button disabled={!b} onClick={()=>b&&props.onSelectGeometry({kind:'interface',id:b.id,ownerRef:b.owner_ref,memberRefs:match.member_pairs.map(p=>p.member_b_ref)})}>查看对端接口<ChevronRight size={12}/></button></div>
        </details>
      </article>;
    })}{matches.length>limit&&<button className="capability-more" onClick={()=>setLimit(v=>v+4)}>继续查看 · 余 {matches.length-limit} 组接口匹配</button>}
      <details className="compatibility-conditions"><summary>装配条件与依据</summary><p>{checked?'已逐姿态检查两个完整原模型，仅保留无实体干涉的对位。装入路径、紧固规格与保持仍需验证。':'孔组几何已匹配；整体干涉、装入路径、紧固规格与保持仍需验证。'}</p>{!!candidate.unresolved_conditions?.length&&<ul>{candidate.unresolved_conditions.map((condition,i)=><li key={i}>{compatibilityConditionLabel(condition)}</li>)}</ul>}{props.onOpenSource&&assemblySources(props.data,matches.flatMap(m=>m.evidence_refs)).map(source=><button key={source.evidenceId??source.sourceId} onClick={()=>props.onOpenSource?.(source.sourceId,source.evidenceId)}><FileText size={12}/>{source.title}<ChevronRight size={12}/></button>)}</details>
    </>}
  </details>;
}

export function CompatibilityPairView({pair,onBack,...props}:Props&{pair:CompatibilityPairSummary;onBack:()=>void}){
  const [detail,setDetail]=useState<CompatibilityPairDetail|null>(null),[parts,setParts]=useState<PartCapabilities[]>([]),[failure,setFailure]=useState(''),[retry,setRetry]=useState(0),[filter,setFilter]=useState(''),[explore,setExplore]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setDetail(null);setParts([]);setFailure('');setFilter('');setExplore(false);
    Promise.all([loadCompatibilityPair(props.data,pair,controller.signal),Promise.all(pair.owner_refs.map(owner=>loadPartCapabilities(props.data,owner,controller.signal)))]).then(([result,loaded])=>{
      if(controller.signal.aborted)return;
      const supplied=loaded.filter((d):d is PartCapabilities=>!!d);
      if(supplied.length!==pair.owner_refs.length)throw new Error('所选部件对缺少完整几何摘要。');
      for(const d of supplied)props.onHydratePart?.(d);
      setParts(supplied);setDetail(result);
    }).catch(e=>{if(!controller.signal.aborted)setFailure(e.message);});
    return()=>controller.abort();
    // Immutable pair identity controls the reads; hydration does not restart them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pair.path,props.data.meta.packageDigest,retry]);
  const data=useMemo(()=>parts.reduce(mergePartCapabilities,props.data),[props.data,parts]);
  const candidates=useMemo(()=>sortedCandidates(detail?.candidates??[]),[detail]);
  const selected=candidates.filter(c=>!filter||mechanismKey(c)===filter),main=selected.filter(c=>!exploratoryCandidate(c)),extra=selected.filter(exploratoryCandidate);
  return <section className="capability-pair-detail" data-compatibility-pair={pair.id}>
    <button className="assembly-back" onClick={()=>{props.onPreviewCompatibility?.(null);onBack();}}><ArrowLeft size={12}/>返回部件对</button>
    <h3>{pair.owner_refs.map(owner=>assemblyPartName(props.data,owner)).join(' ↔ ')}</h3>
    <p className="compatibility-scope">{pair.placement_evaluated?'完整接口匹配 · 固定姿态已检查干涉':pair.interface_match_count!==undefined?'完整接口匹配 · 整体装配待验证':'局部结构比较 · 整体装配待验证'}</p>
    {failure?<div className="capability-error" role="alert"><p>{failure}</p><button onClick={()=>setRetry(v=>v+1)}>重新读取</button></div>:!detail?<p className="capability-loading"><LoaderCircle size={14}/>读取双方结构与连接线索…</p>:<>
      {props.onPreviewCompatibility&&<p className="compatibility-preview-hint"><Box size={14}/>{pair.interface_match_count!==undefined?'选择一个接口，在左侧查看整组对位':'选择下方结构，在左侧演示对位'}</p>}
      <label className="compatibility-filter">连接方式<select aria-label="筛选连接方式" value={filter} onChange={e=>{props.onPreviewCompatibility?.(null);setFilter(e.target.value);}}><option value="">全部方式 · {candidates.length} 类</option>{[...new Set(candidates.map(mechanismKey))].map(key=><option key={key} value={key}>{mechanismNames[key]??key}</option>)}</select></label>
      {main.map((candidate,i)=>candidate.interface_matches?<CompleteInterfaceCard {...props} data={data} key={candidate.id} candidate={candidate} initiallyOpen={i===0}/>:<CandidateCard {...props} data={data} key={candidate.id} candidate={candidate} initiallyOpen={i===0}/>)}
      {extra.length>0&&<details className="compatibility-exploration" open={explore||!!filter} onToggle={e=>setExplore(e.currentTarget.open)}><summary>更多探索线索 · {extra.length} 类</summary><p>承托和普通接触几何，实际放置与重叠条件待核。</p>{(explore||filter)&&extra.map(c=><CandidateCard {...props} data={data} key={c.id} candidate={c} initiallyOpen={false}/>)}</details>}
      {!selected.length&&<p className="assembly-empty">当前筛选没有连接线索。</p>}
      <details className="compatibility-conditions"><summary>本部件对的检查范围</summary><p>{pair.interface_match_count!==undefined?`已保留 ${candidates.length} 类连接方式，逐组检查全部要求成员。单孔或单面局部线索单独保留，不计为兼容接口。`:`已保留 ${candidates.length} 类线索。分段比较和成员关系不等于完整装配方式。`}</p>{pair.placement_evaluated&&<p>整件干涉按两个完整原模型检查；存在穿透或无法判断的姿态不进入装配示意。分开到对位的动画不表示装入路径已通过检查。</p>}<pre>{JSON.stringify(detail.screening,null,2)}</pre></details>
    </>}
  </section>;
}
