import { ArrowUpRight, ChevronRight, FileText, Focus, GitCompareArrows, Link2 } from 'lucide-react';
import type { GeometrySelection, InstallationHypothesis, InvestigationRecord, Part, PrototypeData } from './types';
import './structure-details.css';

export interface HypothesisProps {
  data: PrototypeData;
  part: Part;
  selection: GeometrySelection | null;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
}
const mm = (value: number) => (value * 1000).toFixed(3).replace(/\.?0+$/, '');
const roleLabels: Record<string, string> = { location: '定位', retention: '保持', motion: '运动', limit: '限位' };
export const installationHypothesesFor = (data: PrototypeData, partRef: string) => data.analysis?.installation_hypotheses?.filter(item => item.participants.some(participant => participant.part_ref === partRef)) ?? [];

function SourceButtons({ data, sourceRefs, evidenceRefs, preferredEvidenceRefs = [], onOpenSource }: Pick<HypothesisProps, 'data' | 'onOpenSource'> & { sourceRefs: string[]; evidenceRefs: string[]; preferredEvidenceRefs?: string[] }) {
  return <div className="hypothesis-sources">{[...new Set(sourceRefs)].map(id => {
    const source = data.sources.find(item => item.id === id);
    const evidence = data.evidence.find(item => preferredEvidenceRefs.includes(item.id) && (!evidenceRefs.length || evidenceRefs.includes(item.id)) && item.sourceId === id) || data.evidence.find(item => evidenceRefs.includes(item.id) && item.sourceId === id);
    return source && <button className="mechanics-source-link" key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={13} /><span>{source.title}</span><ArrowUpRight size={12} /></button>;
  })}</div>;
}
function Statements({ title, items, kind = '' }: { title: string; items: string[]; kind?: string }) {
  return items.length ? <div className={`hypothesis-statements ${kind}`}><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null;
}
export function InvestigationRecordDetails({ item, ...props }: Pick<HypothesisProps, 'data' | 'onOpenSource'> & { item: InvestigationRecord }) {
  const preferredEvidenceRefs = props.data.parts.find(part => part.id === item.part_ref)?.evidenceIds ?? [];
  return <details className="structure-technical investigation-record" data-investigation-record-id={item.id} data-work-status={item.work_status} data-evidence-status={item.evidence_status}>
    <summary>已执行的调查 · {item.title}</summary>
    <div className="structure-technical-body">{item.actions.map((action, index) => <div className="investigation-performed-action" key={index}><strong>{action.method}</strong><p>{action.observation}</p><SourceButtons {...props} sourceRefs={action.source_refs} evidenceRefs={[]} preferredEvidenceRefs={preferredEvidenceRefs} /></div>)}
      <Statements title="具体判断" items={item.findings} />
      <Statements title="仍缺少的依据" items={item.missing_evidence} kind="is-open" />
      <p className="field-help">{item.stop_reason}</p>
    </div>
  </details>;
}

export function InstallationHypothesisDetails({ item, ...props }: HypothesisProps & { item: InstallationHypothesis }) {
  const { data, part, onSelectGeometry, onOpenSource } = props;
  const own = item.participants.find(participant => participant.part_ref === part.id);
  const investigation = data.analysis?.investigation_records?.find(record => record.id === item.investigation_ref);
  const metric = (value: number, unit: string) => unit === 'm' ? value !== 0 && Math.abs(value * 1000) < .0001 ? (value * 1000).toExponential(2) : mm(value) : unit === 'rad' ? (value * 180 / Math.PI).toFixed(2) : String(value);
  return <div className="hypothesis-details">
    <p className="hypothesis-mechanism" data-hypothesis-mechanism={item.mechanism.kind}>{item.mechanism.summary}</p>
    {own && <p className="structure-location-description"><strong>本件部位</strong>{own.label}<span>源局部 {own.position_local_m.map(mm).join(', ')} mm</span></p>}
    <div className="hypothesis-participants" aria-label="关系两端">{item.participants.filter(participant => participant.part_ref !== part.id).map(participant => <button key={participant.part_ref} className="installation-peer hypothesis-peer" data-hypothesis-participant={participant.part_ref} onClick={() => onSelectGeometry({ kind: 'installation_hypothesis', id: item.id, ownerRef: participant.part_ref })}><GitCompareArrows size={15} /><span><strong>{data.parts.find(peer => peer.id === participant.part_ref)?.name || participant.part_ref}</strong><small>{participant.label}</small><small>源局部 {participant.position_local_m.map(mm).join(', ')} mm</small></span><Focus size={14} /></button>)}</div>
    <dl className="hypothesis-roles">{item.roles.map((role, index) => <div key={`${role.role}:${index}`} data-role={role.role} data-role-status={role.status}><dt>{roleLabels[role.role] || role.role}<span>{role.status === 'supported_hypothesis' ? '有依据的假设' : '仍待核实'}</span></dt><dd>{role.statement}</dd></div>)}</dl>
    {item.measurements.length > 0 && <details className="structure-technical hypothesis-measurements"><summary>尺寸与共同构型比较 · {item.measurements.length} 项</summary><dl className="mechanics-metrics structure-technical-body">{item.measurements.map((measurement, index) => <div key={index}><dt>{measurement.name}</dt><dd>{(Array.isArray(measurement.value) ? measurement.value : [measurement.value]).map(value => metric(value, measurement.unit)).join(' / ')} {measurement.unit === 'm' ? 'mm' : measurement.unit === 'rad' ? '°' : ''}</dd></div>)}</dl><p className="field-help">源几何测量；数值残差与间隙不代表制造公差。</p></details>}
    {item.intermediate_components.length > 0 && <Statements title="所需中间件" items={item.intermediate_components.map(component => `${component.requirement === 'required' ? '需要' : '可能需要'}${component.kind}：${component.statement}（实物规格未确认）`)} />}
    <div className="hypothesis-evidence" data-hypothesis-evidence="support"><h4>支持依据</h4>{item.supporting_evidence.map((evidence, index) => <div key={index}><p>{evidence.claim}</p><SourceButtons data={data} sourceRefs={evidence.source_refs} evidenceRefs={evidence.evidence_refs} preferredEvidenceRefs={part.evidenceIds} onOpenSource={onOpenSource} /></div>)}</div>
    <Statements title="反证与不一致" items={item.counterevidence} />
    <Statements title="其他解释" items={item.alternatives} />
    <Statements title="还缺什么" items={item.unresolved_requirements} kind="is-open" />
    {investigation && <InvestigationRecordDetails data={data} onOpenSource={onOpenSource} item={investigation} />}
    <details className="structure-technical"><summary>关系原始记录与来源</summary><div className="structure-technical-body"><code className="mechanics-object-id">{item.id}</code><p className="field-help">项目推断；该记录尚未取得正式 Interface 资格，也没有实际接合或工程验证结果。</p><SourceButtons data={data} sourceRefs={item.source_refs} evidenceRefs={item.evidence_refs} preferredEvidenceRefs={part.evidenceIds} onOpenSource={onOpenSource} /></div></details>
  </div>;
}

export function InstallationHypothesisCard({ item, expanded = false, compact = false, ...props }: HypothesisProps & { item: InstallationHypothesis; expanded?: boolean; compact?: boolean }) {
  const { data, part, selection, onSelectGeometry } = props;
  const active = selection?.kind === 'installation_hypothesis' && selection.id === item.id;
  return <article className={`installation-hypothesis ${active ? 'is-active' : ''}`} data-installation-hypothesis-id={item.id} data-hypothesis-status={item.status}>
    <button className="hypothesis-card-heading" onClick={() => onSelectGeometry({ kind: 'installation_hypothesis', id: item.id, ownerRef: part.id })} aria-label={`定位安装假设 ${item.title}`}><Link2 size={16} /><span><strong>{item.title}</strong><small>待验证安装假设 · 项目推断</small></span><Focus size={15} /></button>
    {compact ? <div className="hypothesis-compact"><p>{item.mechanism.summary}</p>{item.participants.filter(participant => participant.part_ref !== part.id).map(participant => <button className="hypothesis-compact-peer" key={participant.part_ref} data-hypothesis-participant={participant.part_ref} onClick={() => onSelectGeometry({ kind: 'installation_hypothesis', id: item.id, ownerRef: participant.part_ref })}>可能对端：{data.parts.find(peer => peer.id === participant.part_ref)?.name || participant.part_ref}<Focus size={12} /></button>)}<button onClick={() => onSelectGeometry({ kind: 'installation_hypothesis', id: item.id, ownerRef: part.id })}>查看对端、依据与未决条件<ChevronRight size={12} /></button></div> : <details className="hypothesis-body" open={expanded || active}><summary>连接机制、依据与未决条件</summary><InstallationHypothesisDetails {...props} item={item} /></details>}
  </article>;
}
