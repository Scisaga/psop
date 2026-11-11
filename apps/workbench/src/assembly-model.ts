import type { AssemblyConnection, AssemblyFeature, AssemblyInterface, AssemblyMember, GeometrySelection, Part, PrototypeData } from './types';
import {capabilityRoleLabel,compatibilityTemplateLabel} from './compatibility-presentation.ts';

export type AssemblyUseState = 'used' | 'available' | 'possible' | 'manual' | 'excluded' | 'identified' | 'review';
export interface AssemblyIndex {
  interfaces: Map<string, AssemblyInterface>;
  features: Map<string, AssemblyFeature>;
  parts: Map<string, Part>;
  byPart: Map<string, AssemblyInterface[]>;
  connections: Map<string, AssemblyConnection[]>;
}

const cache = new WeakMap<PrototypeData, AssemblyIndex>();
export function assemblyIndex(data: PrototypeData): AssemblyIndex {
  const saved = cache.get(data);
  if (saved) return saved;
  const interfaces = data.assembly?.interfaces ?? [];
  const index: AssemblyIndex = {
    interfaces: new Map(interfaces.map(item => [item.id, item])),
    features: new Map((data.assembly?.features ?? []).map(item => [item.id, item])),
    parts: new Map(data.parts.map(part => [part.id, part])),
    byPart: new Map(), connections: new Map(),
  };
  for (const item of interfaces) {
    const list = index.byPart.get(item.owner_ref) ?? [];
    list.push(item);
    index.byPart.set(item.owner_ref, list);
  }
  for (const connection of data.assembly?.connections ?? []) {
    for (const ref of new Set(connection.endpoints.map(endpoint => endpoint.interface_ref))) {
      const list = index.connections.get(ref) ?? [];
      list.push(connection);
      index.connections.set(ref, list);
    }
  }
  cache.set(data, index);
  return index;
}

export function interfacesForPart(data: PrototypeData, ownerRef: string) {
  return assemblyIndex(data).byPart.get(ownerRef) ?? [];
}

export function referenceAssemblyData(data: PrototypeData): PrototypeData {
  if (!data.assembly?.capability_index) return data;
  const connected = new Set(data.assembly.connections.flatMap(connection => connection.endpoints.map(endpoint => endpoint.interface_ref)));
  // A known installation interface remains useful when its reference peer is
  // unresolved. Only geometry-only hypotheses belong exclusively to the other
  // views; absence of a Connection must not erase a bearing ring interface.
  return {...data, assembly: {...data.assembly, interfaces: data.assembly.interfaces.filter(item => connected.has(item.id) || item.capability_basis !== 'geometry_hypothesis')}};
}

export function featuresForPart(data: PrototypeData, ownerRef: string) {
  return (data.assembly?.features ?? []).filter(feature => feature.owner_ref === ownerRef);
}

export function selectionForFeature(feature: AssemblyFeature): GeometrySelection {
  return { kind: 'feature', id: feature.id, ownerRef: feature.owner_ref };
}

export function featureLabel(feature: AssemblyFeature): string {
  return feature.name || feature.label || ({key:'键形凸起',tab:'凸耳形结构',slot:'有限槽形区域',guide:'有限导向区域'} as Record<string,string>)[feature.semantic_role??''] || ({ bore_wall: '有限内孔壁', shaft_wall: '有限轴壁', planar_patch: '有限平面', surface_region: '局部曲面', conical_bore_wall: '锥形内孔壁', conical_shaft_wall: '锥形轴壁' } as Record<string, string>)[feature.kind]
    || ({ cylinder: '有限圆柱面', plane: '有限平面', conical_frustum: '有限锥面', source_region: '局部几何区域' })[feature.geometry.type];
}

export function featureDimensions(feature: AssemblyFeature): string {
  const g = feature.geometry;
  const mm = (value: number) => Number((value * 1000).toFixed(3));
  if (g.type === 'cylinder') return `Ø${mm(g.radius_m * 2)} · 长 ${mm(Math.abs(g.axial_range_m[1] - g.axial_range_m[0]))} mm`;
  if (g.type === 'conical_frustum') return `Ø${mm(g.radius_start_m * 2)} → ${mm(g.radius_end_m * 2)} · 长 ${mm(g.length_m)} mm`;
  if (g.type === 'plane') return `源区域 ${Number((g.area_m2 * 1e6).toFixed(2))} mm²`;
  if (feature.profile_dimensions_m) {
    const dimensions=feature.profile_dimensions_m;
    const width=Number.isFinite(dimensions.width_at_cap_m)&&Number.isFinite(dimensions.width_at_base_m)&&Math.abs(dimensions.width_at_cap_m-dimensions.width_at_base_m)>1e-7
      ? `宽 ${mm(Math.min(dimensions.width_at_cap_m,dimensions.width_at_base_m))} → ${mm(Math.max(dimensions.width_at_cap_m,dimensions.width_at_base_m))}`
      : Number.isFinite(dimensions.width_m)?`宽 ${mm(dimensions.width_m)}`:'';
    const parts=[width,Number.isFinite(dimensions.height_m)?`高 ${mm(dimensions.height_m)}`:'',Number.isFinite(dimensions.length_m)?`长 ${mm(dimensions.length_m)}`:''].filter(Boolean);
    return parts.length?parts.join(' · ')+' mm':'有限源几何区域';
  }
  return '有限源几何区域';
}

export function geometrySearchEntries(data: PrototypeData, query: string, limit = 12) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const index = assemblyIndex(data);
  const entries = (data.assembly?.interfaces ?? []).map(item => ({ selection: selectionForInterface(item), title: item.name, detail: item.geometry_summary + ' · ' + (index.parts.get(item.owner_ref)?.name || '') }));
  for (const feature of data.assembly?.features ?? []) {
    entries.push({ selection: selectionForFeature(feature), title: featureLabel(feature), detail: [featureDimensions(feature),...(feature.capability?[capabilityRoleLabel(feature.capability.role)]:[]),...(feature.capability?.template_refs??[]).map(compatibilityTemplateLabel),index.parts.get(feature.owner_ref)?.name||''].join(' · ') });
  }
  return entries.filter(item => `${item.title} ${item.detail} ${item.selection.id}`.toLocaleLowerCase().includes(q)).slice(0, limit);
}

export function connectionsForInterface(data: PrototypeData, interfaceRef: string) {
  return assemblyIndex(data).connections.get(interfaceRef) ?? [];
}

export function interfaceFeatureRefs(data: PrototypeData, item: AssemblyInterface) {
  const features=assemblyIndex(data).features;
  const refs=new Set(item.members.flatMap(member=>member.feature_refs));
  for(const ref of [...refs]){
    const source=features.get(ref);
    for(const replacement of source?.replacement_feature_refs??[]){
      const target=features.get(replacement);
      if(target?.owner_ref===item.owner_ref&&target.geometry_digest===source?.geometry_digest)refs.add(replacement);
    }
  }
  return [...refs];
}

export function interfacesForSelection(data: PrototypeData, selection: GeometrySelection | null) {
  if (!selection) return [];
  const index = assemblyIndex(data);
  if (selection.kind === 'interface') {
    const item = index.interfaces.get(selection.id);
    return item && (!selection.ownerRef || item.owner_ref === selection.ownerRef) ? [item] : [];
  }
  return (selection.ownerRef ? index.byPart.get(selection.ownerRef) ?? [] : [...index.interfaces.values()])
    .filter(item => interfaceFeatureRefs(data,item).includes(selection.id));
}

export function isUsedConnection(connection: AssemblyConnection) {
  if(connection.manual_decision)return connection.manual_decision.status==='confirmed';
  return ['declared', 'source_assembly', 'source_fit', 'inferred_fit'].includes(connection.basis);
}

export function referenceAssessment(connection:AssemblyConnection){
  const assessment=connection.reference_assessment;
  return assessment&&(!connection.configuration_ref||assessment.configuration_ref===connection.configuration_ref)?assessment:undefined;
}

export function hasIdentifiedCounterpart(connection:AssemblyConnection){
  if(connection.manual_decision)return connection.manual_decision.status==='confirmed';
  return isUsedConnection(connection)||referenceAssessment(connection)?.counterpart==='identified';
}

export function connectionUseState(connection:AssemblyConnection):AssemblyUseState{
  if(connection.manual_decision)return connection.manual_decision.status==='confirmed'?'manual':'excluded';
  const assessment=referenceAssessment(connection);
  if(assessment?.geometry==='review_required'||connection.basis==='incompatible')return 'review';
  if(isUsedConnection(connection))return 'used';
  if(assessment?.counterpart==='identified')return 'identified';
  return connection.basis==='hypothesis'?'possible':'available';
}

export function referencePendingSummary(connection:AssemblyConnection){
  const assessment=referenceAssessment(connection);
  if(!assessment||connection.manual_decision?.status==='rejected')return '';
  return [assessment.geometry==='axes_aligned'?'孔位已对应':assessment.geometry==='review_required'&&assessment.counterpart==='identified'&&!connection.manual_decision?'对端已识别':'几何待核',
    assessment.fastening==='unspecified'?'紧固细节待核':''].filter(Boolean).join(' · ');
}

export function interfaceUseState(data: PrototypeData, item: AssemblyInterface): AssemblyUseState {
  const connections = connectionsForInterface(data, item.id);
  const states=connections.map(connectionUseState);
  return (['manual','review','used','identified','possible','excluded'] as AssemblyUseState[]).find(state=>states.includes(state))??'available';
}

export const assemblyStateLabel: Record<AssemblyUseState, string> = { used: '已确定', available: '可用', possible: '待核实',manual:'人工确认',excluded:'已排除',identified:'对端已识别',review:'几何待核' };

export function selectionForInterface(item: AssemblyInterface, memberRefs: string[] = [], relationRef?: string): GeometrySelection {
  const valid = [...new Set(memberRefs)].filter(ref => item.members.some(member => member.id === ref));
  return {
    kind: 'interface', id: item.id, ownerRef: item.owner_ref,
    ...(valid.length === 1 ? { memberRef: valid[0] } : valid.length ? { memberRefs: valid } : {}),
    ...(relationRef ? { relationRef } : {}),
  };
}

export function selectedAssemblyMembers(data: PrototypeData, item: AssemblyInterface, selection: GeometrySelection | null): AssemblyMember[] {
  if (!selection) return [];
  if (selection.kind === 'feature') return item.members.filter(member => member.feature_refs.includes(selection.id));
  if (selection.id !== item.id) return [];
  if (selection.fastenerRef) {
    const paths=connectionsForInterface(data,item.id).filter(connection=>!selection.relationRef||connection.id===selection.relationRef).flatMap(connection=>connection.fastener_paths??[]).filter(path=>path.id===selection.fastenerRef);
    if(paths.length!==1)return [];
    const endpoint=[paths[0].entry,paths[0].receiver].find(endpoint=>endpoint.interface_ref===item.id);
    if(!endpoint)return [];
    const explicit=selection.memberRef?[selection.memberRef]:selection.memberRefs??[];
    return explicit.length&&!explicit.includes(endpoint.member_ref)?[]:item.members.filter(member=>member.id===endpoint.member_ref);
  }
  if (selection.memberRef) return item.members.filter(member => member.id === selection.memberRef);
  if (selection.memberRefs?.length) return item.members.filter(member => selection.memberRefs!.includes(member.id));
  const connection = selection.relationRef ? connectionsForInterface(data, item.id).find(item => item.id === selection.relationRef) : undefined;
  const endpoint = connection?.endpoints.find(endpoint => endpoint.interface_ref === item.id);
  return selection.relationRef ? item.members.filter(member => endpoint?.member_refs.includes(member.id)) : item.members;
}

export function peerEndpoints(data: PrototypeData, item: AssemblyInterface, connection: AssemblyConnection) {
  const index = assemblyIndex(data);
  return connection.endpoints.flatMap(endpoint => {
    if (endpoint.interface_ref === item.id) return [];
    const target = index.interfaces.get(endpoint.interface_ref);
    return target ? [{ target, memberRefs: endpoint.member_refs }] : [];
  });
}

export function assemblyPartName(data: PrototypeData, ownerRef: string) {
  const part = assemblyIndex(data).parts.get(ownerRef);
  if (!part) return '未知部件';
  const sameName = data.parts.filter(candidate => candidate.name === part.name);
  if (sameName.length === 1) return part.name;
  const body = data.bodies.find(body => body.name === part.body)?.label || part.groupLabel;
  const siblings = sameName.filter(candidate => candidate.body === part.body);
  return `${part.name} · ${body}${siblings.length > 1 ? ` · ${siblings.indexOf(part) + 1}` : ''}`;
}

export const localMillimeters = (position: number[]) => position.map(value => Number((value * 1000).toFixed(3))).join(', ');

export function memberDirection(direction: number[]) {
  const axis = direction.findIndex(value => Math.abs(value) > .999);
  return axis < 0 ? '斜向' : `${direction[axis] < 0 ? '−' : '+'}${['X', 'Y', 'Z'][axis]}`;
}

export function assemblySources(data: PrototypeData, evidenceRefs: string[], featureRefs: string[] = []) {
  const sources = new Map<string, { sourceId: string; evidenceId?: string; title: string }>();
  for (const ref of evidenceRefs) {
    const evidence = data.evidence.find(evidence => evidence.id === ref);
    const source = data.sources.find(source => source.id === (evidence?.sourceId || ref));
    const key = evidence?.id || source?.id;
    if (source && key && !sources.has(key)) sources.set(key, { sourceId: source.id, evidenceId: evidence?.id, title: evidence?.title || source.title });
  }
  for (const ref of featureRefs) {
    const feature = assemblyIndex(data).features.get(ref);
    const source = feature && data.sources.find(source => source.id === feature.geometry_source_ref);
    if (source && ![...sources.values()].some(item => item.sourceId === source.id)) sources.set(source.id, { sourceId: source.id, title: source.title });
  }
  return [...sources.values()];
}
