import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Crosshair, FileText, Focus, Link2, Search } from 'lucide-react';
import type { AssemblyConnection, AssemblyInterface, CompatibilityPairSummary, GeometrySelection, Part, PartCapabilities, PrototypeData } from './types';
import { assemblyIndex, assemblyPartName, assemblySources, assemblyStateLabel, connectionsForInterface, interfacesForPart, interfacesForSelection, interfaceUseState, isUsedConnection, localMillimeters, memberDirection, peerEndpoints, referenceAssemblyData, selectedAssemblyMembers, selectionForInterface } from './assembly-model';
import './assembly-inspector.css';
import {fastenerViews,selectionForFastener} from './fastener-model';
import {CapabilityConnectionsPage,PartCapabilityInspector} from './CapabilityInspector';
import {connectionUseState,hasIdentifiedCounterpart,referenceAssessment,referencePendingSummary} from './assembly-model';
import {ChooseReferencePeer,ConnectionReviewControls} from './ReferenceReviewControls';
import type {ReferenceReviewController} from './reference-decisions';
import type {CompatibilityPreviewRequest} from './compatibility-preview';

export type CapabilityTab = 'geometry' | 'reference' | 'candidates';

export interface AssemblyInspectorProps {
  data: PrototypeData;
  part: Part;
  selection: GeometrySelection | null;
  capabilityTab: CapabilityTab;
  onCapabilityTabChange: (tab: CapabilityTab) => void;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onFocusGeometry?: (selection: GeometrySelection) => void;
  onFocusConnection?: (selection: GeometrySelection) => void;
  onNavigatePeer?: (selection: GeometrySelection, focus: boolean, fromSelection?:GeometrySelection) => void;
  onReturnToSite?: () => void;
  canReturnToSite?: boolean;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
  onHydratePart?: (detail:PartCapabilities) => void;
  referenceReview?:ReferenceReviewController;
  compatibilityPair?:CompatibilityPairSummary|null;
  onCompatibilityPairChange?:(pair:CompatibilityPairSummary|null)=>void;
  compatibilityPreview?:CompatibilityPreviewRequest|null;
  onPreviewCompatibility?:(request:CompatibilityPreviewRequest|null)=>void;
}

function EvidenceLinks({ data, refs, features = [], onOpenSource }: { data: PrototypeData; refs: string[]; features?: string[]; onOpenSource: AssemblyInspectorProps['onOpenSource'] }) {
  const sources = assemblySources(data, refs, features);
  if (!sources.length) return null;
  return <details className="assembly-evidence"><summary><FileText size={12} />查看依据</summary><div>{sources.map(source => <button key={source.evidenceId || source.sourceId} onClick={() => onOpenSource(source.sourceId, source.evidenceId)}>{source.title}<ChevronRight size={12} /></button>)}</div></details>;
}

function InterfacePeers({ props, item }: { props: AssemblyInspectorProps; item: AssemblyInterface }) {
  const connections = connectionsForInterface(props.data, item.id);
  const usable = connections.filter(connection => connection.manual_decision?.status!=='rejected'&&(connection.basis!=='incompatible'||connection.manual_decision?.status==='confirmed'));
  const incompatible = connections.filter(connection => connection.basis==='incompatible'&&!connection.manual_decision);
  const excluded=connections.filter(connection=>connection.manual_decision?.status==='rejected');
  const groups = [
    { label: '已识别对端', entries: usable.filter(hasIdentifiedCounterpart) },
    { label: '待核实对端', entries: usable.filter(connection => !hasIdentifiedCounterpart(connection)) },
  ];
  return <div className="assembly-peers">
    {groups.filter(group => group.entries.length).map(group => <section key={group.label}><h4>{group.label}</h4>{group.entries.map(connection => <div className="assembly-connection" data-assembly-connection={connection.id} key={connection.id}>
      {!referenceAssessment(connection)&&<p className="assembly-mechanism">{connection.name} · {assemblyStateLabel[connectionUseState(connection)]}</p>}
      {peerEndpoints(props.data, item, connection).map(({ target, memberRefs }) => {
        const paths=fastenerViews(props.data,props.selection).filter(view=>view.connectionRef===connection.id);
        const referenceMembers=paths.map(view=>view.entryInterfaceRef===target.id?view.entryMemberRef:view.receiverInterfaceRef===target.id?view.receiverMemberRef:'').filter(Boolean);
        const selection = {...selectionForInterface(target,referenceMembers.length?referenceMembers:memberRefs, connection.id),...(paths.length===1?{fastenerRef:paths[0].id}:{})};
        const members = target.members.filter(member => memberRefs.includes(member.id));
        return <div className="assembly-peer" data-assembly-peer={target.id} key={target.id}>
          <strong>{assemblyPartName(props.data, target.owner_ref)}</strong>
          <span>{target.name}{members.length ? ` · ${members.map(member => member.label).join(' + ')}` : ''}</span>
          <div className="assembly-actions"><button onClick={() => props.onNavigatePeer?.(selection, false)}>查看对端<ChevronRight size={12} /></button><button onClick={() => props.onNavigatePeer?.(selection, true)}><Focus size={12} />定位对端</button></div>
        </div>;
      })}
      <ConnectionAssessment connection={connection}/>
      {!referenceAssessment(connection)&&connection.note && <p className="assembly-specific-note">{connection.note}</p>}
      {(connection.basis==='hypothesis'||connection.manual_decision)&&<ConnectionReviewControls data={props.data} connection={connection} review={props.referenceReview}/>}
      {!!connection.fastener_paths?.length && <div className="assembly-fasteners">
        <h4>连接件示意</h4><p>选择一个孔查看螺钉示意；实际选孔数量、规格待核。</p>
        {fastenerViews(props.data,props.selection).filter(view=>view.connectionRef===connection.id).map(view=><button className="assembly-reference-focus" key={view.id} onClick={()=>props.onFocusConnection?.(selectionForFastener(view))}><Focus size={12}/>沿接口轴查看</button>)}
        <details><summary>可选参考路径 · {connection.fastener_paths.length}</summary>{connection.fastener_paths.map((path,index)=>{
          const endpoint=path.entry.interface_ref===item.id?path.entry:path.receiver;
          const selected={...selectionForInterface(item,[endpoint.member_ref],connection.id),fastenerRef:path.id};
          return <div className={`assembly-fastener-path ${props.selection?.fastenerRef===path.id?'is-selected':''}`} data-fastener-path={path.id} key={path.id}>
            <button onClick={()=>props.onSelectGeometry(selected)}>路径 {index+1} · 螺钉示意</button>
            <button onClick={()=>props.onFocusConnection?.(selected)}><Focus size={12}/>沿接口轴查看</button>
          </div>;
        })}</details>
      </div>}
    </div>)}</section>)}
    {!usable.length && <p className="assembly-available">{incompatible.length?'本件接口能力保留；原配置对应存在冲突。':'此接口可选用。'}</p>}
    {incompatible.map(connection => <div key={connection.id} data-assembly-connection={connection.id}>
      <h4>来源冲突对端</h4>
      <p className="assembly-incompatible">原配置记录：{connection.note || connection.name}</p>
      {peerEndpoints(props.data,item,connection).map(({target,memberRefs})=>{
        const selection=selectionForInterface(target,memberRefs,connection.id);
        return <div className="assembly-peer" data-assembly-peer={target.id} key={target.id}>
          <strong>{assemblyPartName(props.data,target.owner_ref)}</strong><span>{target.name}</span>
          <div className="assembly-actions"><button onClick={()=>props.onNavigatePeer?.(selection,false)}>查看对端<ChevronRight size={12}/></button><button onClick={()=>props.onNavigatePeer?.(selection,true)}><Focus size={12}/>定位对端</button></div>
        </div>;
      })}
      <ConnectionReviewControls data={props.data} connection={connection} review={props.referenceReview}/>
    </div>)}
    {excluded.map(connection=><div key={connection.id} data-assembly-connection={connection.id}><p className="assembly-specific-note">已排除：{connection.name}</p><ConnectionReviewControls data={props.data} connection={connection} review={props.referenceReview}/></div>)}
    {!usable.length&&<ChooseReferencePeer data={props.data} item={item} review={props.referenceReview} onHydratePart={props.onHydratePart}/>}
  </div>;
}

function ConnectionAssessment({connection}:{connection:AssemblyConnection}){
  const assessment=referenceAssessment(connection);
  if(!assessment)return null;
  return <div className="assembly-assessment" data-reference-assessment={connection.id}>
    <p>{assessment.summary}</p>
    <dl>
      <div><dt>用途</dt><dd>{assessment.purpose==='identified'?'已识别':'待核实'}</dd></div>
      <div><dt>对端</dt><dd>{assessment.counterpart==='identified'?'已识别':'待核实'}</dd></div>
      <div><dt>几何</dt><dd>{{axes_aligned:'孔位已对应',review_required:'来源几何待核',unverified:'待核实'}[assessment.geometry]}</dd></div>
      <div><dt>紧固细节</dt><dd>{{specified:'已注明',unspecified:'待核实',not_applicable:'不适用'}[assessment.fastening]}</dd></div>
    </dl>
    {!!assessment.open_items.length&&<ul>{assessment.open_items.map((item,index)=><li key={index}>{item.note}</li>)}</ul>}
  </div>;
}

export default function AssemblyInspector(props: AssemblyInspectorProps) {
  if (!props.data.assembly?.capability_index) return <LegacyAssemblyInspector {...props}/>;
  const referenceData = referenceAssemblyData(props.data);
  return <PartCapabilityInspector {...props} legacyInterfaces={<LegacyAssemblyInspector {...props}/>} referenceInterfaces={<LegacyAssemblyInspector {...props} data={referenceData}/>}/>;
}

function LegacyAssemblyInspector(props: AssemblyInspectorProps) {
  const { data, part, selection, onSelectGeometry } = props;
  const items = interfacesForPart(data, part.id);
  const candidates = interfacesForSelection(data, selection).filter(item => item.owner_ref === part.id);
  const active = candidates.length === 1 ? candidates[0] : undefined;
  const [browsing, setBrowsing] = useState(!active);
  useEffect(() => { setBrowsing(!active); }, [part.id, active?.id]);
  const selected = active ? selectedAssemblyMembers(data, active, selection) : [];
  const selectedIds = selected.map(member => member.id);
  const choose = (item: AssemblyInterface) => { setBrowsing(false); onSelectGeometry(selectionForInterface(item)); };
  const notes = data.assembly?.part_notes.filter(note => note.owner_ref === part.id) ?? [];
  const connections = active ? connectionsForInterface(data, active.id) : [];
  const usedMembers = new Set(connections.filter(isUsedConnection).flatMap(connection => connection.endpoints.filter(endpoint => endpoint.interface_ref === active?.id).flatMap(endpoint => endpoint.member_refs)));
  const currentSelection = active ? selection?.kind === 'interface' && selection.id === active.id ? selection : selectionForInterface(active, selectedIds) : null;
  return <div className="assembly-inspector" data-assembly-part={part.id}>
    {props.canReturnToSite && <button className="assembly-back assembly-return" onClick={props.onReturnToSite}><ArrowLeft size={13} />返回原接口</button>}
    {!active || browsing ? <section className="assembly-directory">
      <h3>安装接口<small>尺寸 mm · 源局部</small></h3>
      {items.map(item => {
        const state = interfaceUseState(data, item);
        const itemConnections=connectionsForInterface(data,item.id);
        const referenceConnections = itemConnections.filter(c=>c.manual_decision?.status!=='rejected'&&(c.basis!=='incompatible'||c.manual_decision?.status==='confirmed'));
        const peers=referenceConnections.flatMap(connection=>peerEndpoints(data,item,connection).map(peer=>({...peer,connection})));
        return <div className={`assembly-interface-row ${candidates.some(candidate => candidate.id === item.id) ? 'is-selected' : ''}`} data-assembly-interface={item.id} key={item.id}>
          <button className="assembly-interface-select" onClick={() => choose(item)} aria-label={`选择${item.name}`}><Crosshair size={15} /><span><strong>{item.name}</strong><small>{item.geometry_summary}</small>{!peers.length&&data.assembly?.capability_index&&<span className="assembly-row-peers">{state==='excluded'?'人工已排除此对应':connectionsForInterface(data,item.id).length?'参考配置存在冲突记录':'原装配对端待确认'}</span>}</span><span className={`assembly-use-state is-${state}`}>{assemblyStateLabel[state]}</span><ChevronRight size={13} /></button>
          <button className="assembly-locate" aria-label={`定位${item.name}`} title="定位本端" onClick={() => { choose(item); props.onFocusGeometry?.(selectionForInterface(item)); }}><Focus size={15} /></button>
          {!!peers.length&&<div className="assembly-peer-links">{peers.map(({target,memberRefs,connection})=><button key={connection.id+target.id} data-reference-peer-link={target.id} title={`查看${assemblyPartName(data,target.owner_ref)}的${target.name}`} onClick={()=>props.onNavigatePeer?.(selectionForInterface(target,memberRefs,connection.id),false,selectionForInterface(item,connection.endpoints.find(e=>e.interface_ref===item.id)?.member_refs??[],connection.id))}>{assemblyPartName(data,target.owner_ref)}{!hasIdentifiedCounterpart(connection)&&'（待核实）'}<ChevronRight size={10}/></button>)}</div>}
          {itemConnections.some(c=>referencePendingSummary(c))&&<p className="assembly-row-assessment">{[...new Set(itemConnections.map(referencePendingSummary).filter(Boolean))].join('；')}</p>}
        </div>;
      })}
      {!items.length && <p className="assembly-empty">本件暂无安装接口记录。</p>}
    </section> : <section className="assembly-detail" data-active-assembly-interface={active.id}>
      <button className="assembly-back" onClick={() => setBrowsing(true)}><ArrowLeft size={12} />本件接口</button>
      <div className="assembly-detail-heading"><h3>{active.name}</h3><span className={`assembly-use-state is-${interfaceUseState(data, active)}`}>{assemblyStateLabel[interfaceUseState(data, active)]}</span></div>
      <p className="assembly-dimensions">{active.geometry_summary}</p>
      {active.purpose&&active.purpose.trim()!==active.name.trim() && <p className="assembly-purpose">{active.purpose}</p>}
      {!selected.length && <p className="assembly-specific-note">当前关系尚未指定实际选用成员，可选择一个孔查看参考路径。</p>}
      <div className="assembly-actions assembly-primary-actions"><button disabled={!selected.length} onClick={() => currentSelection && props.onFocusGeometry?.(currentSelection)}><Focus size={13} />定位本端</button><button onClick={() => onSelectGeometry(selectionForInterface(active))}><Crosshair size={13} />选择整个接口</button></div>
      <div className="assembly-members"><h4>组成<span>{active.members.length} 个成员</span></h4>{active.members.map(member => {
        const isSelected = selectedIds.includes(member.id);
        return <button key={member.id} className={`assembly-member ${isSelected ? 'is-selected' : ''}`} data-assembly-member={member.id} aria-pressed={isSelected} onClick={() => onSelectGeometry(selectionForInterface(active, [member.id]))}>
          <Crosshair size={12} /><span><strong>{active.members.indexOf(member)+1} · {member.label}</strong></span>{usedMembers.has(member.id) && <span className="assembly-member-used">已用</span>}
        </button>;
      })}</div>
      {active.selection.kind === 'adjacent_pair' && <div className="assembly-pairs"><h4>本侧选相邻两孔</h4><div>{(active.selection.allowed_pairs ?? []).map(pair => {
        const members = pair.map(ref => active.members.find(member => member.id === ref));
        if (members.some(member => !member)) return null;
        const isSelected = selectedIds.length === 2 && pair.every(ref => selectedIds.includes(ref));
        return <button key={pair.join('|')} data-assembly-pair={pair.join('|')} className={isSelected ? 'is-selected' : ''} aria-pressed={isSelected} onClick={() => onSelectGeometry(selectionForInterface(active, pair))}>{members.map(member => `孔 ${active.members.indexOf(member!)+1}`).join(' + ')}</button>;
      })}</div></div>}
      <InterfacePeers props={props} item={active} />
      {active.note && !connections.some(connection=>connection.note?.trim()===active.note?.trim()) && (connections.some(connection=>referenceAssessment(connection))?<details className="assembly-evidence"><summary>接口补充说明</summary><p className="assembly-specific-note">{active.note}</p></details>:<p className="assembly-specific-note">{active.note}</p>)}
      {active.members.some(member=>member.feature_refs.some(ref=>assemblyIndex(data).features.get(ref)?.geometry.type==='source_region'))&&<p className="assembly-specific-note">已定位局部曲面，完整接触范围待核实。</p>}
      <EvidenceLinks data={data} refs={[...active.evidence_refs, ...connections.flatMap(connection => connection.evidence_refs)]} features={active.members.flatMap(member => member.feature_refs)} onOpenSource={props.onOpenSource} />
      <details className="assembly-evidence"><summary>几何位置 · 源局部 mm</summary><div>{active.members.map((member,index)=><p key={member.id}>{index+1} · {localMillimeters(member.position)} · 方向 {memberDirection(member.direction)}</p>)}</div></details>
    </section>}
    {notes.length > 0 && <div className="assembly-part-notes">{notes.map((note, index) => <p key={index}>{note.text}</p>)}</div>}
  </div>;
}

type ConnectionsPageProps = { data: PrototypeData; onSelectGeometry: (selection: GeometrySelection) => void; onOpenSource?: AssemblyInspectorProps['onOpenSource']; onHydratePart?:AssemblyInspectorProps['onHydratePart'];onCompatibilityPairChange?:AssemblyInspectorProps['onCompatibilityPairChange'];compatibilityPreview?:CompatibilityPreviewRequest|null;onPreviewCompatibility?:AssemblyInspectorProps['onPreviewCompatibility'] };

export function AssemblyConnectionsPage(props:ConnectionsPageProps) {
  return props.data.assembly?.capability_index ? <CapabilityConnectionsPage {...props}/> : <LegacyAssemblyConnectionsPage {...props}/>;
}

function LegacyAssemblyConnectionsPage({ data, onSelectGeometry, onOpenSource }: ConnectionsPageProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const index = assemblyIndex(data);
  const connections = useMemo(() => (data.assembly?.connections ?? []).filter(connection => {
    if (connection.basis === 'incompatible' || scope === 'used' && !isUsedConnection(connection) || scope === 'possible' && connection.basis !== 'hypothesis') return false;
    const labels = connection.endpoints.flatMap(endpoint => {
      const item = index.interfaces.get(endpoint.interface_ref);
      return item ? [item.name, item.purpose, assemblyPartName(data, item.owner_ref)] : [];
    });
    return [connection.name, ...labels].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [data, index, query, scope]);
  return <div className="assembly-connections-page">
    <header><h2>装配连接</h2><div className="assembly-page-filters"><label className="assembly-search"><Search size={14} /><input aria-label="查找装配连接" placeholder="查找部件或接口" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="连接范围" value={scope} onChange={event => setScope(event.target.value)}><option value="all">全部连接</option><option value="used">已用</option><option value="possible">待核实</option></select></div></header>
    <div className="assembly-connections-list">{connections.map(connection => <article className="assembly-catalog-connection" key={connection.id} data-assembly-connection={connection.id}>
      <div className="assembly-catalog-connection-title"><Link2 size={15} /><h3>{connection.name}</h3><span className={`assembly-use-state is-${connectionUseState(connection)}`}>{assemblyStateLabel[connectionUseState(connection)]}</span></div>
      <div className="assembly-endpoints">{connection.endpoints.map(endpoint => {
        const item = index.interfaces.get(endpoint.interface_ref);
        if (!item) return null;
        const members = item.members.filter(member => endpoint.member_refs.includes(member.id));
        return <button key={endpoint.interface_ref} onClick={() => onSelectGeometry(selectionForInterface(item, endpoint.member_refs, connection.id))}><strong>{assemblyPartName(data, item.owner_ref)}</strong><span>{item.name}{members.length ? ` · ${members.map(member => member.label).join(' + ')}` : ''}</span><ChevronRight size={13} /></button>;
      })}</div>
      <ConnectionAssessment connection={connection}/>
      {!referenceAssessment(connection)&&connection.note && <p className="assembly-specific-note">{connection.note}</p>}
      {onOpenSource && <EvidenceLinks data={data} refs={connection.evidence_refs} onOpenSource={onOpenSource} />}
    </article>)}</div>
    {!connections.length && <p className="assembly-empty">没有与搜索条件相符的连接。</p>}
  </div>;
}
