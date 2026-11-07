import { useMemo, useState } from 'react';
import { ArrowUpRight, Box, ChevronLeft, ChevronRight, CircleHelp, Crosshair, Eye, EyeOff, FileText, Focus, GitCompareArrows, Layers3, Link2, Search } from 'lucide-react';
import type { ConnectionReview, GeometrySelection, Part, PrototypeData, SupplementalComponent } from './types';
import { connectionReviewsFor, isAlternativeSupplement, openingGroupsFor, supplementAlternativeKeys } from './mechanics-model';
import { ConnectionFindingDetails, ConnectionFindingSummary, findingStage, relationRoleStatus } from './RelationAnalysis';
import './connection-reviews.css';
import './connection-fasteners.css';
import './connection-alternatives.css';

interface ReviewProps {
  data: PrototypeData; part: Part; selection: GeometrySelection | null;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
  onInspectRawGeometry?: (selection: GeometrySelection) => void;
  onToggleConnectionFasteners?: (reviewId: string) => void;
  visibleFastenerReviewIds?: string[];
  onSelectConnectionAlternative?: (reviewId: string, alternativeId: string) => void;
  activeConnectionAlternativeIds?: string[];
}
const roleLabels: Record<string, string> = { location: '定位', retention: '保持与第三件', motion: '运动关系' };
const stateLabel = (value?: string) => ({ hypothesis: '待核实推断', unknown: '未确认', unresolved: '待补证据', source_geometry: '来源几何', reference_only: '参考事实', unverified: '未验证', illustrative_unconfirmed: '补全示意', project_inferred: '项目推断' } as Record<string, string>)[value || ''] || '待核查';
export const connectionPartName = (data: PrototypeData, id: string) => {
  const part = data.parts.find(item => item.id === id);
  if (!part) return id;
  return data.parts.filter(item => item.name === part.name).length > 1 ? `${part.name} · #${id.slice(-6)}` : part.name;
};
const partName = connectionPartName;
const mm = (value: number) => (value * 1000).toFixed(3).replace(/\.?0+$/, '');
export const connectionPartLocation = (data: PrototypeData, id: string) => {
  const part = data.parts.find(item => item.id === id);
  return part ? `${part.groupLabel} · 基准位置 (${part.position.map(mm).join(', ')}) mm` : id;
};

export function ConnectionFasteners({ review, ...props }: ReviewProps & { review: ConnectionReview }) {
  const components = props.data.analysis?.supplemental_components?.filter(item => item.review_ref === review.id && !isAlternativeSupplement(props.data, item)) ?? [];
  if (!components.length) return null;
  const visible = props.visibleFastenerReviewIds?.includes(review.id) ?? false;
  const selectedComponent = props.selection?.kind === 'supplement' ? components.find(component => component.id === props.selection?.id) : undefined;
  return <div className="connection-fasteners" data-fastener-review-id={review.id}>
    <div className="connection-fasteners-heading"><Layers3 size={13} /><strong>紧固路径示意</strong><span>连接件未绑定</span></div>
    <button className="connection-fasteners-toggle" aria-label={`${visible ? '隐藏' : '显示'}紧固路径示意 ${review.id}`} aria-pressed={visible} onClick={() => props.onToggleConnectionFasteners ? props.onToggleConnectionFasteners(review.id) : props.onSelectGeometry({ kind: 'supplement', id: components[0].id, ownerRef: props.part.id })}>{visible ? <EyeOff size={13} /> : <Eye size={13} />}{visible ? '隐藏紧固路径示意' : '查看紧固路径示意'}</button>
    <div className="connection-fastener-items">{components.map(component => <button key={component.id} className={props.selection?.kind === 'supplement' && props.selection.id === component.id ? 'is-active' : ''} data-fastener-component-id={component.id} onClick={() => props.onSelectGeometry({ kind: 'supplement', id: component.id, ownerRef: props.part.id })}><Box size={12} /><span>{component.label}</span><Focus size={12} /></button>)}</div>
    <small className="connection-fasteners-status">合成示意 · 实物、装入侧与规格待确认</small>
    {selectedComponent && <SupplementDetails {...props} component={selectedComponent} />}
  </div>;
}

export function ConnectionAlternativePlans({ review, ...props }: ReviewProps & { review: ConnectionReview }) {
  const components = props.data.analysis?.supplemental_components?.filter(item => item.review_ref === review.id && isAlternativeSupplement(props.data, item)) ?? [];
  const alternatives = review.alternatives.filter(alternative => alternative.component_refs.some(id => components.some(component => component.id === id)) || !alternative.component_refs.length);
  if (!alternatives.length || !components.length) return null;
  const peers = review.participants.filter(participant => participant.part_ref !== props.part.id).map(participant => connectionPartName(props.data, participant.part_ref));
  const anyActive = components.some(component => supplementAlternativeKeys(props.data, component).some(key => props.activeConnectionAlternativeIds?.includes(key)));
  const selectedComponent = props.selection?.kind === 'supplement' ? components.find(component => component.id === props.selection?.id) : undefined;
  return <details className="connection-alternative-plans" open={anyActive || !!selectedComponent} data-alternative-review-id={review.id}>
    <summary>待验证方案<span>{peers.join(' / ')}</span></summary>
    <p className="connection-alternative-intro">这些方案尚未确认为设备实际连接，选择后才显示相应示意件。</p>
    {alternatives.map(alternative => {
      const key = `${review.id}::${alternative.id}`;
      const active = props.activeConnectionAlternativeIds?.includes(key) ?? false;
      const members = components.filter(component => alternative.component_refs.includes(component.id));
      return <section className={`connection-alternative-plan ${active ? 'is-active' : ''}`} key={alternative.id} data-connection-alternative-id={key}>
        <strong>{alternative.label}</strong><span className="connection-alternative-status">待验证</span>
        {members.length > 0 && <><button className="connection-alternative-select" aria-pressed={active} onClick={() => props.onSelectConnectionAlternative?.(review.id, alternative.id)} disabled={!props.onSelectConnectionAlternative}>{active ? <EyeOff size={13} /> : <Eye size={13} />}{active ? '停止查看此方案' : '选择此方案查看 3D'}</button><div className="connection-alternative-components">{members.map(component => active ? <button key={component.id} data-alternative-component-id={component.id} onClick={() => props.onSelectGeometry({ kind: 'supplement', id: component.id, ownerRef: props.part.id })}><Box size={12} /><span>{component.label}</span><Focus size={12} /></button> : <span key={component.id}><Box size={12} />{component.label}</span>)}</div></>}
        <details><summary>方案依据与待核实项</summary><ul>{alternative.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul></details>
        {active && selectedComponent && members.some(component => component.id === selectedComponent.id) && <SupplementDetails {...props} component={selectedComponent} />}
      </section>;
    })}
  </details>;
}

function EvidenceLinks({ data, sourceRefs, evidenceRefs, onOpenSource }: { data: PrototypeData; sourceRefs: string[]; evidenceRefs: string[]; onOpenSource: ReviewProps['onOpenSource'] }) {
  return <div className="review-evidence-links">{sourceRefs.map(id => {
    const source = data.sources.find(item => item.id === id);
    const evidence = data.evidence.find(item => item.sourceId === id && evidenceRefs.includes(item.id));
    return source && <button key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={12} /><span>{source.title}</span><ArrowUpRight size={11} /></button>;
  })}</div>;
}

export function SupplementDetails({ component, ...props }: ReviewProps & { component: SupplementalComponent }) {
  const geometry = component.geometry;
  return <section className="review-supplement" data-supplement-id={component.id} data-supplement-status={component.status}>
    <div className="review-supplement-heading"><Box size={16} /><div><strong>{component.label}</strong><small>{isAlternativeSupplement(props.data, component) ? '待验证方案示意' : '参考连接示意'} · 未确认 BOM</small></div><button aria-label={`定位补全示意 ${component.label}`} onClick={() => props.onSelectGeometry({ kind: 'supplement', id: component.id, ownerRef: props.part.id })}><Focus size={13} /></button></div>
    <dl className="mechanics-metrics"><div><dt>{geometry.type === 'screw' ? '实际长度' : '实际规格'}</dt><dd>{geometry.type === 'screw' ? '长度待确认' : '规格待确认'}</dd></div></dl>
    <details className="review-current-geometry"><summary>当前示意图形参数</summary><dl className="mechanics-metrics"><div><dt>{geometry.type === 'screw' ? '杆径 / 杆长' : '外径 / 厚度'}</dt><dd>{geometry.type === 'screw' ? `Ø${mm(geometry.shaft_radius_m * 2)} × ${mm(geometry.shaft_length_m)} mm` : `Ø${mm(geometry.outer_radius_m * 2)} × ${mm(geometry.thickness_m)} mm`}</dd></div></dl><p>用于表达连接链，尚未确认为设备实际规格。</p></details>
    <details><summary>待确认参数 · {component.unconfirmed_fields.length} 项</summary><ul>{component.unconfirmed_fields.map(item => <li key={item}>{item}</li>)}</ul><code>{component.id}</code></details>
    {component.insertion && <p className="connector-insertion-note" data-insertion-status={component.insertion.status}>装入假设：从支架外侧穿向壳体。有限几何一致，实物装入侧、螺纹与保持仍未确认。</p>}
    {!isAlternativeSupplement(props.data, component) && !component.insertion && <p className="connector-insertion-note">历史示意：装入方向尚未按有限路径核验。</p>}
    <details className="review-supplement-sources"><summary>来源与推导引用 · {component.source_refs.length} 份</summary><EvidenceLinks data={props.data} sourceRefs={component.source_refs} evidenceRefs={component.evidence_refs} onOpenSource={props.onOpenSource} /></details>
  </section>;
}

function ReviewDetails({ review, ...props }: ReviewProps & { review: ConnectionReview }) {
  const { data, onSelectGeometry } = props;
  const components = data.analysis?.supplemental_components?.filter(item => item.review_ref === review.id && !isAlternativeSupplement(data, item)) ?? [];
  const participants = [...review.participants].sort((a, b) => Number(b.part_ref === props.part.id) - Number(a.part_ref === props.part.id));
  const finding = data.analysis?.connection_review_findings?.find(item => item.review_ref === review.id);
  return <section className="connection-review-detail" data-connection-review-id={review.id}>
    <div className="review-detail-title"><GitCompareArrows size={16} /><strong>局部连接审查</strong><span>{stateLabel(review.status)}</span></div>
    {finding && <ConnectionFindingDetails {...props} finding={finding} />}
    <details className="relation-original-review" open={!finding}><summary>原始连接审查、角色路径与几何证据</summary>
    <div className="review-participants">{participants.map(participant => {
      const groups = openingGroupsFor(data, participant.part_ref).filter(group => group.openings.some(opening => participant.opening_refs.includes(opening.id)));
      const primaryIds = new Set(groups.map(group => group.representative.id));
      const mainOpenings = participant.opening_refs.filter(id => primaryIds.has(id));
      const auxiliaryOpenings = participant.opening_refs.filter(id => !primaryIds.has(id));
      return <div key={participant.part_ref} className="review-participant" data-review-participant={participant.part_ref}>
      <div><span>{participant.part_ref === props.part.id ? '本件' : '对端'}</span><strong>{partName(data, participant.part_ref)}</strong><button aria-label={`定位连接参与部件 ${partName(data, participant.part_ref)}`} onClick={() => onSelectGeometry({ kind: 'connection_review', id: review.id, ownerRef: participant.part_ref })}><Focus size={12} /></button></div>
      <div className="review-local-features">{mainOpenings.map(id => {
        const opening = data.analysis?.circular_openings?.find(item => item.id === id);
        const axis = opening?.geometry.normal.findIndex(value => Math.abs(value) > .5) ?? -1;
        return <button key={id} onClick={() => onSelectGeometry({ kind: 'opening', id, ownerRef: participant.part_ref })}><Crosshair size={11} />{opening ? `Ø${mm(opening.geometry.radius_m * 2)} · ${opening.geometry.normal[axis] > 0 ? '+' : '−'}${['X', 'Y', 'Z'][axis]} 侧` : '有限开口'}<ChevronRight size={10} /></button>;
      })}{participant.site_refs.map(id => {
        const site = data.analysis?.mounting_sites?.find(item => item.id === id);
        return site && <button key={id} onClick={() => onSelectGeometry({ kind: 'site', id, ownerRef: participant.part_ref })}><Crosshair size={11} />{site.label}<ChevronRight size={10} /></button>;
      })}{participant.feature_refs.filter(id => data.analysis?.features.find(feature => feature.id === id)?.geometry.type !== 'plane').map(id => <button key={id} onClick={() => onSelectGeometry({ kind: 'feature', id, ownerRef: participant.part_ref })}><Crosshair size={11} />源局部特征<ChevronRight size={10} /></button>)}{!participant.opening_refs.length && !participant.site_refs.length && !participant.feature_refs.some(id => data.analysis?.features.find(feature => feature.id === id)?.geometry.type !== 'plane') && <span>局部连接特征尚未定位</span>}</div>
      <small className="review-participant-location">{connectionPartLocation(data, participant.part_ref)}</small>
      {auxiliaryOpenings.length > 0 && <details className="review-auxiliary-sections"><summary>其他有限截面 · {auxiliaryOpenings.length} 条</summary>{auxiliaryOpenings.map(id => { const opening = data.analysis?.circular_openings?.find(item => item.id === id); const axis = opening?.geometry.normal.findIndex(value => Math.abs(value) > .5) ?? 0; return opening && <button key={id} onClick={() => onSelectGeometry({ kind: 'opening', id, ownerRef: participant.part_ref })}>Ø{mm(opening.geometry.radius_m * 2)} · {['X', 'Y', 'Z'][axis]} {mm(opening.geometry.center[axis])} mm<Focus size={11} /></button>; })}</details>}
      {props.onInspectRawGeometry && (mainOpenings[0] || participant.site_refs[0] || participant.feature_refs[0]) && <button className="review-raw-geometry" onClick={() => props.onInspectRawGeometry?.({ kind: mainOpenings[0] ? 'opening' : participant.site_refs[0] ? 'site' : 'feature', id: mainOpenings[0] || participant.site_refs[0] || participant.feature_refs[0], ownerRef: participant.part_ref })}>查看原始几何<ArrowUpRight size={11} /></button>}
    </div>; })}</div>
    <div className="review-role-paths">{(['location', 'retention', 'motion'] as const).map(role => {
      const paths = review.role_paths.filter(item => item.role === role);
      return <div className="review-role-path" data-review-role={role} key={role}><div><strong>{roleLabels[role]}</strong><span>{paths.length ? stateLabel(paths[0].status) : '缺少判据'}</span></div>{paths.length ? paths.map((path, index) => <div key={index}><p>{path.description}</p>{path.component_refs.map(id => { const component = components.find(item => item.id === id); return component && <button className="review-component-link" key={id} onClick={() => onSelectGeometry({ kind: 'supplement', id, ownerRef: props.part.id })}><Layers3 size={12} />{component.label}<small>补全示意</small><Focus size={12} /></button>; })}</div>) : <p>尚无足够证据判断此连接的{roleLabels[role]}。</p>}</div>;
    })}</div>
    {review.alternatives.length > 0 && <details className="review-alternatives"><summary>候选解释与要求 · {review.alternatives.length} 项</summary>{review.alternatives.map(alternative => <div key={alternative.id}><strong>{alternative.label}<span>待验证</span></strong><ul>{alternative.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul></div>)}</details>}
    <ConnectionFasteners {...props} review={review} />
    <details className="review-missing-details"><summary>待补依据 · {review.missing_requirements.length} 项</summary>{review.missing_requirements.length ? <ul>{review.missing_requirements.map(item => <li key={item}>{item}</li>)}</ul> : <p>当前接合与工程验收尚未评估。</p>}</details>
    <details className="review-geometry-support"><summary>辅助几何观测 · {review.geometry_observation_refs.length} 项</summary><p>投影、共轴和相邻关系仅辅助定位，不能代替保持机制与装配证据。</p>{review.geometry_observation_refs.map(id => <button key={id} onClick={() => onSelectGeometry({ kind: 'observation', id, ownerRef: props.part.id })}>查看源几何观测<Focus size={12} /></button>)}</details>
    <details className="review-source-details"><summary>来源与证据</summary><EvidenceLinks data={data} sourceRefs={review.source_refs} evidenceRefs={review.evidence_refs} onOpenSource={props.onOpenSource} /></details>
    <details className="review-identifiers"><summary>追踪审查与评估状态</summary><code>{review.id}</code><code>{review.screening_ref}</code><dl className="mechanics-metrics">{Object.entries(review.assessments).map(([key, value]) => <div key={key}><dt>{({ mechanical: '机械', engineering: '工程', task: '任务', completion: '完成' } as Record<string, string>)[key]}</dt><dd>{stateLabel(value)}</dd></div>)}</dl></details>
    </details>
  </section>;
}

export function ConnectionReviewInspector(props: ReviewProps) {
  const reviews = connectionReviewsFor(props.data, props.part.id);
  const selectedComponent = props.selection?.kind === 'supplement' ? props.data.analysis?.supplemental_components?.find(item => item.id === props.selection?.id) : undefined;
  const selectedReview = reviews.find(item => item.id === (selectedComponent?.review_ref || props.selection?.id));
  const findings = props.data.analysis?.connection_review_findings ?? [];
  const contexts = props.data.analysis?.connection_relation_contexts?.filter(item => item.part_refs.includes(props.part.id)) ?? [];
  const coverage = props.data.analysis?.connection_analysis_coverage?.parts.find(item => item.part_ref === props.part.id);
  const pendingPairs = props.data.analysis?.connection_analysis_coverage?.unreviewed_geometric_pairs.filter(item => item.part_refs.includes(props.part.id)) ?? [];
  const findingFor = (review: ConnectionReview) => findings.find(item => item.review_ref === review.id);
  const groups = [
    { id: 'mechanism', title: '已有机制解释的连接审查', reviews: reviews.filter(review => findingFor(review)?.evidence_status === 'supported_hypothesis') },
    { id: 'insufficient', title: '已完成调查、仍缺证的关系', reviews: reviews.filter(review => { const finding = findingFor(review); return finding?.work_status === 'investigated' && finding.evidence_status !== 'supported_hypothesis'; }) },
    { id: 'candidate', title: '尚未完成调查的候选关系', reviews: reviews.filter(review => !findingFor(review) || findingFor(review)?.work_status === 'not_investigated') },
  ];
  return <div className="connection-review-inspector" data-connection-analysis-part={props.part.id}>
    {selectedReview && props.selection?.kind === 'connection_review' && <ReviewDetails {...props} review={selectedReview} />}
    {groups.filter(group => group.reviews.length > 0).map(group => <section className="detail-section connection-analysis-group" key={group.id} data-connection-analysis-stage={group.id}><h3>{group.title}<span>{group.reviews.length} 对</span></h3>{group.id === 'candidate' && <p className="field-help">这些记录提供局部调查入口，尚不构成安装机制或正式接口。</p>}{group.reviews.map(review => { const finding = findingFor(review); return <div key={review.id} data-review-list-id={review.id}>{finding ? <ConnectionFindingSummary {...props} finding={finding} /> : <button className={`review-list-item ${selectedReview?.id === review.id ? 'is-active' : ''}`} onClick={() => props.onSelectGeometry({ kind: 'connection_review', id: review.id, ownerRef: props.part.id })}><Link2 size={14} /><span><strong>{review.participants.filter(item => item.part_ref !== props.part.id).map(item => partName(props.data, item.part_ref)).join(' / ')}</strong><small>{review.missing_requirements.length} 项待补 · 此快照尚无逐项机制调查结论</small></span><ChevronRight size={12} /></button>}</div>; })}</section>)}
    {contexts.length > 0 && <section className="detail-section connection-analysis-group"><h3>涉及多个部件的关系链<span>{contexts.length} 条 · 保持待证</span></h3>{contexts.map(context => <article className="relation-finding-summary" key={context.id} data-relation-context={context.id}><strong>{context.title}</strong><p>{context.statement}</p><p>{context.part_refs.map(id => partName(props.data, id)).join(' → ')}</p><div className="relation-summary-peers">{context.finding_refs.map(id => { const finding = findings.find(item => item.id === id); return finding && <button key={id} onClick={() => props.onSelectGeometry({ kind: 'connection_review', id: finding.review_ref, ownerRef: finding.participants.find(participant => participant.part_ref === props.part.id)?.part_ref || finding.participants[0]?.part_ref })}>{finding.title}<Focus size={11} /></button>; })}</div><ul>{context.missing_evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></article>)}</section>}
    {pendingPairs.length > 0 && <section className="detail-section connection-analysis-group"><h3>尚未进入连接审查的几何线索<span>{pendingPairs.length} 对</span></h3>{pendingPairs.map((pair, index) => { const structure = props.data.analysis?.structure_candidates?.find(item => pair.structure_refs.includes(item.id) && item.owner_ref === props.part.id); return <article className="relation-finding-summary" key={index}><strong>{pair.part_refs.map(id => partName(props.data, id)).join(' ↔ ')}</strong><p>{pair.next_action}</p>{structure && <button className="mechanics-detail-link" onClick={() => props.onSelectGeometry({ kind: 'structure', id: structure.id, ownerRef: props.part.id })}>查看有限几何线索<Focus size={12} /></button>}</article>; })}</section>}
    {coverage && <details className="structure-technical"><summary>本件关系分析覆盖 · 各证据阶段分别计数</summary><dl className="mechanics-metrics"><div><dt>已有安装定义</dt><dd>{coverage.installation_definition_refs.length}</dd></div><div><dt>有依据的待验证假设</dt><dd>{coverage.hypothesis_refs.length}</dd></div><div><dt>已调查、仍缺证的关系</dt><dd>{coverage.investigated_insufficient_refs.length}</dd></div><div><dt>有局部几何、尚未调查</dt><dd>{coverage.geometry_only_refs.length}</dd></div><div><dt>全部尚未调查的审查</dt><dd>{coverage.uninvestigated_refs.length}</dd></div><div><dt>尚未进入审查的几何线索</dt><dd>{pendingPairs.length}</dd></div></dl><p className="field-help">一件可参与多种关系；关系调查不能代表整件所有区域已完成审查。</p></details>}
    {!reviews.length && <section className="detail-section"><h3>连接关系调查</h3><p className="field-help">此部件尚无连接审查记录，不能据此判断没有连接。</p></section>}
  </div>;
}

export function ConnectionReviewPage({ data, onSelectGeometry }: { data: PrototypeData; onSelectGeometry: ReviewProps['onSelectGeometry'] }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [offset, setOffset] = useState(0);
  const reviews = data.analysis?.connection_reviews ?? [], screenings = data.analysis?.pair_screenings ?? [], components = data.analysis?.supplemental_components ?? [];
  const findingFor = (review: ConnectionReview) => data.analysis?.connection_review_findings?.find(item => item.review_ref === review.id);
  const filtered = useMemo(() => reviews.filter(review => `${review.id} ${review.participants.map(item => partName(data, item.part_ref)).join(' ')} ${review.missing_requirements.join(' ')} ${findingFor(review)?.title || ''} ${findingFor(review)?.mechanism_candidates.map(item => item.summary).join(' ') || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === 'all' || filter === 'supplemented' && components.some(item => item.review_ref === review.id) || filter === 'missing' && review.missing_requirements.length > 0)), [reviews, data, query, filter, components]);
  const page = filtered.slice(offset, offset + 20);
  return <div className="bp-page connection-review-page"><header className="bp-page-heading"><div><h1>连接审查</h1><p>逐对检查连接链，定位仍缺的机制、第三件与装配依据。</p></div><span className="review-readonly"><CircleHelp size={13} />筛查覆盖与物理通过分别记录</span></header>
    <div className="review-directory-summary"><div><strong>{screenings.length}</strong><span>来源部件对筛查</span></div><div><strong>{reviews.length}</strong><span>已建审查记录</span></div><div><strong>{reviews.filter(item => item.missing_requirements.length > 0).length}</strong><span>仍需补充依据</span></div><div><strong>{components.length}</strong><span>补全示意件 · 未确认 BOM</span></div></div>
    <div className="bp-workspace-card"><div className="review-directory-tools"><label><Search size={15} /><input value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} aria-label="搜索连接审查" placeholder="查找部件对、连接审查 ID 或缺项…" /></label><select aria-label="筛选连接审查" value={filter} onChange={event => { setFilter(event.target.value); setOffset(0); }}><option value="all">全部审查</option><option value="missing">仍缺依据</option><option value="supplemented">包含补全示意</option></select></div>
      <div className="bp-table-scroll"><table className="bp-table review-directory-table"><thead><tr><th>参与部件对与调查阶段</th><th>定位</th><th>保持</th><th>运动</th><th>待补依据</th><th /></tr></thead><tbody>{page.map(review => { const finding = findingFor(review); return <tr key={review.id} data-review-row-id={review.id} tabIndex={0} onClick={() => onSelectGeometry({ kind: 'connection_review', id: review.id, ownerRef: review.participants[0]?.part_ref })} onKeyDown={event => { if (event.key === 'Enter') onSelectGeometry({ kind: 'connection_review', id: review.id, ownerRef: review.participants[0]?.part_ref }); }}><td><strong>{finding?.title || review.participants.map(item => partName(data, item.part_ref)).join(' ↔ ')}</strong>{finding && <small>{findingStage(finding)}</small>}<small>{review.id}</small></td>{['location', 'retention', 'motion'].map(role => { const investigatedRole = finding?.roles.find(item => item.role === role); return <td key={role} title={investigatedRole?.statement}>{investigatedRole ? relationRoleStatus(investigatedRole.status) : stateLabel(review.role_paths.find(path => path.role === role)?.status)}</td>; })}<td><span className="review-missing-count">{finding?.missing_evidence.length ?? review.missing_requirements.length} 项</span></td><td><ArrowUpRight size={14} /></td></tr>; })}</tbody></table></div>
      {!filtered.length && <div className="review-directory-empty"><Search size={25} /><strong>{reviews.length ? '没有匹配的连接审查' : '此版本尚未发布连接审查'}</strong><p>已有几何与来源仍可查询；缺少审查记录不代表机械连接不存在。</p></div>}
      <footer className="bp-table-footer"><span>{filtered.length ? offset + 1 : 0}–{Math.min(offset + 20, filtered.length)} / {filtered.length} 对</span><div className="review-pagination"><button aria-label="上一页连接审查" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}><ChevronLeft size={14} /></button><button aria-label="下一页连接审查" disabled={offset + 20 >= filtered.length} onClick={() => setOffset(offset + 20)}><ChevronRight size={14} /></button></div></footer>
    </div></div>;
}
