import { ArrowUpRight, ChevronRight, Crosshair, Focus, GitCompareArrows, Link2 } from 'lucide-react';
import type { PinHoleFit, PrototypeData } from './types';
import type { MountingProps } from './MountingInspector';
import { openingGroupsFor } from './mechanics-model';
import { ConnectionAlternativePlans, connectionPartName, connectionPartLocation } from './ConnectionReviews';
import './assembly-sites.css';
import './pin-fits.css';

export const pinFitInstallationsFor = (data: PrototypeData, ownerRef: string) => data.analysis?.pin_hole_fits?.filter(fit => fit.participants.some(participant => participant.part_ref === ownerRef)) ?? [];
const mm = (value: number) => (value * 1000).toFixed(2).replace(/\.?0+$/, '');

function PinFitCard({ fit, ...props }: MountingProps & { fit: PinHoleFit }) {
  const pinCarrier = fit.participants.find(participant => participant.role === 'pin_carrier');
  const housing = fit.participants.find(participant => participant.role === 'housing_hole_carrier');
  const peer = fit.participants.find(participant => participant.part_ref !== props.part.id);
  const review = props.data.analysis?.connection_reviews?.find(item => item.id === fit.review_ref);
  const site = (id: string) => props.data.analysis?.mounting_sites?.find(item => item.id === id);
  const selected = props.selection?.id === fit.id || fit.pairs.some(pair => pair.pin_site_ref === props.selection?.id || pair.hole_site_ref === props.selection?.id);
  const insertions = fit.pairs.map(pair => pair.measurements.insertion_length_m);
  const minimumInsertion = Math.min(...insertions), maximumInsertion = Math.max(...insertions);
  const insertion = Math.abs(maximumInsertion - minimumInsertion) < .00001 ? mm(minimumInsertion) : `${mm(minimumInsertion)}–${mm(maximumInsertion)}`;
  return <section className={`installation-fit ${selected ? 'is-selected' : ''}`} data-pin-fit-id={fit.id}>
    <header className="installation-fit-heading"><Link2 size={17} /><div><strong>小柱与壳体孔配合</strong><small>{fit.pairs.length} 根小柱对应 {fit.pairs.length} 个孔</small></div><button aria-label={`定位小柱与壳体孔配合 ${fit.id}`} onClick={() => props.onSelectGeometry({ kind: 'pin_fit', id: fit.id, ownerRef: props.part.id })}><Focus size={15} /></button></header>
    {peer && <div className="installation-fit-peer"><GitCompareArrows size={13} /><span><strong>{connectionPartName(props.data, peer.part_ref)}</strong><small>{connectionPartLocation(props.data, peer.part_ref)}</small></span></div>}
    <div className="installation-fit-state"><span className="installation-status">来源位姿几何匹配</span><span className="installation-status is-pending">保持未知</span></div>
    <div className="installation-fit-pairs"><div className="installation-fit-pair-labels"><span>一体小柱</span><span>舵机壳体孔</span></div>{fit.pairs.map(pair => {
      const pin = site(pair.pin_site_ref), hole = site(pair.hole_site_ref);
      return <div className="installation-fit-pair" key={pair.pin_site_ref} data-pin-fit-pair={`${pair.pin_site_ref}|${pair.hole_site_ref}`}>
        <button aria-label={`定位小柱 ${pin?.label || pair.pin_site_ref}`} data-paired-pin-site={pair.pin_site_ref} onClick={() => props.onSelectGeometry({ kind: 'site', id: pair.pin_site_ref, ownerRef: pinCarrier?.part_ref })}><Crosshair size={13} /><strong>{pin?.label || '小柱'}</strong><Focus size={11} /></button><Link2 size={12} /><button aria-label={`定位配对壳体孔 ${hole?.label || pair.hole_site_ref}`} data-paired-hole-site={pair.hole_site_ref} onClick={() => props.onSelectGeometry({ kind: 'site', id: pair.hole_site_ref, ownerRef: housing?.part_ref })}><Crosshair size={13} /><strong>{hole?.label || '壳体孔'}</strong><Focus size={11} /></button>
      </div>;
    })}</div>
    <dl className="installation-fit-measurements"><div><dt>小柱／孔间距</dt><dd>{mm(fit.measurements.pin_spacing_m)} / {mm(fit.measurements.hole_spacing_m)} mm</dd></div><div><dt>计算插入段</dt><dd>≈ {insertion} mm</dd></div></dl>
    <div className="installation-fit-boundary"><strong>参考配对，选用规则未声明</strong><p>两处配对来自共同来源位姿；最少使用数量、允许子集及保持方式仍待确认。</p></div>
    {review && <><button className="installation-analysis-link installation-fit-analysis" onClick={() => props.onSelectGeometry({ kind: 'connection_review', id: review.id, ownerRef: props.part.id })}>查看连接分析<ChevronRight size={12} /></button><ConnectionAlternativePlans {...props} review={review} /></>}
    <details className="installation-source-geometry"><summary>测量与来源</summary><p>显示实际配对入口，反向入口仍共享同一孔道，不重复计作另一处配合。几何插入与间隙不证明固定或承载。</p>{fit.pairs.map(pair => <div className="installation-fit-atomic-measurement" key={pair.pin_site_ref}><strong>{site(pair.pin_site_ref)?.label} ↔ {site(pair.hole_site_ref)?.label}</strong><span>孔径 Ø{mm(pair.measurements.hole_diameter_m)} mm</span><span>入口径向间隙 {mm(pair.measurements.radial_clearance_at_entry_m)} mm</span></div>)}{fit.source_refs.map(id => { const source = props.data.sources.find(item => item.id === id); return source && <button key={id} onClick={() => props.onOpenSource(id)}><span>{source.title}</span><ArrowUpRight size={12} /></button>; })}{props.onInspectRawGeometry && <button className="installation-raw-link" onClick={() => props.onInspectRawGeometry?.({ kind: 'feature', id: fit.pairs[0].pin_feature_ref, ownerRef: pinCarrier?.part_ref })}>查看原始几何<ArrowUpRight size={12} /></button>}</details>
  </section>;
}

/** Only published pair records become the primary fit view; historical reviews do not invent them. */
export function AssemblySitesInspector(props: MountingProps) {
  return <>{pinFitInstallationsFor(props.data, props.part.id).map(fit => <PinFitCard key={fit.id} fit={fit} {...props} />)}</>;
}

export function UnresolvedOpeningGeometry(props: MountingProps) {
  const groups = openingGroupsFor(props.data, props.part.id);
  if (!groups.length || !props.data.analysis?.mounting_sites?.some(site => site.owner_ref === props.part.id && site.site_kind === 'integral_pin')) return null;
  return <details className="installation-unresolved-openings"><summary>圆洞几何 · 用途待核实<span>{groups.length} 处轴心</span></summary><p>外侧圆洞与其有限内壁独立保留。用途尚未确认，不作为小柱与壳体孔配合的依据。</p>{groups.map(group => {
    const opening = group.representative;
    return <div className="installation-unresolved-opening" key={opening.id} data-unresolved-opening-id={opening.id}><button onClick={() => props.onSelectGeometry({ kind: 'opening', id: opening.id, ownerRef: props.part.id })}><Crosshair size={13} /><span><strong>圆洞 Ø{mm(opening.geometry.radius_m * 2)} mm</strong><small>局部 {group.label} mm</small></span><Focus size={13} /></button><details className="installation-source-geometry"><summary>有限截面与原始几何</summary><p>{group.openings.length} 条截面保留独立身份，未作为额外安装孔计数。</p>{group.openings.map(item => <button key={item.id} onClick={() => props.onSelectGeometry({ kind: 'opening', id: item.id, ownerRef: props.part.id })}><span>Ø{mm(item.geometry.radius_m * 2)} mm</span><Focus size={12} /></button>)}{props.onInspectRawGeometry && <button className="installation-raw-link" onClick={() => props.onInspectRawGeometry?.({ kind: 'opening', id: opening.id, ownerRef: props.part.id })}>查看原始几何<ArrowUpRight size={12} /></button>}</details></div>;
  })}</details>;
}
