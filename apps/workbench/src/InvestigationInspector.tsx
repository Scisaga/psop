import { Crosshair, FileText, Focus } from 'lucide-react';
import type { GeometrySelection, Part, PrototypeData, ReviewRegion, StructureCandidate } from './types';
import './investigation.css';

const mm = (value: number) => (value * 1000).toFixed(3).replace(/\.?0+$/, '');
const residualMm = (value: number) => value !== 0 && Math.abs(value * 1000) < .0001 ? (value * 1000).toExponential(3) : mm(value);
const reviewLabel: Record<string, string> = { auto_screened: '仅自动初筛', reviewed: '已审查', blocked: '受限待处理', unreviewed: '未审查' };
export const structureLabel = (item: StructureCandidate) => ({ circular_opening: '圆形开口', circular_inner_boundary: '圆形内轮廓', conical_frustum: '有限锥形柱表面', bore_wall: '内圆柱壁', shaft_wall: '实体柱表面', cylinder: '有限圆柱结构', slot: '槽开口', capsule_opening: '胶囊形槽开口', rounded_rectangle_opening: '圆角矩形槽开口', planar_patch: '有限面片' } as Record<string, string>)[item.geometry.type === 'cylinder' && ['bore_wall', 'shaft_wall'].includes(item.kind) ? item.kind : item.geometry.type] || '待调查几何结构';
const functionLabel = (item: StructureCandidate) => item.function_status === 'installation_evidence_available' ? '有安装用途依据' : item.function_status === 'installation_hypothesis_available' ? '有依据的安装假设' : '功能待证';
const textLabels: Record<string, string> = {
  'Device-specific functional role, installation side, retention and connector specification have not been established.': '本设备中的功能、装入侧、保持方式和连接件规格尚未核定。',
  'Inspect raw source region and assembly drawings for this exact geometry revision.': '检查本几何修订的源区域和装配图。',
  'Compare finite geometry and evidence for adjacent Parts and any intermediate connector.': '对照相邻部件及中间连接件的有限几何和资料。',
  'No functional complementarity, retention, motion ownership, connector or continuous path is established.': '尚未确认功能互补、保持、运动归属、连接件或连续装拆路径。',
  'Preparation discovered finite geometry; no source-specific functional evidence supports qualification.': '已登记有限源几何，尚无部件专属的功能资料可确认用途。',
  'Independently observed geometry is located; device-specific function or retaining evidence may still be missing.': '独立复核已定位本结构，本设备的功能与保持依据仍可能缺失。',
  'Only the related published installation evidence applies; retention and engineering remain separately unresolved.': '只沿用所关联的已发布安装依据；保持和工程验证仍需分别核查。',
  "Only the related installation declaration's scope is supported; actual engagement, retaining mechanism, connector specification, motion ownership, continuous path and engineering acceptance remain unresolved.": '只确认关联安装声明支持的范围；实际接合、保持机制、连接件规格、运动归属、连续路径与工程验收仍未核定。',
  'This is measured finite wall geometry, not a functional interface, thread, through-hole or confirmed connection.': '这里只测得有限壁面几何，尚未确认功能接口、螺纹、通孔或实际连接。',
  'Partial angular coverage and clipped ends remain partial; the analytic cylinder does not fill missing source material.': '圆周覆盖不完整或端部被截切时保留部分壁面，不用解析圆柱补出缺失材料。',
  'Search uses at most 64 normal-derived axis proposals, radius 0.5–50 mm, wall extent at least 0.15 mm and angular coverage at least 35%; other structures require another method.': '本方法最多检查 64 个源法向导出的轴向提议，适用于半径 0.5–50 mm、壁面长度至少 0.15 mm、圆周覆盖至少 35% 的结构；其他结构需换用方法。',
  'Automatic source-region screening does not exhaust hidden, noncircular, flexible or unsupported connection structures.': '自动初筛尚未穷尽隐藏、非圆形、柔性或当前不支持的连接结构。',
  'Inspect all source regions, capture independent annotations and investigate remaining functional evidence.': '逐区域检查源模型，补充独立标注并调查剩余功能依据。',
  'No whole-device or arbitrary-geometry recall claim; unannotated and occluded regions remain open.': '不据此声明整机或任意几何的召回率；未标注和遮挡区域仍待检查。',
  'Raw mesh normal sector was enumerated; inner, backside, occluded and noncylindrical structures are not independently exhausted.': '已按源面法向分区初筛；内部、背面、遮挡区和非圆柱结构尚未独立穷尽。',
  'Inspect this region from both sides and in section; annotate suspected structures independently of the recognizer.': '从两侧及剖面检查本区域，独立于识别器标注疑似结构。',
  'Review remaining adjacent, inner and occluded source regions.': '继续检查相邻、内部及被遮挡的源区域。',
  parallel_source_axes_and_finite_transverse_proximity: '源模型中的轴向平行，有限区段在横向上接近。',
  'No source-triangle, local-position, finite-extent and direction match': '未找到同时符合源三角面、局部位置、有限范围和方向的几何记录。',
};
const displayText = (value: string) => textLabels[value] || value;

type Props = { data: PrototypeData; onSelectGeometry: (selection: GeometrySelection) => void; onOpenSource: (sourceId: string, evidenceId?: string) => void };
function Sources({ data, refs, evidenceRefs, onOpenSource }: Pick<Props, 'data' | 'onOpenSource'> & { refs: string[]; evidenceRefs: string[] }) {
  const sourceRefs = [...new Set([...refs, ...data.evidence.filter(item => evidenceRefs.includes(item.id)).map(item => item.sourceId)])];
  return <div className="mechanics-record-sources">{sourceRefs.map(id => {
    const source = data.sources.find(item => item.id === id);
    const evidence = data.evidence.find(item => item.sourceId === id && evidenceRefs.includes(item.id));
    return source && <button className="mechanics-source-link" key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={13} /><span>{source.title}</span></button>;
  })}</div>;
}
function Actions({ title, items }: { title: string; items: string[] }) {
  return items.length > 0 && <div className="investigation-actions"><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{displayText(item)}</li>)}</ul></div>;
}

export function StructureDetails({ data, item, onSelectGeometry, onOpenSource }: Props & { item: StructureCandidate }) {
  const proposals = item.counterpart_proposals;
  const annotations = data.analysis?.review_coverage?.independent_features.matches.filter(match => match.candidate_refs.includes(item.id)) ?? [];
  const installationSites = data.analysis?.mounting_sites?.filter(site => site.owner_ref === item.owner_ref && site.status !== 'geometry_candidate' && site.feature_refs.some(ref => item.related_feature_refs.includes(ref))) ?? [];
  const coverage = item.measurement?.coverage;
  const partial = coverage !== undefined && coverage < .95;
  const performed = data.analysis?.investigation_records?.filter(record => record.part_ref === item.owner_ref && (record.structure_refs.includes(item.id) || record.opening_refs.some(ref => item.related_opening_refs.includes(ref)) || record.feature_refs.some(ref => item.related_feature_refs.includes(ref)))) ?? [];
  const supported = performed.some(record => record.evidence_status === 'supported_hypothesis');
  const workStatus = item.work_status ?? (performed.length ? 'investigated' : 'not_recorded');
  const investigated = workStatus === 'investigated';
  return <div className="structure-investigation" data-structure-id={item.id} data-review-status={item.review_status} data-function-status={item.function_status} data-work-status={workStatus}>
    <div className="investigation-state"><span>几何{reviewLabel[item.review_status]}</span><strong>{supported ? '有依据的安装假设' : functionLabel(item)}</strong></div>
    <p className="structure-work-status">{workStatus === 'not_recorded' ? '此历史快照未单独记录功能调查状态。' : `功能调查：${investigated ? supported || item.function_status === 'installation_hypothesis_available' ? '已执行，形成待验证假设' : '已执行，依据仍不足' : '尚未完成具体部位调查'}。`}几何审查与功能依据分别记录。</p>
    {partial && <p className="investigation-stop" data-angular-coverage={coverage}><strong>部分圆柱壁 · 圆周覆盖 {(coverage! * 100).toFixed(2)}%</strong>未覆盖的圆周保持缺失，不能据此认定完整孔或通孔。</p>}
    <p className="field-help">登记源几何和调查去向。几何候选与对端提议不确认机械连接、保持或承载。</p>
    {installationSites.map(site => <button className="mechanics-detail-link" key={site.id} onClick={() => onSelectGeometry({ kind: 'site', id: site.id, ownerRef: site.owner_ref })}>查看对应安装用途与依据 · {site.label}<Focus size={12} /></button>)}
    <dl className="mechanics-metrics">{annotations.length > 0 && <div><dt>独立标注</dt><dd>{annotations.map(match => match.id).join(' / ')}</dd></div>}<div><dt>源网格局部位置</dt><dd>{item.geometry.center.map(mm).join(', ')} mm</dd></div>
      {item.geometry.radius_m !== undefined && <div><dt>{item.geometry.type === 'circular_inner_boundary' ? '入口轮廓直径' : '拟合直径'}</dt><dd>Ø{mm(item.geometry.radius_m * 2)} mm</dd></div>}
      {(item.geometry.axis || item.geometry.normal) && <div><dt>局部方向</dt><dd>{(item.geometry.axis || item.geometry.normal)!.map(value => value.toFixed(4)).join(', ')}</dd></div>}
      <div><dt>源三角面见证</dt><dd>{item.support_triangle_indices.length} 个</dd></div><div><dt>发现方法</dt><dd>{item.method}</dd></div></dl>
    <details className="investigation-proposals" open={partial}><summary>测量与方法适用边界</summary><div className="investigation-proposal"><dl className="mechanics-metrics">
      {coverage !== undefined && <div><dt>圆周覆盖</dt><dd>{(coverage * 100).toFixed(2)}%</dd></div>}
      {item.measurement?.fit_rms_m !== undefined && <div><dt>拟合 RMS 残差</dt><dd>{residualMm(item.measurement.fit_rms_m)} mm</dd></div>}
      {item.measurement?.fit_max_m !== undefined && <div><dt>最大拟合残差</dt><dd>{residualMm(item.measurement.fit_max_m)} mm</dd></div>}
    </dl><p className="field-help">拟合误差表示源网格的数值残差，不等于制造公差。</p><Actions title="方法与适用边界" items={item.limitations} /></div></details>
    <Actions title="仍缺少的证据" items={item.missing_evidence} />
    <Actions title="下一步调查" items={item.next_actions} />
    {item.stop_reason && <p className="investigation-stop"><strong>本轮停止理由</strong>{displayText(item.stop_reason)}</p>}
    <details className="investigation-proposals"><summary>可能对端 · {proposals.length} 项几何提议</summary>
      {!proposals.length && <p className="field-help">当前参考构型中未提出对端；保留该结构，后续可调查其他构型及中间件。</p>}
      {proposals.map((proposal, index) => <div key={index} className="investigation-proposal" data-proposal-status={proposal.status}>
        <strong>{data.parts.find(part => part.id === proposal.part_ref)?.name || proposal.part_ref}</strong><p>{displayText(proposal.basis)}</p>
        <dl className="mechanics-metrics">{proposal.axis_distance_m !== undefined && <div><dt>轴线距离</dt><dd>{mm(proposal.axis_distance_m)} mm</dd></div>}{proposal.axial_gap_m !== undefined && <div><dt>轴向间隔</dt><dd>{mm(proposal.axial_gap_m)} mm</dd></div>}</dl>
        <Actions title="提议边界" items={proposal.limitations} />
        {proposal.structure_ref && <button className="mechanics-detail-link" onClick={() => onSelectGeometry({ kind: 'structure', id: proposal.structure_ref!, ownerRef: proposal.part_ref })}>查看对端结构<Focus size={12} /></button>}
      </div>)}
    </details>
    {(item.related_feature_refs.length > 0 || item.related_opening_refs.length > 0) && <details className="investigation-proposals"><summary>关联的已提取几何</summary>
      {item.related_feature_refs.map(id => <button className="mechanics-member" key={id} onClick={() => onSelectGeometry({ kind: data.analysis?.slot_features?.some(slot => slot.id === id) ? 'slot' : 'feature', id, ownerRef: item.owner_ref })}><Crosshair size={12} /><span>{id}</span></button>)}
      {item.related_opening_refs.map(id => <button className="mechanics-member" key={id} onClick={() => onSelectGeometry({ kind: 'opening', id, ownerRef: item.owner_ref })}><Crosshair size={12} /><span>{id}</span></button>)}
    </details>}
    <Sources data={data} refs={item.source_refs} evidenceRefs={item.evidence_refs} onOpenSource={onOpenSource} />
  </div>;
}

export function ReviewRegionDetails({ data, item, onOpenSource }: Pick<Props, 'data' | 'onOpenSource'> & { item: ReviewRegion }) {
  return <div className="review-region-detail" data-review-region-id={item.id} data-review-status={item.review_status}>
    <div className="investigation-state"><strong>{reviewLabel[item.review_status]}</strong><span>{item.triangle_indices.length} 个源三角面</span></div>
    <p className="field-help">区域位置和检查状态独立于检测器发现数量。自动初筛不代表人工多视角审查完成。</p>
    <Actions title="本区域的限制" items={item.limitations} /><Actions title="后续检查" items={item.next_actions} />
    <Sources data={data} refs={[item.geometry_source_ref]} evidenceRefs={item.evidence_refs} onOpenSource={onOpenSource} />
  </div>;
}

export function InvestigationCoverage({ data, part, onSelectGeometry }: { data: PrototypeData; part: Part; onSelectGeometry?: Props['onSelectGeometry'] }) {
  const analysis = data.analysis;
  if (!analysis?.part_investigations) return null;
  const investigation = analysis.part_investigations.find(item => item.part_ref === part.id);
  const regions = analysis.review_regions?.filter(item => item.owner_ref === part.id) ?? [];
  const independent = analysis.review_coverage?.independent_features;
  const missing = independent?.missing.filter(item => item.part_ref === part.id) ?? [];
  return <div className="investigation-coverage" data-investigation-part={part.id}>
    <h4>部件与区域审查</h4><p className="field-help">本件 {regions.filter(item => item.review_status === 'reviewed').length} / {regions.length} 个区域已审查。自动遍历和几何发现不计为完整审查。</p>
    {investigation && <><dl className="mechanics-metrics"><div><dt>调查状态</dt><dd>{investigation.status === 'partial' ? '部分完成' : investigation.status}</dd></div><div><dt>结构候选</dt><dd>{investigation.candidate_refs.length} 项</dd></div><div><dt>几何摘要</dt><dd title={investigation.geometry_sha256}>{investigation.geometry_sha256.slice(0, 16)}…</dd></div></dl><Actions title="本件检查限制" items={investigation.limitations} /><Actions title="本件后续动作" items={investigation.next_actions} /></>}
    <details className="investigation-regions"><summary>逐区域记录 · {regions.length}</summary>{regions.map(region => <button className="mechanics-member" key={region.id} disabled={!onSelectGeometry} onClick={() => onSelectGeometry?.({ kind: 'review_region', id: region.id, ownerRef: part.id })}><Crosshair size={12} /><span>{region.label}<small>{reviewLabel[region.review_status]} · {region.triangle_indices.length} 个源三角面</small></span><Focus size={12} /></button>)}</details>
    {independent && <div className="investigation-independent" data-independent-status={independent.status}><h4>独立样例覆盖</h4><p className="field-help">{independent.status === 'not_supplied' ? '本快照未提供独立标注，无法据检测器输出声称覆盖完整。' : `声明样例定位 ${independent.located_count} / ${independent.expected_count}；${independent.status === 'pass' ? '样例检查通过' : '仍有漏项'}。结论仅适用于标注范围。`}</p>{missing.map(item => <p className="investigation-missing" key={item.id}><strong>{item.id}</strong>{item.reason}<small>局部 {item.center_local_m.map(mm).join(', ')} mm</small></p>)}</div>}
  </div>;
}

export function BuildInvestigationCoverage({ data }: { data: PrototypeData }) {
  const analysis = data.analysis;
  const coverage = analysis?.review_coverage;
  if (!coverage) return null;
  const regions = coverage.region_review;
  const sample = coverage.independent_features;
  const candidates = analysis?.structure_candidates ?? [];
  return <section className="cap-history-panel cap-investigation-panel" data-review-coverage="published">
    <header className="cap-section-heading"><div><h2>调查与覆盖验收</h2><p>审查状态、功能证据和独立样例分别报告。</p></div><span className="cap-state is-partial">部分完成</span></header>
    {analysis?.installation_hypotheses && <dl className="cap-facts"><div><dt>有依据的安装假设</dt><dd>{analysis.installation_hypotheses.length} 项</dd></div><div><dt>已有安装定义</dt><dd>{analysis.mounting_interfaces?.length ?? 0} 项</dd></div><div><dt>已确认接合</dt><dd>{analysis.interface_connections?.length ?? 0} 项</dd></div></dl>}
    {analysis?.relationship_coverage && <dl className="cap-facts"><div><dt>独立关系样例定位</dt><dd>{analysis.relationship_coverage.located_count} / {analysis.relationship_coverage.expected_count}</dd></div><div><dt>正式 Interface / 工程确认</dt><dd>{analysis.relationship_coverage.qualified_interfaces_count} / {analysis.relationship_coverage.engineering_confirmed_count}</dd></div></dl>}
    <dl className="cap-facts"><div><dt>已建立调查清单</dt><dd>{analysis?.part_investigations?.length ?? 0} / {data.parts.length} 个实例</dd></div><div><dt>已登记结构</dt><dd>{candidates.length} 项</dd></div><div><dt>功能仍待证</dt><dd>{candidates.filter(item => item.function_status === 'unknown').length} 项</dd></div><div><dt>结构尚未审查 / 受限</dt><dd>{candidates.filter(item => item.review_status === 'unreviewed').length} / {candidates.filter(item => item.review_status === 'blocked').length}</dd></div><div><dt>区域已审查</dt><dd>{regions.reviewed} / {regions.total}</dd></div><div><dt>仅自动初筛 / 未审查 / 受限</dt><dd>{regions.auto_screened} / {regions.unreviewed} / {regions.blocked}</dd></div><div><dt>独立样例定位</dt><dd>{sample.located_count} / {sample.expected_count}</dd></div><div><dt>样例验收</dt><dd>{({ pass: '声明样例通过', incomplete: '存在遗漏', not_supplied: '未提供独立标注' })[sample.status]}</dd></div></dl>
    <p className="field-help">样例通过仅覆盖冻结标注列明的源几何及区域。全机表面、背面、遮挡区、未标注结构和机械功能仍需独立调查；遍历网格不等于审查完成。</p>
    {sample.missing.length > 0 && <div className="build-investigation-missing">{sample.missing.map(item => <p className="investigation-missing" key={`${item.part_ref}:${item.id}`}><strong>{data.parts.find(part => part.id === item.part_ref)?.name || item.part_ref} · {item.id}</strong>{item.reason}<small>源网格局部 {item.center_local_m.map(mm).join(', ')} mm</small></p>)}</div>}
    <Actions title="独立验收范围的限制" items={sample.limitations} />
  </section>;
}
