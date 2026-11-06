import { ArrowUpRight, Blend, Check, ChevronRight, Crosshair, FileText, Focus, GitCompareArrows, Layers3, Link2, Ruler } from 'lucide-react';
import type { GeometrySelection, MountingInterface, MountingSite, Part, PrototypeData, ReferenceMount } from './types';
import { isAlternativeSupplement, mountingInterfacesFor, mountingRecordInferred, mountingRuleSummary, mountingSiteName, mountingSitesFor, mountingSiteSetName, referenceMountsFor } from './mechanics-model';
import { AssemblySitesInspector, pinFitInstallationsFor, UnresolvedOpeningGeometry } from './AssemblySitesInspector';
import { ConnectionAlternativePlans, ConnectionFasteners, connectionPartName, connectionPartLocation } from './ConnectionReviews';
import './mounting.css';
import './mounting-flow.css';

export interface MountingProps {
  data: PrototypeData; part: Part; selection: GeometrySelection | null;
  onSelectGeometry: (selection: GeometrySelection) => void;
  onOpenSource: (sourceId: string, evidenceId?: string) => void;
  onTransparentInspect?: () => void; onExplodeInspect?: () => void;
  onInspectRawGeometry?: (selection: GeometrySelection) => void;
  onToggleConnectionFasteners?: (reviewId: string) => void;
  visibleFastenerReviewIds?: string[];
  onSelectConnectionAlternative?: (reviewId: string, alternativeId: string) => void;
  activeConnectionAlternativeIds?: string[];
}
const mm = (value: number) => value !== 0 && Math.abs(value) < 1e-6 ? (value * 1000).toExponential(2) : (value * 1000).toFixed(3).replace(/\.?0+$/, '');
const point = (values: number[]) => values.map(mm).join(', ');
function Sources({ data, record, onOpenSource }: Pick<MountingProps, 'data' | 'onOpenSource'> & { record: { source_refs: string[]; evidence_refs: string[]; assertion_refs?: string[] } }) {
  return <div className="mounting-sources">{record.source_refs.map(id => {
    const source = data.sources.find(item => item.id === id);
    const related = data.evidence.filter(item => item.sourceId === id && record.evidence_refs.includes(item.id));
    // A source file can contain several independent assertions. Follow the
    // evidence for this record, rather than the file's older generic statement.
    const evidence = related.find(item => record.assertion_refs?.some(assertion => item.id.endsWith(`:mounting-assertion:${assertion}`)))
      || related.find(item => item.id.includes(':mounting-assertion:')) || related[0];
    return source && <button className="mechanics-source-link" key={id} onClick={() => onOpenSource(id, evidence?.id)}><FileText size={13} /><span>{source.title}</span><ArrowUpRight size={12} /></button>;
  })}</div>;
}
function SiteButton({ site, selected, onSelect }: { site: MountingSite; selected: boolean; onSelect: () => void }) {
  return <button className={`mounting-site ${selected ? 'is-selected' : ''}`} data-mounting-site-id={site.id} data-site-side={site.side_ref} data-site-kind={site.site_kind || 'hole_entry'} onClick={onSelect} aria-label={`定位${mountingSiteName(site)} ${site.label}`}>
    <span className="mounting-site-symbol"><Crosshair size={16} /></span><span><strong>{site.label}</strong><small>{site.site_kind === 'integral_pin' ? '一体小柱 · 用途推断' : '安装入口'}</small></span><Focus size={12} />
  </button>;
}
function InterfaceCard({ item, ...props }: MountingProps & { item: MountingInterface }) {
  const { data, selection, onSelectGeometry } = props;
  const sites = data.analysis?.mounting_sites?.filter(site => item.member_site_refs.includes(site.id)) ?? [];
  const label = (id: string) => sites.find(site => site.id === id)?.label || id;
  const holes = new Set(sites.flatMap(site => site.hole_ref ? [site.hole_ref] : [])).size;
  const pins = sites.filter(site => site.site_kind === 'integral_pin').length;
  const historicalPinGroup = pins === sites.length && pins > 0 && mountingRecordInferred(item);
  const ruleKnown = item.selection_rule.status !== 'unknown' && item.selection_rule.min_count !== null;
  const references = referenceMountsFor(data, item.owner_ref).filter(mount => mount.participants.some(participant => participant.interface_ref === item.id));
  return <section className="mounting-interface-card" data-mounting-interface-id={item.id}>
    <div className="mounting-card-heading"><Link2 size={16} /><div><strong>{historicalPinGroup ? `一体小柱组 ${sites[0]?.label.split('.')[0] || ''}` : item.label || (item.role === 'housing_mount' ? '壳体安装孔位' : '连杆安装孔位')}</strong><small>{historicalPinGroup ? '历史推断 · 配对尚未复核' : mountingRecordInferred(item) ? '安装用途待核实' : '安装用途已声明'}</small></div><button aria-label={`定位全部可选${mountingSiteSetName(sites)}`} onClick={() => onSelectGeometry({ kind: 'mounting_interface', id: item.id, ownerRef: item.owner_ref })}><Focus size={14} /></button></div>
    <div className="mounting-site-count"><strong>{sites.length}<small>个{mountingSiteSetName(sites)}</small></strong><span>{pins ? `${pins} 根一体小柱` : `${holes} 条共享孔道`}</span></div>
    <details className="mounting-choices" open={!references.length || selection?.kind === 'mounting_interface' && selection.id === item.id || selection?.kind === 'site' && sites.some(site => site.id === selection.id)}><summary>可选孔位与规则<span>{ruleKnown ? '选用条件已声明' : '选用条件待确认'}</span></summary>
    {item.sides.map(side => <div className="mounting-side" key={side.id} data-mounting-side-id={side.id}><div className="mounting-side-heading"><strong>{side.label}</strong><span>{side.site_refs.length} 个{pins ? '位置' : '入口'}</span></div><div className="mounting-site-grid">{side.site_refs.map(id => {
      const site = sites.find(value => value.id === id);
      return site && <SiteButton key={id} site={site} selected={selection?.kind === 'site' && selection.id === id} onSelect={() => onSelectGeometry({ kind: 'site', id, ownerRef: site.owner_ref })} />;
    })}</div></div>)}
    <div className={`mounting-rule ${ruleKnown ? '' : 'is-unresolved'}`} data-mounting-rule={ruleKnown ? 'same_side_adjacent' : 'unknown'}><div>{ruleKnown ? <Check size={13} /> : <Ruler size={13} />}<strong>{mountingRuleSummary(item)}</strong></div><p>{ruleKnown ? '在这份孔位池中选用，仍需匹配对端孔距与共同位姿。' : '最少数量、允许组合与保持方式待确认。'}</p>{ruleKnown && <div className="mounting-adjacency">{item.selection_rule.allowed_adjacent_pairs.map(([a, b]) => <span key={`${a}:${b}`}>{`{${label(a)}, ${label(b)}}`}</span>)}</div>}</div>
    {selection?.kind === 'site' && sites.find(site => site.id === selection.id) && <SiteDetails {...props} site={sites.find(site => site.id === selection!.id)!} />}
    </details>
    {item.unresolved_requirements.includes('reference_hole_axes_unaligned') && <div className="mounting-reference-warning" data-reference-alignment="unaligned"><p>参考孔轴未对齐：来源零位下两侧孔阵列相位不同，尚未发布逐孔对应。其他安装相位仍待验证。</p><p>相邻部件会遮挡安装位置，可透明或展开查看。</p><div className="mounting-view-actions">{props.onTransparentInspect && <button onClick={props.onTransparentInspect}><Blend size={12} />透明查看</button>}{props.onExplodeInspect && <button onClick={props.onExplodeInspect}><Layers3 size={12} />展开查看</button>}</div></div>}
    {references.length > 0 && <div className="mounting-local-connections"><div className="mounting-flow-label">参考安装<span>{references.length} 项</span></div>{references.map(mount => <ReferenceConnectionCard key={mount.id} {...props} mount={mount} />)}</div>}

    <details className="mounting-evidence"><summary>查看安装规则与来源</summary><p>安装用途、选用规则和当前已接合状态分别保存。</p><Sources data={data} record={item} onOpenSource={props.onOpenSource} /></details>
  </section>;
}
function ReferenceCard({ mount, ...props }: MountingProps & { mount: ReferenceMount }) {
  const { data, part, selection, onSelectGeometry } = props;
  const peers = mount.participants.filter(item => item.part_ref !== part.id);
  const peerNames = peers.map(item => connectionPartName(data, item.part_ref));
  return <button className={`mounting-reference-card ${selection?.kind === 'mount' && selection.id === mount.id ? 'is-selected' : ''}`} data-reference-mount-id={mount.id} onClick={() => onSelectGeometry({ kind: 'mount', id: mount.id, ownerRef: part.id })}>
    <GitCompareArrows size={17} /><span><strong>{peerNames.join(' / ')}</strong><small>{mount.site_pairs.length} 对孔位 · 标准参考装配</small>{peers.map(peer => <small key={peer.part_ref}>{connectionPartLocation(data, peer.part_ref)}</small>)}</span><Focus size={14} />
  </button>;
}
function SiteDetails({ site, ...props }: MountingProps & { site: MountingSite }) {
  const { data, onSelectGeometry, onOpenSource } = props;
  const hole = data.analysis?.logical_holes?.find(item => item.id === site.hole_ref);
  const counterparts = site.hole_ref ? data.analysis?.mounting_sites?.filter(item => item.hole_ref === site.hole_ref && item.id !== site.id && item.status === 'user_asserted') ?? [] : [];
  const references = referenceMountsFor(data, site.owner_ref).filter(mount => mount.participants.some(item => item.site_refs.includes(site.id)));
  return <section className="detail-section mounting-selected-site" data-selected-site-id={site.id} data-site-kind={site.site_kind || 'hole_entry'}><h3>{mountingSiteName(site)} {site.label}<span>可独立寻址</span></h3><code className="mechanics-object-id">{site.id}</code>
    <dl className="mechanics-metrics"><div><dt>{site.site_kind === 'integral_pin' ? '销端位置' : '入口位置'}</dt><dd>{point(site.position)} mm</dd></div><div><dt>{site.site_kind === 'integral_pin' ? '销轴方向' : '进入方向'}</dt><dd>{site.entry_direction.join(', ')}</dd></div><div><dt>参考装配</dt><dd>{references.length ? `${references.length} 项已知对应` : '尚无已确认对应'}</dd></div><div><dt>功能依据</dt><dd>{mountingRecordInferred(site) ? site.status === 'user_asserted' ? '历史推断 · 资格已更正' : '项目推断 · 功能未确认' : '用户确认 · 已保留来源'}</dd></div></dl>
    <p className="field-help">{site.site_kind === 'integral_pin' ? '源网格中的一体锥形小柱，作用待核实。' : '此侧入口可独立寻址，另一侧入口共享同一条孔道。'}</p>
    {props.onInspectRawGeometry && <button className="mounting-raw-geometry" onClick={() => props.onInspectRawGeometry?.(hole ? { kind: 'hole', id: hole.id, ownerRef: hole.owner_ref } : { kind: 'feature', id: site.feature_refs[0], ownerRef: site.owner_ref })}>查看原始几何<ArrowUpRight size={12} /></button>}
    {counterparts.map(item => <button className="mounting-opposite" key={item.id} onClick={() => onSelectGeometry({ kind: 'site', id: item.id, ownerRef: item.owner_ref })}>另一侧入口 {item.label}<GitCompareArrows size={13} /></button>)}
    <details className="mounting-member-evidence"><summary>此位置的来源与依据</summary><Sources data={data} record={site} onOpenSource={onOpenSource} /></details>
  </section>;
}
function ReferenceConnectionCard({ mount, ...props }: MountingProps & { mount: ReferenceMount }) {
  const { data, part, selection, onSelectGeometry, onOpenSource } = props;
  const sites = data.analysis?.mounting_sites ?? [];
  const review = data.analysis?.connection_reviews?.find(item => item.reference_mount_refs.includes(mount.id));
  const active = selection?.kind === 'mount' && selection.id === mount.id || selection?.kind === 'site' && mount.site_pairs.some(pair => pair.site_refs.includes(selection.id)) || selection?.kind === 'supplement' && data.analysis?.supplemental_components?.some(item => item.id === selection.id && item.review_ref === review?.id);
  return <section className={`mounting-reference-connection ${active ? 'is-selected' : ''}`} data-reference-connection-id={mount.id}>
    <ReferenceCard {...props} mount={mount} />
    <div className="mounting-reference-status"><Check size={13} /><span>参考孔位对应已定位<small>接合与保持状态未评估</small></span></div>
    <div className={`mounting-correspondences ${selection?.kind === 'mount' && selection.id === mount.id ? 'mounting-selected-reference' : ''}`} data-selected-mount-id={selection?.kind === 'mount' && selection.id === mount.id ? mount.id : undefined}>
      <div className="mounting-pair-labels"><span>本件孔位</span><span>对端孔位</span></div>
      {mount.site_pairs.map((pair, index) => {
        const ordered = pair.site_refs.map(id => sites.find(item => item.id === id)).filter((item): item is MountingSite => !!item).sort((a, b) => Number(b.owner_ref === part.id) - Number(a.owner_ref === part.id));
        return <div className="mounting-correspondence" key={pair.site_refs.join('|')} data-mount-pair-index={index}><div>{ordered.map((site, i) => <span key={site.id}>{i > 0 && <Link2 size={12} />}<button onClick={() => onSelectGeometry({ kind: 'site', id: site.id, ownerRef: site.owner_ref })}><strong>{site.label}</strong><small>{data.parts.find(item => item.id === site.owner_ref)?.name}</small><Focus size={12} /></button></span>)}</div></div>;
      })}
    </div>
    <div className="mounting-connection-state">{mount.connector_roles.length} 条紧固路径要求 · 实际连接件未绑定</div>
    {review && <ConnectionFasteners {...props} review={review} />}
    <details className="mounting-reference-evidence"><summary>参考测量与依据</summary><p>同一来源构型中的孔位对应，未作为运行中已安装或已保持的记录。</p>{mount.site_pairs.map((pair, i) => <dl className="mechanics-metrics" key={i}><div><dt>第 {i + 1} 对孔轴距离</dt><dd>{mm(pair.axis_distance_m)} mm</dd></div><div><dt>有限孔壁间隔</dt><dd>{mm(pair.axial_gap_m)} mm</dd></div></dl>)}<Sources data={data} record={mount} onOpenSource={onOpenSource} /></details>
  </section>;
}
export function MountingSummary(props: MountingProps & { onOpenInterfaces: () => void }) {
  const sites = mountingSitesFor(props.data, props.part.id), references = referenceMountsFor(props.data, props.part.id);
  const fits = pinFitInstallationsFor(props.data, props.part.id);
  if (!sites.length && !references.length) return null;
  return <div className="mounting-summary"><button onClick={props.onOpenInterfaces}><span className="mounting-summary-icon"><Link2 size={17} /></span><span><strong>{fits.length ? `${fits.length} 组小柱与壳体孔配合` : `${sites.length} 个${mountingSiteSetName(sites)}`}</strong><small>{references.length} 项参考装配 · 查看部位与规则</small></span><ChevronRight size={13} /></button>{references.slice(0, 2).map(mount => <ReferenceCard key={mount.id} {...props} mount={mount} />)}</div>;
}
export default function MountingInspector(props: MountingProps) {
  const fits = pinFitInstallationsFor(props.data, props.part.id);
  const pairedPinSites = new Set(fits.flatMap(fit => fit.participants.filter(participant => participant.part_ref === props.part.id && participant.role === 'pin_carrier').flatMap(participant => participant.site_refs)));
  const interfaces = mountingInterfacesFor(props.data, props.part.id).filter(item => !item.member_site_refs.length || !item.member_site_refs.every(id => pairedPinSites.has(id))), references = referenceMountsFor(props.data, props.part.id);
  const referencesWithoutLocalCard = references.filter(mount => !interfaces.some(item => mount.participants.some(participant => participant.interface_ref === item.id)));
  const selectedSupplement = props.selection?.kind === 'supplement' ? props.data.analysis?.supplemental_components?.find(component => component.id === props.selection?.id) : undefined;
  const selectedSupplementReview = selectedSupplement ? props.data.analysis?.connection_reviews?.find(review => review.id === selectedSupplement.review_ref && review.participants.some(participant => participant.part_ref === props.part.id)) : undefined;
  const selectedReviewHasLocalCard = !!selectedSupplementReview && (fits.some(fit => fit.review_ref === selectedSupplementReview.id) || references.some(mount => selectedSupplementReview.reference_mount_refs.includes(mount.id)));
  const orphanAlternativeReviews = props.data.analysis?.connection_reviews?.filter(review => review.participants.some(participant => participant.part_ref === props.part.id) && !fits.some(fit => fit.review_ref === review.id) && props.data.analysis?.supplemental_components?.some(component => component.review_ref === review.id && isAlternativeSupplement(props.data, component))) ?? [];
  const selectedSite = props.selection?.kind === 'site' ? props.data.analysis?.mounting_sites?.find(item => item.id === props.selection?.id && item.status !== 'geometry_candidate' && item.owner_ref === props.part.id) : undefined;
  return <div className="mounting-inspector" data-mounting-knowledge="published"><section className="detail-section"><h3>安装定义与参考配合<span>{[interfaces.length ? `${interfaces.length} 类定义` : '', fits.length ? `${fits.length} 项参考配合` : ''].filter(Boolean).join(' / ') || '尚无记录'}</span></h3><AssemblySitesInspector {...props} />{interfaces.map(item => <InterfaceCard key={item.id} {...props} item={item} />)}{!interfaces.length && !fits.length && <p className="field-help">尚无已声明的安装部位。可查看几何证据或待核实的连接记录。</p>}</section>
    {selectedSupplement && !isAlternativeSupplement(props.data, selectedSupplement) && selectedSupplementReview && !selectedReviewHasLocalCard && <section className="detail-section mounting-current-connection" data-selected-fastener-review-id={selectedSupplementReview.id}><h3>当前连接固定件</h3>{selectedSupplementReview.participants.filter(participant => participant.part_ref !== props.part.id).map(peer => <button key={peer.part_ref} className="installation-peer" onClick={() => props.onSelectGeometry({ kind: 'connection_review', id: selectedSupplementReview.id, ownerRef: props.part.id })}><span><strong>{connectionPartName(props.data, peer.part_ref)}</strong><small>{connectionPartLocation(props.data, peer.part_ref)}</small></span><Focus size={13} /></button>)}<ConnectionFasteners {...props} review={selectedSupplementReview} /></section>}
    <UnresolvedOpeningGeometry {...props} />
    {orphanAlternativeReviews.map(review => <ConnectionAlternativePlans key={review.id} {...props} review={review} />)}
    {selectedSite && !interfaces.some(item => item.member_site_refs.includes(selectedSite.id)) && <SiteDetails {...props} site={selectedSite} />}
    {referencesWithoutLocalCard.length > 0 && <section className="detail-section mounting-references"><h3>参考安装<span>{referencesWithoutLocalCard.length} 项</span></h3>{referencesWithoutLocalCard.map(mount => <ReferenceConnectionCard key={mount.id} {...props} mount={mount} />)}</section>}
  </div>;
}
