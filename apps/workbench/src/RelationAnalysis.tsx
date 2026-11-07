import { ArrowUpRight, FileText, Focus, GitCompareArrows, Link2 } from 'lucide-react';
import type { ConnectionReviewFinding, GeometrySelection, Part, PrototypeData } from './types';
import './relation-analysis.css';

interface Props {
  data: PrototypeData; part: Part; finding: ConnectionReviewFinding;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
}
const roles: Record<string, string> = { location: '定位', retention: '保持', motion: '运动', limit: '限位' };
export const relationRoleStatus = (status: string) => ({ supported_hypothesis: '有依据的假设', geometric_support: '几何支持', contradicted: '存在反证', unknown: '仍缺依据' } as Record<string, string>)[status] || '待验证';
const mm = (value: number) => (value * 1000).toFixed(3).replace(/\.?0+$/, '');
const participantName = (data: PrototypeData, id: string) => {
  const participant = data.parts.find(item => item.id === id);
  if (!participant) return id;
  return data.parts.some(item => item.id !== id && item.name === participant.name) ? `${participant.name} · #${id.slice(-6)}` : participant.name;
};
export const connectionFindingsFor = (data: PrototypeData, partRef: string) => data.analysis?.connection_review_findings?.filter(finding => finding.participants.some(participant => participant.part_ref === partRef)) ?? [];
export const findingStage = (finding: ConnectionReviewFinding) => finding.work_status === 'not_investigated' ? '候选关系 · 尚未完成调查' : finding.evidence_status === 'supported_hypothesis' ? '机制有依据 · 接合待验证' : '已调查 · 证据仍不足';

function Statements({ title, items }: { title: string; items: string[] }) {
  return items.length > 0 && <div className="relation-statements"><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}
export function ConnectionFindingSummary({ data, part, finding, onSelectGeometry }: Omit<Props, 'onOpenSource'>) {
  return <article className="relation-finding-summary" data-relation-finding={finding.id} data-work-status={finding.work_status} data-evidence-status={finding.evidence_status}>
    <button className="relation-finding-heading" onClick={() => onSelectGeometry({ kind: 'connection_review', id: finding.review_ref, ownerRef: part.id })}><Link2 size={14} /><span><strong>{finding.title}</strong><small>{findingStage(finding)}</small></span><Focus size={14} /></button>
    {finding.mechanism_candidates.map((candidate, index) => <p key={index}>{candidate.summary}</p>)}
    {!finding.mechanism_candidates.length && finding.findings[0] && <p>{finding.findings[0]}</p>}
    {finding.missing_evidence[0] && <p className="relation-open-condition"><strong>还缺：</strong>{finding.missing_evidence[0]}</p>}
    <div className="relation-summary-peers">{finding.participants.filter(participant => participant.part_ref !== part.id).map(participant => <button key={participant.part_ref} data-relation-peer={participant.part_ref} onClick={() => onSelectGeometry({ kind: 'connection_review', id: finding.review_ref, ownerRef: participant.part_ref })}><GitCompareArrows size={12} />{participantName(data, participant.part_ref)}<Focus size={11} /></button>)}</div>
  </article>;
}
export function ConnectionFindingDetails({ data, part, finding, onSelectGeometry, onOpenSource }: Props) {
  return <div className="relation-finding-details" data-connection-finding-id={finding.id}>
    <h4>{finding.title}</h4><p className="relation-stage">{findingStage(finding)}</p>
    <div className="relation-participant-locations">{finding.participants.map(participant => <div key={participant.part_ref}>
      <button data-relation-participant={participant.part_ref} onClick={() => onSelectGeometry({ kind: 'connection_review', id: finding.review_ref, ownerRef: participant.part_ref })}><span><strong>{participant.part_ref === part.id ? '本件' : '对端'} · {participantName(data, participant.part_ref)}</strong><small>{participant.label}</small><small>{participant.position_local_m ? `源局部 ${participant.position_local_m.map(mm).join(', ')} mm` : '双方对应的局部位置尚待定位'}</small></span><Focus size={13} /></button>
      <small>{data.parts.find(item => item.id === participant.part_ref)?.groupLabel} · 参考装配位置 ({data.parts.find(item => item.id === participant.part_ref)?.position.map(mm).join(', ')}) mm</small>
      <div className="relation-local-links">{participant.opening_refs.map(id => <button key={id} onClick={() => onSelectGeometry({ kind: 'opening', id, ownerRef: participant.part_ref })}>查看局部孔口<Focus size={11} /></button>)}{participant.structure_refs.map(id => <button key={id} onClick={() => onSelectGeometry({ kind: 'structure', id, ownerRef: participant.part_ref })}>查看源结构及三角见证<Focus size={11} /></button>)}{participant.feature_refs.map(id => <button key={id} onClick={() => onSelectGeometry({ kind: 'feature', id, ownerRef: participant.part_ref })}>查看有限源特征<Focus size={11} /></button>)}</div>
    </div>)}</div>
    <Statements title="局部结构配对与兼容性" items={finding.local_pairings.map(pairing => pairing.statement)} />
    <Statements title="机制候选与适用范围" items={finding.mechanism_candidates.map(candidate => candidate.summary)} />
    <dl className="relation-role-explanations">{finding.roles.map((role, index) => <div key={index}><dt>{roles[role.role] || role.role}<span>{relationRoleStatus(role.status)}</span></dt><dd>{role.statement}</dd></div>)}</dl>
    <Statements title={finding.work_status === 'investigated' ? '已执行调查的具体结论' : '自动几何线索 · 用途尚待调查'} items={finding.findings} />
    <Statements title="第三件与紧固件" items={finding.intermediate_components.map(component => `${component.kind}：${component.statement}`)} />
    <Statements title="反证与不一致" items={finding.counterevidence} />
    <Statements title="替代解释" items={finding.alternatives} />
    <Statements title="还缺少的证据" items={finding.missing_evidence} />
    <Statements title="下一步可执行调查" items={finding.next_actions} />
    {finding.hypothesis_refs.map(id => <button className="mechanics-detail-link" key={id} onClick={() => onSelectGeometry({ kind: 'installation_hypothesis', id, ownerRef: part.id })}>查看有依据的关系假设<Focus size={13} /></button>)}
    {finding.actions.length > 0 && <details className="relation-performed-actions"><summary>实际调查方法与观察 · {finding.actions.length} 项</summary>{finding.actions.map((action, index) => <div key={index}><strong>{action.method}</strong><p>{action.observation}</p></div>)}</details>}
    <div className="relation-source-links"><h4>{finding.work_status === 'investigated' ? '支持与审查来源' : '几何与筛查来源'}</h4>{finding.source_refs.map(id => { const source = data.sources.find(item => item.id === id); const evidence = data.evidence.find(item => finding.evidence_refs.includes(item.id) && item.sourceId === id); return source && <button key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={12} /><span>{source.title}</span><ArrowUpRight size={12} /></button>; })}</div>
    <p className="field-help">该分析保留审查依据与未决条件；实际接合、保持能力与工程验收仍需各自验证。</p>
  </div>;
}
