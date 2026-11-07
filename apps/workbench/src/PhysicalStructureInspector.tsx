import { useMemo, type ReactNode } from 'react';
import { ChevronRight, Crosshair, FileText, Focus, Ruler } from 'lucide-react';
import type { CircularOpening, GeometrySelection, MechanicalFeature, Part, PrototypeData, StructureCandidate } from './types';
import { openingGroupsFor, resolveGeometry } from './mechanics-model';
import { InvestigationRecordDetails, InstallationHypothesisCard, installationHypothesesFor } from './InstallationHypotheses';
import { ConnectionFindingSummary, connectionFindingsFor } from './RelationAnalysis';
import { ReviewRegionDetails, StructureDetails } from './InvestigationInspector';
import './structure-details.css';

interface Props {
  data: PrototypeData; part: Part; selection: GeometrySelection | null;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
  rawRecords: ReactNode; selectedRecord: ReactNode;
}
interface PhysicalLocation {
  id: string; title: string; description: string; selection: GeometrySelection;
  openings: CircularOpening[]; structures: StructureCandidate[]; featureRefs: string[];
}
const mm = (value: number) => (value * 1000).toFixed(2);
const point = (values: number[]) => values.map(mm).join(', ');
const intersects = (a: string[], b: string[]) => a.some(ref => b.includes(ref));

/** Browsing groups are presentation only; no hole or passage identities change. */
export function physicalLocationsFor(data: PrototypeData, part: Part): PhysicalLocation[] {
  const structures = data.analysis?.structure_candidates?.filter(item => item.owner_ref === part.id) ?? [];
  const groups = openingGroupsFor(data, part.id);
  const assigned = new Set<string>();
  const result: PhysicalLocation[] = groups.map(group => {
    const openings = group.openings;
    const own = structures.filter(item => {
      if (intersects(item.related_opening_refs, openings.map(opening => opening.id))) return true;
      const axis = item.geometry.axis || item.geometry.normal;
      if (!axis || Math.abs(axis.reduce((sum, value, i) => sum + value * group.axis[i], 0)) < .995) return false;
      const delta = item.geometry.center.map((value, i) => value - group.center[i]);
      const along = delta.reduce((sum, value, i) => sum + value * group.axis[i], 0);
      const transverse = Math.max(0, delta.reduce((sum, value) => sum + value * value, 0) - along * along);
      const axialRange = openings.map(opening => opening.geometry.center.reduce((sum, value, i) => sum + value * group.axis[i], 0));
      const coordinate = item.geometry.center.reduce((sum, value, i) => sum + value * group.axis[i], 0);
      return transverse < 1e-8 && coordinate >= Math.min(...axialRange) - .008 && coordinate <= Math.max(...axialRange) + .008;
    });
    own.forEach(item => assigned.add(item.id));
    return { id: group.representative.id, title: `圆洞位置 · ${group.label} mm`, description: `${openings.length} 条入口边界`,
      selection: { kind: 'opening', id: group.representative.id, ownerRef: part.id }, openings, structures: own,
      featureRefs: [...new Set(own.flatMap(item => item.related_feature_refs))] };
  });
  for (const slot of data.analysis?.slot_features?.filter(item => item.owner_ref === part.id) ?? []) {
    const own = structures.filter(item => item.related_feature_refs.includes(slot.id));
    own.forEach(item => assigned.add(item.id));
    result.push({ id: slot.id, title: `槽开口 · ${point(slot.geometry.origin)} mm`, description: `${mm(slot.geometry.width_m)} × ${mm(slot.geometry.length_m)} mm`, selection: { kind: 'slot', id: slot.id, ownerRef: part.id }, openings: [], structures: own, featureRefs: [] });
  }
  for (const item of structures.filter(item => !assigned.has(item.id) && item.geometry.type !== 'plane')) {
    // Several recognizers can observe the same source wall. They are listed in
    // one location while retaining every independent source record below it.
    const existing = result.find(location => location.structures.some(other => other.geometry.type === item.geometry.type && other.geometry.center.every((value, i) => Math.abs(value - item.geometry.center[i]) < .00001) && Math.abs((other.geometry.radius_m ?? 0) - (item.geometry.radius_m ?? 0)) < .00001));
    if (existing) { existing.structures.push(item); existing.featureRefs.push(...item.related_feature_refs); continue; }
    result.push({ id: item.id, title: `${item.kind === 'shaft_wall' || item.geometry.type === 'conical_frustum' ? '柱状结构' : '有限壁段'} · ${point(item.geometry.center)} mm`, description: item.geometry.radius_m === undefined ? '源几何位置' : `Ø${mm(item.geometry.radius_m * 2)} mm`, selection: { kind: 'structure', id: item.id, ownerRef: part.id }, openings: [], structures: [item], featureRefs: item.related_feature_refs });
  }
  return result;
}
function locationContains(data: PrototypeData, location: PhysicalLocation, selection: GeometrySelection) {
  if (location.selection.id === selection.id || location.openings.some(item => item.id === selection.id) || location.structures.some(item => item.id === selection.id) || location.featureRefs.includes(selection.id)) return true;
  if (selection.kind === 'passage') return data.analysis?.passage_hypotheses?.some(item => item.id === selection.id && intersects(item.opening_refs, location.openings.map(opening => opening.id)));
  if (selection.kind === 'hole') return data.analysis?.logical_holes?.some(item => item.id === selection.id && intersects(item.wall_feature_refs, location.featureRefs));
  if (selection.kind === 'site') return data.analysis?.mounting_sites?.some(item => item.id === selection.id && intersects(item.feature_refs, location.featureRefs));
  return false;
}
function WallSummary({ item }: { item: MechanicalFeature }) {
  if (item.geometry.type === 'plane') return null;
  return <span>{item.geometry.type === 'cylinder' ? `Ø${mm(item.geometry.radius_m * 2)} mm · 壁长 ${mm(item.geometry.axial_range_m[1] - item.geometry.axial_range_m[0])} mm` : `Ø${mm(item.geometry.radius_start_m * 2)}–${mm(item.geometry.radius_end_m * 2)} mm · 长 ${mm(item.geometry.length_m)} mm`}</span>;
}

export default function PhysicalStructureInspector(props: Props) {
  const { data, part, selection, onSelectGeometry, onOpenSource, rawRecords, selectedRecord } = props;
  const locations = useMemo(() => physicalLocationsFor(data, part), [data, part]);
  const active = selection ? locations.find(item => locationContains(data, item, selection)) : undefined;
  const opening = selection?.kind === 'opening' ? data.analysis?.circular_openings?.find(item => item.id === selection.id) : undefined;
  const structure = selection?.kind === 'structure' ? data.analysis?.structure_candidates?.find(item => item.id === selection.id) : undefined;
  const region = selection?.kind === 'review_region' ? data.analysis?.review_regions?.find(item => item.id === selection.id) : undefined;
  const descriptor = resolveGeometry(data, selection);
  const refs = active ? { structures: active.structures.map(item => item.id), openings: active.openings.map(item => item.id), features: active.featureRefs } : { structures: structure ? [structure.id] : [], openings: descriptor?.openingRefs ?? [], features: descriptor?.featureRefs ?? [] };
  const hypotheses = installationHypothesesFor(data, part.id).filter(item => item.participants.some(participant => participant.part_ref === part.id && (intersects(participant.structure_refs, refs.structures) || intersects(participant.opening_refs, refs.openings) || intersects(participant.feature_refs, refs.features))));
  const connectionFindings = connectionFindingsFor(data, part.id).filter(item => item.participants.some(participant => participant.part_ref === part.id && (intersects(participant.structure_refs, refs.structures) || intersects(participant.opening_refs, refs.openings) || intersects(participant.feature_refs, refs.features))));
  const investigations = data.analysis?.investigation_records?.filter(item => item.part_ref === part.id && (intersects(item.structure_refs, refs.structures) || intersects(item.opening_refs, refs.openings) || intersects(item.feature_refs, refs.features))) ?? [];
  const passages = data.analysis?.passage_hypotheses?.filter(item => item.owner_ref === part.id && intersects(item.opening_refs, refs.openings)) ?? [];
  const walls = data.analysis?.features.filter(item => refs.features.includes(item.id) && item.geometry.type !== 'plane') ?? [];
  const discoveredWalls = (active?.structures ?? []).filter(item => item.geometry.type === 'cylinder' && !item.related_feature_refs.some(ref => walls.some(wall => wall.id === ref)));
  const sites = data.analysis?.mounting_sites?.filter(item => item.owner_ref === part.id && item.status !== 'geometry_candidate' && intersects(item.feature_refs, refs.features)) ?? [];
  const selectedTitle = active?.title || (structure ? '有限源结构' : region ? `审查区域 · ${region.label}` : descriptor?.title);
  const selectedPosition = opening?.geometry.center || structure?.geometry.center || region?.center;
  return <div className="physical-structure-inspector" data-physical-structure-part={part.id}>
    <section className="detail-section physical-location-browser"><h3>按物理位置查看<span>{locations.length} 处</span></h3>
      <label className="physical-location-picker"><span>选择物理位置</span><select aria-label="选择物理位置" value={active?.id || ''} onChange={event => { const location = locations.find(item => item.id === event.target.value); if (location) onSelectGeometry(location.selection); }}><option value="">选择孔、槽或柱的位置…</option>{locations.map(item => <option key={item.id} value={item.id}>{item.title} · {item.description}</option>)}</select></label>
      {!selection && <div className="physical-location-list">{locations.slice(0, 8).map(item => <button key={item.id} data-geometry-id={item.selection.id} data-geometry-kind={item.selection.kind} onClick={() => onSelectGeometry(item.selection)}><Crosshair size={14} /><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={13} /></button>)}</div>}
      {!locations.length && <p className="field-help">此部件尚无可按位置浏览的局部几何。源面片和审查范围可在下方展开。</p>}
    </section>
    {selection && selectedTitle && (active || opening || structure || region) && <section className="detail-section physical-location-detail" data-physical-location-id={active?.id || selection.id}>
      <h3>{selectedTitle}<span>源几何</span></h3>
      {selectedPosition && <p className="structure-location-description"><strong>在哪里</strong>源网格局部 {point(selectedPosition)} mm</p>}
      {opening && <div className="physical-opening-measurement" data-selected-opening-id={opening.id}><dl className="structure-key-metrics"><div><dt>选中边界直径</dt><dd>Ø{mm(opening.geometry.radius_m * 2)} <small>mm</small></dd></div><div><dt>入口方向</dt><dd>{opening.geometry.normal.map(value => value.toFixed(0)).join(', ')}</dd></div></dl></div>}
      {active && <>
        <div className="structure-composition"><h4>这里包含什么</h4><p>{active.openings.length ? `${active.openings.length} 条有限入口边界` : '有限源结构'}{walls.length + discoveredWalls.length ? `，${walls.length + discoveredWalls.length} 份有限壁面记录` : ''}。{passages.length ? `${passages.length} 份内壁拓扑记录可分别查看。` : ''}</p>
          {discoveredWalls.length > 0 && <p className="structure-wall-diameters">有限壁面直径：{[...new Set(discoveredWalls.map(item => mm((item.geometry.radius_m ?? 0) * 2)))].map(value => `Ø${value}`).join(' / ')} mm</p>}
          <details className="structure-technical structure-composition-members"><summary>查看独立入口、壁段与连通记录</summary><div>
          {active.openings.map((item, index) => <button className={`structure-member ${item.id === selection.id ? 'is-selected' : ''}`} key={item.id} data-geometry-id={item.id} data-geometry-kind="opening" onClick={() => onSelectGeometry({ kind: 'opening', id: item.id, ownerRef: part.id })}><span><strong>入口边界 {index + 1} · Ø{mm(item.geometry.radius_m * 2)} mm</strong><small>局部 {point(item.geometry.center)} mm</small></span><Focus size={13} /></button>)}
          {walls.map((item, index) => <button className="structure-member" key={item.id} data-source-wall-ref={item.id} onClick={() => onSelectGeometry({ kind: 'feature', id: item.id, ownerRef: part.id })}><span><strong>有限壁段 {index + 1}</strong><small><WallSummary item={item} /></small></span><Focus size={13} /></button>)}
          {discoveredWalls.map((item, index) => <button className="structure-member" key={item.id} data-source-wall-ref={item.id} onClick={() => onSelectGeometry({ kind: 'structure', id: item.id, ownerRef: part.id })}><span><strong>源壁观测 {walls.length + index + 1} · Ø{mm((item.geometry.radius_m ?? 0) * 2)} mm</strong><small>局部 {point(item.geometry.center)} mm</small></span><Focus size={13} /></button>)}
          {passages.map((item, index) => <button className="mechanics-detail-link" key={item.id} onClick={() => onSelectGeometry({ kind: 'passage', id: item.id, ownerRef: part.id })}>查看有限内壁拓扑 {index + 1}<Focus size={12} /></button>)}
          </div></details>
          {active.openings.length > 1 && <p className="field-help">同轴位置仅用于浏览。每条入口和壁段保留独立身份，连通关系由源拓扑另行判断。</p>}
        </div>
      </>}
      {structure && <StructureDetails data={data} item={structure} onSelectGeometry={onSelectGeometry} onOpenSource={onOpenSource} />}
      {region && <ReviewRegionDetails data={data} item={region} onOpenSource={onOpenSource} />}
      {(active || structure) && <div className="structure-connection-context"><h4>可能连接谁、承担什么作用</h4>{hypotheses.map(item => <InstallationHypothesisCard key={item.id} {...props} item={item} compact />)}
        {sites.map(site => <button className="structure-known-installation" key={site.id} onClick={() => onSelectGeometry({ kind: 'site', id: site.id, ownerRef: site.owner_ref })}><LinkIcon /><span><strong>{site.status === 'user_asserted' ? '已有安装用途声明' : '已有安装用途推断'} · {site.label}</strong><small>查看选用条件、参考关系与依据</small></span><ChevronRight size={13} /></button>)}
        {connectionFindings.filter(item => !item.hypothesis_refs.some(id => hypotheses.some(hypothesis => hypothesis.id === id))).map(finding => <ConnectionFindingSummary key={finding.id} {...props} finding={finding} />)}
        {!hypotheses.length && !sites.length && !connectionFindings.length && <p className="field-help">{investigations.length ? '此部位已执行调查，当前依据仍不足以形成具体安装关系。' : Array.isArray(data.analysis?.investigation_records) ? '当前只有几何记录；该部位尚未完成具体连接用途调查。' : '此历史快照未单独记录部位的功能调查状态；已发布几何和原有依据保留。'}</p>}
        {investigations.filter(item => !item.hypothesis_refs.length).map(item => <div key={item.id} className="structure-investigated-result"><p>{item.findings.join(' ')}</p><h4>还缺什么</h4><ul>{item.missing_evidence.map((missing, index) => <li key={index}>{missing}</li>)}</ul><InvestigationRecordDetails data={data} onOpenSource={onOpenSource} item={item} /></div>)}
      </div>}
      {opening && <details className="structure-technical"><summary>此边界的原始记录与来源</summary><div className="structure-technical-body"><code className="mechanics-object-id">{opening.id}</code><p className="field-help">{opening.geometry.boundary_vertices.length} 个源边界顶点；入口边界不等于独立通孔。</p>{opening.source_refs.map(id => { const source = data.sources.find(item => item.id === id); const evidence = data.evidence.find(item => opening.evidence_refs.includes(item.id) && item.sourceId === id); return source && <button className="mechanics-source-link" key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={13} /><span>{source.title}</span></button>; })}</div></details>}
    </section>}
    {selectedRecord}
    <details className="structure-technical raw-geometry-disclosure" data-raw-geometry-records="available"><summary><Ruler size={13} />原始记录与分析<span>几何、区域与数值</span></summary><div className="raw-geometry-records">{rawRecords}</div></details>
  </div>;
}
function LinkIcon() { return <Crosshair size={14} />; }
