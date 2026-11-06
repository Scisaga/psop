"""Addressable mounting entries and declared reference assemblies for profile 1.4.

Source geometry is replayed through the frozen 1.3 analysis. Functional claims
come only from the explicitly captured user statement; neither a common source
body nor close surfaces creates a connection. Reference mappings use one source
configuration, preserve the finite gap, and never assert execution or retention.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
from itertools import combinations
import json
import math
from pathlib import Path
import re

from . import mechanics, semantics, surfaces

METHOD = "mounting-sites-and-reference-assemblies/1"
SLOT_METHOD = "finite-rounded-slot-openings/1"
KNOWLEDGE_SCHEMA = "psop.mounting.knowledge/1.0-draft.1"
KNOWLEDGE_SOURCE = "SRC-MD-ASSEMBLY-KNOWLEDGE"
KNOWLEDGE_EVIDENCE = "evidence:microduck:assembly-knowledge"
FIT_M = 2e-6
_SLOT_CACHE = {}


def _token(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _unit(vector):
    length = mechanics._length(vector)
    if length < 1e-12:
        raise ValueError("Mounting direction must be nonzero")
    return [v / length for v in vector]


def _keys(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError("Unsupported " + label + " fields")


def _positive(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(label + " must be finite and positive")


def _text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(label + " must be a nonempty string")


def _selector(selector):
    _keys(selector, ("mesh_key", "geometry_sha256"), "mounting selector")
    if not isinstance(selector["mesh_key"], str) or not selector["mesh_key"] or not isinstance(selector["geometry_sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", selector["geometry_sha256"]):
        raise ValueError("Mounting selector needs a mesh key and frozen geometry SHA-256")


def validate_knowledge(knowledge):
    """Reject unsupported declarations rather than silently guessing semantics."""
    _keys(knowledge, ("schema", "device_id", "provenance", "interface_families", "reference_assemblies"), "mounting knowledge")
    if knowledge["schema"] != KNOWLEDGE_SCHEMA or not isinstance(knowledge["device_id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", knowledge["device_id"]):
        raise ValueError("Unsupported mounting knowledge schema or device")
    _keys(knowledge["provenance"], ("kind", "recorded_at", "statement", "interpretation"), "mounting provenance")
    if knowledge["provenance"]["kind"] != "user_statement" or any(not isinstance(v, str) or not v for v in knowledge["provenance"].values()):
        raise ValueError("Mounting knowledge requires an explicit user statement")
    if not isinstance(knowledge["interface_families"], list) or not isinstance(knowledge["reference_assemblies"], list):
        raise ValueError("Mounting declarations must be lists")
    ids = []
    for family in knowledge["interface_families"]:
        _keys(family, ("id", "selector", "layout", "mechanism", "role", "selection", "statement"), "mounting family")
        _text(family["id"], "Mounting family ID")
        _text(family["statement"], "Mounting family statement")
        _selector(family["selector"])
        layout = family["layout"]
        _keys(layout, ("type", "hole_diameter_m", "spacing_m", "side_count"), "mounting layout")
        if layout["type"] != "rectangular" or type(layout["side_count"]) is not int or layout["side_count"] != 2 or not isinstance(layout["spacing_m"], list) or len(layout["spacing_m"]) != 2:
            raise ValueError("Only an explicit two-sided rectangular family is supported")
        for v in [layout["hole_diameter_m"], *layout["spacing_m"]]:
            _positive(v, "Mounting layout measurement")
        if family["mechanism"] != "fastener_mount" or family["role"] != "housing_mount":
            raise ValueError("Unsupported declared mounting mechanism or role")
        selection = family["selection"]
        _keys(selection, ("same_side", "min_count", "require_adjacent_pair", "adjacency"), "mounting selection")
        if (type(selection["same_side"]) is not bool or type(selection["require_adjacent_pair"]) is not bool
                or type(selection["min_count"]) is not int
                or selection != {"same_side": True, "min_count": 2, "require_adjacent_pair": True, "adjacency": "rectangle_edges"}):
            raise ValueError("Unsupported mounting selection rule")
        ids.append(family["id"])
    family_ids = set(ids)
    for reference in knowledge["reference_assemblies"]:
        _keys(reference, ("id", "interface_family_ref", "counterpart_selector", "occurrence_selector", "counterpart", "expected_pair_count", "role", "statement"), "reference mounting")
        _text(reference["id"], "Reference mounting ID")
        _text(reference["statement"], "Reference mounting statement")
        _text(reference["interface_family_ref"], "Reference family ID")
        _selector(reference["counterpart_selector"])
        _keys(reference["counterpart"], ("hole_diameter_m", "hole_spacing_m"), "counterpart measurements")
        for v in reference["counterpart"].values():
            _positive(v, "Counterpart measurement")
        if reference["interface_family_ref"] not in family_ids or reference["occurrence_selector"] != "same_source_body" or type(reference["expected_pair_count"]) is not int or reference["expected_pair_count"] != 2 or reference["role"] != "bracket_mount":
            raise ValueError("Unsupported reference assembly scope")
        ids.append(reference["id"])
    if any(not isinstance(v, str) or not v for v in ids) or len(ids) != len(set(ids)):
        raise ValueError("Mounting assertion IDs must be nonempty and unique")
    return knowledge


def _matching(part, selector, sources):
    if part.get("meshKey") != selector["mesh_key"]:
        return False
    source = sources[part["geometryUrl"]]
    if source["digest"].removeprefix("sha256:") != selector["geometry_sha256"]:
        raise ValueError("Declared mounting geometry digest does not match the selected mesh")
    return True


def _site_side(part_id, portal):
    normal = portal["normal"]
    plane = round(mechanics._dot(normal, portal["position"]) / FIT_M)
    return "mounting-side:" + part_id.removeprefix("part:") + ":" + _token(json.dumps([normal, plane]))


def _geometry_sites(base):
    result = []
    for hole in base["logical_holes"]:
        for portal in hole["portals"]:
            if portal["status"] != "opening":
                continue
            normal = portal["normal"]
            axis = max(range(3), key=lambda i: abs(normal[i]))
            result.append({"id": "mounting-site:" + hole["owner_ref"].removeprefix("part:") + ":" + _token(portal["id"]),
                           "owner_ref": hole["owner_ref"], "frame_ref": hole["frame_ref"], "hole_ref": hole["id"], "portal_ref": portal["id"],
                           "feature_refs": list(hole["wall_feature_refs"]), "side_ref": _site_side(hole["owner_ref"], portal),
                           "label": "几何入口 " + "XYZ"[axis] + ("+" if normal[axis] > 0 else "−"),
                           "position": list(portal["position"]), "entry_direction": [-v for v in normal],
                           "status": "geometry_candidate", "role": "unqualified", "assertion_refs": [],
                           "source_refs": list(hole["source_refs"]), "evidence_refs": list(hole["evidence_refs"])})
    return result


def _qualify(site, role, assertion):
    site.update(status="user_asserted", role=role)
    site["assertion_refs"] = sorted(set(site["assertion_refs"] + [assertion]))
    site["source_refs"] = sorted(set(site["source_refs"] + [KNOWLEDGE_SOURCE]))
    site["evidence_refs"] = sorted(set(site["evidence_refs"] + [KNOWLEDGE_EVIDENCE]))


def _family_interfaces(base, scene, knowledge, sites):
    sources = {s["url"]: s for s in scene["sources"]}
    features = {f["id"]: f for f in base["features"]}
    by_portal = {s["portal_ref"]: s for s in sites}
    result, by_family = [], {}
    for family in knowledge["interface_families"]:
        family_result = []
        for part in scene["parts"]:
            if not _matching(part, family["selector"], sources):
                continue
            layout = family["layout"]
            matches = []
            for pattern in base["feature_patterns"]:
                if pattern["owner_ref"] != part["id"] or pattern["geometry"]["type"] != "rectangular" or len(pattern["logical_hole_refs"]) != 4:
                    continue
                spacing = sorted(pattern["geometry"]["spacing_m"])
                if len(spacing) != 2 or any(abs(a - b) > FIT_M for a, b in zip(spacing, sorted(layout["spacing_m"]))):
                    continue
                members = [by_portal[p] for p in pattern["portal_refs"]]
                if all(abs(features[s["feature_refs"][0]]["geometry"]["radius_m"] * 2 - layout["hole_diameter_m"]) <= FIT_M for s in members):
                    matches.append((pattern, members))
            if len(matches) != 2 or set(matches[0][0]["logical_hole_refs"]) != set(matches[1][0]["logical_hole_refs"]):
                raise ValueError("Declared rectangular mounting family does not have exactly two sides of the same four holes")
            matches.sort(key=lambda pair: pair[0]["geometry"]["origin"])
            sides, pairs, members = [], [], []
            for side_index, (pattern, selected) in enumerate(matches):
                selected.sort(key=lambda s: s["position"])
                label = "AB"[side_index]
                for number, site in enumerate(selected, 1):
                    _qualify(site, family["role"], family["id"])
                    site["label"] = label + str(number)
                for a, b in combinations(selected, 2):
                    distance = mechanics._length(mechanics._sub(a["position"], b["position"]))
                    if any(abs(distance - spacing) <= FIT_M for spacing in layout["spacing_m"]):
                        pairs.append([a["id"], b["id"]])
                sides.append({"id": selected[0]["side_ref"], "label": label + " 侧", "normal": list(pattern["geometry"]["normal"]), "site_refs": [s["id"] for s in selected]})
                members.extend(selected)
            if len(pairs) != 8:
                raise ValueError("Declared rectangle must expose four edge adjacencies on each side")
            interface = {"id": "mounting-interface:" + part["id"].removeprefix("part:") + ":" + _token(family["id"]),
                         "owner_ref": part["id"], "frame_ref": members[0]["frame_ref"], "status": "user_asserted",
                         "mechanism": family["mechanism"], "role": family["role"], "member_site_refs": [s["id"] for s in members], "sides": sides,
                         "selection_rule": {"same_side": True, "min_count": 2, "require_adjacent_pair": True, "allowed_adjacent_pairs": pairs, "adjacency_basis": "rectangle_edges"},
                         "assertion_refs": [family["id"]], "source_refs": sorted({r for s in members for r in s["source_refs"]}),
                         "evidence_refs": sorted({r for s in members for r in s["evidence_refs"]}),
                         "unresolved_requirements": ["User-declared applicability is not manufacturer certification; connector identity, threads, insertion depth and engineering limits are unspecified.",
                                                     "Additional selected sites must match the counterpart under one common configuration; a qualifying pair does not prove a complete assembly.",
                                                     "Housing mounting roles do not assign motion ownership to the complete servo source mesh or its output geometry."]}
            result.append(interface)
            family_result.append(interface)
        if not family_result:
            raise ValueError("Declared mounting family selected no source Part")
        by_family[family["id"]] = family_result
    return result, by_family


def selection_status(interface, site_refs, sites):
    """Declared mode eligibility, not a physical impossibility or retaining test."""
    refs = set(site_refs)
    rule = interface["selection_rule"]
    if len(refs) != len(site_refs) or not refs.issubset(interface["member_site_refs"]) or len(refs) < rule["min_count"]:
        return "fail"
    index = {site["id"]: site for site in sites}
    if rule["same_side"] and len({index[ref]["side_ref"] for ref in refs}) != 1:
        return "fail"
    if rule["require_adjacent_pair"] and not any(set(pair).issubset(refs) for pair in rule["allowed_adjacent_pairs"]):
        return "fail"
    return "pass"


def _world_direction(part, direction):
    return _unit(mechanics._rotate([v / part.get("scale", [1., 1., 1.])[i] for i, v in enumerate(direction)], part["quaternion"]))


def _site_pair(a, b, part_a, part_b):
    pa, pb = (semantics._world_point(part, site["position"]) for part, site in ((part_a, a), (part_b, b)))
    na, nb = (_world_direction(part, [-v for v in site["entry_direction"]]) for part, site in ((part_a, a), (part_b, b)))
    angle = math.acos(max(-1., min(1., -mechanics._dot(na, nb))))
    delta = mechanics._sub(pb, pa)
    lateral = mechanics._length(mechanics._cross(delta, na))
    gap = mechanics._dot(delta, na)
    if angle > mechanics.AXIS_TOLERANCE_RAD or lateral > mechanics.COAXIAL_TOLERANCE_M or gap < -FIT_M:
        return None
    return {"site_refs": [a["id"], b["id"]], "hole_refs": [a["hole_ref"], b["hole_ref"]],
            "feature_refs": [a["feature_refs"][0], b["feature_refs"][0]], "axis_distance_m": lateral,
            "axis_angle_rad": angle, "axial_gap_m": max(0., gap)}


def _reference_mounts(base, scene, knowledge, sites, interfaces, by_family):
    parts = {p["id"]: p for p in scene["parts"]}
    sources = {s["url"]: s for s in scene["sources"]}
    features = {f["id"]: f for f in base["features"]}
    site_map = {s["id"]: s for s in sites}
    result = []
    for assertion in knowledge["reference_assemblies"]:
        found = 0
        for counterpart in scene["parts"]:
            if not _matching(counterpart, assertion["counterpart_selector"], sources):
                continue
            candidates = [s for s in sites if s["owner_ref"] == counterpart["id"] and all(abs(features[f]["geometry"]["radius_m"] * 2 - assertion["counterpart"]["hole_diameter_m"]) <= FIT_M for f in s["feature_refs"])]
            matches = []
            for interface in by_family[assertion["interface_family_ref"]]:
                owner = parts[interface["owner_ref"]]
                if owner.get("body") != counterpart.get("body"):
                    continue  # Scope comes from this explicit assertion, never a generic connection rule.
                selected = [site_map[r] for r in interface["member_site_refs"]]
                possible = [pair for a in selected for b in candidates if (pair := _site_pair(a, b, owner, counterpart))]
                for pair_a, pair_b in combinations(possible, 2):
                    if any(pair_a[key][side] == pair_b[key][side] for key in ("site_refs", "hole_refs") for side in (0, 1)):
                        continue
                    pair_sites = [site_map[pair["site_refs"][0]] for pair in (pair_a, pair_b)]
                    if selection_status(interface, [s["id"] for s in pair_sites], sites) != "pass":
                        continue
                    b_sites = [site_map[pair["site_refs"][1]] for pair in (pair_a, pair_b)]
                    if len({s["side_ref"] for s in b_sites}) != 1:
                        continue
                    distance = mechanics._length(mechanics._sub(b_sites[0]["position"], b_sites[1]["position"]))
                    if abs(distance - assertion["counterpart"]["hole_spacing_m"]) > FIT_M:
                        continue
                    matches.append((sum(pair["axial_gap_m"] for pair in (pair_a, pair_b)), interface, [pair_a, pair_b]))
            if not matches:
                raise ValueError("Declared reference assembly has no jointly aligned two-hole mapping")
            matches.sort(key=lambda v: (v[0], v[1]["id"], json.dumps(v[2], sort_keys=True)))
            _, interface_a, pairs = matches[0]
            # If several distinct equal-distance alternatives exist, do not silently select one.
            if len(matches) > 1 and abs(matches[1][0] - matches[0][0]) <= FIT_M:
                raise ValueError("Declared reference assembly has an ambiguous site mapping")
            pairs.sort(key=lambda pair: pair["site_refs"])
            chosen = [site_map[pair["site_refs"][1]] for pair in pairs]
            for i, site in enumerate(sorted(chosen, key=lambda s: s["position"]), 1):
                _qualify(site, assertion["role"], assertion["id"])
                site["label"] = "L" + str(i)
            interface_b = {"id": "mounting-interface:" + counterpart["id"].removeprefix("part:") + ":" + _token(assertion["id"]),
                           "owner_ref": counterpart["id"], "frame_ref": chosen[0]["frame_ref"], "status": "user_asserted", "mechanism": "fastener_mount", "role": assertion["role"],
                           "member_site_refs": [s["id"] for s in chosen], "sides": [{"id": chosen[0]["side_ref"], "label": "参考安装侧", "normal": [-v for v in chosen[0]["entry_direction"]], "site_refs": [s["id"] for s in chosen]}],
                           "selection_rule": {"same_side": True, "min_count": 2, "require_adjacent_pair": True, "allowed_adjacent_pairs": [[s["id"] for s in chosen]], "adjacency_basis": "reference_pair"},
                           "assertion_refs": [assertion["id"]], "source_refs": sorted({r for s in chosen for r in s["source_refs"]}), "evidence_refs": sorted({r for s in chosen for r in s["evidence_refs"]}),
                           "unresolved_requirements": ["This declared reference pair does not prohibit other mounting positions or prove physical engagement."]}
            interfaces.append(interface_b)
            part_refs = [interface_a["owner_ref"], counterpart["id"]]
            participating = [site_map[ref] for pair in pairs for ref in pair["site_refs"]]
            result.append({"id": "reference-mount:" + knowledge["device_id"] + ":" + _token(assertion["id"] + "|" + "|".join(part_refs)),
                           "configuration_ref": "configuration:" + knowledge["device_id"] + ":source-qpos0", "status": "user_asserted_reference", "mechanism": "fastener_mount",
                           "participants": [{"part_ref": interface_a["owner_ref"], "interface_ref": interface_a["id"], "site_refs": [p["site_refs"][0] for p in pairs]},
                                            {"part_ref": counterpart["id"], "interface_ref": interface_b["id"], "site_refs": [p["site_refs"][1] for p in pairs]}],
                           "site_pairs": pairs, "reference_placements": [{"part_ref": ref, "position": list(parts[ref]["position"]), "quaternion": list(parts[ref]["quaternion"]), "scale": list(parts[ref].get("scale", [1., 1., 1.]))} for ref in part_refs],
                           "connector_roles": [{"role": "fastener", "status": "unbound", "site_pair_index": i} for i in range(len(pairs))],
                           "assessment": {"reference_alignment": "pass", "mechanical": "unknown", "engineering": "unknown", "task": "unknown", "completion": "unknown"},
                           "assertion_refs": [assertion["id"], assertion["interface_family_ref"]], "source_refs": sorted({r for s in participating for r in s["source_refs"]}),
                           "evidence_refs": sorted({r for s in participating for r in s["evidence_refs"]}),
                           "unresolved_requirements": ["This is a user-declared standard relationship located in the frozen source configuration, not a live assembled state.",
                                                       "The finite gap is measured, not hidden by a relaxed adjacency threshold; a compatible fastener and its actual occupied range remain unbound.",
                                                       "Connector dimensions, threads, retaining contact, engagement, assembly paths, engineering and task acceptance remain unevaluated."]})
            found += 1
        if not found:
            raise ValueError("Declared reference assembly selected no counterpart Part")
    return result


def _rounded_boundary(loop, normal):
    points = loop[:-1] if loop[0] == loop[-1] else loop
    if len(points) < 8:
        return None
    n = _unit(normal)
    basis = [1. if i == min(range(3), key=lambda j: abs(n[j])) else 0. for i in range(3)]
    u = _unit(mechanics._cross(n, basis)); v = mechanics._cross(n, u)
    mean = [sum(p[i] for p in points) / len(points) for i in range(3)]
    projected = [[mechanics._dot(mechanics._sub(p, mean), axis) for axis in (u, v)] for p in points]
    xx, yy, xy = (sum(p[i] * p[j] for p in projected) for i, j in ((0, 0), (1, 1), (0, 1)))
    angle = .5 * math.atan2(2 * xy, xx - yy)
    major = [math.cos(angle) * u[i] + math.sin(angle) * v[i] for i in range(3)]
    # Fix the arbitrary PCA sign so identifiers and display axes replay exactly.
    if major[max(range(3), key=lambda i: abs(major[i]))] < 0:
        major = [-x for x in major]
    minor = mechanics._cross(n, major)
    coords = [[mechanics._dot(mechanics._sub(p, mean), axis) for axis in (major, minor)] for p in points]
    low = [min(p[i] for p in coords) for i in range(2)]; high = [max(p[i] for p in coords) for i in range(2)]
    length, width = [high[i] - low[i] for i in range(2)]
    if width < .0003 or length <= width * 1.1:
        return None
    center = [(low[i] + high[i]) / 2 for i in range(2)]
    coords = [[p[i] - center[i] for i in range(2)] for p in coords]
    def residual(radius, p):
        a, b = abs(p[0]) - (length / 2 - radius), abs(p[1]) - (width / 2 - radius)
        return math.hypot(max(a, 0.), max(b, 0.)) + min(max(a, b), 0.) - radius
    def score(radius):
        return sum(residual(radius, p) ** 2 for p in coords)
    left, right = 0., width / 2
    for _ in range(55):
        a, b = (2 * left + right) / 3, (left + 2 * right) / 3
        if score(a) <= score(b): right = b
        else: left = a
    radius = (left + right) / 2
    if score(width / 2) <= score(radius) + 1e-20:
        radius = width / 2
    maximum = max(abs(residual(radius, p)) for p in coords)
    if maximum > FIT_M or radius < FIT_M * 2:
        return None
    origin = [mean[i] + major[i] * center[0] + minor[i] * center[1] for i in range(3)]
    return {"type": "capsule_opening" if abs(radius - width / 2) <= FIT_M else "rounded_rectangle_opening", "origin": origin, "normal": n,
            "major_axis": major, "width_m": width, "length_m": length, "corner_radius_m": radius,
            "boundary_vertices": deepcopy(points)}, maximum


def _slot_geometry(raw):
    digest = hashlib.sha256(raw).hexdigest()
    if digest in _SLOT_CACHE:
        return _SLOT_CACHE[digest]
    mesh = surfaces._planar_mesh(raw)
    result = []
    for patch in mesh["patches"]:
        for loop in patch["loops"]:
            area_vector = [sum(mechanics._cross(a, b)[i] for a, b in zip(loop, loop[1:])) for i in range(3)]
            if mechanics._dot(area_vector, patch["normal"]) >= 0:
                continue  # Only inner material boundaries, not an exterior rounded profile.
            fitted = _rounded_boundary(loop, patch["normal"])
            if fitted is None:
                continue
            geometry, maximum = fitted
            keys = {tuple(round(v / mechanics.WELD_M) for v in p) for p in loop}
            support = [t for t in patch["triangles"] if sum(tuple(round(v / mechanics.WELD_M) for v in mesh["vertices"][i]) in keys for i in mesh["faces"][t]) >= 2]
            geometry["support_triangle_indices"] = support
            result.append((geometry, maximum))
    _SLOT_CACHE[digest] = result
    return result


def _slot_features(scene, root):
    sources = {s["url"]: s for s in scene["sources"]}
    result = []
    for part in scene["parts"]:
        source = sources[part["geometryUrl"]]
        raw = mechanics._asset(root, part["geometryUrl"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["digest"].removeprefix("sha256:"):
            raise ValueError("Slot geometry source digest changed")
        for geometry, maximum in _slot_geometry(raw):
            token = _token(json.dumps([source["digest"], geometry["boundary_vertices"]], separators=(",", ":")))
            result.append({"id": "slot-feature:" + part["id"].removeprefix("part:") + ":" + token, "owner_ref": part["id"],
                           "frame_ref": "frame:" + part["id"].removeprefix("part:") + ":source-mesh", "status": "geometry_only", "kind": geometry["type"],
                           "geometry_source_ref": source["id"], "geometry_digest": "sha256:" + source["digest"].removeprefix("sha256:"), "geometry": deepcopy(geometry),
                           "measurement": {"basis": "calculated", "method": SLOT_METHOD, "fit_max_m": maximum},
                           "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])})
    return result


def augment_analysis(base, scene, package_root, assembly_knowledge=None):
    """Add 1.4 records to a replayed 1.3 result (also useful for bounded tests)."""
    result = deepcopy(base)
    sites = _geometry_sites(result)
    interfaces, references = [], []
    if assembly_knowledge is not None:
        validate_knowledge(assembly_knowledge)
        device_ids = {p["id"].split(":")[1] for p in scene["parts"]}
        if device_ids != {assembly_knowledge["device_id"]}:
            raise ValueError("Assembly declaration belongs to another device")
        source = next((s for s in scene["sources"] if s["id"] == KNOWLEDGE_SOURCE), None)
        if source is None or not any(e["id"] == KNOWLEDGE_EVIDENCE for e in scene.get("evidence", [])):
            raise ValueError("Assembly declaration source and evidence must be explicitly captured")
        raw = mechanics._asset(Path(package_root), source["url"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["digest"].removeprefix("sha256:") or json.loads(raw) != assembly_knowledge:
            raise ValueError("Assembly declaration differs from the captured source bytes")
        interfaces, by_family = _family_interfaces(result, scene, assembly_knowledge, sites)
        references = _reference_mounts(result, scene, assembly_knowledge, sites, interfaces, by_family)
    slots = _slot_features(scene, Path(package_root))
    result.update(mounting_sites=sites, mounting_interfaces=interfaces, reference_mounts=references, slot_features=slots)
    result["analysis"].update(method=METHOD, mounting_sites_count=len(sites), mounting_interfaces_count=len(interfaces), reference_mounts_count=len(references), slot_features_count=len(slots))
    result["analysis"]["coverage"]["feature_type_status"]["slots_keys"] = "partial"
    result["analysis"]["limitations"] = [line for line in result["analysis"]["limitations"] if not line.startswith("No functional warrant,")]
    result["analysis"]["limitations"] += ["Mounting entries address each source opening separately and still refer to shared logical-hole resources.",
                                              "Functional mounting applicability and standard reference pairings come from the separately captured user statement, not manufacturer certification.",
                                              "Reference mappings retain the measured finite gap and source placement; compatible fasteners, retaining contact and assembly execution remain unverified.",
                                              "Actual active kinematic frames and motion ownership remain unresolved; a user-declared mounting capability does not supply an internal servo model.",
                                              "Slot records fit finite inner rounded contours only; depth, through connectivity, mechanical function and other slot or key shapes remain unresolved."]
    return result


def analysis_for(scene, package_root, assembly_knowledge=None):
    return augment_analysis(semantics.analysis_for(scene, package_root), scene, package_root, assembly_knowledge)
