import type {CompatibilityCandidate,CompatibilityInterfaceMatch} from './types';

const templates:Record<string,string>={
  cylindrical_insertion:'圆柱轴与孔的有限适配',conical_insertion:'锥形及混合轮廓适配',bearing_fit:'轴承内外圈几何适配',
  keyed_guidance:'键槽与凸耳导向',planar_seating:'有限面落座',screw_reception:'通孔与螺钉承接候选',
  through_fastener:'通孔与穿层连接件候选',latch_engagement:'卡舌与限位结构候选',
};
const conditions:Record<string,string>={
  placement_collision_and_retention_not_evaluated:'放置、整体干涉与保持尚未验证',manufacturing_fit_unknown:'制造配合公差未知',
  material_side_unknown:'内外侧作用角色待确认',dimensions_overlap_measurement_interval:'尺寸差与测量误差区间重叠',
  finite_axial_extent_unknown:'有限轴向范围待确认',axial_registration_and_profile_overlap_unresolved:'轴向放置及有限轮廓重叠待确认',
  conical_seating_or_clearance_unknown:'锥面落座或间隙条件待确认',bearing_fit_class_and_axial_retention_unknown:'轴承配合等级与轴向保持待确认',
  placement_and_common_axis_not_evaluated:'共同轴线及实际放置尚未求解',head_seat_and_tool_access_unknown:'头部承座和工具入口待确认',
  connector_specification_and_length_unresolved:'连接件规格和长度待选',retention_not_evaluated:'保持尚未验证',
  receiving_thread_or_self_tapping_specification_unknown:'承接螺纹或自攻要求待确认',nut_seat_and_multilayer_stack_unresolved:'螺母承座及多层堆叠待确认',
  full_passage_continuity_unverified:'完整通道连续性尚未验证',finite_region_overlap_and_placement_unresolved:'实际放置与有限区域重叠待确认',
  seating_does_not_establish_retention:'落座本身不证明保持成立',profile_orientation_and_placement_unresolved:'轮廓方向和放置待确认',
  profile_dimensions_or_complementary_role_unknown:'轮廓尺寸或互补角色待确认',elastic_material_and_deformation_unverified:'弹性材料与变形尚未验证',
  latch_engagement_path_unverified:'卡扣接合路径尚未验证',
  required_engagement_length_unknown:'所需有效接合长度待确认',
  assembly_path_and_retention_not_evaluated:'装入路径与保持方式尚未验证',
  manufacturing_fit_and_retention_unverified:'制造配合等级与保持方式待核实',
  partial_support_contact_and_encirclement_unverified:'局部支承的实际接触、完整包围与轴向保持待核实',
  source_coordinate_frame_does_not_prove_common_rigid_motion:'源坐标框架不能证明这些区域始终共同刚性运动',
  finite_axial_registration_and_insertion_depth_not_evaluated:'有限轴向对应与插入深度尚未验证',
  common_motion_ownership_not_verified:'共同运动归属尚未核实',
  nonparallel_handedness_and_common_placement_unverified:'非平行布局的手性与共同放置尚未验证',
  relative_entry_sides_and_direction_mapping_unverified:'相对入口侧与方向对应尚未验证',
  'Only supplied finite local geometry is considered':'当前比较仅使用已提供的有限局部几何',
  'Unconfirmed roles remain explicit hypotheses':'尚未确认的功能角色保留为假设',
  'A suitable standard connector may be supplied; it is not added to the real inventory':'允许补充合适的标准连接件；尚未计入实际物料',
  'Complementary material side and compatible finite radial profile':'需要内外侧互补、有限径向轮廓相容的对端',
  'A standard connector and a suitable receiver or nut; thread and stack remain unspecified':'需要标准连接件及合适的承接端或螺母；螺纹和叠层待确认',
  'Finite opposing surface overlap; ordinary seating does not establish a fixed connection':'需要相向有限面的实际重叠；普通落座本身不能证明固定连接成立',
  'Complementary finite cross section, side polarity and entry direction':'需要互补的有限截面、内外侧作用及入口方向',
  'Functional use, manufacturing fit, motion ownership, retaining and engineering conditions require their own evidence':'新设计中的用途、制造配合、运动归属、保持及工程适用需分别核实',
};

export function compatibilityPatternLabel(match:CompatibilityInterfaceMatch):string {
  if(match.member_pairs.some(pair=>pair.radial_fit?.fit_kinds?.includes('partial_radial_support')))return '局部支承';
  if(match.selection_a==='adjacent_pair'||match.selection_b==='adjacent_pair')return '相邻双孔';
  if(match.selection_a==='declared_member_set'||match.selection_b==='declared_member_set')return '指定孔组';
  return '完整接口';
}

export function compatibilityTemplateLabel(value:string|undefined):string {
  if(!value)return '局部几何候选';
  const key=value.startsWith('mechanism:')?value.split(':')[1]:value;
  return templates[key]||'局部几何候选';
}

export function compatibilityConditionLabel(value:unknown):string {
  if(typeof value==='string')return conditions[value]||value;
  if(value&&typeof value==='object'){
    const item=value as Record<string,unknown>;
    const message=item.message??item.description??item.statement??item.condition;
    if(typeof message==='string')return compatibilityConditionLabel(message);
  }
  return '具体条件见几何检查记录';
}

export function capabilityRoleLabel(value:string):string {
  return ({receiving_wall:'内孔承接壁',projecting_wall:'凸出轴或柱壁',support_or_contact_surface:'承托或接触表面',key:'定位键',tab:'凸耳或卡舌',slot:'有限槽',guide:'导向结构',unknown:'作用角色待确认'} as Record<string,string>)[value]||'作用角色待确认';
}

export function connectorRequirementLabel(value:unknown):string {
  if(typeof value==='string')return compatibilityConditionLabel(value);
  if(!value||typeof value!=='object')return '标准连接件规格待确认';
  const item=value as Record<string,unknown>;
  const role=item.role==='screw'?'螺钉':item.role==='through_bolt_with_nut_and_optional_washers'?'穿层螺栓、螺母及按需垫圈':'标准连接件';
  const diameters=Array.isArray(item.possible_shank_diameter_upper_bounds_m)?item.possible_shank_diameter_upper_bounds_m.filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)):[];
  const labels=[...new Set(diameters.map(value=>'Ø'+Number((value*1000).toFixed(3))))];
  const dimensions=labels.length?`；依孔组合，杆径上界 ${labels.slice(0,8).join(' / ')} mm${labels.length>8?' 等':''}`:'';
  return role+dimensions+'；实际规格、长度与物料待选';
}

/** Page an already published finite relation; no new matching or placement is inferred here. */
export function compatibilityRelations(candidate:CompatibilityCandidate,offset=0,limit=12) {
  const family=candidate.mapping_family;
  if(!family)return {total:0,items:[] as {feature_a_ref:string;feature_b_ref:string;check_profile_ref?:number}[]};
  if(family.kind==='cartesian_feature_relation'){
    const a=family.features_a??[],b=family.features_b??[],total=a.length*b.length;
    const items=[];
    for(let index=offset;index<Math.min(total,offset+limit);index++)items.push({feature_a_ref:a[Math.floor(index/b.length)],feature_b_ref:b[index%b.length]});
    return {total,items};
  }
  const pairs=family.pairs??[];
  return {total:pairs.length,items:pairs.slice(offset,offset+limit)};
}
