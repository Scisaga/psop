import type { CircularOpening, FeaturePattern, GeometrySelection, MechanicalFeature, MountingInterface, MountingSite, PrototypeData, SupplementalComponent } from './types';

/** Presentation descriptors preserve the authority of the published record. */
export interface GeometryDescriptor {
  selection: GeometrySelection;
  authority: 'geometry_only' | 'historical_geometry' | 'mechanism_candidate' | 'user_asserted' | 'project_inferred' | 'reference_assembly' | 'illustrative_unconfirmed';
  ownerRef: string;
  featureRefs: string[];
  peers: { ownerRef: string; featureRefs: string[]; siteRefs?: string[]; openingRefs?: string[]; structureRefs?: string[] }[];
  siteRefs?: string[];
  slotRef?: string;
  openingRefs?: string[];
  passageRef?: string;
  supplementRef?: string;
  structureRef?: string;
  structureRefs?: string[];
  hypothesisRef?: string;
  reviewRegionRef?: string;
  contextPartRefs: string[];
  title: string;
}

export const isMechanismProfile = (data: PrototypeData) => Array.isArray(data.analysis?.logical_holes) && Array.isArray(data.analysis?.reference_observations);
export const isMountingProfile = (data: PrototypeData) => Array.isArray(data.analysis?.mounting_sites) && Array.isArray(data.analysis?.reference_mounts);
export const mountingSitesFor = (data: PrototypeData, ownerRef: string) => data.analysis?.mounting_sites?.filter(item => item.owner_ref === ownerRef && item.status !== 'geometry_candidate') ?? [];
export const mountingInterfacesFor = (data: PrototypeData, ownerRef: string) => data.analysis?.mounting_interfaces?.filter(item => item.owner_ref === ownerRef) ?? [];
export const referenceMountsFor = (data: PrototypeData, ownerRef: string) => data.analysis?.reference_mounts?.filter(item => item.participants.some(participant => participant.part_ref === ownerRef)) ?? [];
export const mountingSiteName = (site: MountingSite) => site.site_kind === 'integral_pin' ? '一体小柱' : '安装孔位';
export const mountingSiteSetName = (sites: MountingSite[]) => sites.some(site => site.site_kind === 'integral_pin') ? '安装位置' : '安装孔位';
export const mountingRecordInferred = (item: { status: string; assertion_refs: string[] }) => item.status === 'project_inferred' || item.assertion_refs.includes('thigh-integral-mounting-pins');
export const mountingRuleSummary = (item: MountingInterface) => item.selection_rule.status === 'unknown' || item.selection_rule.min_count === null
  ? '选用数量与组合规则未确认'
  : `${item.selection_rule.same_side ? '同侧' : ''}至少 ${item.selection_rule.min_count} 个${item.selection_rule.require_adjacent_pair ? '，包含一对允许的相邻孔位' : ''}`;
export const installationSelection = (selection: GeometrySelection | null) => !!selection && ['installation_hypothesis', 'pin_fit', 'site', 'mount', 'mounting_interface', 'interface', 'connection_review', 'supplement'].includes(selection.kind);
export const connectionReviewsFor = (data: PrototypeData, ownerRef: string) => data.analysis?.connection_reviews?.filter(item => item.participants.some(participant => participant.part_ref === ownerRef)) ?? [];
/** Historical profiles have no usage discriminator; retain their explicit alternative scope. */
export function isAlternativeSupplement(data: PrototypeData, component: SupplementalComponent) {
  if (component.usage) return component.usage === 'unverified_alternative';
  const review = data.analysis?.connection_reviews?.find(item => item.id === component.review_ref);
  return !!review && !review.reference_mount_refs.length && review.alternatives.some(item => item.component_refs.includes(component.id));
}
export function supplementAlternativeKeys(data: PrototypeData, component: SupplementalComponent) {
  if (!isAlternativeSupplement(data, component)) return [];
  const review = data.analysis?.connection_reviews?.find(item => item.id === component.review_ref);
  return review?.alternatives.filter(item => item.component_refs.includes(component.id)).map(item => `${review.id}::${item.id}`) ?? [];
}
export function supplementalComponentEnabled(data: PrototypeData, component: SupplementalComponent, referenceEnabled: boolean, reviewScope: string[] | null | undefined, activeAlternativeIds: string[] = []) {
  return isAlternativeSupplement(data, component)
    ? supplementAlternativeKeys(data, component).some(key => activeAlternativeIds.includes(key))
    : referenceEnabled && (reviewScope == null || reviewScope.includes(component.review_ref));
}

export function openingGroupsFor(data: PrototypeData, ownerRef: string) {
  const groups: { axis: number[]; center: number[]; openings: CircularOpening[]; representative: CircularOpening; label: string }[] = [];
  const reviewRefs = new Set(data.analysis?.connection_reviews?.flatMap(review => review.participants.filter(item => item.part_ref === ownerRef).flatMap(item => item.opening_refs)) ?? []);
  for (const opening of data.analysis?.circular_openings?.filter(item => item.owner_ref === ownerRef) ?? []) {
    const axis = [...opening.geometry.normal];
    if ((axis.find(value => Math.abs(value) > .5) || 0) < 0) axis.forEach((value, index) => { axis[index] = -value; });
    const center = opening.geometry.center;
    const group = groups.find(item => {
      const alignment = item.axis.reduce((sum, value, index) => sum + value * axis[index], 0);
      const difference = center.map((value, index) => value - item.center[index]);
      const along = difference.reduce((sum, value, index) => sum + value * axis[index], 0);
      return alignment > .999 && difference.reduce((sum, value) => sum + value * value, 0) - along * along < 1e-8;
    });
    if (group) { group.openings.push(opening); if (reviewRefs.has(opening.id) && !reviewRefs.has(group.representative.id)) group.representative = opening; }
    else {
      const dominant = axis.findIndex(value => Math.abs(value) > .5);
      const label = center.map((value, index) => index === dominant ? '' : `${['X', 'Y', 'Z'][index]} ${(value * 1000).toFixed(2)}`).filter(Boolean).join(' / ');
      groups.push({ axis, center: [...center], openings: [opening], representative: opening, label });
    }
  }
  for (const group of groups) {
    const coordinate = (opening: CircularOpening) => opening.geometry.center.reduce((sum, value, index) => sum + value * group.axis[index], 0);
    const minimum = Math.min(...group.openings.map(coordinate)), maximum = Math.max(...group.openings.map(coordinate));
    const exterior = group.openings.filter(opening => {
      const normal = opening.geometry.normal.reduce((sum, value, index) => sum + value * group.axis[index], 0);
      return normal < 0 && Math.abs(coordinate(opening) - minimum) < 1e-6 || normal > 0 && Math.abs(coordinate(opening) - maximum) < 1e-6;
    });
    group.representative = [...(exterior.length ? exterior : group.openings)].sort((a, b) => b.geometry.radius_m - a.geometry.radius_m)[0];
  }
  return groups;
}
export function patternLayoutsFor(data: PrototypeData, ownerRef: string): FeaturePattern[][] {
  const layouts = new Map<string, FeaturePattern[]>();
  for (const pattern of data.analysis?.feature_patterns?.filter(item => item.owner_ref === ownerRef) ?? []) {
    const key = [pattern.frame_ref, pattern.geometry.type, ...[...pattern.logical_hole_refs].sort()].join('|');
    const sides = layouts.get(key) || []; sides.push(pattern); layouts.set(key, sides);
  }
  return [...layouts.values()];
}
export function patternSideLabel(pattern: FeaturePattern) {
  const axis = pattern.geometry.normal.findIndex(value => Math.abs(value) > .5);
  return `${pattern.geometry.normal[axis] < 0 ? 'A' : 'B'} 侧 · 局部 ${pattern.geometry.normal[axis] < 0 ? '−' : '+'}${['X', 'Y', 'Z'][axis]}`;
}
export const qualifiedInterfaces = (data: PrototypeData) => isMechanismProfile(data) ? data.analysis?.interfaces ?? [] : [];
export const qualifiedConnections = (data: PrototypeData) => isMechanismProfile(data) ? data.analysis?.connection_candidates ?? [] : [];
export const featuresFor = (data: PrototypeData, refs: string[]) => {
  const ids = new Set(refs);
  return data.analysis?.features.filter(feature => ids.has(feature.id)) ?? [];
};
export const observationLabel = (kind: string) => ({ finite_surface_overlap: '有限面投影重叠观测', coaxial_bores: '同轴孔几何观测', finite_cylinder_containment: '圆柱有限包含观测', hole_pattern_alignment: '孔阵列对齐观测' } as Record<string, string>)[kind] || '参考位姿几何观测';

export function resolveGeometry(data: PrototypeData, selection: GeometrySelection | null): GeometryDescriptor | null {
  const analysis = data.analysis;
  if (!analysis || !selection) return null;
  const base = { selection, authority: 'geometry_only' as const, peers: [], contextPartRefs: [] };
  if (selection.kind === 'installation_hypothesis') {
    const hypothesis = analysis.installation_hypotheses?.find(item => item.id === selection.id);
    const participant = hypothesis?.participants.find(item => item.part_ref === selection.ownerRef) || hypothesis?.participants[0];
    if (!hypothesis || !participant) return null;
    return { ...base, authority: 'project_inferred', ownerRef: participant.part_ref,
      featureRefs: participant.feature_refs, openingRefs: participant.opening_refs, structureRefs: participant.structure_refs,
      hypothesisRef: hypothesis.id,
      peers: hypothesis.participants.filter(item => item.part_ref !== participant.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: item.feature_refs, openingRefs: item.opening_refs, structureRefs: item.structure_refs })),
      contextPartRefs: hypothesis.participants.map(item => item.part_ref), title: `${hypothesis.title} · 待验证假设` };
  }
  if (selection.kind === 'structure') {
    const candidate = analysis.structure_candidates?.find(item => item.id === selection.id);
    return candidate ? { ...base, ownerRef: candidate.owner_ref, featureRefs: [], structureRef: candidate.id,
      title: '待调查结构 · 功能证据单独核查' } : null;
  }
  if (selection.kind === 'review_region') {
    const region = analysis.review_regions?.find(item => item.id === selection.id);
    return region ? { ...base, ownerRef: region.owner_ref, featureRefs: [], reviewRegionRef: region.id, title: `审查区域 · ${region.label}` } : null;
  }
  if (selection.kind === 'pin_fit') {
    const fit = analysis.pin_hole_fits?.find(item => item.id === selection.id);
    const participant = fit?.participants.find(item => item.part_ref === selection.ownerRef) || fit?.participants.find(item => item.role === 'pin_carrier');
    if (!fit || !participant) return null;
    return { ...base, authority: 'project_inferred', ownerRef: participant.part_ref, featureRefs: participant.feature_refs, siteRefs: participant.site_refs,
      peers: fit.participants.filter(item => item.part_ref !== participant.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: item.feature_refs, siteRefs: item.site_refs })),
      contextPartRefs: fit.participants.map(item => item.part_ref), title: '小柱与壳体孔配合 · 保持方式未知' };
  }
  if (selection.kind === 'opening') {
    const opening = analysis.circular_openings?.find(item => item.id === selection.id);
    return opening ? { ...base, ownerRef: opening.owner_ref, featureRefs: [], openingRefs: [opening.id], title: '真实有限圆形内轮廓' } : null;
  }
  if (selection.kind === 'passage') {
    const passage = analysis.passage_hypotheses?.find(item => item.id === selection.id);
    return passage ? { ...base, ownerRef: passage.owner_ref, featureRefs: [], openingRefs: passage.opening_refs, passageRef: passage.id, title: '变半径有限内壁 · 源拓扑记录' } : null;
  }
  if (selection.kind === 'connection_review' || selection.kind === 'supplement') {
    const supplement = selection.kind === 'supplement' ? analysis.supplemental_components?.find(item => item.id === selection.id) : undefined;
    const review = analysis.connection_reviews?.find(item => item.id === (supplement?.review_ref || selection.id));
    const owner = review?.participants.find(item => item.part_ref === selection.ownerRef) || review?.participants[0];
    if (!review || !owner) return null;
    const finding = !supplement ? analysis.connection_review_findings?.find(item => item.review_ref === review.id && item.work_status === 'investigated') : undefined;
    const investigatedOwner = finding?.participants.find(item => item.part_ref === owner.part_ref);
    if (finding && investigatedOwner && finding.participants.some(item => item.structure_refs.length || item.feature_refs.length || item.opening_refs.length)) {
      return { ...base, authority: 'project_inferred', ownerRef: investigatedOwner.part_ref,
        featureRefs: investigatedOwner.feature_refs, openingRefs: investigatedOwner.opening_refs, structureRefs: investigatedOwner.structure_refs,
        peers: finding.participants.filter(item => item.part_ref !== investigatedOwner.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: item.feature_refs, openingRefs: item.opening_refs, structureRefs: item.structure_refs })),
        contextPartRefs: finding.participants.map(item => item.part_ref), title: `${finding.title} · ${finding.evidence_status === 'supported_hypothesis' ? '机制待验证' : '已调查、仍缺证'}` };
    }
    // Plane projections support a review, but do not define its contact area.
    // Explicit feature/observation selections retain full source-plane access.
    const refsFor = (participant: typeof owner) => [...new Set([...participant.feature_refs, ...(analysis.mounting_sites?.filter(site => participant.site_refs.includes(site.id)).flatMap(site => site.feature_refs) ?? [])])].filter(id => analysis.features.find(feature => feature.id === id)?.geometry.type !== 'plane');
    const openingsFor = (participant: typeof owner) => openingGroupsFor(data, participant.part_ref).filter(group => group.openings.some(opening => participant.opening_refs.includes(opening.id))).map(group => group.representative.id);
    return { ...base, authority: supplement ? 'illustrative_unconfirmed' : 'project_inferred', ownerRef: owner.part_ref, featureRefs: supplement ? [] : refsFor(owner), siteRefs: supplement ? [] : owner.site_refs, openingRefs: supplement ? [] : openingsFor(owner), supplementRef: supplement?.id,
      peers: supplement ? [] : review.participants.filter(item => item.part_ref !== owner.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: refsFor(item), openingRefs: openingsFor(item), siteRefs: item.site_refs })), contextPartRefs: review.participants.map(item => item.part_ref), title: supplement ? `${supplement.label} · 补全示意` : '局部连接审查 · 定位、保持与运动' };
  }
  if (selection.kind === 'site') {
    const site = analysis.mounting_sites?.find(item => item.id === selection.id);
    if (!site) return null;
    const counterpartIds = analysis.pin_hole_fits?.flatMap(fit => fit.pairs.flatMap(pair => pair.pin_site_ref === site.id ? [pair.hole_site_ref] : pair.hole_site_ref === site.id ? [pair.pin_site_ref] : [])) ?? [];
    for (const mount of analysis.reference_mounts ?? []) for (const pair of mount.site_pairs) if (pair.site_refs.includes(site.id)) counterpartIds.push(...pair.site_refs.filter(id => id !== site.id));
    const counterparts = analysis.mounting_sites?.filter(item => counterpartIds.includes(item.id)) ?? [];
    return { ...base, authority: site.status === 'geometry_candidate' ? 'geometry_only' : mountingRecordInferred(site) ? 'project_inferred' : 'user_asserted', ownerRef: site.owner_ref, featureRefs: site.feature_refs, siteRefs: [site.id],
      peers: counterparts.map(item => ({ ownerRef: item.owner_ref, featureRefs: item.feature_refs, siteRefs: [item.id] })), contextPartRefs: [...new Set([site.owner_ref, ...counterparts.map(item => item.owner_ref)])],
      title: site.status === 'geometry_candidate' ? site.label : `${mountingSiteName(site)} ${site.label}${counterparts.length ? ` ↔ ${counterparts.map(item => `${mountingSiteName(item)} ${item.label}`).join(' / ')}` : ''}` };

  }
  if (selection.kind === 'mounting_interface') {
    const item = analysis.mounting_interfaces?.find(value => value.id === selection.id);
    const sites = analysis.mounting_sites?.filter(site => item?.member_site_refs.includes(site.id)) ?? [];
    return item ? { ...base, authority: mountingRecordInferred(item) ? 'project_inferred' : 'user_asserted', ownerRef: item.owner_ref, featureRefs: [...new Set(sites.flatMap(site => site.feature_refs))], siteRefs: sites.map(site => site.id), title: item.label || `可选${mountingSiteSetName(sites)}与组合规则` } : null;
  }
  if (selection.kind === 'mount') {
    const mount = analysis.reference_mounts?.find(item => item.id === selection.id);
    const participant = mount?.participants.find(item => item.part_ref === selection.ownerRef) || mount?.participants[0];
    if (!mount || !participant) return null;
    const sitesFor = (ids: string[]) => analysis.mounting_sites?.filter(site => ids.includes(site.id)) ?? [];
    return { ...base, authority: 'reference_assembly', ownerRef: participant.part_ref, featureRefs: [...new Set(sitesFor(participant.site_refs).flatMap(site => site.feature_refs))], siteRefs: participant.site_refs,
      peers: mount.participants.filter(item => item.part_ref !== participant.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: [...new Set(sitesFor(item.site_refs).flatMap(site => site.feature_refs))], siteRefs: item.site_refs })),
      contextPartRefs: mount.participants.map(item => item.part_ref), title: '标准参考装配 · 双孔对应' };
  }
  if (selection.kind === 'slot') {
    const slot = analysis.slot_features?.find(item => item.id === selection.id);
    return slot ? { ...base, ownerRef: slot.owner_ref, featureRefs: [], slotRef: slot.id, title: '长槽有限开口' } : null;
  }
  if (selection.kind === 'feature') {
    const feature = analysis.features.find(item => item.id === selection.id);
    return feature ? { ...base, ownerRef: feature.owner_ref, featureRefs: [feature.id], title: feature.geometry.type === 'plane' ? '有限源面片' : feature.geometry.type === 'conical_frustum' ? '有限锥形实体表面' : '圆柱壁几何特征' } : null;
  }
  if (selection.kind === 'hole' || selection.kind === 'pattern') {
    const hole = selection.kind === 'hole' ? analysis.logical_holes?.find(item => item.id === selection.id) : null;
    const pattern = selection.kind === 'pattern' ? analysis.feature_patterns?.find(item => item.id === selection.id) : null;
    if (!hole && !pattern) return null;
    const holes = hole ? [hole] : analysis.logical_holes?.filter(item => pattern!.logical_hole_refs.includes(item.id)) ?? [];
    return { ...base, ownerRef: hole?.owner_ref || pattern!.owner_ref, featureRefs: holes.flatMap(item => item.wall_feature_refs), title: pattern ? '几何孔阵列' : hole?.kind === 'stepped_bore' ? '阶梯孔几何' : '逻辑孔几何' };
  }
  if (selection.kind === 'observation') {
    const observation = analysis.reference_observations?.find(item => item.id === selection.id);
    if (!observation) return null;
    const participant = observation.participants.find(item => item.part_ref === selection.ownerRef) || observation.participants[0];
    if (!participant) return null;
    return { ...base, ownerRef: participant.part_ref, featureRefs: participant.feature_refs, peers: observation.participants.filter(item => item.part_ref !== participant.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: item.feature_refs })), contextPartRefs: observation.participants.map(item => item.part_ref), title: observationLabel(observation.kind) };
  }
  if (selection.kind === 'legacy_observation') {
    if (isMechanismProfile(data)) return null;
    const observation = analysis.connection_candidates.find(item => item.id === selection.id);
    if (!observation) return null;
    const participant = observation.endpoint_refs.find(item => item.part_ref === selection.ownerRef) || observation.endpoint_refs[0];
    return { ...base, authority: 'historical_geometry', ownerRef: participant.part_ref, featureRefs: participant.feature_refs, peers: observation.endpoint_refs.filter(item => item.part_ref !== participant.part_ref).map(item => ({ ownerRef: item.part_ref, featureRefs: item.feature_refs })), contextPartRefs: observation.endpoint_refs.map(item => item.part_ref), title: '历史几何配对观测' };
  }
  const item = (selection.kind === 'interface' ? qualifiedInterfaces(data) : !isMechanismProfile(data) ? analysis.interfaces : []).find(item => item.id === selection.id);
  if (!item) return null;
  const pairs = analysis.connection_candidates.filter(candidate => candidate.endpoint_refs.some(endpoint => endpoint.interface_ref === item.id));
  return { ...base, authority: selection.kind === 'interface' ? 'mechanism_candidate' : 'historical_geometry', ownerRef: item.owner_ref, featureRefs: item.feature_refs, peers: pairs.flatMap(candidate => candidate.endpoint_refs.filter(endpoint => endpoint.part_ref !== item.owner_ref).map(endpoint => ({ ownerRef: endpoint.part_ref, featureRefs: endpoint.feature_refs }))), contextPartRefs: pairs.flatMap(candidate => candidate.endpoint_refs.map(endpoint => endpoint.part_ref)), title: selection.kind === 'interface' ? '接口机制候选' : '历史几何分组' };
}

export function descriptorFeatures(data: PrototypeData, descriptor: GeometryDescriptor | null): MechanicalFeature[] {
  return descriptor ? featuresFor(data, descriptor.featureRefs) : [];
}

export function routeSelection(params: URLSearchParams): GeometrySelection | null {
  for (const [key, kind] of [['hypothesis', 'installation_hypothesis'], ['structure', 'structure'], ['reviewRegion', 'review_region'], ['pinFit', 'pin_fit'], ['review', 'connection_review'], ['supplement', 'supplement'], ['opening', 'opening'], ['passage', 'passage'], ['site', 'site'], ['mount', 'mount'], ['mountingInterface', 'mounting_interface'], ['slot', 'slot'], ['observation', 'observation'], ['pattern', 'pattern'], ['hole', 'hole'], ['feature', 'feature'], ['group', 'legacy_group'], ['legacyObservation', 'legacy_observation'], ['interface', 'interface']] as const) {
    const id = params.get(key);
    if (id) return { kind, id, ownerRef: params.get('part') || undefined };
  }
  return null;
}

export function selectionQueryKey(selection: GeometrySelection): string {
  return selection.kind === 'installation_hypothesis' ? 'hypothesis' : selection.kind === 'review_region' ? 'reviewRegion' : selection.kind === 'pin_fit' ? 'pinFit' : selection.kind === 'legacy_group' ? 'group' : selection.kind === 'legacy_observation' ? 'legacyObservation' : selection.kind === 'mounting_interface' ? 'mountingInterface' : selection.kind === 'connection_review' ? 'review' : selection.kind;
}
