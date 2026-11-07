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
export interface MechanicalFrame {
  id: string;
  owner_ref: string;
  attached_to?: string;
  kind?: 'source_geometry_measurement';
  geometry_source_ref?: string;
  geometry_digest?: string;
  motion_ownership?: 'unresolved';
  pose: { expressed_in: string; position: Vec3; quaternion: Quat };
  revision: string;
  evidence_refs: string[];
}
interface MechanicalFeatureBase {
  id: string;
  owner_ref: string;
  frame_ref: string;
  geometry_source_ref: string;
  geometry_digest: string;
  measurement: { basis: 'calculated'; method: string; fit_rms_m: number; fit_max_m: number; coverage: number };
  source_refs: string[];
  evidence_refs: string[];
}
export interface CylindricalFeature extends MechanicalFeatureBase {
  kind: 'bore_wall' | 'shaft_wall';
  geometry: {
    type: 'cylinder'; axis: Vec3; origin: Vec3; radius_m: number;
    axial_range_m: [number, number]; triangle_indices: number[];
  };
}
export interface PlanarFeature extends MechanicalFeatureBase {
  kind: 'planar_patch';
  geometry: { type: 'plane'; origin: Vec3; normal: Vec3; area_m2: number; triangle_indices: number[]; boundary_loops: Vec3[][] };
}
export interface ConicalFeature extends MechanicalFeatureBase {
  kind: 'shaft_wall';
  geometry: { type: 'conical_frustum'; axis: Vec3; origin: Vec3; radius_start_m: number; radius_end_m: number; length_m: number; triangle_indices: number[] };
}
export type MechanicalFeature = CylindricalFeature | PlanarFeature | ConicalFeature;
export interface LogicalHole {
  id: string; owner_ref: string; frame_ref: string; geometry_source_ref: string; geometry_digest: string;
  status: 'geometry_only'; motion_ownership: 'unresolved'; kind: 'single_bore' | 'stepped_bore';
  wall_feature_refs: string[];
  axis: { origin: Vec3; direction: Vec3; axial_range_m: [number, number] };
  portals: { id: string; position: Vec3; normal: Vec3; status: 'opening' | 'closed' | 'unresolved'; support_triangle_indices: number[]; boundary_vertices: Vec3[] }[];
  topology_links: { kind: 'annular_shoulder'; wall_feature_refs: [string, string]; triangle_indices: number[] }[];
  source_refs: string[]; evidence_refs: string[];
}
export interface FeaturePattern {
  id: string; owner_ref: string; frame_ref: string; status: 'geometry_only'; motion_ownership: 'unresolved'; kind: 'geometry_only';
  logical_hole_refs: string[]; portal_refs: string[];
  geometry: { type: 'circular' | 'rectangular' | 'linear' | 'coplanar_collection'; origin: Vec3; normal: Vec3; member_centers: Vec3[]; pitch_circle_diameter_m: number | null; spacing_m: number[]; rotational_symmetry_order: number };
  witness: { method: 'coplanar-hole-patterns/1'; support_triangle_indices: number[] };
  source_refs: string[]; evidence_refs: string[];
}
export interface MountingSite {
  id: string; owner_ref: string; frame_ref: string; hole_ref: string | null; portal_ref: string | null; feature_refs: string[];
  site_kind?: 'hole_entry' | 'integral_pin';
  side_ref: string; label: string; position: Vec3; entry_direction: Vec3;
  status: 'geometry_candidate' | 'user_asserted' | 'project_inferred'; role: 'unqualified' | 'housing_mount' | 'bracket_mount' | 'mounting_feature';
  assertion_refs: string[]; source_refs: string[]; evidence_refs: string[];
}
export interface MountingInterface {
  id: string; owner_ref: string; frame_ref: string; status: 'user_asserted' | 'project_inferred'; mechanism: 'fastener_mount' | 'unknown'; label?: string;
  role: 'housing_mount' | 'bracket_mount' | 'mounting_feature'; member_site_refs: string[];
  sides: { id: string; label: string; normal: Vec3; site_refs: string[] }[];
  selection_rule: { status?: 'declared' | 'unknown'; same_side: boolean | null; min_count: number | null; require_adjacent_pair: boolean | null; allowed_adjacent_pairs: [string, string][]; adjacency_basis: 'rectangle_edges' | 'reference_pair' | 'not_assessed' };
  assertion_refs: string[]; source_refs: string[]; evidence_refs: string[]; unresolved_requirements: string[];
}
export interface ReferenceMount {
  id: string; configuration_ref: string; status: 'user_asserted_reference'; mechanism: 'fastener_mount';
  participants: { part_ref: string; interface_ref: string; site_refs: string[] }[];
  site_pairs: { site_refs: [string, string]; hole_refs: [string, string]; feature_refs: [string, string]; axis_distance_m: number; axis_angle_rad: number; axial_gap_m: number }[];
  reference_placements: { part_ref: string; position: Vec3; quaternion: Quat; scale: Vec3 }[];
  connector_roles: { role: 'fastener'; status: 'unbound'; site_pair_index: number }[];
  assessment: { reference_alignment: 'pass'; mechanical: 'unknown'; engineering: 'unknown'; task: 'unknown'; completion: 'unknown' };
  assertion_refs: string[]; source_refs: string[]; evidence_refs: string[]; unresolved_requirements: string[];
}
export interface SlotFeature {
  id: string; owner_ref: string; frame_ref: string; status: 'geometry_only'; kind: 'capsule_opening' | 'rounded_rectangle_opening';
  geometry_source_ref: string; geometry_digest: string;
  geometry: { type: 'capsule_opening' | 'rounded_rectangle_opening'; origin: Vec3; normal: Vec3; major_axis: Vec3; width_m: number; length_m: number; corner_radius_m: number; boundary_vertices: Vec3[]; support_triangle_indices: number[] };
  measurement: { basis: 'calculated'; method: 'finite-rounded-slot-openings/1'; fit_max_m: number };
  source_refs: string[]; evidence_refs: string[];
}
export interface CircularOpening {
  id: string; owner_ref: string; frame_ref: string; status: 'geometry_only';
  geometry: { type: 'circular_inner_boundary'; center: Vec3; normal: Vec3; radius_m: number; boundary_vertices: Vec3[] };
  source_geometry_digest: string; support_triangle_indices: number[]; fit_max_m: number; source_refs: string[]; evidence_refs: string[];
}
export interface PassageHypothesis {
  id: string; owner_ref: string; frame_ref: string; status: 'topology_witnessed'; opening_refs: string[];
  geometry: { type: 'variable_radius_cavity'; origin: Vec3; axis: Vec3; axial_range_m: [number, number]; radius_range_m: [number, number] };
  wall_triangle_indices: number[]; connectivity: { method: string; boundary_closed: boolean; scope: 'finite_source_surface_only' };
  source_geometry_digest: string; unresolved_requirements: string[]; source_refs: string[]; evidence_refs: string[];
}
export interface PairScreening {
  id: string; configuration_ref: string; part_refs: [string, string]; method: string; distance_m: number; threshold_m: number;
  status: string; review_ref: string | null;
}
export interface ConnectionReview {
  id: string; configuration_ref: string; screening_ref: string; status: string;
  participants: { part_ref: string; feature_refs: string[]; opening_refs: string[]; site_refs: string[] }[];
  basis: string[]; geometry_observation_refs: string[]; reference_mount_refs: string[];
  role_paths: { role: 'location' | 'retention' | 'motion'; status: string; description: string; component_refs: string[]; evidence_refs: string[] }[];
  alternatives: { id: string; label: string; status: string; component_refs: string[]; requirements: string[] }[];
  assessments: { mechanical: string; engineering: string; task: string; completion: string };
  missing_requirements: string[]; source_refs: string[]; evidence_refs: string[];
}
export interface PinHoleFit {
  id: string; review_ref: string; configuration_ref: string; status: 'source_pose_geometric_fit'; inference_scope: 'installation_location_only';
  grouping: { kind: 'reference_pair'; selection_status: 'unknown' };
  participants: { part_ref: string; role: 'pin_carrier' | 'housing_hole_carrier'; site_refs: string[]; feature_refs: string[] }[];
  pairs: { pin_site_ref: string; hole_site_ref: string; pin_feature_ref: string; hole_feature_refs: string[];
    geometry: { frame: 'world'; pin_base: Vec3; pin_tip: Vec3; pin_axis: Vec3; hole_entry: Vec3; hole_axis: Vec3; overlap_start: Vec3; overlap_end: Vec3 };
    measurements: { basis: 'calculated_from_source_geometry'; unit: 'm'; axis_distance_m: number; axis_angle_rad: number; insertion_length_m: number; hole_diameter_m: number; pin_diameter_at_entry_m: number; pin_diameter_at_overlap_end_m: number; pin_tip_diameter_m: number; radial_clearance_at_entry_m: number; radial_clearance_at_overlap_end_m: number };
  }[];
  measurements: { basis: 'calculated_from_source_geometry'; unit: 'm'; member_count: number; pin_spacing_m: number; hole_spacing_m: number; spacing_error_m: number };
  assessments: { location: 'geometric_support'; retention: 'unknown'; load_capacity: 'unknown'; mechanical: 'unknown'; engineering: 'unknown'; task: 'unknown'; completion: 'unknown' };
  source_refs: string[]; evidence_refs: string[]; unresolved_requirements: string[];
}
export interface SupplementalComponent {
  id: string; review_ref: string; label: string; kind: 'screw' | 'cap'; status: 'illustrative_unconfirmed'; domain: 'synthetic'; bom_status: 'not_confirmed'; role: string; usage?: 'reference_connector' | 'unverified_alternative';
  insertion?: null | { status: 'illustrative_hypothesis'; hypothesis: 'through_bracket_toward_housing'; reference_mount_ref: string; configuration_ref: string; site_refs: string[]; entry_part_ref: string; entry_portal_ref: string; target_site_ref: string; head_seat_world: Vec3; axis_world: Vec3; sections: { part_ref: string; hole_ref: string; feature_ref: string; range_m: [number, number] }[]; checks: { finite_geometry: 'pass'; continuous_path: 'not_evaluated'; retention: 'unknown' } };
  pose: { frame: 'world'; position: Vec3; quaternion: Quat; scale: Vec3 };
  geometry: { type: 'screw'; shaft_radius_m: number; shaft_length_m: number; head_radius_m: number; head_length_m: number }
    | { type: 'cap'; outer_radius_m: number; inner_radius_m: number; thickness_m: number };
  parameter_basis: string; unconfirmed_fields: string[]; source_refs: string[]; evidence_refs: string[];
}
export type GeometrySelectionKind = 'interface' | 'feature' | 'hole' | 'pattern' | 'observation' | 'site' | 'mount' | 'mounting_interface' | 'slot' | 'opening' | 'passage' | 'connection_review' | 'supplement' | 'pin_fit' | 'structure' | 'review_region' | 'installation_hypothesis' | 'legacy_group' | 'legacy_observation';
export interface GeometrySelection { kind: GeometrySelectionKind; id: string; ownerRef?: string }
export interface MechanicalInterface {
  id: string;
  owner_ref: string;
  frame_ref: string;
  feature_refs: string[];
  status: 'candidate';
  kind?: 'surface_fit';
  mechanism_candidates: ('fastened_mount' | 'cylindrical_fit' | 'surface_seating' | 'guided_enclosure')[];
  unresolved_requirements: string[];
  source_refs: string[];
  evidence_refs: string[];
}
export interface ConnectionEndpoint {
  part_ref: string;
  interface_ref: string;
  feature_refs: string[];
}
export interface ConnectionCandidate {
  id: string;
  configuration_ref: string;
  endpoint_refs: [ConnectionEndpoint, ConnectionEndpoint];
  status: 'geometric_candidate';
  kind?: 'surface_fit';
  surface_pairs?: { feature_refs: [string, string]; overlap_area_m2: number; plane_gap_m: number; normal_angle_rad: number }[];
  checks: { kind: 'axis_angle' | 'axis_distance' | 'finite_axial_gap' | 'finite_axial_overlap' | 'radial_clearance' | 'bore_radius_difference' | 'opposed_normals' | 'plane_gap' | 'finite_surface_overlap'; result: 'pass'; residual: number; threshold: number; unit: 'rad' | 'm' | 'm2' }[];
  direction_assessment?: {
    status: 'partial' | 'unknown'; basis: 'reference-planar-normal-halfspaces'; moving_part_ref: string; frame: 'world';
    directions: { vector: Vec3; result: 'locally_blocked' | 'not_blocked_by_selected_surfaces' | 'unknown'; blocking_feature_refs: string[] }[];
    limitations: string[];
  };
  unresolved_requirements: string[];
  source_refs: string[];
  evidence_refs: string[];
}
export interface ReferenceObservation {
  id: string;
  kind: 'coaxial_bores' | 'finite_cylinder_containment' | 'finite_surface_overlap' | 'hole_pattern_alignment';
  status: 'geometry_only'; configuration_ref: string;
  participants: { part_ref: string; feature_refs: string[]; logical_hole_refs: string[]; pattern_refs: string[] }[];
  checks: ConnectionCandidate['checks'];
  surface_pairs?: NonNullable<ConnectionCandidate['surface_pairs']>;
  normal_halfspace_test?: {
    status: 'numerical_only'; basis: 'source-reference-normal-projections'; moving_part_ref: string; frame: 'world';
    orientation_support: 'closed_outward' | 'unresolved'; near_contact_tolerance_m: number;
    samples: { vector: Vec3; projections: { feature_ref: string; value: number; near_contact: boolean }[] }[];
    limitations: string[];
  };
  member_observation_refs?: string[];
  member_correspondences?: { logical_hole_refs: [string, string]; feature_refs: [string, string] }[];
  reference_placements?: { part_ref: string; position: Vec3; quaternion: Quat; scale: Vec3 }[];
  unresolved_requirements: string[]; source_refs: string[]; evidence_refs: string[];
}
export interface ReferenceRelation {
  id: string;
  kind: 'same_source_body' | 'source_joint';
  part_refs: string[];
  source_body_ref: string;
  source_joint_ref?: string;
  evidence_refs: string[];
}
export type MechanicalGapType = 'slots_keys' | 'undercuts_shoulders' | 'threads_fasteners' | 'curved_mates' | 'snap_geometry' | 'elastic_retention' | 'assembly_paths' | 'electrical_interfaces' | 'engineering_limits';
export interface StructureCandidate {
  id: string; kind: string; owner_ref: string; geometry_source_ref: string; geometry_sha256: string;
  geometry: { type: string; center: Vec3; axis?: Vec3; normal?: Vec3; radius_m?: number; [key: string]: unknown };
  support_triangle_indices: number[]; source_refs: string[]; evidence_refs: string[];
  measurement?: { coverage?: number; fit_rms_m?: number; fit_max_m?: number; [key: string]: unknown };
  limitations: string[];
  related_feature_refs: string[]; related_opening_refs: string[];
  function_status: 'unknown' | 'installation_evidence_available' | 'installation_hypothesis_available';
  work_status?: 'not_investigated' | 'investigated'; investigation_refs?: string[]; hypothesis_refs?: string[];
  review_status: 'unreviewed' | 'reviewed' | 'blocked';
  next_actions: string[]; missing_evidence: string[]; stop_reason: string; method: string;
  counterpart_proposals: { part_ref: string; structure_ref?: string; basis: string; axis_distance_m?: number; axial_gap_m?: number; status: 'geometry_only'; limitations: string[] }[];
}
export interface ReviewRegion {
  id: string; owner_ref: string; geometry_source_ref: string; label: string;
  triangle_indices: number[]; center: Vec3;
  review_status: 'auto_screened' | 'reviewed' | 'blocked' | 'unreviewed';
  evidence_refs: string[]; limitations: string[]; next_actions: string[];
}
export interface PartInvestigation {
  part_ref: string; geometry_source_ref: string; geometry_sha256: string; geometry_asset_ref: string;
  instance_context: Record<string, unknown>; region_refs: string[]; candidate_refs: string[];
  status: string; limitations: string[]; next_actions: string[];
}
export interface ReviewCoverage {
  schema: string;
  region_review: { total: number; reviewed: number; auto_screened: number; blocked: number; unreviewed: number; complete: false };
  independent_features: {
    status: 'pass' | 'incomplete' | 'not_supplied'; expected_count: number; located_count: number;
    missing: { id: string; part_ref: string; center_local_m: Vec3; reason: string }[];
    matches: { id: string; part_ref: string; center_local_m: Vec3; candidate_refs: string[] }[]; scope: string; limitations: string[];
  };
}
export interface InstallationHypothesis {
  id: string; title: string; status: 'supported_hypothesis'; assertion_basis: 'project_inference';
  configuration_ref: string; investigation_ref: string;
  mechanism: { kind: string; summary: string };
  participants: { part_ref: string; role: string; label: string; structure_refs: string[]; feature_refs: string[]; opening_refs: string[]; position_local_m: Vec3 }[];
  roles: { role: 'location' | 'retention' | 'motion' | 'limit'; status: 'supported_hypothesis' | 'unknown'; statement: string; participant_refs: string[] }[];
  measurements: { name: string; value: number | number[]; unit: 'm' | 'rad' | 'count'; basis: 'source_geometry' }[];
  supporting_evidence: { claim: string; source_refs: string[]; evidence_refs: string[] }[];
  counterevidence: string[]; alternatives: string[];
  intermediate_components: { kind: string; requirement: 'required' | 'possible'; status: 'unconfirmed'; statement: string }[];
  unresolved_requirements: string[]; source_refs: string[]; evidence_refs: string[];
}
export interface InvestigationRecord {
  id: string; title: string; part_ref: string; structure_refs: string[]; opening_refs: string[]; feature_refs: string[];
  position_local_m: Vec3; work_status: 'investigated'; evidence_status: 'supported_hypothesis' | 'insufficient';
  actions: { method: string; source_refs: string[]; observation: string }[];
  findings: string[]; missing_evidence: string[]; hypothesis_refs: string[]; stop_reason: string;
}
export interface ConnectionReviewFinding {
  id: string; review_ref: string; title: string;
  work_status: 'investigated' | 'not_investigated';
  evidence_status: 'supported_hypothesis' | 'insufficient' | 'geometry_only';
  participants: { part_ref: string; structure_refs: string[]; feature_refs: string[]; opening_refs: string[]; position_local_m: Vec3 | null; label: string; role: string }[];
  local_pairings: { participant_refs: string[]; feature_refs: string[]; geometry_checks: { name?: string; kind?: string; value?: number | number[]; residual?: number; unit?: string; result?: string; statement?: string }[]; statement: string }[];
  mechanism_candidates: { kind: string; status: string; summary: string }[];
  roles: { role: 'location' | 'retention' | 'motion' | 'limit'; status: string; statement: string }[];
  actions: { method: string; source_refs: string[]; observation: string }[];
  findings: string[]; counterevidence: string[]; alternatives: string[];
  intermediate_components: { kind: string; requirement: string; status: string; statement: string }[];
  missing_evidence: string[]; next_actions: string[]; hypothesis_refs: string[];
  source_refs: string[]; evidence_refs: string[];
}
export interface MechanicalAnalysis {
  frames: MechanicalFrame[];
  features: MechanicalFeature[];
  logical_holes?: LogicalHole[];
  feature_patterns?: FeaturePattern[];
  reference_observations?: ReferenceObservation[];
  mounting_sites?: MountingSite[];
  mounting_interfaces?: MountingInterface[];
  reference_mounts?: ReferenceMount[];
  slot_features?: SlotFeature[];
  circular_openings?: CircularOpening[];
  passage_hypotheses?: PassageHypothesis[];
  pair_screenings?: PairScreening[];
  connection_reviews?: ConnectionReview[];
  supplemental_components?: SupplementalComponent[];
  pin_hole_fits?: PinHoleFit[];
  structure_candidates?: StructureCandidate[];
  part_investigations?: PartInvestigation[];
  review_regions?: ReviewRegion[];
  review_coverage?: ReviewCoverage;
  installation_hypotheses?: InstallationHypothesis[];
  investigation_records?: InvestigationRecord[];
  connection_review_findings?: ConnectionReviewFinding[];
  connection_relation_contexts?: {
    id: string; title: string; part_refs: string[]; statement: string;
    missing_evidence: string[]; source_refs: string[]; finding_refs: string[];
    status: 'investigated_insufficient';
  }[];
  connection_analysis_coverage?: {
    parts: { part_ref: string; name: string; installation_definition_refs: string[]; hypothesis_refs: string[]; finding_refs: string[]; investigated_insufficient_refs: string[]; geometry_only_refs: string[]; uninvestigated_refs: string[]; mechanisms: string[]; context_refs: string[] }[];
    unreviewed_geometric_pairs: { part_refs: string[]; structure_refs: string[]; next_action: string; work_status: 'not_investigated'; evidence_status: 'geometry_only' }[];
    [key: string]: unknown;
  };
  relationship_coverage?: {
    expected_count: number; located_count: number;
    matches: { id: string; hypothesis_ref: string }[]; missing: string[];
    installation_hypotheses_count: number; installation_definitions_count: number;
    qualified_interfaces_count: number; engineering_confirmed_count: number; scope: string;
  };
  interfaces: MechanicalInterface[];
  connection_candidates: ConnectionCandidate[];
  reference_relations: ReferenceRelation[];
  interface_connections?: never[];
  analysis: {
    method: string;
    unit: 'm';
    features_count: number;
    interfaces_count: number;
    connection_candidates_count: number;
    meshes_analyzed: number;
    logical_holes_count?: number;
    feature_patterns_count?: number;
    raw_observations_count?: number;
    reference_observations_count?: number;
    pattern_alignment_count?: number;
    limitations: string[];
    coverage: {
      mesh_count: number; part_count: number; parts_with_features: number; parts_without_features: number; primitive_types: ('cylinder' | 'plane' | 'conical_frustum')[];
      planar_features_count?: number; surface_interface_count?: number; surface_candidate_count?: number; surface_pairs_count?: number; parts_with_planar_features?: number;
      planar_regions_examined_count?: number; unpaired_planar_regions_count?: number;
      raw_cylinder_observations_count?: number; raw_surface_observations_count?: number;
      feature_type_status?: { cylindrical_geometry: 'partial'; planar_geometry: 'partial' } & Record<MechanicalGapType, 'not_analyzed'>;
      part_gaps?: { part_ref: string; unresolved_types: MechanicalGapType[] }[];
    };
  };
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
    counts: { sources: number; geometries: number; parts: number; bodies: number; joints: number; evidence: number };
    capabilities?: Record<string, { status: 'complete' | 'partial' | 'unavailable'; description?: string; limitations?: string[] }>;
    validation?: { valid: boolean; profile?: string };
  };
  parts: Part[];
  bodies: Body[];
  joints: Joint[];
  sources: Source[];
  evidence: Evidence[];
  analysis?: MechanicalAnalysis;
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
