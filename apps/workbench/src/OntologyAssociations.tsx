import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Ruler, Search } from 'lucide-react';
import type { GeometrySelection, PrototypeData } from './types';
import { featureLabel, featureSummary, interfaceFeatures, interfaceLabel } from './MechanicsInspector';
import { isMechanismProfile, isMountingProfile, mountingRuleSummary, qualifiedConnections, qualifiedInterfaces } from './mechanics-model';
import './ontology-associations.css';

interface Props {
  data: PrototypeData;
  typeKey: string;
  onSelectPart: (id: string) => void;
  onSelectInterface?: (id: string) => void;
  onSelectGeometry?: (selection: GeometrySelection) => void;
  onOpenVersions?: () => void;
}
interface AssociationRow {
  id: string;
  title: string;
  detail: string;
  nature: string;
  endpoints: { partId: string; name: string; interfaceId?: string; featureId?: string; selection?: GeometrySelection }[];
}

export function OntologyAssociations({ data, typeKey, onSelectPart, onSelectInterface, onSelectGeometry, onOpenVersions }: Props) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const analysis = data.analysis;
  const rows = useMemo<AssociationRow[]>(() => {
    if (!analysis) return [];
    const owner = (id: string) => data.parts.find(part => part.id === id);
    if (typeKey === 'Interface' && isMountingProfile(data)) return (analysis.mounting_interfaces ?? []).map(item => ({ id: item.id, title: `${owner(item.owner_ref)?.name || item.owner_ref}${item.label ? ` · ${item.label}` : ''}`, detail: `${item.member_site_refs.length} 个可寻址安装位置 · ${mountingRuleSummary(item)}`, nature: '用户确认的安装用途', endpoints: [{ partId: item.owner_ref, name: '查看安装位置与规则', selection: { kind: 'mounting_interface' as const, id: item.id, ownerRef: item.owner_ref } }] }));
    if (typeKey === 'InterfaceConnection' && isMountingProfile(data)) return (analysis.reference_mounts ?? []).map(item => ({ id: item.id, title: item.participants.map(participant => owner(participant.part_ref)?.name || participant.part_ref).join(' ↔ '), detail: `${item.site_pairs.length} 对孔位已定位 · 连接件尚未绑定，当前接合状态未评估`, nature: '参考装配关联 · 未执行紧固', endpoints: item.participants.map(participant => ({ partId: participant.part_ref, name: owner(participant.part_ref)?.name || participant.part_ref, selection: { kind: 'mount' as const, id: item.id, ownerRef: participant.part_ref } })) }));
    if (typeKey === 'Frame') return analysis.frames.map(frame => ({ id: frame.id, title: owner(frame.owner_ref)?.name || frame.owner_ref, detail: '源网格局部框架 · 位置与方向保留包内定义', nature: '测量框架', endpoints: [{ partId: frame.owner_ref, name: owner(frame.owner_ref)?.name || frame.owner_ref }] }));
    if (typeKey === 'Feature') return analysis.features.map(feature => ({ id: feature.id, title: `${owner(feature.owner_ref)?.name || feature.owner_ref} · ${featureLabel(feature)}`, detail: featureSummary([feature]), nature: '网格计算', endpoints: [{ partId: feature.owner_ref, name: '定位特征', featureId: feature.id }] }));
    if (typeKey === 'Interface') return qualifiedInterfaces(data).map(item => ({ id: item.id, title: owner(item.owner_ref)?.name || item.owner_ref, detail: featureSummary(interfaceFeatures(data, item)), nature: interfaceLabel(data, item), endpoints: [{ partId: item.owner_ref, name: '定位接口', interfaceId: item.id }] }));
    if (typeKey === 'InterfaceConnection') return qualifiedConnections(data).map(candidate => ({ id: candidate.id, title: candidate.endpoint_refs.map(endpoint => owner(endpoint.part_ref)?.name || endpoint.part_ref).join(' ↔ '), detail: candidate.kind === 'surface_fit' ? `${candidate.surface_pairs?.length ?? 0} 组有限对应面 · 静态贴合及投影重叠，保持与路径尚未确认` : `${candidate.checks.length} 项来源零位几何判据 · 实际接合与紧固尚未确认`, nature: '机制连接候选', endpoints: candidate.endpoint_refs.map(endpoint => ({ partId: endpoint.part_ref, name: owner(endpoint.part_ref)?.name || endpoint.part_ref, interfaceId: endpoint.interface_ref })) }));
    return [];
  }, [analysis, data, typeKey]);
  const filtered = rows.filter(row => `${row.id} ${row.title} ${row.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const items = filtered.slice(offset, offset + 12);
  if (!analysis) return <div className="ontology-analysis-unavailable"><Ruler size={26} strokeWidth={1.3} /><strong>该版本尚未分析</strong><p>当前知识版本没有网格特征、接口或对接候选记录，不能据此判断设备没有接口。</p>{onOpenVersions && <button className="bp-text-button" onClick={onOpenVersions}>查看知识版本<ChevronRight size={13} /></button>}</div>;
  return <div className="ontology-associations">
    <div className="ontology-association-caption"><span>{isMountingProfile(data) && typeKey === 'Interface' ? `${rows.length} 项安装定义 · 安装位置与规则` : isMountingProfile(data) && typeKey === 'InterfaceConnection' ? `已确认连接 ${analysis.interface_connections?.length ?? 0} · 参考装配关联 ${rows.length}` : typeKey === 'InterfaceConnection' ? isMechanismProfile(data) ? `已确认连接 ${analysis.interface_connections?.length ?? 0} · 机制连接候选 ${rows.length}` : '历史几何记录未按接口机制判据复评' : typeKey === 'Interface' ? isMechanismProfile(data) ? `${rows.length} 个机制接口候选 · 几何观测单独浏览` : '接口机制未复评 · 历史几何分组不计为接口' : typeKey === 'Frame' ? `${rows.length} 个源网格测量框架` : `${rows.length} 项源网格计算特征`}</span><label><Search size={14} /><input value={query} aria-label="搜索本体关联记录" placeholder="搜索部件、尺寸或 ID…" onChange={event => { setQuery(event.target.value); setOffset(0); }} /></label></div>
    <div className="ontology-association-list">{items.map(row => <div className="ontology-association-row" key={row.id}><div><strong>{row.title}<span>{row.nature}</span></strong><p>{row.detail}</p><code title={row.id}>{row.id}</code></div><div className="ontology-association-actions">{row.endpoints.map((endpoint, index) => <button key={`${endpoint.partId}-${index}`} onClick={() => endpoint.selection && onSelectGeometry ? onSelectGeometry(endpoint.selection) : endpoint.featureId && onSelectGeometry ? onSelectGeometry({ kind: 'feature', id: endpoint.featureId, ownerRef: endpoint.partId }) : endpoint.interfaceId && onSelectInterface ? onSelectInterface(endpoint.interfaceId) : onSelectPart(endpoint.partId)}><Crosshair size={13} /><span>{endpoint.name}</span></button>)}</div></div>)}</div>
    {!items.length && <p className="ontology-association-empty">{query ? '没有匹配的记录。' : ['Interface', 'InterfaceConnection'].includes(typeKey) ? '几何已分析，接口机制尚未确认。孔、阵列与参考观测可在设备几何详情中查看，不计为接口实例。' : '当前支持范围内没有提取到这类记录。'}</p>}
    <footer><span>{filtered.length ? offset + 1 : 0}–{Math.min(offset + 12, filtered.length)} / {filtered.length}</span><div><button disabled={offset === 0} aria-label="上一页关联记录" onClick={() => setOffset(value => Math.max(0, value - 12))}><ChevronLeft size={14} /></button><button disabled={offset + 12 >= filtered.length} aria-label="下一页关联记录" onClick={() => setOffset(value => value + 12)}><ChevronRight size={14} /></button></div></footer>
  </div>;
}
