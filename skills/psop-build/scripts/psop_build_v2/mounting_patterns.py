"""Add explicit mounting patterns and witnessed tapered pins for profile 1.5.

The 1.4 geometry and semantics stay frozen. Circular source caps seed a new
finite-frustum pass; no circle is silently promoted to a hole. New functional
claims require their own captured declaration and keep unknown selection rules.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
from itertools import combinations
import json
import math
from pathlib import Path

from . import mechanics, mounting, semantics, surfaces

METHOD = "mounting-patterns-and-tapered-pins/1"
FRUSTUM_METHOD = "finite-capped-frustum-walls/1"
KNOWLEDGE_SCHEMA = "psop.mounting.knowledge/1.1-draft.1"
FIT_M = mounting.FIT_M
_FRUSTUM_CACHE = {}


def _circle(loop, normal):
    """Fit a complete finite circular contour in an axis-aligned plane."""
    points = loop[:-1] if loop[0] == loop[-1] else loop
    if len(points) < 12:
        return None
    axis = max(range(3), key=lambda i: abs(normal[i]))
    if abs(normal[axis]) < 1 - 1e-8:
        return None
    radial = [i for i in range(3) if i != axis]
    mean = [sum(p[i] for p in points) / len(points) for i in range(3)]
    rows = [[p[radial[0]] - mean[radial[0]], p[radial[1]] - mean[radial[1]], 1.] for p in points]
    target = [-r[0] ** 2 - r[1] ** 2 for r in rows]
    fit = mechanics._solve([[sum(r[i] * r[j] for r in rows) for j in range(3)] for i in range(3)],
                           [sum(r[i] * t for r, t in zip(rows, target)) for i in range(3)])
    if fit is None:
        return None
    center = list(mean)
    center[radial[0]] -= fit[0] / 2
    center[radial[1]] -= fit[1] / 2
    radii = [math.hypot(p[radial[0]] - center[radial[0]], p[radial[1]] - center[radial[1]]) for p in points]
    radius = sum(radii) / len(radii)
    error = max(abs(r - radius) for r in radii)
    angles = sorted(math.atan2(p[radial[1]] - center[radial[1]], p[radial[0]] - center[radial[0]]) % math.tau for p in points)
    if (not .0003 <= radius <= .05 or error > FIT_M
            or max(abs(p[axis] - center[axis]) for p in points) > FIT_M
            or max((b - a) % math.tau for a, b in zip(angles, angles[1:] + angles[:1])) > math.radians(31)):
        return None
    return axis, radial, center, radius, error


def _frustum_geometry(raw):
    """Recognize outward, closed-tip draft pins using actual source wall faces.

    A planar disk is only a seed. Every accepted wall vertex must fit one common
    radius-vs-axis line, every wall normal must face radially outward, and both
    tip ring and remaining finite wall boundary must be closed. Thus holes, disks alone, merged bores,
    shallow circles and an incomplete wall cannot create an integral pin.
    """
    digest = hashlib.sha256(raw).hexdigest()
    if digest in _FRUSTUM_CACHE:
        return deepcopy(_FRUSTUM_CACHE[digest])
    mesh = surfaces._planar_mesh(raw)
    vertices, faces, normals, _ = mechanics._mesh(raw)
    edge_faces = defaultdict(list)
    adjacency = [[] for _ in faces]
    for t, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edge_faces[tuple(sorted((a, b)))].append(t)
    for pair in edge_faces.values():
        if len(pair) == 2:
            a, b = pair
            adjacency[a].append(b); adjacency[b].append(a)
    lookup = {tuple(round(x / mechanics.WELD_M) for x in p): i for i, p in enumerate(vertices)}
    output, seen = [], set()
    if not mesh["outward_orientation_supported"]:
        return []
    for patch in mesh["patches"]:
        if len(patch["loops"]) != 1:
            continue
        fitted = _circle(patch["loops"][0], patch["normal"])
        if fitted is None:
            continue
        axis, radial, center, radius, cap_error = fitted
        loop = patch["loops"][0]
        area = mechanics._dot([sum(mechanics._cross(a, b)[i] for a, b in zip(loop, loop[1:])) for i in range(3)], patch["normal"])
        if area <= 0:
            continue
        ring_ids = [lookup[tuple(round(x / mechanics.WELD_M) for x in p)] for p in loop]
        seeds = {t for a, b in zip(ring_ids, ring_ids[1:]) for t in edge_faces[tuple(sorted((a, b)))] if t not in patch["triangles"]}
        for seed in sorted(seeds):
            if seed in seen:
                continue
            seed_points = [vertices[v] for v in faces[seed]]
            far = max(seed_points, key=lambda p: abs(p[axis] - center[axis]))
            delta = far[axis] - center[axis]
            if abs(delta) < .00015:
                continue
            slope = (math.hypot(far[radial[0]] - center[radial[0]], far[radial[1]] - center[radial[1]]) - radius) / delta
            if not .005 <= abs(slope) <= 1:
                continue
            def fits(t):
                points = [vertices[v] for v in faces[t]]
                if max(p[axis] for p in points) - min(p[axis] for p in points) < mechanics.WELD_M:
                    return False
                for p in points:
                    predicted = radius + slope * (p[axis] - center[axis])
                    if predicted < .0003 or abs(math.hypot(p[radial[0]] - center[radial[0]], p[radial[1]] - center[radial[1]]) - predicted) > FIT_M:
                        return False
                midpoint = [sum(p[i] for p in points) / 3 for i in range(3)]
                radial_vector = [midpoint[i] - center[i] if i != axis else 0. for i in range(3)]
                return mechanics._dot(normals[t], radial_vector) / max(mechanics._length(radial_vector), 1e-20) > .7
            if not fits(seed):
                continue
            selected, stack = {seed}, [seed]
            while stack:
                t = stack.pop()
                for other in adjacency[t]:
                    if other not in selected and fits(other):
                        selected.add(other); stack.append(other)
            if len(selected) < 24:
                continue
            points = [vertices[v] for t in selected for v in faces[t]]
            low, high = min(p[axis] for p in points), max(p[axis] for p in points)
            if high - low < .00015 or min(abs(center[axis] - low), abs(center[axis] - high)) > FIT_M:
                continue
            # A tip faces away from the solid base, not into a cavity.
            sign = -1 if abs(center[axis] - low) < abs(center[axis] - high) else 1
            if patch["normal"][axis] * sign < .999:
                continue
            if slope * sign >= -.005:
                continue  # The smaller closed end is the supported pin tip.
            edges = semantics._edges(faces, selected)
            terminal = {e for e in edges if all(abs(vertices[v][axis] - center[axis]) <= mechanics.WELD_M * 2 for v in e)}
            tip_ring = semantics._ordered_ring(terminal, vertices)
            base_ring = semantics._ordered_ring(edges - terminal, vertices)
            if not tip_ring or not base_ring or len(edges) != len(tip_ring) + len(base_ring):
                continue
            base_coordinate = high if sign < 0 else low
            origin = list(center); origin[axis] = base_coordinate
            direction = [float(sign) if i == axis else 0. for i in range(3)]
            residuals = [abs(math.hypot(p[radial[0]] - center[radial[0]], p[radial[1]] - center[radial[1]]) - radius - slope * (p[axis] - center[axis])) for p in points]
            maximum = max(residuals)
            output.append({"geometry": {"type": "conical_frustum", "axis": direction, "origin": origin,
                                        "radius_start_m": radius + slope * (base_coordinate - center[axis]), "radius_end_m": radius,
                                        "length_m": high - low, "triangle_indices": sorted(selected)},
                           "fit_max_m": max(maximum, cap_error), "fit_rms_m": math.sqrt(sum(r * r for r in residuals) / len(residuals)), "cap_triangle_indices": list(patch["triangles"]),
                           "tip_boundary_vertices": [list(vertices[v]) for v in tip_ring],
                           "base_boundary_vertices": [list(vertices[v]) for v in base_ring]})
            seen.update(selected)
    output.sort(key=lambda item: (item["geometry"]["origin"], item["geometry"]["axis"]))
    _FRUSTUM_CACHE[digest] = deepcopy(output)
    return output


def _legacy_knowledge(value):
    result = {k: deepcopy(value[k]) for k in ("schema", "device_id", "provenance", "interface_families", "reference_assemblies")}
    result["schema"] = mounting.KNOWLEDGE_SCHEMA
    return result


def validate_knowledge(value):
    mounting._keys(value, ("schema", "device_id", "provenance", "interface_families", "reference_assemblies", "mounting_assertions"), "mounting knowledge 1.1")
    if value["schema"] != KNOWLEDGE_SCHEMA:
        raise ValueError("Unsupported mounting knowledge schema")
    mounting.validate_knowledge(_legacy_knowledge(value))
    if not isinstance(value["mounting_assertions"], list):
        raise ValueError("Mounting assertions must be a list")
    ids = [x["id"] for x in value["interface_families"] + value["reference_assemblies"]]
    for assertion in value["mounting_assertions"]:
        mounting._keys(assertion, ("id", "label", "provenance", "selectors", "layout", "mechanism", "role", "selection", "statement"), "mounting assertion")
        for k in ("id", "label", "statement"):
            mounting._text(assertion[k], "Mounting assertion " + k)
        mounting._keys(assertion["provenance"], ("kind", "recorded_at", "statement", "interpretation"), "mounting assertion provenance")
        if assertion["provenance"]["kind"] != "user_statement" or any(not isinstance(v, str) or not v for v in assertion["provenance"].values()):
            raise ValueError("Mounting assertion requires its own raw user statement")
        if not isinstance(assertion["selectors"], list) or not assertion["selectors"]:
            raise ValueError("Mounting assertion requires frozen geometry selectors")
        for selector in assertion["selectors"]:
            mounting._selector(selector)
        if len({(s["mesh_key"], s["geometry_sha256"]) for s in assertion["selectors"]}) != len(assertion["selectors"]):
            raise ValueError("Mounting selectors must be unique")
        if assertion["selection"] != {"status": "unknown"} or assertion["mechanism"] != "unknown":
            raise ValueError("New mounting assertions cannot invent selection rules or mechanisms")
        layout = assertion["layout"]
        if not isinstance(layout, dict):
            raise ValueError("Mounting pattern layout must be an object")
        if layout.get("type") == "circular":
            mounting._keys(layout, ("type", "member_count", "hole_diameter_m", "pitch_circle_diameter_m", "entry_side"), "circular mounting layout")
            if type(layout["member_count"]) is not int or layout["member_count"] < 3 or layout["entry_side"] != "positive_axis" or assertion["role"] != "bracket_mount":
                raise ValueError("Unsupported circular mounting scope")
            for k in ("hole_diameter_m", "pitch_circle_diameter_m"):
                mounting._positive(layout[k], "Circular mounting measurement")
        elif layout.get("type") == "linear_pins":
            mounting._keys(layout, ("type", "member_count", "tip_diameter_m", "pin_spacing_m"), "linear pin layout")
            if type(layout["member_count"]) is not int or layout["member_count"] != 2 or assertion["role"] != "mounting_feature":
                raise ValueError("Unsupported integral pin mounting scope")
            for k in ("tip_diameter_m", "pin_spacing_m"):
                mounting._positive(layout[k], "Linear pin measurement")
        else:
            raise ValueError("Unsupported mounting pattern type")
        ids.append(assertion["id"])
    if len(ids) != len(set(ids)):
        raise ValueError("Mounting assertion IDs must be unique")
    return value


def _pin_features(scene, root):
    sources = {s["url"]: s for s in scene["sources"]}
    features, sites = [], []
    for part in scene["parts"]:
        source = sources[part["geometryUrl"]]
        raw = mechanics._asset(root, part["geometryUrl"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["digest"].removeprefix("sha256:"):
            raise ValueError("Frustum geometry source digest changed")
        for primitive in _frustum_geometry(raw):
            geometry = primitive["geometry"]
            token = mounting._token(FRUSTUM_METHOD + ":" + source["digest"] + ":" + ",".join(map(str, geometry["triangle_indices"])))
            identifier = "feature:" + part["id"].removeprefix("part:") + ":" + token
            frame = "frame:" + part["id"].removeprefix("part:") + ":source-mesh"
            feature = {"id": identifier, "owner_ref": part["id"], "frame_ref": frame, "kind": "shaft_wall",
                       "geometry_source_ref": source["id"], "geometry_digest": "sha256:" + source["digest"].removeprefix("sha256:"),
                       "geometry": deepcopy(geometry),
                       "measurement": {"basis": "calculated", "method": FRUSTUM_METHOD, "fit_rms_m": primitive["fit_rms_m"], "fit_max_m": primitive["fit_max_m"], "coverage": 1.},
                       "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])}
            features.append(feature)
            sites.append({"id": "mounting-site:" + part["id"].removeprefix("part:") + ":" + mounting._token(identifier + ":closed-tip"),
                          "owner_ref": part["id"], "frame_ref": frame, "hole_ref": None, "portal_ref": None, "site_kind": "integral_pin",
                          "feature_refs": [identifier], "side_ref": "mounting-side:" + part["id"].removeprefix("part:") + ":" + mounting._token(json.dumps(geometry["axis"])),
                          "label": "整体锥销几何", "position": [geometry["origin"][i] + geometry["axis"][i] * geometry["length_m"] for i in range(3)],
                          "entry_direction": list(geometry["axis"]), "status": "geometry_candidate", "role": "unqualified", "assertion_refs": [],
                          "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])})
    return features, sites


def _unknown_rule():
    return {"status": "unknown", "same_side": None, "min_count": None, "require_adjacent_pair": None,
            "allowed_adjacent_pairs": [], "adjacency_basis": "not_assessed"}


def selection_status(interface, site_refs, sites):
    """Missing functional rules remain unknown, never an impossible assembly."""
    if interface["selection_rule"].get("status") == "unknown":
        return "unknown"
    return mounting.selection_status(interface, site_refs, sites)


def _qualify(site, assertion):
    mounting._qualify(site, assertion["role"], assertion["id"])
    site["evidence_refs"] = sorted(set(site["evidence_refs"] + ["evidence:microduck:mounting-assertion:" + assertion["id"]]))


def _new_interface(assertion, part, members, label):
    sides = []
    for side in sorted({s["side_ref"] for s in members}):
        selected = [s for s in members if s["side_ref"] == side]
        sides.append({"id": side, "label": "已定位安装侧", "normal": [-v for v in selected[0]["entry_direction"]], "site_refs": [s["id"] for s in selected]})
    return {"id": "mounting-interface:" + part["id"].removeprefix("part:") + ":" + mounting._token(assertion["id"] + ":" + "|".join(sorted(s["id"] for s in members))),
            "owner_ref": part["id"], "frame_ref": members[0]["frame_ref"], "status": "user_asserted", "label": label,
            "mechanism": assertion["mechanism"], "role": assertion["role"], "member_site_refs": [s["id"] for s in members], "sides": sides,
            "selection_rule": _unknown_rule(), "assertion_refs": [assertion["id"]],
            "source_refs": sorted({r for s in members for r in s["source_refs"]}), "evidence_refs": sorted({r for s in members for r in s["evidence_refs"]}),
            "unresolved_requirements": ["selection_rule_not_declared", "mechanism_not_declared", "active_frame_not_assigned", "retention_not_assessed",
                                        "The statement identifies mounting features only. Minimum count, allowed subsets, connecting mechanism, active frames, retention, engineering limits and assembly paths remain unknown."]}


def _circular_phase_note(interface, pattern, part, base, scene):
    """Assess source-pose axes only; a phase mismatch is not a design veto."""
    parts = {p["id"]: p for p in scene["parts"]}
    portals = {p["id"]: p for h in base["logical_holes"] for p in h["portals"]}
    center = semantics._world_point(part, pattern["geometry"]["origin"])
    normal = mechanics._rotate(pattern["geometry"]["normal"], part["quaternion"])
    candidates = []
    for other in base["feature_patterns"]:
        if other["owner_ref"] == part["id"] or other["geometry"]["type"] != "circular" or len(other["portal_refs"]) != len(pattern["portal_refs"]):
            continue
        if abs(other["geometry"]["pitch_circle_diameter_m"] - pattern["geometry"]["pitch_circle_diameter_m"]) > FIT_M:
            continue
        peer = parts[other["owner_ref"]]
        n = mechanics._rotate(other["geometry"]["normal"], peer["quaternion"])
        offset = mechanics._sub(semantics._world_point(peer, other["geometry"]["origin"]), center)
        axial = mechanics._dot(offset, normal)
        radial = mechanics._length([offset[i] - normal[i] * axial for i in range(3)])
        if mechanics._dot(normal, n) > -.999 or abs(axial) > .001 or radial > FIT_M:
            continue
        left = [semantics._world_point(part, portals[p]["position"]) for p in pattern["portal_refs"]]
        right = [semantics._world_point(peer, portals[p]["position"]) for p in other["portal_refs"]]
        distance = max(min(mechanics._length([a[i] - b[i] - normal[i] * mechanics._dot(mechanics._sub(a, b), normal) for i in range(3)]) for b in right) for a in left)
        candidates.append((abs(axial), distance, peer["id"]))
    if candidates:
        gap, distance, peer = min(candidates)
        if distance > FIT_M:
            phase = 2 * math.asin(min(1., distance / pattern["geometry"]["pitch_circle_diameter_m"]))
            interface["unresolved_requirements"] += ["reference_hole_axes_unaligned",
                "Source qpos0 shares the pitch-circle center with " + peer + ", but nearest hole axes differ by %.6f mm (phase %.6f degrees, finite plane gap %.6f mm). This is not a permanent incompatibility; one common relative configuration and output-frame ownership remain unresolved." % (distance * 1000, math.degrees(phase), gap * 1000)]


def _asserted_interfaces(base, scene, knowledge, sites):
    sources = {s["url"]: s for s in scene["sources"]}
    features = {f["id"]: f for f in base["features"]}
    by_portal = {s["portal_ref"]: s for s in sites if s["portal_ref"] is not None}
    result = []
    for assertion in knowledge["mounting_assertions"]:
        matched = 0
        for part in scene["parts"]:
            if not any(mounting._matching(part, selector, sources) for selector in assertion["selectors"]):
                continue
            layout = assertion["layout"]
            if layout["type"] == "circular":
                groups = []
                for pattern in base["feature_patterns"]:
                    g = pattern["geometry"]
                    if pattern["owner_ref"] != part["id"] or g["type"] != "circular" or len(pattern["portal_refs"]) != layout["member_count"]:
                        continue
                    axis = max(range(3), key=lambda i: abs(g["normal"][i]))
                    if g["normal"][axis] < 0 or abs(g["pitch_circle_diameter_m"] - layout["pitch_circle_diameter_m"]) > FIT_M:
                        continue
                    members = [by_portal[p] for p in pattern["portal_refs"]]
                    if not all(abs(features[s["feature_refs"][0]]["geometry"]["radius_m"] * 2 - layout["hole_diameter_m"]) <= FIT_M for s in members):
                        continue
                    groups.append((pattern, members))
                if len(groups) != 1:
                    raise ValueError("Declared circular mounting scope must match exactly one witnessed opening side")
                pattern, members = groups[0]
                members.sort(key=lambda s: s["position"])
                for n, site in enumerate(members, 1):
                    _qualify(site, assertion); site["label"] = "U" + str(n)
                interface = _new_interface(assertion, part, members, assertion["label"])
                _circular_phase_note(interface, pattern, part, base, scene)
                interface["unresolved_requirements"].append("Only the complete positive-axis source entry is functionally qualified here; the opposite entry and clipped counterbores remain separate geometry evidence, not a user assertion of bidirectional mounting.")
                result.append(interface)
            else:
                owned = [s for s in sites if s["owner_ref"] == part["id"] and s.get("site_kind") == "integral_pin"
                         and abs(features[s["feature_refs"][0]]["geometry"]["radius_end_m"] * 2 - layout["tip_diameter_m"]) <= FIT_M]
                groups = [(a, b) for a, b in combinations(owned, 2) if abs(mechanics._length(mechanics._sub(a["position"], b["position"])) - layout["pin_spacing_m"]) <= FIT_M
                          and mechanics._dot(a["entry_direction"], b["entry_direction"]) > .999]
                groups.sort(key=lambda group: [s["position"] for s in group])
                if not groups or any(sum(s in pair for pair in groups) != 1 for s in owned):
                    raise ValueError("Declared pin layout is missing, incomplete or ambiguously overlapping")
                for n, members in enumerate(groups, 1):
                    for i, site in enumerate(members, 1):
                        _qualify(site, assertion); site["label"] = "P%d.%d" % (n, i)
                    interface = _new_interface(assertion, part, members, assertion["label"] + " · 安装组 " + str(n))
                    interface["unresolved_requirements"].append("These are outward source draft walls with closed circular tips, not holes or fastener threads. The frustum base is clipped by the shell; triangle witnesses delimit the actual material instead of a completed analytic solid. A 16 mm geometric grouping does not state that both pins must be used.")
                    result.append(interface)
            matched += 1
        if not matched:
            raise ValueError("Declared mounting assertion has no captured matching occurrence")
    return result


def _pin_reference_note(interface, sites, features, scene):
    """Record one unchanged source-pose comparison without certifying a mount."""
    parts = {p["id"]: p for p in scene["parts"]}
    by_id = {s["id"]: s for s in sites}
    feature_map = {f["id"]: f for f in features}
    members = [by_id[r] for r in interface["member_site_refs"]]
    candidates = []
    for site in members:
        part = parts[site["owner_ref"]]
        point = semantics._world_point(part, site["position"])
        axis = mechanics._rotate(site["entry_direction"], part["quaternion"])
        length = feature_map[site["feature_refs"][0]]["geometry"]["length_m"]
        matches = []
        for other in sites:
            if other["role"] != "housing_mount":
                continue
            peer = parts[other["owner_ref"]]
            if peer.get("scale", [1., 1., 1.]) != [1., 1., 1.] or part.get("scale", [1., 1., 1.]) != [1., 1., 1.]:
                continue
            direction = mechanics._rotate(other["entry_direction"], peer["quaternion"])
            offset = mechanics._sub(point, semantics._world_point(peer, other["position"]))
            depth = mechanics._dot(offset, axis)
            distance = mechanics._length([offset[i] - axis[i] * depth for i in range(3)])
            if mechanics._dot(direction, axis) > .999 and distance <= FIT_M and -FIT_M <= depth <= length:
                matches.append((other, distance, depth))
        candidates.append(matches)
    if all(len(m) == 1 for m in candidates):
        matches = [m[0] for m in candidates]
        if len({m[0]["owner_ref"] for m in matches}) == 1 and len({m[0]["id"] for m in matches}) == len(members):
            interface["unresolved_requirements"].extend(["reference_pin_axes_aligned",
                "Under the unchanged source qpos0, this pin group shares axes with " + matches[0][0]["owner_ref"] + " entries " + ", ".join(m[0]["label"] for m in matches)
                + "; maximum axis distance %.6f mm and tip penetration %.6f to %.6f mm. These are source-geometry observations, not a certified connection, retention state, allowed subset rule or executed assembly."
                % (max(m[1] for m in matches) * 1000, min(m[2] for m in matches) * 1000, max(m[2] for m in matches) * 1000)])


def augment_analysis(base, scene, package_root, assembly_knowledge=None):
    result = mounting.augment_analysis(base, scene, package_root, None)
    new_features, new_sites = _pin_features(scene, Path(package_root))
    result["features"].extend(new_features)
    result["mounting_sites"].extend(new_sites)
    if assembly_knowledge is not None:
        validate_knowledge(assembly_knowledge)
        if {p["id"].split(":")[1] for p in scene["parts"]} != {assembly_knowledge["device_id"]}:
            raise ValueError("Assembly declaration belongs to another device")
        source = next((s for s in scene["sources"] if s["id"] == mounting.KNOWLEDGE_SOURCE), None)
        if source is None or not any(e["id"] == mounting.KNOWLEDGE_EVIDENCE for e in scene.get("evidence", [])):
            raise ValueError("Assembly declaration source and evidence must be explicitly captured")
        if any(not any(e["id"] == "evidence:microduck:mounting-assertion:" + a["id"] for e in scene.get("evidence", [])) for a in assembly_knowledge["mounting_assertions"]):
            raise ValueError("Each mounting assertion must have explicitly captured evidence")
        raw = mechanics._asset(Path(package_root), source["url"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["digest"].removeprefix("sha256:") or json.loads(raw) != assembly_knowledge:
            raise ValueError("Assembly declaration differs from the captured source bytes")
        legacy = _legacy_knowledge(assembly_knowledge)
        interfaces, by_family = mounting._family_interfaces(result, scene, legacy, result["mounting_sites"])
        references = mounting._reference_mounts(result, scene, legacy, result["mounting_sites"], interfaces, by_family)
        for interface in interfaces:
            interface["label"] = "舵机壳体安装孔位" if interface["role"] == "housing_mount" else "连杆中部双孔安装位"
        interfaces.extend(_asserted_interfaces(result, scene, assembly_knowledge, result["mounting_sites"]))
        for interface in interfaces:
            if interface["role"] == "mounting_feature":
                _pin_reference_note(interface, result["mounting_sites"], result["features"], scene)
        result.update(mounting_interfaces=interfaces, reference_mounts=references)
    result["analysis"].update(method=METHOD, features_count=len(result["features"]), mounting_sites_count=len(result["mounting_sites"]),
                              mounting_interfaces_count=len(result["mounting_interfaces"]), reference_mounts_count=len(result["reference_mounts"]))
    if new_features:
        result["analysis"]["coverage"]["primitive_types"].append("conical_frustum")
    result["analysis"]["limitations"].extend([
        "Tapered shaft patches are fitted from outward source triangles adjacent to a closed circular disk; their clipped base boundary is not completed into a solid or a bore.",
        "Newly identified mounting patterns carry unknown mechanisms and subset rules. Unknown is neither a minimum-two rule nor an impossibility result.",
        "A source-reference phase mismatch can require a different common pose or internal output frame; individual holes are never independently moved to fabricate a reference mount."])
    return result


def analysis_for(scene, package_root, assembly_knowledge=None):
    return augment_analysis(semantics.analysis_for(scene, package_root), scene, package_root, assembly_knowledge)
