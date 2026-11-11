"""Finite, pose-independent geometric compatibility discovery.

These are necessary-condition candidates, not solved placements or connections.
The complete domain is the supplied features, instance pairs and versioned
templates.  Unknown specifications are retained, not interpreted as no match.
No world placement, rigid registration, standard SKU or manufacturing tolerance
is inferred.  Large member selections are stored as finite relation families;
``query_mappings`` enumerates those families without a top-K completeness claim.
"""
from __future__ import annotations

from copy import deepcopy
import base64
import hashlib
from itertools import combinations
import json
import math


SCHEMA = "psop.assembly.compatibility/1"
COMPARISON_MARGIN_M = 2e-5
ANGLE_MARGIN_RAD = math.radians(.15)
_EPS = 1e-12
_TEMPLATES = (
    ("cylindrical_insertion", "Finite cylindrical male / female insertion", "cylinder"),
    ("conical_insertion", "Finite conical or mixed-profile insertion", "cone"),
    ("bearing_fit", "Bearing inner / outer ring geometric fit", "bearing"),
    ("keyed_guidance", "Finite key / slot or tab / recess guidance", "key"),
    ("planar_seating", "Potential finite planar seating", "plane"),
    ("screw_reception", "Clearance opening and potential screw receiver", "screw"),
    ("through_fastener", "Clearance openings with a through bolt / nut requirement", "through"),
    ("latch_engagement", "Latch head and ledge / opening geometric candidate", "latch"),
)


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(value):
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _length(a):
    return math.sqrt(_dot(a, a))


def _unit(value):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        return None
    if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in value):
        return None
    magnitude = _length(value)
    return [x/magnitude for x in value] if magnitude > _EPS else None


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _refs(values):
    return sorted(set(value for value in values if isinstance(value, str) and value))


def _templates():
    return [{"id": "mechanism:"+name+":1", "kind": name, "version": 1, "name": label,
             "assessment_scope": "pose_independent_geometry", "placement_evaluated": False,
             "coverage": "Necessary local geometric conditions only; no placement, collision, path or retention proof"}
            for name, label, _ in _TEMPLATES]


def _role(feature):
    explicit = feature.get("polarity", feature.get("geometry", {}).get("polarity", feature.get("semantic_role")))
    if explicit in {"male", "female"}:
        return explicit
    kind = (str(feature.get("kind", ""))+" "+str(feature.get("semantic_role", ""))).lower()
    if kind.strip() in {"male", "female"}:
        return kind.strip()
    if any(word in kind for word in ("bore", "hole_wall", "inner_wall", "socket", "seat_wall", "inner_ring", "female")):
        return "female"
    if any(word in kind for word in ("shaft", "pin_wall", "outer_wall", "boss_wall", "stud", "outer_ring", "male")) or str(feature.get("semantic_role", "")).lower() in {"pin", "boss"}:
        return "male"
    return "unknown"


def _profile_role(feature):
    measurement = feature.get("measurement", {})
    polarity = measurement.get("profile_polarity") if isinstance(measurement, dict) else None
    if polarity in {"convex", "concave"}:
        return "projecting" if polarity == "convex" else "receiver"
    text = (str(feature.get("kind", ""))+" "+str(feature.get("semantic_role", ""))).lower()
    if any(word in text for word in ("slot", "notch", "recess", "pocket", "groove", "ledge", "latch_receiver")):
        return "receiver"
    if any(word in text for word in ("key", "tab", "lug", "latch_head", "hook", "tongue", "latch_surface")):
        return "projecting"
    if "guide" in text or "latch" in text:
        return "unknown_profile"
    return None


def _descriptor(feature, part):
    geometry = feature.get("geometry", {})
    measurement = feature.get("measurement", {})
    if not isinstance(measurement, dict):
        measurement = {}
    supplied = measurement.get("uncertainty_m")
    uncertainty = max(COMPARISON_MARGIN_M, supplied) if _number(supplied) and supplied >= 0 else COMPARISON_MARGIN_M
    kind = geometry.get("type", "unknown")
    radii = []
    if kind == "cylinder" and _number(geometry.get("radius_m")) and geometry["radius_m"] > 0:
        radii = [geometry["radius_m"], geometry["radius_m"]]
    elif kind == "conical_frustum" and all(_number(geometry.get(key)) for key in ("radius_start_m", "radius_end_m")):
        radii = sorted([geometry["radius_start_m"], geometry["radius_end_m"]])
        if radii[0] < 0 or radii[1] <= 0:
            radii = []
    interval = geometry.get("axial_range_m")
    length = geometry.get("length_m")
    if isinstance(interval, list) and len(interval) == 2 and all(_number(x) for x in interval):
        length = interval[1]-interval[0]
    length = length if _number(length) and length > 0 else None
    profile = geometry.get("profile_dimensions_m", feature.get("profile_dimensions_m"))
    if profile is None and all(_number(geometry.get(k)) for k in ("width_m", "height_m")):
        profile = [geometry["width_m"], geometry["height_m"]]
    if isinstance(profile, dict):
        profile_length = profile.get("length_m")
        if length is None and _number(profile_length) and profile_length > 0:
            length = profile_length
        profile = [profile.get("width_m"), profile.get("height_m")]
    if not isinstance(profile, list) or len(profile) != 2 or not all(_number(x) and x > 0 for x in profile):
        profile = None
    thread = feature.get("thread", geometry.get("thread"))
    return {"id": feature["id"], "owner_ref": feature["owner_ref"], "shape": kind,
            "role": _role(feature), "profile_role": _profile_role(feature), "radii_m": radii,
            "length_m": length, "uncertainty_m": uncertainty, "profile_dimensions_m": profile,
            "profile_polarity": measurement.get("profile_polarity"),
            "bearing": part.get("kind") == "bearing" or "bearing" in str(feature.get("kind", "")),
            "thread": thread if isinstance(thread, dict) else None,
            "latch": any(word in (str(feature.get("kind", ""))+" "+str(feature.get("semantic_role", ""))).lower() for word in ("latch", "hook")),
            "evidence_refs": _refs(feature.get("evidence_refs", [])),
            "frame_ref": feature.get("frame_ref")}


def _uncertain_pair(left, right, checks, unresolved):
    return {"feature_a_ref": left["id"], "feature_b_ref": right["id"],
            "role_a": left["role"], "role_b": right["role"], "checks": checks,
            "unresolved_conditions": sorted(set(unresolved))}


def _radial_pair(left, right, family, minimum_gap=None):
    if left["shape"] not in {"cylinder", "conical_frustum"} or right["shape"] not in {"cylinder", "conical_frustum"}:
        return None, False
    if family == "cylinder" and (left["shape"] != "cylinder" or right["shape"] != "cylinder"):
        return None, False
    if family == "cone" and left["shape"] == right["shape"] == "cylinder":
        return None, False
    if family == "bearing" and not (left["bearing"] or right["bearing"]):
        return None, False
    if left["role"] == right["role"] and left["role"] != "unknown":
        return None, False
    if not left["radii_m"] or not right["radii_m"]:
        return None, True
    unresolved = ["placement_collision_and_retention_not_evaluated", "manufacturing_fit_unknown"]
    checks = []
    if "unknown" in {left["role"], right["role"]}:
        unresolved.append("material_side_unknown")
        checks.append({"kind": "role_complementarity", "status": "unknown"})
    else:
        male, female = (left, right) if left["role"] == "male" else (right, left)
        gap = female["radii_m"][1]-male["radii_m"][0]
        margin = male["uncertainty_m"]+female["uncertainty_m"]
        if gap < (minimum_gap if minimum_gap is not None else 0)-margin:
            return None, True
        checks.append({"kind": "radial_envelope", "status": "compatible" if gap >= margin else "conditional",
                       "possible_radial_clearance_m": [gap-margin, gap+margin],
                       "comparison_margin_m": margin})
        if gap < margin:
            unresolved.append("dimensions_overlap_measurement_interval")
    if not left["length_m"] or not right["length_m"]:
        unresolved.append("finite_axial_extent_unknown")
    else:
        checks.append({"kind": "finite_segments", "lengths_m": [left["length_m"], right["length_m"]],
                       "maximum_possible_overlap_m": min(left["length_m"], right["length_m"])})
    if family == "cone":
        unresolved.extend(["axial_registration_and_profile_overlap_unresolved", "conical_seating_or_clearance_unknown"])
        checks.append({"kind": "profile_envelopes", "radii_a_m": left["radii_m"], "radii_b_m": right["radii_m"]})
    if family == "bearing":
        unresolved.append("bearing_fit_class_and_axial_retention_unknown")
    return _uncertain_pair(left, right, checks, unresolved), True


def _match(left, right, family, minimum_gap=None):
    if family in {"cylinder", "cone", "bearing"}:
        return _radial_pair(left, right, family, minimum_gap)
    if family in {"screw", "through"}:
        radial = {"cylinder", "conical_frustum"}
        if left["shape"] not in radial or right["shape"] not in radial:
            return None, False
        if "male" in {left["role"], right["role"]}:
            return None, False
        if not left["radii_m"] or not right["radii_m"]:
            return None, True
        bore = 2*min(left["radii_m"][0], right["radii_m"][0])
        checks = [{"kind": "potential_shank_clearance", "shank_diameter_upper_bound_m": bore,
                   "manufacturing_clearance_unknown": True}]
        unresolved = ["placement_and_common_axis_not_evaluated", "head_seat_and_tool_access_unknown",
                      "connector_specification_and_length_unresolved", "retention_not_evaluated"]
        if "unknown" in {left["role"], right["role"]}:
            unresolved.append("material_side_unknown")
        if family == "screw":
            # A source bore does not establish threads or permit self tapping.
            if not (left["thread"] or right["thread"]):
                unresolved.append("receiving_thread_or_self_tapping_specification_unknown")
            # The receiver's minor/pilot diameter is not a clearance limit on
            # the screw's major diameter. Keep both role assignments explicit.
            options = []
            for clearance, receiver in ((left, right), (right, left)):
                thread = receiver["thread"] or {}
                nominal = thread.get("nominal_diameter_m", thread.get("diameter_m"))
                upper = 2*clearance["radii_m"][0]
                margin = 2*(clearance["uncertainty_m"]+receiver["uncertainty_m"])
                if _number(nominal) and nominal > upper+margin:
                    continue
                options.append({"clearance_endpoint_index": 0 if clearance is left else 1,
                                "receiver_endpoint_index": 0 if receiver is left else 1,
                                "shank_diameter_upper_bound_m": upper, "receiver_thread": receiver["thread"]})
            if not options:
                return None, True
            checks = [{"kind": "screw_role_options", "options": options}]
            checks.append({"kind": "thread_information", "a": left["thread"], "b": right["thread"]})
        else:
            unresolved.extend(["nut_seat_and_multilayer_stack_unresolved", "full_passage_continuity_unverified"])
        return _uncertain_pair(left, right, checks, unresolved), True
    if family == "plane":
        if left["shape"] != "plane" or right["shape"] != "plane":
            return None, False
        return _uncertain_pair(left, right, [{"kind": "finite_planar_regions", "status": "conditional"}],
                               ["finite_region_overlap_and_placement_unresolved", "seating_does_not_establish_retention"]), True
    if family in {"key", "latch"}:
        if not left["profile_role"] or not right["profile_role"]:
            return None, False
        if family == "latch" and not (left["latch"] or right["latch"]):
            return None, False
        if family == "key" and (left["latch"] or right["latch"]):
            return None, False
        if left["profile_role"] == right["profile_role"] and left["profile_role"] != "unknown_profile":
            return None, False
        checks, unresolved = [], ["profile_orientation_and_placement_unresolved", "retention_not_evaluated",
                                  "required_engagement_length_unknown"]
        rectangular = {"kind": "rectangular_envelope", "dimensions_a_m": left["profile_dimensions_m"],
                       "dimensions_b_m": right["profile_dimensions_m"],
                       "profile_polarities": [left["profile_polarity"], right["profile_polarity"]]}
        if left["profile_dimensions_m"] and right["profile_dimensions_m"] and "unknown_profile" not in {left["profile_role"], right["profile_role"]}:
            male, female = (left, right) if left["profile_role"] == "projecting" else (right, left)
            # Interchanging the profile axes is a rotation, not an arbitrary scale.
            margin = male["uncertainty_m"]+female["uncertainty_m"]
            fits = [all(m <= f+margin for m, f in zip(male["profile_dimensions_m"], dims))
                    for dims in (female["profile_dimensions_m"], list(reversed(female["profile_dimensions_m"])))]
            if not any(fits):
                return None, True
            rectangular.update({"axis_order_options": [i for i, fit in enumerate(fits) if fit],
                "male_endpoint_index": 0 if male is left else 1,
                "receiver_endpoint_index": 0 if female is left else 1,
                "clearance_options": [{"receiver_axis_order": [0, 1] if i == 0 else [1, 0],
                    "clearance_intervals_m": [[f-m-margin, f-m+margin] for m, f in zip(male["profile_dimensions_m"], dims)]}
                    for i, dims in enumerate((female["profile_dimensions_m"], list(reversed(female["profile_dimensions_m"])))) if fits[i]]})
        else:
            unresolved.append("profile_dimensions_or_complementary_role_unknown")
            rectangular["axis_order_options"] = []
        checks.append(rectangular)
        checks.append({"kind": "finite_segments", "lengths_m": [left["length_m"], right["length_m"]],
                       "maximum_possible_overlap_m": min(left["length_m"], right["length_m"]) if left["length_m"] and right["length_m"] else None,
                       "required_overlap_unknown": True})
        if family == "latch":
            unresolved.extend(["elastic_material_and_deformation_unverified", "latch_engagement_path_unverified"])
        return _uncertain_pair(left, right, checks, unresolved), True
    raise ValueError("Unknown mechanism family")


def _entry_refs(feature_ref, resources):
    return _refs(entry["id"] for resource in resources if feature_ref in resource.get("feature_refs", [])
                 for entry in resource.get("entries", []) if isinstance(entry, dict) and "id" in entry)


def _member_features(member, replacements):
    result = []
    for ref in member.get("feature_refs", []):
        result.extend(replacements.get(ref, [ref]))
    return _refs(result)


def _members_by_feature(interfaces, replacements):
    index = {}
    for interface in interfaces:
        for member in interface.get("members", []):
            for ref in _member_features(member, replacements):
                index.setdefault(ref, []).append({"interface_ref": interface["id"], "member_ref": member["id"]})
    return index


def _group(interface, descriptors, replacements):
    """Describe source-local axis relations without a rigid-motion assertion."""
    members = []
    for member in sorted(interface.get("members", []), key=lambda item: item["id"]):
        eligible = [descriptors[ref] for ref in _member_features(member, replacements) if ref in descriptors
                    and descriptors[ref]["shape"] in {"cylinder", "conical_frustum"}
                    and descriptors[ref]["role"] != "male"]
        direction = _unit(member.get("direction"))
        position = member.get("position")
        if not eligible or direction is None or not isinstance(position, list) or len(position) != 3 or not all(_number(x) for x in position):
            continue
        members.append({"id": member["id"], "feature_refs": sorted(d["id"] for d in eligible),
                        "position": position, "direction": direction,
                        "frame_refs": _refs(d["frame_ref"] for d in eligible),
                        "entry_ref": member.get("entry_ref"), "resource_ref": member.get("resource_ref")})
    if len(members) < 2:
        return None
    axis = members[0]["direction"]
    parallel = all(abs(_dot(axis, m["direction"])) >= math.cos(ANGLE_MARGIN_RAD) for m in members)
    # Opposite entries on a parallel group are distinct sides. Genuine
    # multi-axis composite groups have separate directed axis invariants.
    if parallel and any(_dot(axis, m["direction"]) < 0 for m in members):
        return None
    frames = sorted({ref for m in members for ref in m["frame_refs"]})
    positions = [m["position"] for m in members]
    transverse = [[x-_dot(point, axis)*a for x, a in zip(point, axis)] for point in positions]
    angles = [[round(math.acos(min(1., abs(_dot(a["direction"], b["direction"])))), 12)
               for b in members[:i]] for i, a in enumerate(members)]
    entry_angles = [[round(math.acos(max(-1., min(1., _dot(a["direction"], b["direction"])))), 12)
               for b in members[:i]] for i, a in enumerate(members)]
    def line_distance(i, j):
        delta = _sub(positions[i], positions[j])
        cross = _cross(members[i]["direction"], members[j]["direction"])
        length = _length(cross)
        if length < math.sin(ANGLE_MARGIN_RAD):
            u = members[i]["direction"]
            return _length([x-_dot(delta, u)*v for x, v in zip(delta, u)])
        return abs(_dot(delta, cross))/length
    distance = [[round(_length(_sub(a, b)), 12) for b in transverse[:i]] for i, a in enumerate(transverse)] if parallel else [
        [round(line_distance(i, j), 12) for j in range(i)] for i in range(len(members))]
    # Relative signed areas are quadratic, not cubic: every oriented triple is
    # exactly A(j,k)-A(i,k)+A(i,j), where A uses member zero as origin. This
    # retains all handedness information even for a 61-hole PCB pattern.
    relative = [_sub(point, transverse[0]) for point in transverse]
    areas = [[round(_dot(axis, _cross(a, b)), 15) for b in relative[:i]] for i, a in enumerate(relative)] if parallel else []
    published_members = [{key: m[key] for key in ("id", "feature_refs", "entry_ref", "resource_ref") if m[key] is not None} for m in members]
    result = {"interface_ref": interface["id"], "members": published_members,
            "geometry_kind": "parallel_axes" if parallel else "nonparallel_axes",
            "axis_angle_lower_triangle_rad": angles, "directed_entry_angle_lower_triangle_rad": entry_angles,
            "angle_comparison_margin_rad": ANGLE_MARGIN_RAD*2,
            "relative_axial_offsets_m": [round(_dot(_sub(p, positions[0]), axis), 12) for p in positions],
            "axial_offset_basis": "first_member_source_direction_measurement_only",
            "measurement_basis": "owner_source_local", "feature_frame_refs": frames,
            "motion_ownership_status": "unverified", "handedness_evaluated": parallel,
            "comparison_margin_m": COMPARISON_MARGIN_M*2,
            "frame_ref": frames[0] if len(frames) == 1 else None,
            "conditions": ["source_coordinate_frame_does_not_prove_common_rigid_motion",
                           "finite_axial_registration_and_insertion_depth_not_evaluated",
                           "common_motion_ownership_not_verified"]}
    if parallel:
        result.update({"transverse_distance_lower_triangle_m": distance, "reference_area_lower_triangle_m2": areas})
    else:
        result["axis_line_distance_lower_triangle_m"] = distance
        result["conditions"].append("nonparallel_handedness_and_common_placement_unverified")
        result["conditions"].append("relative_entry_sides_and_direction_mapping_unverified")
    return result


def _pattern_families(owner_a, owner_b, groups_by_owner, pair_edges):
    groups_a, groups_b = groups_by_owner[owner_a], groups_by_owner[owner_b]
    edges = {(p["feature_a_ref"], p["feature_b_ref"]) for p in pair_edges}
    families = []
    for left in groups_a:
        for right in groups_b:
            member_edges = [[a["id"], b["id"]] for a in left["members"] for b in right["members"]
                            if any((fa, fb) in edges for fa in a["feature_refs"] for fb in b["feature_refs"])]
            if len(member_edges) < 2:
                continue
            parallel = left["geometry_kind"] == right["geometry_kind"] == "parallel_axes"
            family = {"kind": "invariant_member_relation" if parallel else "axis_line_member_relation", "a": left, "b": right,
                      "allowed_member_pairs": member_edges, "minimum_members": 2,
                      "maximum_members": min(len(left["members"]), len(right["members"])),
                      "constraints": ["injective_member_mapping", "all_transverse_pair_distances" if parallel else "all_axis_line_shortest_distances",
                                      "all_pair_axis_angles"]+(["directed_entry_signed_area"] if parallel else []),
                      "conditions": sorted(set(left["conditions"]+right["conditions"])),
                      "handedness_evaluated": parallel,
                      "selection_policy": "all_geometric_subsets_engineering_rules_separate",
                      "entry_relation_options": ["parallel", "opposed"],
                      "default_entry_relation": "parallel",
                      "mapping_enumeration_performed": False,
                      "placement_evaluated": False}
            family["id"] = "mapping-family:"+_digest(family)[:24]
            families.append(family)
    return families


def _connector(family, pairs):
    if family not in {"screw", "through"}:
        return []
    upper = sorted(set(value for pair in pairs for check in pair["checks"]
                       for value in ([check["shank_diameter_upper_bound_m"]] if check["kind"] == "potential_shank_clearance"
                                     else [option["shank_diameter_upper_bound_m"] for option in check["options"]] if check["kind"] == "screw_role_options" else [])))
    return [{"role": "screw" if family == "screw" else "through_bolt_with_nut_and_optional_washers",
             "specification_status": "unresolved", "catalog_sku_selected": False,
             "possible_shank_diameter_upper_bounds_m": upper,
             "length_status": "requires_common_placement_and_stack", "inventory_status": "not_established",
             "assumptions": ["A suitable standard connector may be supplied; it is not added to the real inventory"]}]


def build_candidates(parts, catalog, *, interface_policy=None, geometry_root=None, progress=None):
    """Exhaust every unordered *instance* pair for the finite template library.

    ``parts`` is a scene parts list (or an ID-to-part mapping). ``catalog`` is
    the inner catalog object; accepting the authored wrapper is convenient for
    independent audits. Existing source connections are never used as filters.
    """
    if "catalog" in catalog and "features" not in catalog:
        catalog = catalog["catalog"]
    parts = list(parts.values()) if isinstance(parts, dict) else list(parts)
    part_map = {p["id"]: p for p in parts}
    if len(part_map) != len(parts):
        raise ValueError("Duplicate Part identity")
    ordered = sorted(part_map)
    all_features = catalog.get("features", [])
    features = [feature for feature in all_features if feature.get("candidate_eligible", True)]
    if len({f["id"] for f in features}) != len(features):
        raise ValueError("Duplicate feature identity")
    if any(f["owner_ref"] not in part_map for f in features):
        raise ValueError("Compatibility feature references an absent Part")
    descriptors = {f["id"]: _descriptor(f, part_map[f["owner_ref"]]) for f in features}
    by_owner = {owner: sorted([d for d in descriptors.values() if d["owner_ref"] == owner], key=lambda d: d["id"]) for owner in ordered}
    interfaces = sorted(catalog.get("interfaces", []), key=lambda item: item["id"])
    replacements = {f["id"]: _refs(f["replacement_feature_refs"]) for f in all_features
                    if f.get("replacement_feature_refs")}
    for old, refs in replacements.items():
        if any(ref not in descriptors or descriptors[ref]["owner_ref"] != next(f["owner_ref"] for f in all_features if f["id"] == old) for ref in refs):
            raise ValueError("Replacement feature must be an eligible finite feature on the same Part")
    memberships = _members_by_feature(interfaces, replacements)
    groups_by_owner = {owner: [] for owner in ordered}
    for interface in interfaces:
        group = _group(interface, descriptors, replacements)
        if group:
            groups_by_owner[interface["owner_ref"]].append(group)
    resources = catalog.get("resources", [])
    entries_by_feature = {f["id"]: _entry_refs(f["id"], resources) for f in features}
    def eligible(descriptor, family):
        shape = descriptor["shape"]
        if family == "plane":
            return shape == "plane"
        if family == "cylinder":
            return shape == "cylinder"
        if family in {"cone", "bearing"}:
            return shape in {"cylinder", "conical_frustum"}
        if family in {"screw", "through"}:
            return shape in {"cylinder", "conical_frustum"} and descriptor["role"] != "male"
        return bool(descriptor["profile_role"]) and (family != "key" or not descriptor["latch"])
    family_owners = {family: {owner: [d for d in by_owner[owner] if eligible(d, family)] for owner in ordered}
                     for _, _, family in _TEMPLATES}
    templates = _templates()
    candidates, dispositions = [], []
    owner_index = {owner: [] for owner in ordered}
    template_index = {t["id"]: [] for t in templates}
    pair_index = {}
    totals = {t["id"]: {"candidates": 0, "no_match_in_scope": 0, "insufficient_data": 0, "not_applicable": 0} for t in templates}
    for owner_a, owner_b in combinations(ordered, 2):
        outcomes = []
        pair_key = _canonical([owner_a, owner_b])
        pair_index[pair_key] = []
        for template, (_, _, family) in zip(templates, _TEMPLATES):
            pairs, considered = [], 0
            plane_a = family_owners[family][owner_a] if family == "plane" else []
            plane_b = family_owners[family][owner_b] if family == "plane" else []
            cartesian_planes = bool(plane_a and plane_b)
            for left in ([] if family == "plane" else family_owners[family][owner_a]):
                for right in family_owners[family][owner_b]:
                    minimum_gap=None
                    if (interface_policy or {}).get('schema')=='psop.interface-matching-policy/3':
                        negative=[rule['radial_clearance_m'][0] for rule in interface_policy.get('radial_fit_rules',[]) if rule.get('fit_kind') in {'interference_fit','preload_fit','flexible_fit'}]
                        if negative:minimum_gap=min(negative)
                    match, applicable = _match(left, right, family, minimum_gap)
                    considered += bool(applicable)
                    if match:
                        pairs.append(match)
            if pairs or cartesian_planes:
                endpoints = [{"owner_ref": owner, "feature_refs": _refs(p["feature_"+side+"_ref"] for p in pairs)}
                             for owner, side in ((owner_a, "a"), (owner_b, "b"))]
                if cartesian_planes:
                    endpoints = [{"owner_ref": owner, "feature_refs": [d["id"] for d in planes]}
                                 for owner, planes in ((owner_a, plane_a), (owner_b, plane_b))]
                for endpoint in endpoints:
                    entry_refs = _refs(entry for ref in endpoint["feature_refs"] for entry in entries_by_feature.get(ref, []))
                    if entry_refs:
                        endpoint["entry_refs"] = entry_refs
                evidence = _refs(ref for endpoint in endpoints for fref in endpoint["feature_refs"] for ref in descriptors[fref]["evidence_refs"])
                evidence += _refs(ref for interface in interfaces if interface["owner_ref"] in (owner_a, owner_b)
                                  and any(set(_member_features(m, replacements)).intersection(endpoints[0 if interface["owner_ref"] == owner_a else 1]["feature_refs"])
                                          for m in interface.get("members", [])) for ref in interface.get("evidence_refs", []))
                connectors = _connector(family, pairs)
                unresolved = sorted({condition for p in pairs for condition in p["unresolved_conditions"]})
                profiles, profile_index = [], {}
                for pair in pairs:
                    profile = {"checks": pair.pop("checks"), "unresolved_conditions": pair.pop("unresolved_conditions")}
                    key = _canonical(profile)
                    if key not in profile_index:
                        profile_index[key] = len(profiles)
                        profiles.append(profile)
                    pair["check_profile_ref"] = profile_index[key]
                bindings = {ref: {"members": memberships.get(ref, []), "entry_refs": entries_by_feature.get(ref, [])}
                            for endpoint in endpoints for ref in endpoint["feature_refs"]
                            if memberships.get(ref) or entries_by_feature.get(ref)}
                candidate = {"template_ref": template["id"], "endpoints": endpoints,
                             "role_bindings": [{"endpoint_index": 0, "role": "a"}, {"endpoint_index": 1, "role": "b"}],
                             "mapping_family": {"kind": "finite_feature_relation", "pairs": pairs,
                                                "check_profiles": profiles, "feature_bindings": bindings,
                                                "primitive_relation_complete": True},
                             "geometric_witness": {"status": "conditional", "kind": "necessary_local_geometry_conditions",
                                                   "primitive_pairs": len(plane_a)*len(plane_b) if cartesian_planes else len(pairs), "comparison_margin_m": COMPARISON_MARGIN_M,
                                                   "manufacturing_tolerances_inferred": False},
                             "connector_requirements": connectors,
                             "assumptions": ["Only supplied finite local geometry is considered", "Unconfirmed roles remain explicit hypotheses"],
                             "unresolved_conditions": unresolved,
                             "evidence_refs": sorted(set(evidence)), "assessment_scope": "pose_independent_geometry",
                             "placement_evaluated": False}
                if cartesian_planes:
                    candidate["mapping_family"] = {"kind": "cartesian_feature_relation",
                        "features_a": endpoints[0]["feature_refs"], "features_b": endpoints[1]["feature_refs"],
                        "pair_count": len(plane_a)*len(plane_b), "primitive_relation_complete": True,
                        "shared_checks": [{"kind": "finite_planar_regions", "status": "conditional"}]}
                    candidate["unresolved_conditions"] = ["finite_region_overlap_and_placement_unresolved", "seating_does_not_establish_retention"]
                if family == "through":
                    candidate["mapping_family"]["pattern_families"] = _pattern_families(owner_a, owner_b, groups_by_owner, pairs)
                    candidate["unresolved_conditions"] = sorted(set(candidate["unresolved_conditions"]+
                        [condition for pattern in candidate["mapping_family"]["pattern_families"] for condition in pattern["conditions"]]))
                candidate["id"] = "compatibility:"+_digest(candidate)[:24]
                candidates.append(candidate)
                identifier = candidate["id"]
                owner_index[owner_a].append(identifier)
                owner_index[owner_b].append(identifier)
                template_index[template["id"]].append(identifier)
                pair_index[pair_key].append(identifier)
                status = "candidates"
                outcomes.append({"template_ref": template["id"], "status": status, "candidate_refs": [identifier]})
            else:
                unknown = not by_owner[owner_a] or not by_owner[owner_b] or any(
                    d["shape"] == "source_region" and d["profile_role"] is None
                    or d["shape"] in {"cylinder", "conical_frustum"} and not d["radii_m"]
                    for owner in (owner_a, owner_b) for d in by_owner[owner])
                status = "insufficient_data" if unknown else "no_match_in_scope" if considered else "not_applicable"
                outcomes.append({"template_ref": template["id"], "status": status, "candidate_refs": []})
            totals[template["id"]][status] += 1
        dispositions.append({"owner_refs": [owner_a, owner_b], "templates": outcomes})
    candidates.sort(key=lambda item: item["id"])
    # Deliberately exclude source world position/quaternion/scale and source
    # connections from this digest: moving the source assembly cannot change
    # pose-independent capability or pagination identity.
    domain = {"part_ids": ordered, "descriptors": sorted(descriptors.values(), key=lambda d: d["id"]),
              "templates": templates, "candidate_ids": [c["id"] for c in candidates]}
    result = {"schema": SCHEMA, "templates": templates, "candidates": candidates,
              "index": {"by_owner": owner_index, "by_template": template_index, "by_pair": pair_index},
              "coverage": {"complete": True, "scope": "supplied_features_and_finite_template_library",
                           "part_count": len(ordered), "expected_unordered_instance_pairs": len(ordered)*(len(ordered)-1)//2,
                           "evaluated_unordered_instance_pairs": len(dispositions), "pair_dispositions": dispositions,
                           "template_dispositions": totals, "primitive_relation_complete": True,
                           "member_mapping_enumeration_complete": False, "placement_evaluated": False,
                           "unsupported_features": sorted(d["id"] for d in descriptors.values()
                                                          if d["shape"] not in {"cylinder", "conical_frustum", "plane"} and not d["profile_role"]),
                           "excluded_redundant_features": sorted(f["id"] for f in all_features if not f.get("candidate_eligible", True)),
                           "limitations": ["Complete means all supplied primitive pairs and templates were considered, not all possible engineering mechanisms",
                                           "No candidate does not establish physical impossibility; unknown geometry or mechanisms remain outside scope",
                                           "Member combinations are symbolic finite families; enumerate separately with explicit coverage"]},
              "input_digest": "sha256:"+_digest(domain)}
    if interface_policy is not None:
        from .interface_compatibility import qualify_interfaces
        result=qualify_interfaces(result,catalog,interface_policy)
        if interface_policy.get('whole_part_interference'):
            from .interface_placement import qualify_placements
            result=qualify_placements(result,catalog,interface_policy,parts,geometry_root,progress=progress)
        if interface_policy.get('schema') in {'psop.interface-matching-policy/2','psop.interface-matching-policy/3'}:
            from .interface_review import review_interfaces
            review=review_interfaces(catalog,result,interface_policy)
            result['coverage'].update(interface_analysis=review,interface_pattern_search_complete=True,
                interface_matching_complete=review['functional_constraint_gap_count']==0)
        return result
    return result


def _cursor(value):
    return base64.urlsafe_b64encode(_canonical(value).encode("utf-8")).decode("ascii").rstrip("=")


def _read_cursor(value, digest, filters):
    if value is None:
        return 0
    try:
        decoded = json.loads(base64.urlsafe_b64decode(value+"="*(-len(value) % 4)))
    except (ValueError, TypeError, UnicodeError) as error:
        raise ValueError("Invalid compatibility cursor") from error
    if not isinstance(decoded, dict) or decoded.get("digest") != digest or decoded.get("filters") != filters or not isinstance(decoded.get("offset"), int) or isinstance(decoded.get("offset"), bool) or decoded["offset"] < 0:
        raise ValueError("Compatibility cursor belongs to another input or filter")
    return decoded["offset"]


def query_candidates(result, owner_refs=None, template_refs=None, cursor=None, page_size=200):
    """Page the already complete candidate relation without truncating it."""
    if not isinstance(page_size, int) or isinstance(page_size, bool) or not 1 <= page_size <= 10000:
        raise ValueError("page_size must be between 1 and 10000")
    filters = {"owner_refs": sorted(set(owner_refs or [])), "template_refs": sorted(set(template_refs or []))}
    offset = _read_cursor(cursor, result["input_digest"], filters)
    owners, templates = set(filters["owner_refs"]), set(filters["template_refs"])
    selected = [c for c in result["candidates"] if owners.issubset({e["owner_ref"] for e in c["endpoints"]})
                and (not templates or c["template_ref"] in templates)]
    if offset > len(selected):
        raise ValueError("Compatibility cursor exceeds result size")
    page = deepcopy(selected[offset:offset+page_size])
    end = offset+len(page)
    return {"items": page, "total": len(selected), "complete": end >= len(selected),
            "next_cursor": None if end >= len(selected) else _cursor({"digest": result["input_digest"], "filters": filters, "offset": end}),
            "candidate_generation_complete": result["coverage"]["complete"], "input_digest": result["input_digest"]}


def _mapping_events(family, size=None, entry_relation="parallel"):
    left, right = family["a"], family["b"]
    a_members, b_members = left["members"], right["members"]
    allowed = {tuple(pair) for pair in family["allowed_member_pairs"]}
    minimum, maximum = family["minimum_members"], family["maximum_members"]
    if size is not None:
        if not isinstance(size, int) or isinstance(size, bool) or not minimum <= size <= maximum:
            raise ValueError("Requested member count is outside the family")
        sizes = [size]
    else:
        sizes = range(minimum, maximum+1)
    tolerance = max(left["comparison_margin_m"], right["comparison_margin_m"])
    def distance_matrix(group):
        return group.get("transverse_distance_lower_triangle_m", group.get("axis_line_distance_lower_triangle_m", []))
    area_tolerance = tolerance*max([distance for row in distance_matrix(left)+distance_matrix(right) for distance in row]+[tolerance])*4
    angle_tolerance = max(left.get("angle_comparison_margin_rad", ANGLE_MARGIN_RAD*2), right.get("angle_comparison_margin_rad", ANGLE_MARGIN_RAD*2))
    def distance(group, first, second):
        return distance_matrix(group)[max(first, second)][min(first, second)] if first != second else 0.
    def angle(group, first, second):
        return group.get("axis_angle_lower_triangle_rad", [])[max(first, second)][min(first, second)] if first != second else 0.
    def area(group, first, second, third):
        def anchored(i, j):
            if i == j:
                return 0.
            value = group["reference_area_lower_triangle_m2"][max(i, j)][min(i, j)]
            return value if i > j else -value
        return anchored(second, third)-anchored(first, third)+anchored(first, second)
    if entry_relation not in family.get("entry_relation_options", ["parallel", "opposed"]):
        raise ValueError("Entry relation is not permitted by this family")
    # Opposite entry normals reverse signed areas under a proper 3D rotation.
    # The branch is explicit, never an arbitrary per-member direction flip.
    sign = -1 if entry_relation == "opposed" else 1
    for count in sizes:
        for chosen in combinations(range(len(a_members)), count):
            yield None  # count subset expansion even if it has no legal edge
            def extend(mapping):
                depth = len(mapping)
                if depth == count:
                    yield [{"member_a_ref": a_members[a]["id"], "member_b_ref": b_members[b]["id"]} for a, b in zip(chosen, mapping)]
                    return
                ai = chosen[depth]
                for bi in range(len(b_members)):
                    yield None  # a branch attempt, including rejected branches
                    if bi in mapping or (a_members[ai]["id"], b_members[bi]["id"]) not in allowed:
                        continue
                    if any(abs(distance(left, ai, aj)-distance(right, bi, bj)) > tolerance
                           for aj, bj in zip(chosen, mapping)):
                        continue
                    if any(abs(angle(left, ai, aj)-angle(right, bi, bj)) > angle_tolerance
                           for aj, bj in zip(chosen, mapping)):
                        continue
                    if family.get("handedness_evaluated", True) and any(abs(area(left, ai, chosen[j], chosen[k])-
                               sign*area(right, bi, mapping[j], mapping[k])) > area_tolerance
                           for j in range(depth) for k in range(j)):
                        continue
                    yield from extend(mapping+[bi])
            yield from extend([])


def _mapping_generator(family, size=None, entry_relation="parallel"):
    for event in _mapping_events(family, size, entry_relation):
        if event is not None:
            yield event


def query_mappings(family, size=None, cursor=None, page_size=200, max_examined=100000, entry_relation="parallel"):
    """Enumerate a symbolic member family, preserving symmetry and subsets.

    ``max_examined`` bounds actual attempted branches, including failed ones.
    Continuation offsets count deterministic traversal events, not solutions,
    so a difficult empty search can stop and resume without being called a
    negative result. Replaying the prefix is intentional and keeps cursors
    stateless; no global mutable solver state enters a Build artifact.
    """
    if not isinstance(page_size, int) or isinstance(page_size, bool) or not 1 <= page_size <= 10000:
        raise ValueError("page_size must be between 1 and 10000")
    if not isinstance(max_examined, int) or isinstance(max_examined, bool) or max_examined <= 0:
        raise ValueError("max_examined must be positive")
    filters = {"size": size, "entry_relation": entry_relation}
    digest = "sha256:"+_digest(family)
    offset = _read_cursor(cursor, digest, filters)
    page, events, examined, exhausted = [], 0, 0, True
    generator = iter(_mapping_events(family, size, entry_relation))
    for event in generator:
        events += 1
        if events <= offset:
            continue
        examined += 1
        if event is not None:
            page.append(event)
        if len(page) >= page_size or examined >= max_examined:
            # Peek without advancing the continuation position; the next page
            # replays that event. An exactly exhausted page has no false cursor.
            exhausted = next(generator, "exhausted") == "exhausted"
            if not exhausted:
                break
        if exhausted and (len(page) >= page_size or examined >= max_examined):
            break
    if events < offset:
        raise ValueError("Mapping cursor exceeds traversal size")
    end = offset+examined
    if not exhausted and not examined:
        raise ValueError("Mapping pagination made no progress")
    return {"items": page, "complete": exhausted, "events_examined": examined,
            "stop_reason": "exhausted" if exhausted else "max_examined" if examined >= max_examined else "page_size",
            "next_cursor": None if exhausted else _cursor({"digest": digest, "filters": filters, "offset": end}),
            "entry_relation": entry_relation, "handedness_evaluated": family.get("handedness_evaluated", True),
            "conditions": family.get("conditions", []), "assessment_scope": "pose_independent_necessary_invariants",
            "placement_evaluated": False}


def query_primitive_pairs(candidate, cursor=None, page_size=200):
    """Page explicit or compressed Cartesian primitive relations identically."""
    if not isinstance(page_size, int) or isinstance(page_size, bool) or not 1 <= page_size <= 10000:
        raise ValueError("page_size must be between 1 and 10000")
    digest = "sha256:"+_digest(candidate)
    offset = _read_cursor(cursor, digest, {})
    family = candidate["mapping_family"]
    if family["kind"] == "cartesian_feature_relation":
        a, b = family["features_a"], family["features_b"]
        total = len(a)*len(b)
        items = [{"feature_a_ref": a[i//len(b)], "feature_b_ref": b[i % len(b)],
                  "checks": deepcopy(family["shared_checks"]), "unresolved_conditions": candidate["unresolved_conditions"]}
                 for i in range(offset, min(offset+page_size, total))]
    else:
        total = len(family["pairs"])
        items = deepcopy(family["pairs"][offset:offset+page_size])
        for item in items:
            if "check_profile_ref" in item:
                item.update(deepcopy(family["check_profiles"][item.pop("check_profile_ref")]))
            for side in ("a", "b"):
                binding = family.get("feature_bindings", {}).get(item["feature_"+side+"_ref"], {})
                if binding.get("members"):
                    item["members_"+side] = deepcopy(binding["members"])
                if binding.get("entry_refs"):
                    item["entry_refs_"+side] = deepcopy(binding["entry_refs"])
    if offset > total:
        raise ValueError("Primitive cursor exceeds relation size")
    end = offset+len(items)
    return {"items": items, "total": total, "complete": end >= total,
            "next_cursor": None if end >= total else _cursor({"digest": digest, "filters": {}, "offset": end}),
            "placement_evaluated": False}
