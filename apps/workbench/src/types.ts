export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Page = 'explorer' | 'knowledge' | 'connections' | 'ontology' | 'sources' | 'build' | 'simulate' | 'compile';
export type PartKind = 'structure' | 'shell' | 'actuator' | 'electronics' | 'bearing' | 'other';
export interface Part {
  id: string;
  name: string;
  meshKey: string;
  body: string;
  group: string;
  groupLabel: string;
  kind: PartKind;
  geometryUrl: string;
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
  rgba: [number, number, number, number];
  sourceIds: string[];
  evidenceIds: string[];
  locator: string;
  interface_status?: 'mechanism_unconfirmed';
}
export interface Body {
  id: string;
  name: string;
  label: string;
  parent: string | null;
  position: Vec3;
  quaternion: Quat;
  group: string;
  partIds: string[];
}
export interface Joint {
  id: string;
  name: string;
  label: string;
  body: string;
  parent: string;
  type: string;
  axis: Vec3;
  range: [number, number];
  sourceId: string;
  locator: string;
}
export interface Source {
  id: string;
  title: string;
  path: string;
  format: string;
  bytes: number;
  digest: string;
  scope: 'model' | 'alpha' | 'hat' | 'media' | 'ontology' | 'package';
  url: string;
  text?: string;
  externalUrl?: string;
  supplemented?: boolean;
  knowledgeScope?: 'manufacturer_general';
}
export interface Evidence {
  id: string;
  sourceId: string;
  title: string;
  kind: 'xml-node' | 'csv-row' | 'text-line' | 'source-file';
  excerpt: string;
  lineStart?: number;
  lineEnd?: number;
  row?: number;
  partId?: string;
}
export interface AssemblyFeature {
  replacement_feature_refs?: string[];
  id: string; owner_ref: string; geometry_source_ref: string; geometry_digest: string;
  kind: string;
  name?: string; label?: string; frame_ref?: string; resource_ref?: string;
  purpose_status?: string; evidence_refs?: string[]; note?: string;
  measurement?:Record<string,unknown>;tolerances?:Record<string,unknown>;function_status?:string;basis?:string;
  semantic_role?:string;profile_form?:string;profile_dimensions_m?:Record<string,number>;
  capability?: {
    basis:string;role:string;template_refs:string[];resource_refs:string[];
    member_selection:string;complementary_requirements:unknown[];unresolved_conditions:unknown[];
  };
  geometry:
    | {type:'cylinder';axis:Vec3;origin:Vec3;radius_m:number;axial_range_m:[number,number];triangle_indices:number[]}
    | {type:'plane';origin:Vec3;normal:Vec3;area_m2:number;triangle_indices:number[];boundary_loops?:Vec3[][]}
    | {type:'conical_frustum';origin:Vec3;axis:Vec3;radius_start_m:number;radius_end_m:number;length_m:number;triangle_indices:number[]}
    | {type:'source_region';origin:Vec3;normal:Vec3;triangle_indices:number[]};
}
export interface AssemblyMember {
  id:string; label:string; feature_refs:string[]; position:Vec3; direction:Vec3; resource_ref?:string;
}
export interface AssemblyInterface {
  id:string; owner_ref:string; key:string; name:string; purpose:string; geometry_summary:string;
  members:AssemblyMember[];
  selection:{kind:'unspecified'|'adjacent_pair';allowed_pairs?:[string,string][]};
  origin:'user_statement'|'source_geometry'|'project_inference'; evidence_refs:string[]; note?:string;
  capability_basis?:string; modes?:unknown[]; unresolved_conditions?:unknown[];
}
export interface AssemblyConnection {
  id:string; name:string; mechanism:string;
  basis:'declared'|'source_assembly'|'source_fit'|'inferred_fit'|'hypothesis'|'incompatible';
  configuration_ref?:string;
  endpoints:{interface_ref:string;member_refs:string[]}[]; evidence_refs:string[]; note?:string;
  fastener_paths?: AssemblyFastenerPath[];
  reference_assessment?: ReferenceConnectionAssessment;
  manual_decision?:{id:string;status:'confirmed'|'rejected';note:string;created_at:string;configuration_ref:string};
}
export interface ReferenceConnectionAssessment {
  schema:'psop.reference-connection-assessment/1';configuration_ref:string;
  purpose:'identified'|'unresolved';counterpart:'identified'|'unresolved';
  geometry:'axes_aligned'|'review_required'|'unverified';fastening:'specified'|'unspecified'|'not_applicable';
  summary:string;evidence_refs:string[];
  open_items:{kind:'purpose'|'counterpart'|'geometry'|'fastening';note:string}[];
}
export interface AssemblyFastenerPath {
  id:string; kind:'screw'; representation:'schematic';
  entry:{interface_ref:string;member_ref:string;feature_ref:string;side:'low'|'high'};
  receiver:{interface_ref:string;member_ref:string;feature_ref:string};
  evidence_refs:string[]; note?:string;
}
export interface AssemblyCatalog {
  features:AssemblyFeature[];interfaces:AssemblyInterface[];connections:AssemblyConnection[];
  part_notes:{owner_ref:string;text:string;evidence_refs:string[]}[];
  capability_index?: CapabilityIndex;
  loaded_capability_parts?: string[];
}
export interface CapabilityIndex {
  parts: Record<string, {path:string;feature_count:number;interface_count:number;candidate_count:number}>;
  compatibility: {index_path:string};
  review_path?: string;
  asset_base?: string;
}
export interface CapabilityEndpoint {
  owner_ref:string; feature_refs:string[]; interface_ref?:string; member_refs?:string[];
}
export interface CompatibilityCandidate {
  id:string; template_ref?:string; kind?:string; name?:string; summary?:string;
  endpoints:CapabilityEndpoint[]; geometry_status?:string; status?:string;
  checks?:unknown[]; geometric_witness?:unknown; evidence_refs?:string[];
  mapping_family?: {
    kind:string; pairs?:{feature_a_ref:string;feature_b_ref:string;check_profile_ref?:number;[key:string]:unknown}[];
    features_a?:string[];features_b?:string[];pair_count?:number;check_profiles?:unknown[];[key:string]:unknown;
  };
  assumptions?:unknown[]; unresolved_conditions?:unknown[]; connector_requirements?:unknown[];
  interface_matches?:CompatibilityInterfaceMatch[];
  [key:string]:unknown;
}
export interface CompatibilityInterfaceMemberPair {
  member_a_ref:string;member_b_ref:string;feature_a_ref:string;feature_b_ref:string;position_a:Vec3;position_b:Vec3;
  contact_a?:Vec3;contact_b?:Vec3;
  radial_fit?:{kind:string;radial_clearance_m:number[];fit_kinds?:string[];unresolved_conditions?:string[]};
}
export interface CompatibilityInterfaceRegistration {
  rotation_b_to_a:number[][];translation_b_to_a:Vec3;anchor_a:Vec3;axis_a:Vec3;
  maximum_axis_residual_m:number;comparison_margin_m:number;entry_relation:'parallel'|'opposed';
  whole_part_collision_evaluated?:boolean;
}
export interface CompatibilityInterfaceAlignment {
  member_pairs:CompatibilityInterfaceMemberPair[];registration:CompatibilityInterfaceRegistration;
  seating?:{method:string;end_a:string;end_b:string;axis_a:Vec3;separation_axis_a:Vec3;maximum_boundary_residual_m:number;display_gap_m:number};
  assembly_assessment?:{schema:string;decision:'allow'|'allow_with_note'|'block';reasons:string[];configuration_ref:string|null;policy_digest:string};
  interference?:{method:string;status:'clear'|'interference'|'unresolved';numerical_contact_allowance_m?:number;proof?:string};
}
export interface CompatibilityInterfaceMatch extends CompatibilityInterfaceAlignment {
  id:string;interface_a_ref:string;interface_b_ref:string;selection_a:string;selection_b:string;member_count:number;
  source_member_count_a:number;source_member_count_b:number;alignment_options:CompatibilityInterfaceAlignment[];alignment_count:number;evidence_refs:string[];
}
export interface CompatibilityPairSummary {
  id:string; owner_refs:[string,string]; path:string; candidate_count:number;
  template_counts?:Record<string,number>; summary?:string;
  interface_match_count?:number;local_geometry_count?:number;
  placement_evaluated?:boolean;excluded_placement_count?:number;
}
export interface CompatibilityIndex {
  schema:string; pairs:CompatibilityPairSummary[]; scope?:string|Record<string,unknown>;
  [key:string]:unknown;
}
export interface CompatibilityPairDetail {
  schema:string; owner_refs:[string,string]; candidates:CompatibilityCandidate[];
  screening?:Record<string,unknown>|unknown[];
  [key:string]:unknown;
}
export interface PartCapabilities {
  schema:'psop.part-capabilities/1'; owner_ref:string;
  features:AssemblyFeature[]; interfaces:AssemblyInterface[];
  resources?:Record<string,unknown>[]; frames?:Record<string,unknown>[];
  reference_connections?:AssemblyConnection[];
  reference_use_review?:ReferenceUseReview;
  compatibility_pairs?:CompatibilityPairSummary[];
  evidence?:Evidence[];
  [key:string]:unknown;
}
export interface ReferenceUseReview {
  owner_ref:string;summary:string;open_items:string[];scope:string;source_ref:string;
  interface_dispositions:{interface_ref:string;name:string;status:'reference_use_recorded'|'reference_conflict_recorded'|'not_observed_used_in_input'|'use_unresolved';connection_refs:string[]}[];
}
export type MechanicalFeature = AssemblyFeature;
export type GeometrySelectionKind = 'interface'|'feature';
export interface GeometrySelection {kind:GeometrySelectionKind;id:string;ownerRef?:string;memberRef?:string;memberRefs?:string[];relationRef?:string;fastenerRef?:string}
export interface GeometryDescriptor {
  selection:GeometrySelection;ownerRef:string;title:string;featureRefs:string[];
  position:Vec3;normal:Vec3;
  entries:{featureRef:string;position:Vec3;direction:Vec3}[];
  peers:{ownerRef:string;featureRefs:string[]}[];contextPartRefs:string[];
}
export interface PrototypeData {
  meta: {
    inputKind: 'dkp';
    dkpSchema: string;
    packageId: string;
    packageVersion: string;
    packageDigest: string;
    title: string;
    version: string;
    snapshot: string;
    ontologyVersion: string;
    generatedAt: string;
    scope: string;
    sourceCommit: string;
    activeReferenceConfiguration?:string;
    counts: { sources: number; geometries: number; parts: number; bodies: number; joints: number; evidence: number };
    capabilities?: Record<string, { status: 'complete' | 'partial' | 'unavailable'; description?: string; limitations?: string[] }>;
    validation?: { valid: boolean; profile?: string };
  };
  parts: Part[];
  bodies: Body[];
  joints: Joint[];
  sources: Source[];
  evidence: Evidence[];
  assembly?: AssemblyCatalog;
  reference_alignment?:ReferenceAlignment;
}
export interface ReferenceAlignment {
 path:string;configuration_ref:string;source_configuration_ref:string;title:string;basis:'engineering_inference';rationale:string;
 placements:{part_ref:string;source_position:Vec3;position:Vec3;quaternion:Quat}[];
 presentation:{
  part_notes:{owner_ref:string;text:string}[];
  interfaces:{interface_ref:string;note:string;geometry_summary:string}[];
  connections:{connection_ref:string;note:string;basis?:'inferred_fit';check_refs:string[]}[];
 };
}
export interface KnowledgeSnapshot {
  id: string;
  packageId: string;
  packageVersion: string;
  packageDigest: string;
  ontologyVersion: string;
  createdAt: string;
  counts: PrototypeData['meta']['counts'];
}
export interface DeviceWorkspace {
  id: string;
  deviceId: string;
  name: string;
  description: string;
  snapshots: KnowledgeSnapshot[];
  selectedSnapshotId?: string;
}
export const GROUP_LABELS: Record<string, string> = {
  head: '头部与颈部', torso: '躯干', 'left-leg': '左腿与足部', 'right-leg': '右腿与足部', other: '其他部件',
};
export const KIND_LABELS: Record<PartKind, string> = {
  structure: '结构件', shell: '外壳', actuator: '执行器', electronics: '电子器件', bearing: '轴承', other: '其他',
};
