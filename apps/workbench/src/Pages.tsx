import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Box, Braces, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Copy, Cpu, Disc3, ExternalLink, FileCode2, FileImage, FileSpreadsheet, FileText, FolderOpen, Info, Layers, Link2, Move3D, Search, Shapes, X } from 'lucide-react';
import { GROUP_LABELS, KIND_LABELS, type GeometrySelection, type Part, type PartKind, type PrototypeData, type Source } from './types';
import { ONTOLOGY_TYPES } from './ontology';
import { OntologyAssociations } from './OntologyAssociations';
import './pages.css';

export interface PageProps {
  data: PrototypeData;
  onSelectPart: (id: string) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
}

const scopeLabels: Record<Source['scope'], string> = { model: '模型参考', alpha: 'alpha 设备', hat: 'HAT C1 板级', media: '外观媒体', ontology: '本体规范', package: '资料包说明' };
const kindIcons: Record<PartKind, typeof Box> = { structure: Box, shell: Shapes, actuator: Cpu, electronics: Cpu, bearing: Disc3, other: Box };
const textMatch = (query: string, values: unknown[]) => values.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatName = (format: string) => format.replace(/^(application|text|image|video)\//, '').toUpperCase().replace('MARKDOWN', 'MD').replace('PLAIN', 'TXT');
const getSourceIcon = (format: string) => /pdf|md|markdown|plain/i.test(format) ? FileText : /csv/i.test(format) ? FileSpreadsheet : /xml|json/i.test(format) ? FileCode2 : /jpg|png|webp|jpeg/i.test(format) ? FileImage : Box;
const SOURCE_PAGE_LINES = 160;

function Empty({title, description, action}: {title: string; description: string; action?: ReactNode}) {
  return <div className="bp-empty"><div className="bp-empty-icon"><Search size={24} strokeWidth={1.4}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Heading({title, description, children}: {eyebrow: string; title: string; description: string; children?: ReactNode}) {
  return <header className="bp-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}

function SearchField({value, onChange, placeholder}: {value: string; onChange: (value: string) => void; placeholder: string}) {
  return <label className="bp-search"><Search size={16}/><input aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>{value && <button type="button" aria-label="清空搜索" onClick={() => onChange('')}><X size={13}/></button>}</label>;
}

export function KnowledgePage({data, onSelectPart, onOpenSource}: PageProps) {
  const [tab, setTab] = useState<'parts'|'joints'>('parts');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [group, setGroup] = useState('all');
  const filtered = useMemo(() => data.parts.filter(part => textMatch(query, [part.id, part.name, part.meshKey, part.body, part.groupLabel, KIND_LABELS[part.kind]]) && (kind === 'all' || kind === part.kind) && (group === 'all' || group === part.group)), [data.parts, query, kind, group]);
  const joints = data.joints.filter(joint => textMatch(query, [joint.name, joint.label, joint.body, joint.parent]));
  const showEvidence = (part: Part) => {
    const evidence = data.evidence.find(item => part.evidenceIds.includes(item.id));
    const sourceId = evidence?.sourceId || part.sourceIds[0];
    if (sourceId) onOpenSource(sourceId, evidence?.id);
  };
  return <div className="bp-page">
    <Heading eyebrow="KNOWLEDGE EXPLORER" title="知识索引" description="按部件、类别与来源节点，查找模型中的具体知识。"><div className="bp-heading-chip"><span className="bp-status-dot"/>只读知识快照</div></Heading>
    <div className="bp-workspace-card">
      <div className="bp-tabs"><button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}><Box size={16}/>部件实例<span>{data.parts.length}</span></button><button className={tab === 'joints' ? 'active' : ''} onClick={() => setTab('joints')}><Move3D size={16}/>来源运动<span>{data.joints.length}</span></button><div className="bp-tabs-note"><Layers size={13}/>robot_walk · 模型参考</div></div>
      <div className="bp-filterbar"><SearchField value={query} onChange={setQuery} placeholder={tab === 'parts' ? '搜索部件名称、型号或 ID…' : '搜索关节名称或来源节点…'}/>{tab === 'parts' && <div className="bp-filter-selects"><select aria-label="筛选部件类别" value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部类别</option>{Object.entries(KIND_LABELS).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select><select aria-label="筛选部件分组" value={group} onChange={event => setGroup(event.target.value)}><option value="all">全部分组</option>{Object.entries(GROUP_LABELS).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></div>}</div>
      {tab === 'parts' ? filtered.length ? <div className="bp-table-scroll"><table className="bp-table bp-part-table"><thead><tr><th>部件对象</th><th>类别</th><th>所属分组</th><th>来源刚体节点</th><th>可追溯依据</th><th/></tr></thead><tbody>{filtered.map(part => {const Icon = kindIcons[part.kind]; return <tr key={part.id} tabIndex={0} onClick={() => onSelectPart(part.id)} onKeyDown={event => {if(event.key === 'Enter' && event.target === event.currentTarget) onSelectPart(part.id);}}><td><div className="bp-object-cell"><span className={`bp-object-icon kind-${part.kind}`}><Icon size={18} strokeWidth={1.55}/></span><div><strong>{part.name}</strong><small>{part.id}</small></div></div></td><td><span className="bp-neutral-tag">{KIND_LABELS[part.kind]}</span></td><td>{part.groupLabel}</td><td><code className="bp-table-code">{part.body}</code></td><td><button className="bp-text-button" onClick={event => {event.stopPropagation(); showEvidence(part);}}><Link2 size={14}/>{part.evidenceIds.length} 条定位</button></td><td><ArrowUpRight className="bp-row-arrow" size={16}/></td></tr>;})}</tbody></table></div> : <Empty title="没有找到匹配的部件" description="可以尝试中文名称、XL330 型号或来源节点名称。" action={<button className="bp-button" onClick={() => {setQuery('');setGroup('all');setKind('all');}}>清除筛选</button>}/> : joints.length ? <div className="bp-table-scroll"><table className="bp-table"><thead><tr><th>来源关节</th><th>父节点 → 子节点</th><th>运动轴</th><th>模型范围</th><th>来源</th></tr></thead><tbody>{joints.map(joint => <tr key={joint.id}><td><div className="bp-object-cell"><span className="bp-object-icon kind-structure"><Move3D size={18}/></span><div><strong>{joint.label || joint.name}</strong><small>{joint.name}</small></div></div></td><td><code className="bp-table-code">{joint.parent}</code><span className="bp-inline-arrow">→</span><code className="bp-table-code">{joint.body}</code></td><td><code>{joint.axis.join(' · ')}</code></td><td>{joint.range.map(value => `${(value * 180 / Math.PI).toFixed(1)}°`).join(' ～ ')}</td><td><button className="bp-text-button" onClick={() => onOpenSource(joint.sourceId)}><FileCode2 size={14}/>查看 XML</button></td></tr>)}</tbody></table></div> : <Empty title="没有匹配的运动定义" description="当前列表仅显示来源 XML 中实际存在的关节。"/>}
      <footer className="bp-table-footer"><span>显示 {tab === 'parts' ? filtered.length : joints.length} / {tab === 'parts' ? data.parts.length : data.joints.length} 个对象</span><span>模型实例与采购数量分别表达<span className="bp-footer-dot">·</span>点击部件，在 3D 中定位</span></footer>
    </div>
    <div className="bp-inline-note"><Info size={15}/><span>来源模型、软件配置与板级资料分别保存。模型映射用于知识浏览，不确认不同资料域对应同一实机。</span></div>
  </div>;
}

function instanceCount(key: string, data: PrototypeData) {
  if (key === 'Part') return data.parts.length;
  if (key === 'Frame') return 0;
  if (key === 'Feature') return data.assembly?.features.length || 0;
  if (key === 'Interface') return data.assembly?.interfaces.length || 0;
  if (key === 'InterfaceConnection') return data.assembly?.connections.length || 0;
  if (key === 'Source') return data.sources.length;
  if (key === 'Evidence') return data.evidence.length;
  return 0;
}

export interface OntologyPageProps extends PageProps {
  initialType?: string;
  onSelectInterface?: (id: string) => void;
  onSelectGeometry?: (selection: GeometrySelection) => void;
  onOpenVersions?: () => void;
}

export function OntologyPage({data, onSelectPart, onOpenSource, initialType, onSelectInterface, onSelectGeometry, onOpenVersions}: OntologyPageProps) {
  const [selected, setSelected] = useState(() => ONTOLOGY_TYPES.some(type => type.key === initialType) ? initialType! : 'Part');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'structure'|'relations'>('structure');
  const current = ONTOLOGY_TYPES.find(type => type.key === selected)!;
  const types = ONTOLOGY_TYPES.filter(type => textMatch(query, [type.key,type.label,type.group]));
  const ontologySource = data.sources.find(source => source.scope === 'ontology');
  const count = instanceCount(current.key, data);
  const isGeometryType = ['Frame', 'Feature', 'Interface', 'InterfaceConnection'].includes(current.key);
  const associationLabel = isGeometryType ? !data.assembly ? '此快照未提供装配目录' : current.key === 'Frame' ? '部位与几何采用源局部坐标' : current.key === 'Feature' ? `${count} 项源几何` : current.key === 'Interface' ? `${count} 个装配接口` : `${count} 条目录关系` : count ? `${count} 个来源映射` : '尚无确认实例';
  return <div className="bp-page bp-ontology-page">
    <Heading eyebrow="ONTOLOGY LIBRARY" title="本体定义" description="查看对象、空间、连接与判定规则，以及当前来源能够支持的内容。"><span className="bp-version-tag">draft.4<span>规范草案</span></span></Heading>
    <div className="bp-ontology-layout">
      <aside className="bp-type-nav"><div className="bp-type-nav-top"><span>类型目录</span><span>{ONTOLOGY_TYPES.length}</span></div><SearchField value={query} onChange={setQuery} placeholder="查找类型…"/>{['装配主干','空间与运动','条件与任务','来源与依据'].map(groupName => <section key={groupName}><h3>{groupName}</h3>{types.filter(type => type.group === groupName).map(type => <button className={selected === type.key ? 'active' : ''} key={type.key} onClick={() => {setSelected(type.key);setTab('structure');}}><span><strong>{type.label}</strong><small>{type.key}</small></span><ChevronRight size={14}/></button>)}</section>)}</aside>
      <section className="bp-type-content"><div className="bp-type-cover"><span className="bp-type-symbol"><Braces size={26} strokeWidth={1.4}/></span><div><span className="bp-eyebrow">{current.group}</span><h2>{current.key}<span>{current.label}</span></h2><p>{current.description}</p></div></div><div className="bp-type-meta"><span><BookOpen size={14}/>{current.section}</span><span><CircleDot size={14}/>{associationLabel}</span>{ontologySource && <button className="bp-text-button" onClick={() => onOpenSource(ontologySource.id)}>阅读规范<ArrowUpRight size={13}/></button>}</div><div className="bp-tabs bp-type-tabs"><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>结构定义<span>{current.fields.length}</span></button><button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关联与实例</button></div>
        {tab === 'structure' ? <div className="bp-field-list">{current.fields.map(field => <div className="bp-field" key={field.key}><div><div className="bp-field-heading"><code>{field.key}</code><span>{field.label}</span></div><p>{field.description}</p><span className="bp-field-type">{field.type}</span></div></div>)}</div> : <div className="bp-relation-content"><div className="bp-relation-diagram"><span><Box size={23}/>{current.key}</span><span className="bp-relation-line"/><span><Link2 size={23}/>显式关联</span><span className="bp-relation-line"/><span><FileText size={23}/>来源依据</span></div><code className="bp-relation-expression">{current.relation}</code>{isGeometryType ? <OntologyAssociations key={current.key} data={data} typeKey={current.key} onSelectPart={onSelectPart} onSelectInterface={onSelectInterface} onSelectGeometry={onSelectGeometry} onOpenVersions={onOpenVersions} /> : current.key === 'Part' ? <div className="bp-instance-links">{data.parts.slice(0,5).map(part => <button key={part.id} onClick={() => onSelectPart(part.id)}><span><Box size={15}/>{part.name}</span><ArrowUpRight size={14}/></button>)}<p>显示前 5 个模型对象，完整列表见知识索引。</p></div> : <div className="bp-type-instance-note"><Layers size={21}/><strong>{count ? `${count} 个可浏览来源映射` : '当前快照未提供确认实例'}</strong><p>本体定义持续可查；来源没有支持的字段和机械关系保持未确认。</p></div>}</div>}
        <div className="bp-definition-note"><Info size={16}/><p>{current.note}</p></div>
      </section>
    </div>
  </div>;
}

export function SourcesPage({data, onOpenSource}: PageProps) {
  const [query,setQuery] = useState('');
  const [scope,setScope] = useState('all');
  const [format,setFormat] = useState('all');
  const formats = [...new Set(data.sources.map(source => source.format))].sort();
  const sources = data.sources.filter(source => textMatch(query,[source.title,source.path,source.id,source.digest]) && (scope === 'all' || source.scope === scope) && (format === 'all' || source.format === format));
  return <div className="bp-page">
    <Heading eyebrow="SOURCE LIBRARY" title="来源资料" description="查看冻结原件、资料范围，以及知识对应的具体位置。"><span className="bp-heading-chip"><FolderOpen size={14}/>{data.sources.length} 份来源</span></Heading>
    <div className="bp-source-context"><div className="bp-source-context-icon"><Layers size={22}/></div><div><strong>Microduck 官方来源资料</strong><p>模型快照 <code>{data.meta.sourceCommit.slice(0,12)}</code><span>·</span>原始材料与补充装配来源独立登记</p></div><span className="bp-soft-badge">本地保存</span></div>
    <div className="bp-workspace-card"><div className="bp-scope-tabs">{[['all','全部资料'],['model','模型参考'],['alpha','alpha 设备'],['hat','HAT C1'],['media','媒体'],['ontology','本体规范']].map(([key,label]) => <button key={key} onClick={() => setScope(key)} className={scope === key ? 'active' : ''}>{label}<span>{key === 'all' ? data.sources.length : data.sources.filter(source => source.scope === key).length}</span></button>)}</div><div className="bp-filterbar"><SearchField value={query} onChange={setQuery} placeholder="搜索文件名、来源 ID 或资料范围…"/><select value={format} aria-label="筛选来源格式" onChange={event => setFormat(event.target.value)}><option value="all">全部格式</option>{formats.map(item => <option value={item} key={item}>{formatName(item)}</option>)}</select></div>
      {sources.length ? <div className="bp-table-scroll"><table className="bp-table bp-source-table"><thead><tr><th>来源文件</th><th>资料范围</th><th>格式</th><th>文件大小</th><th>定位依据</th><th/></tr></thead><tbody>{sources.map(source => {const Icon=getSourceIcon(source.format); const evidenceCount=data.evidence.filter(item => item.sourceId === source.id).length; return <tr key={source.id} tabIndex={0} onClick={() => onOpenSource(source.id)} onKeyDown={event => {if(event.key==='Enter' && event.target === event.currentTarget) onOpenSource(source.id);}}><td><div className="bp-object-cell"><span className={`bp-source-file-icon format-${formatName(source.format).toLowerCase()}`}><Icon size={19} strokeWidth={1.5}/></span><div><strong>{source.title}{source.supplemented && <span className="bp-supplemented">补充</span>}</strong><small title={source.path}>{source.path}</small></div></div></td><td><span className={`bp-scope-badge scope-${source.scope}`}>{scopeLabels[source.scope]}</span></td><td><span className="bp-format-label">{formatName(source.format)}</span></td><td>{sizeLabel(source.bytes)}</td><td>{evidenceCount ? <span className="bp-evidence-count"><Link2 size={13}/>{evidenceCount}</span> : <span className="bp-muted">—</span>}</td><td><ArrowUpRight className="bp-row-arrow" size={16}/></td></tr>;})}</tbody></table></div> : <Empty title="没有匹配的来源文件" description="尝试文件名、资料范围或其他格式。" action={<button className="bp-button" onClick={() => {setQuery('');setScope('all');setFormat('all');}}>重置筛选</button>}/>}<footer className="bp-table-footer"><span>{sources.length} 份文件<span className="bp-footer-dot">·</span>{sizeLabel(sources.reduce((sum,source) => sum+source.bytes,0))}</span><span><CheckCircle2 size={13}/>原件摘要已登记</span></footer></div>
    <div className="bp-inline-note"><Info size={15}/><span>各份资料保留自己的来源、版本与适用范围；未确认的跨资料对应关系继续保留。</span></div>
  </div>;
}

export interface EvidenceDialogProps {
  data: PrototypeData;
  sourceId: string;
  evidenceId?: string;
  onClose: () => void;
  onSelectPart: (id:string) => void;
}

export function EvidenceDialog({data,sourceId,evidenceId,onClose,onSelectPart}: EvidenceDialogProps) {
  const source=data.sources.find(item=>item.id===sourceId);
  const evidence=data.evidence.find(item=>item.id===evidenceId && item.sourceId===sourceId);
  const [copied,setCopied]=useState(false);
  const [sourceQuery,setSourceQuery]=useState('');
  const [pageStart,setPageStart]=useState(0);
  const [matchIndex,setMatchIndex]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [loaded,setLoaded]=useState<{key:string;text?:string;loading:boolean;error?:string}>({key:'',loading:false});
  const dialogRef=useRef<HTMLDivElement>(null);
  const lineRef=useRef<HTMLDivElement>(null);
  const documentRef=useRef<HTMLDivElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const textKey=[sourceId,source?.digest,source?.url].join('|');
  const textSource=!!source && (/text\/|markdown|plain|(^|\/)(md|txt|csv|xml|json|yaml|yml|log)(;|$)/i.test(source.format) || /\.(md|txt|csv|xml|json|yaml|yml|log)$/i.test(source.path));
  const sourceText=source?.text ?? (loaded.key===textKey?loaded.text:undefined);
  const loading=textSource && sourceText===undefined && (loaded.key!==textKey || loaded.loading);
  const loadError=loaded.key===textKey?loaded.error:undefined;
  const lines=useMemo(()=>sourceText===undefined?[]:sourceText.split(/\r?\n/),[sourceText]);
  const needle=sourceQuery.trim().toLocaleLowerCase();
  const matches=useMemo(()=>needle?lines.flatMap((line,index)=>line.toLocaleLowerCase().includes(needle)?[index]:[]):[],[lines,needle]);
  const currentMatch=Math.min(matchIndex,Math.max(0,matches.length-1));
  const visibleStart=Math.min(pageStart,Math.max(0,Math.floor((lines.length-1)/SOURCE_PAGE_LINES)*SOURCE_PAGE_LINES));
  const highlightStart=evidence?.lineStart || evidence?.row;
  const highlightEnd=evidence?.lineEnd || highlightStart;
  const focusLine=needle?matches[currentMatch]+1:highlightStart;
  useEffect(()=>{
    if(!source || !textSource || source.text!==undefined)return;
    const controller=new AbortController();
    setLoaded({key:textKey,loading:true});
    fetch(source.url,{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error('Source unavailable');
      return response.text();
    }).then(text=>setLoaded({key:textKey,text,loading:false})).catch(error=>{
      if(!controller.signal.aborted)setLoaded({key:textKey,loading:false,error:error instanceof Error?'无法读取原文，请重试或打开原件。':'无法读取原文。'});
    });
    return()=>controller.abort();
  },[source,textKey,textSource,attempt]);
  useEffect(()=>{
    previousFocus.current=document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    const handler=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab' && dialogRef.current){
        const elements=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,iframe')].filter(element=>element.offsetParent!==null);
        if(!elements.length)return;
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey && (document.activeElement===first || document.activeElement===dialogRef.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',handler);
    return ()=>{document.removeEventListener('keydown',handler);previousFocus.current?.focus();};
  },[onClose,sourceId]);
  useEffect(()=>{setSourceQuery('');setCopied(false);setMatchIndex(0);setPageStart(Math.floor(Math.max(0,(highlightStart || 1)-1)/SOURCE_PAGE_LINES)*SOURCE_PAGE_LINES);},[sourceId,evidenceId,highlightStart]);
  useEffect(()=>{
    setMatchIndex(0);
    if(matches.length)setPageStart(Math.floor(matches[0]/SOURCE_PAGE_LINES)*SOURCE_PAGE_LINES);
  },[matches]);
  useEffect(()=>{
    if(documentRef.current)documentRef.current.scrollTop=0;
    const timer=window.setTimeout(()=>lineRef.current?.scrollIntoView({block:'center',behavior:'instant'}),0);
    return()=>window.clearTimeout(timer);
  },[visibleStart,focusLine,sourceText]);
  if(!source)return null;
  const Icon=getSourceIcon(source.format);
  const format=source.format.toLowerCase();
  const relatedParts=data.parts.filter(part=>part.sourceIds.includes(sourceId));
  const relatedEvidence=data.evidence.filter(item=>item.sourceId===sourceId);
  const copy=async()=>{
    const context=new URLSearchParams(location.hash.split('?')[1]);
    context.set('source',source.id);if(evidence)context.set('evidence',evidence.id);else context.delete('evidence');
    const locator=`${location.origin}${location.pathname}#sources?${context}`;
    try {
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(locator);
      else {
        const input=document.createElement('textarea');
        input.value=locator;input.style.position='fixed';input.style.opacity='0';
        dialogRef.current?.append(input);input.select();
        const succeeded=document.execCommand('copy');input.remove();
        if(!succeeded)throw new Error('Clipboard unavailable');
      }
      setCopied(true);window.setTimeout(()=>setCopied(false),1800);
    } catch {setCopied(false);window.prompt('复制来源定位',locator);}
  };
  const renderContent=()=>{
    if(loading)return <div className="bp-binary-preview" role="status"><p>正在读取原文…</p></div>;
    if(loadError)return <div className="bp-binary-preview"><p role="alert">{loadError}</p><button className="bp-button" onClick={()=>setAttempt(value=>value+1)}>重试读取</button></div>;
    if(lines.length)return <><div className="bp-document-toolbar"><div><span>第 {visibleStart+1}–{Math.min(visibleStart+SOURCE_PAGE_LINES,lines.length)} 行 / {lines.length}</span><button className="bp-text-button" aria-label="上一页原文" disabled={visibleStart===0} onClick={()=>setPageStart(Math.max(0,visibleStart-SOURCE_PAGE_LINES))}><ChevronLeft size={14}/></button><button className="bp-text-button" aria-label="下一页原文" disabled={visibleStart+SOURCE_PAGE_LINES>=lines.length} onClick={()=>setPageStart(visibleStart+SOURCE_PAGE_LINES)}><ChevronRight size={14}/></button>{highlightStart && <button className="bp-text-button" onClick={()=>{setSourceQuery('');setPageStart(Math.floor((highlightStart-1)/SOURCE_PAGE_LINES)*SOURCE_PAGE_LINES);}}>定位证据</button>}</div>{needle && <div><span>匹配 {matches.length?currentMatch+1:0} / {matches.length}</span>{[-1,1].map(delta=><button key={delta} className="bp-text-button" aria-label={delta<0?'上一处匹配':'下一处匹配'} disabled={!matches.length} onClick={()=>{const next=(currentMatch+delta+matches.length)%matches.length;setMatchIndex(next);setPageStart(Math.floor(matches[next]/SOURCE_PAGE_LINES)*SOURCE_PAGE_LINES);}}>{delta<0?<ChevronLeft size={14}/>:<ChevronRight size={14}/>}</button>)}</div>}</div><div className="bp-document-lines">{lines.slice(visibleStart,visibleStart+SOURCE_PAGE_LINES).map((line,index)=>{
      const n=visibleStart+index+1;
      const highlighted=!!highlightStart && n>=highlightStart && n<=(highlightEnd || highlightStart);
      const at=needle?line.toLocaleLowerCase().indexOf(needle):-1;
      const matched=at>=0;
      const excerptStart=line.length>6000 && matched?Math.max(0,at-1000):0;
      const excerpt=line.slice(excerptStart,excerptStart+6000);
      return <div className={`bp-document-line ${highlighted?'is-evidence':''} ${matched?'is-match':''}`} key={n} ref={n===focusLine?lineRef:undefined}><span>{n}</span><code title={line.length>6000?'长行节选；完整内容可打开原件查看。':undefined}>{excerptStart?'…':''}{excerpt || ' '}{excerptStart+6000<line.length?'…':''}</code></div>;
    })}</div></>;
    if(/pdf/.test(format))return <iframe className="bp-pdf-frame" title={source.title} src={`${source.url}#page=1&view=FitH`}/>;
    if(/jpg|jpeg|png|webp|gif/.test(format))return <div className="bp-image-preview"><img src={source.url} alt={source.title}/></div>;
    if(/mp4|webm/.test(format))return <div className="bp-image-preview"><video src={source.url} controls preload="metadata"/></div>;
    return <div className="bp-binary-preview"><span><Icon size={42} strokeWidth={1}/></span><h3>{source.title}</h3><p>{/stl/i.test(format)?'几何原件已经映射到 3D 场景，可从关联对象中定位。':'保留完整原始文件，可在相应工具中查看。'}</p><a className="bp-button" href={source.url} download><ArrowDownToLine size={15}/>下载原件<span>{sizeLabel(source.bytes)}</span></a>{relatedParts[0] && <button className="bp-text-button" onClick={()=>{onClose();onSelectPart(relatedParts[0].id);}}>在 3D 中查看关联部件<ArrowUpRight size={14}/></button>}</div>;
  };
  return createPortal(<div className="bp-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="bp-evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="bp-evidence-title" ref={dialogRef} tabIndex={-1}><header className="bp-evidence-header"><div className="bp-evidence-title"><span className="bp-source-file-icon"><Icon size={21}/></span><div><div className="bp-eyebrow">来源定位</div><h2 id="bp-evidence-title">{source.title}</h2></div></div><div className="bp-dialog-actions"><a className="bp-icon-action" aria-label="在新窗口打开原件" title="打开原件" href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={17}/></a><button className="bp-icon-action" onClick={onClose} aria-label="关闭证据面板"><X size={19}/></button></div></header><div className="bp-evidence-body"><section className="bp-document-pane"><div className="bp-document-toolbar"><div><span className="bp-format-label">{formatName(source.format)}</span>{source.knowledgeScope === 'manufacturer_general' && <span className="manufacturer-general-badge">厂商通用资料 · 具体采用待核查</span>}<span>{evidence ? (highlightStart?`定位到第 ${highlightStart}${highlightEnd && highlightEnd!==highlightStart?`–${highlightEnd}`:''} 行`:'已选中证据') : lines.length?`${lines.length} 行原文`:'原始文件预览'}</span></div>{lines.length>0 && <SearchField value={sourceQuery} onChange={setSourceQuery} placeholder="在原文中查找…"/>}</div><div className="bp-document-content" ref={documentRef}>{renderContent()}</div></section><aside className="bp-evidence-aside">{evidence && <section className="bp-evidence-claim"><div className="bp-section-eyebrow"><Link2 size={13}/>当前定位</div><h3>{evidence.title}</h3><p>{evidence.excerpt}</p><div className="bp-evidence-locator"><code>{evidence.kind}{highlightStart?` · ${highlightStart}`:''}</code><span>来源模型 / 文档依据</span></div></section>}<section className="bp-source-facts"><div className="bp-section-eyebrow">来源信息</div><dl><div><dt>资料范围</dt><dd><span className={`bp-scope-badge scope-${source.scope}`}>{source.knowledgeScope === 'manufacturer_general' ? '厂商通用资料' : scopeLabels[source.scope]}</span></dd></div><div><dt>文件格式</dt><dd>{formatName(source.format)}</dd></div><div><dt>文件大小</dt><dd>{sizeLabel(source.bytes)}</dd></div><div><dt>来源 ID</dt><dd><code>{source.id}</code></dd></div>{source.supplemented && <div><dt>登记方式</dt><dd>固定版本补充来源</dd></div>}</dl><div className="bp-small-hash"><span>SHA-256</span><code>{source.digest}</code></div><button className="bp-button bp-copy-button" onClick={copy}>{copied?<Check size={14}/>:<Copy size={14}/ >}{copied?'已复制定位':'复制来源定位'}</button>{source.externalUrl && <a className="bp-text-button" target="_blank" rel="noreferrer" href={source.externalUrl}>查看官方出处<ArrowUpRight size={14}/></a>}</section><section className="bp-evidence-relations"><div className="bp-section-eyebrow">关联知识<span>{relatedParts.length}</span></div>{relatedParts.slice(0,6).map(part=><button key={part.id} onClick={()=>{onClose();onSelectPart(part.id);}}><Box size={14}/><span>{part.name}<small>{part.id}</small></span><ArrowUpRight size={13}/></button>)}{!relatedParts.length && <p>当前没有绑定到 3D 部件的记录。原文仍可独立浏览与查询。</p>}{relatedParts.length>6 && <p>另有 {relatedParts.length-6} 个对象在知识索引中可查。</p>}</section><div className="bp-evidence-note"><Info size={14}/><p>{relatedEvidence.length} 条定位记录。来源可以支持的结论受其版本、对象与资料范围限制。</p></div></aside></div><footer className="bp-evidence-footer"><span><span className="bp-status-dot"/>本地原件 · 只读预览</span><span><kbd>Esc</kbd>关闭</span></footer></div></div>, document.body);
}
