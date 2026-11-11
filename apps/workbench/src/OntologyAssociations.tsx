import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Ruler, Search } from 'lucide-react';
import type { AssemblyFeature, GeometrySelection, PrototypeData } from './types';
import { assemblyIndex, assemblyPartName, localMillimeters, selectionForInterface } from './assembly-model';
import './ontology-associations.css';

interface Props {
  data: PrototypeData; typeKey: string;
  onSelectPart: (id: string) => void;
  onSelectInterface?: (id: string) => void;
  onSelectGeometry?: (selection: GeometrySelection) => void;
  onOpenVersions?: () => void;
}
interface AssociationRow {
  id: string; title: string; detail: string; nature: string;
  endpoints: { partId: string; name: string; selection: GeometrySelection }[];
}
const mm = (value: number) => Number((value * 1000).toFixed(3));
function geometryLabel(feature: AssemblyFeature) {
  const geometry = feature.geometry;
  if (geometry.type === 'cylinder') return feature.kind === 'bore_wall' ? '有限孔壁' : '有限外圆';
  if (geometry.type === 'conical_frustum') return '锥形定位柱';
  return geometry.type === 'plane' ? '有限平面' : '有限源区域';
}
function geometrySummary(feature: AssemblyFeature) {
  const geometry = feature.geometry;
  const position = '源局部 (' + localMillimeters(geometry.origin) + ') mm';
  if (geometry.type === 'cylinder') return 'Ø' + mm(geometry.radius_m * 2) + ' mm · 长 ' + mm(geometry.axial_range_m[1] - geometry.axial_range_m[0]) + ' mm · ' + position;
  if (geometry.type === 'conical_frustum') return 'Ø' + mm(geometry.radius_start_m * 2) + '–' + mm(geometry.radius_end_m * 2) + ' mm · 长 ' + mm(geometry.length_m) + ' mm · ' + position;
  return position;
}

export function OntologyAssociations({ data, typeKey, onSelectPart, onSelectInterface, onSelectGeometry, onOpenVersions }: Props) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const catalog = data.assembly;
  const rows = useMemo<AssociationRow[]>(() => {
    if (!catalog) return [];
    const index = assemblyIndex(data);
    if (typeKey === 'Feature') return catalog.features.map(feature => ({
      id: feature.id, title: assemblyPartName(data, feature.owner_ref) + ' · ' + geometryLabel(feature),
      detail: geometrySummary(feature), nature: '源几何',
      endpoints: [{ partId: feature.owner_ref, name: '查看源几何', selection: { kind: 'feature', id: feature.id, ownerRef: feature.owner_ref } }],
    }));
    if (typeKey === 'Interface') return catalog.interfaces.map(item => ({
      id: item.id, title: assemblyPartName(data, item.owner_ref) + ' · ' + item.name,
      detail: [item.geometry_summary, item.purpose].filter(Boolean).join('；'),
      nature: ({ user_statement: '用户定义', source_geometry: '源几何', project_inference: '装配推断' })[item.origin],
      endpoints: [{ partId: item.owner_ref, name: '查看接口', selection: selectionForInterface(item) }],
    }));
    if (typeKey === 'InterfaceConnection') return catalog.connections.map(connection => ({
      id: connection.id, title: connection.name, detail: connection.mechanism,
      nature: ({ declared: '已声明', source_assembly: '源装配', source_fit: '源配合', inferred_fit:'推断修正配合', hypothesis: '可能连接', incompatible: '不相容' })[connection.basis],
      endpoints: connection.endpoints.flatMap(endpoint => {
        const item = index.interfaces.get(endpoint.interface_ref);
        return item ? [{ partId: item.owner_ref, name: assemblyPartName(data, item.owner_ref) + ' · ' + item.name, selection: selectionForInterface(item, endpoint.member_refs, connection.id) }] : [];
      }),
    }));
    return [];
  }, [catalog, data, typeKey]);
  const filtered = rows.filter(row => (row.title + ' ' + row.detail + ' ' + row.id).toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const start = Math.min(offset, Math.max(0, Math.floor((filtered.length - 1) / 12) * 12));
  const items = filtered.slice(start, start + 12);
  if (!catalog) return <div className="ontology-analysis-unavailable"><Ruler size={26} strokeWidth={1.3} /><strong>此快照未提供装配目录</strong>{onOpenVersions && <button className="bp-text-button" onClick={onOpenVersions}>查看知识版本<ChevronRight size={13} /></button>}</div>;
  return <div className="ontology-associations">
    <div className="ontology-association-caption"><span>{typeKey === 'Frame' ? '部位与几何采用所属零件的源局部坐标' : '当前装配目录'}</span><label><Search size={14} /><input value={query} aria-label="搜索本体关联记录" placeholder="搜索部件或接口…" onChange={event => { setQuery(event.target.value); setOffset(0); }} /></label></div>
    <div className="ontology-association-list">{items.map(row => <div className="ontology-association-row" key={row.id}><div><strong>{row.title}<span>{row.nature}</span></strong><p>{row.detail}</p></div><div className="ontology-association-actions">{row.endpoints.map((endpoint, index) => <button key={endpoint.partId + '-' + index} onClick={() => onSelectGeometry ? onSelectGeometry(endpoint.selection) : endpoint.selection.kind === 'interface' && onSelectInterface ? onSelectInterface(endpoint.selection.id) : onSelectPart(endpoint.partId)}><Crosshair size={13} /><span>{endpoint.name}</span></button>)}</div></div>)}</div>
    {!items.length && <p className="ontology-association-empty">{query ? '没有匹配的记录。' : typeKey === 'Frame' ? '目录未单独发布 Frame 实例。接口成员与源几何已保留各自的局部位置和方向。' : '当前目录没有这类记录。'}</p>}
    <footer><span>{filtered.length ? start + 1 : 0}–{Math.min(start + 12, filtered.length)} / {filtered.length}</span><div><button disabled={start === 0} aria-label="上一页关联记录" onClick={() => setOffset(Math.max(0, start - 12))}><ChevronLeft size={14} /></button><button disabled={start + 12 >= filtered.length} aria-label="下一页关联记录" onClick={() => setOffset(start + 12)}><ChevronRight size={14} /></button></div></footer>
  </div>;
}
