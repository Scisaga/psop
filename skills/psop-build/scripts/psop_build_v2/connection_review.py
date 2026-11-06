"""Finite openings and source-scoped connection reviews for profile 1.6.

The frozen 1.5 recognizer is reused through pure helpers. Circular inner
boundaries, cavity surface topology, source-pose proximity and manufacturer
examples remain distinct from a mechanically verified connection or BOM.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
from itertools import combinations
import json
import math
from pathlib import Path

from . import mechanics, mounting, mounting_patterns as patterns, semantics, surfaces

METHOD = "source-pair-connection-review/1"
KNOWLEDGE_SCHEMA = "psop.mounting.knowledge/1.2-draft.1"
OPENING_METHOD = "finite-circular-inner-boundaries/1"
CAVITY_METHOD = "shared-source-edge-components"
REQUEST_EVIDENCE = "evidence:microduck:connection-review-request"
_OPENING_CACHE = {}


def _legacy_assertions(value):
    result = {k: deepcopy(value[k]) for k in ("schema", "device_id", "provenance", "interface_families", "reference_assemblies", "mounting_assertions")}
    result["schema"] = patterns.KNOWLEDGE_SCHEMA
    for assertion in result["mounting_assertions"]:
        assertion.pop("assertion_basis", None)
    return result


def validate_knowledge(value):
    mounting._keys(value, ("schema", "device_id", "provenance", "interface_families", "reference_assemblies", "mounting_assertions", "supporting_documents", "connection_review"), "connection review knowledge")
    if value["schema"] != KNOWLEDGE_SCHEMA:
        raise ValueError("Unsupported connection review declaration")
    patterns.validate_knowledge(_legacy_assertions(value))
    for assertion in value["mounting_assertions"]:
        if assertion.get("assertion_basis") not in ("user_statement", "project_inference"):
            raise ValueError("Each mounting assertion requires its actual basis")
    if not isinstance(value["supporting_documents"], list):
        raise ValueError("Supporting documents must be a list")
    identifiers = []
    for document in value["supporting_documents"]:
        mounting._keys(document, ("id", "title", "path", "url", "sha256", "scope", "claims"), "supporting document")
        for key in ("id", "title", "path", "url", "sha256"):
            mounting._text(document[key], "Supporting document " + key)
        if document["scope"] != "manufacturer_general" or len(document["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in document["sha256"]):
            raise ValueError("Manufacturer document scope and digest must be explicit")
        if not isinstance(document["claims"], list) or not all(isinstance(x, str) and x for x in document["claims"]):
            raise ValueError("Supporting document claims must be bounded text")
        identifiers.append(document["id"])
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Supporting document identities must be unique")
    policy = value["connection_review"]
    mounting._keys(policy, ("proximity_threshold_m", "axis_alignment_tolerance_m", "statement", "manufacturer_source_refs", "schematic_policy"), "connection review policy")
    for key in ("proximity_threshold_m", "axis_alignment_tolerance_m"):
        mounting._positive(policy[key], "Connection review threshold")
    mounting._text(policy["statement"], "Connection review request")
    if (policy["schematic_policy"] != "illustrative_unconfirmed" or not isinstance(policy["manufacturer_source_refs"], list)
            or len(set(policy["manufacturer_source_refs"])) != len(policy["manufacturer_source_refs"])
            or any(x not in identifiers for x in policy["manufacturer_source_refs"])):
        raise ValueError("Connection review must retain unconfirmed schematic scope and captured sources")
    return value


def _signed_area(loop, normal):
    return mechanics._dot([sum(mechanics._cross(a, b)[i] for a, b in zip(loop, loop[1:])) for i in range(3)], normal) / 2


def _mesh_openings(raw):
    """Recognize negative-winding inner rings; disks are deliberately excluded."""
    digest = hashlib.sha256(raw).hexdigest()
    if digest in _OPENING_CACHE:
        return deepcopy(_OPENING_CACHE[digest])
    planar = surfaces._planar_mesh(raw)
    vertices, faces, normals, _ = mechanics._mesh(raw)
    edge_faces = defaultdict(list)
    neighbours = [[] for _ in faces]
    for t, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edge_faces[tuple(sorted((a, b)))].append(t)
    for pair in edge_faces.values():
        if len(pair) == 2:
            a, b = pair; neighbours[a].append(b); neighbours[b].append(a)
    lookup = {tuple(round(x / mechanics.WELD_M) for x in p): i for i, p in enumerate(vertices)}
    openings = []
    for patch in planar["patches"]:
        for loop in patch["loops"]:
            fitted = patterns._circle(loop, patch["normal"])
            if fitted is None or _signed_area(loop, patch["normal"]) >= 0:
                continue
            axis, radial, center, radius, error = fitted
            ids = [lookup[tuple(round(x / mechanics.WELD_M) for x in p)] for p in loop]
            edges = {tuple(sorted((a, b))) for a, b in zip(ids, ids[1:])}
            support = sorted({t for e in edges for t in edge_faces[e]})
            token = mounting._token(OPENING_METHOD + ":" + digest + ":" + json.dumps([center, patch["normal"], radius]))
            openings.append({"token": token, "geometry": {"type": "circular_inner_boundary", "center": list(center), "normal": list(patch["normal"]),
                            "radius_m": radius, "boundary_vertices": [list(p) for p in loop]}, "support_triangle_indices": support, "fit_max_m": error,
                            "_axis": axis, "_radial": radial, "_edges": edges})
    openings.sort(key=lambda x: x["token"])
    cavities, groups = [], []
    for opening in openings:
        axis, radial = opening["_axis"], opening["_radial"]
        center = opening["geometry"]["center"]
        group = next((g for g in groups if g[0]["_axis"] == axis and math.hypot(*(g[0]["geometry"]["center"][i] - center[i] for i in radial)) <= patterns.FIT_M), None)
        if group is None:
            groups.append([opening])
        else:
            group.append(opening)
    # Each physical axis is scanned once, regardless of the number of entry
    # rings and internal shoulders on it. Never combine independent wall
    # components merely because both touch a co-axial circular boundary.
    for coaxial in groups:
        opening = coaxial[0]
        axis, radial, center = opening["_axis"], opening["_radial"], opening["geometry"]["center"]
        limit = max(o["geometry"]["radius_m"] for o in coaxial) * 1.25 + patterns.FIT_M
        eligible = set()
        for t, face in enumerate(faces):
            points = [vertices[v] for v in face]
            radii = [math.hypot(*(p[i] - center[i] for i in radial)) for p in points]
            if max(radii) > limit or min(radii) < mechanics.WELD_M:
                continue
            midpoint = [sum(p[i] for p in points) / 3 for i in range(3)]
            vector = [midpoint[i] - center[i] if i != axis else 0. for i in range(3)]
            if mechanics._dot(normals[t], vector) < -.1 * mechanics._length(vector):
                eligible.add(t)
        # Finite annular shoulders may connect changing-radius inner walls.
        # A broad plate with several holes is never traversed as a shoulder.
        radial_walls = set(eligible)
        for patch in planar["patches"]:
            if len(patch["loops"]) != 2:
                continue
            rings = [patterns._circle(loop, patch["normal"]) for loop in patch["loops"]]
            if not all(r and r[0] == axis and math.hypot(*(r[2][i] - center[i] for i in radial)) <= patterns.FIT_M and r[3] <= limit for r in rings):
                continue
            # An exterior washer-like cap also has two circular loops. It is
            # not an interior shoulder unless BOTH loops meet inward walls.
            connects_inner_walls = True
            for loop in patch["loops"]:
                ids = [lookup[tuple(round(x / mechanics.WELD_M) for x in p)] for p in loop]
                if not all(any(t in radial_walls for t in edge_faces[tuple(sorted((a, b)))]) for a, b in zip(ids, ids[1:])):
                    connects_inner_walls = False
                    break
            if connects_inner_walls:
                eligible.update(patch["triangles"])
        visited = set()
        seeds = sorted({t for o in coaxial for e in o["_edges"] for t in edge_faces[e] if t in eligible})
        for seed in seeds:
            if seed in visited:
                continue
            selected, stack = {seed}, [seed]
            while stack:
                t = stack.pop()
                for other in neighbours[t]:
                    if other in eligible and other not in selected:
                        selected.add(other); stack.append(other)
            visited.update(selected)
            associated = [o for o in coaxial if any(any(t in selected for t in edge_faces[e]) for e in o["_edges"])]
            complete = all(all(any(t in selected for t in edge_faces[e]) for e in o["_edges"]) for o in associated)
            boundary = semantics._edges(faces, selected)
            degree = defaultdict(int)
            for x, y in boundary:
                degree[x] += 1; degree[y] += 1
            selected_edge_counts = defaultdict(int)
            for t in selected:
                face = faces[t]
                for x, y in zip(face, face[1:] + face[:1]):
                    selected_edge_counts[tuple(sorted((x, y)))] += 1
            closed = bool(boundary) and all(n == 2 for n in degree.values()) and all(n <= 2 for n in selected_edge_counts.values())
            if not associated:
                continue
            points = [vertices[v] for t in selected for v in faces[t]]
            radii = [math.hypot(*(p[i] - center[i] for i in radial)) for p in points]
            origin = list(center); origin[axis] = 0.
            direction = [float(i == axis) for i in range(3)]
            identity = tuple(sorted(selected))
            cavities.append({"token": mounting._token(CAVITY_METHOD + ":" + digest + ":" + str(identity)), "opening_tokens": [o["token"] for o in associated],
                             "status": "topology_witnessed" if len(associated) >= 2 and complete and closed and planar["outward_orientation_supported"] else "partial",
                             "geometry": {"type": "variable_radius_cavity", "origin": origin, "axis": direction,
                                          "axial_range_m": [min(p[axis] for p in points), max(p[axis] for p in points)], "radius_range_m": [min(radii), max(radii)]},
                             "wall_triangle_indices": list(identity), "connectivity": {"method": CAVITY_METHOD, "boundary_closed": closed, "scope": "finite_source_surface_only"}})
    for opening in openings:
        for key in ("_axis", "_radial", "_edges"):
            opening.pop(key)
    result = {"openings": openings, "cavities": sorted(cavities, key=lambda x: x["token"]), "bounds": [[min(p[i] for p in vertices) for i in range(3)], [max(p[i] for p in vertices) for i in range(3)]]}
    _OPENING_CACHE[digest] = deepcopy(result)
    return result


def _opening_records(scene, root):
    sources = {s["url"]: s for s in scene["sources"]}
    openings, cavities, bounds = [], [], {}
    for part in scene["parts"]:
        source = sources[part["geometryUrl"]]
        raw = mechanics._asset(root, part["geometryUrl"]).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != source["digest"].removeprefix("sha256:"):
            raise ValueError("Circular opening source changed")
        geometry = _mesh_openings(raw)
        stem = part["id"].removeprefix("part:")
        common = {"owner_ref": part["id"], "frame_ref": "frame:" + stem + ":source-mesh", "source_geometry_digest": "sha256:" + digest,
                  "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])}
        for opening in geometry["openings"]:
            openings.append({**deepcopy(common), "id": "opening:" + stem + ":" + opening["token"], "status": "geometry_only",
                             **{k: deepcopy(v) for k, v in opening.items() if k != "token"}})
        for cavity in geometry["cavities"]:
            cavities.append({**deepcopy(common), "id": "passage:" + stem + ":" + cavity["token"],
                             **{k: deepcopy(v) for k, v in cavity.items() if k not in ("token", "opening_tokens")},
                             "opening_refs": ["opening:" + stem + ":" + token for token in cavity["opening_tokens"]],
                             "unresolved_requirements": ["Finite cavity surface connectivity does not establish a through solid-volume channel, thread, permitted insertion, functional role or retaining mechanism."]})
        world = [semantics._world_point(part, p) for p in [[x, y, z] for x in (geometry["bounds"][0][0], geometry["bounds"][1][0]) for y in (geometry["bounds"][0][1], geometry["bounds"][1][1]) for z in (geometry["bounds"][0][2], geometry["bounds"][1][2])]]
        bounds[part["id"]] = [[min(p[i] for p in world) for i in range(3)], [max(p[i] for p in world) for i in range(3)]]
    return openings, cavities, bounds


def _distance(a, b):
    return math.sqrt(sum(max(0., a[0][i] - b[1][i], b[0][i] - a[1][i]) ** 2 for i in range(3)))


def _axis_distance(point, origin, axis):
    offset = mechanics._sub(point, origin)
    axial = mechanics._dot(offset, axis)
    return mechanics._length([offset[i] - axis[i] * axial for i in range(3)]), axial


def _axis_matches(openings, features, a, b, tolerance):
    result = []
    for opening in openings:
        if opening["owner_ref"] != a["id"]:
            continue
        center = semantics._world_point(a, opening["geometry"]["center"])
        normal = mechanics._rotate(opening["geometry"]["normal"], a["quaternion"])
        for feature in features:
            g = feature["geometry"]
            if feature["owner_ref"] != b["id"] or feature["kind"] != "shaft_wall" or g["type"] != "cylinder":
                continue
            origin = semantics._world_point(b, g["origin"])
            axis = mechanics._rotate(g["axis"], b["quaternion"])
            distance, axial = _axis_distance(center, origin, axis)
            # Keep the finite source shaft neighborhood; do not match a remote
            # coaxial component elsewhere on the same infinite line.
            if abs(mechanics._dot(normal, axis)) >= .999 and distance <= tolerance and abs(axial) <= max(abs(x) for x in g["axial_range_m"]) + .01:
                result.append((opening, feature, distance, axial))
    return result


def _quaternion_z(axis):
    """Proper rotation from local +Z to a normalized world direction."""
    axis = [v / mechanics._length(axis) for v in axis]
    if axis[2] < -.999999999:
        return [1., 0., 0., 0.]
    q = [-axis[1], axis[0], 0., 1 + axis[2]]
    length = math.sqrt(sum(x * x for x in q))
    return [x / length for x in q]


def _pin_matches(sites, features, a, b, tolerance):
    """Bind a location hypothesis only to its actual finite opposing site."""
    participants = {p["id"]: p for p in (a, b)}
    feature_map = {f["id"]: f for f in features}
    pins = [s for s in sites if s["owner_ref"] in participants and s.get("site_kind") == "integral_pin"]
    result = []
    for pin in pins:
        owner = participants[pin["owner_ref"]]
        point = semantics._world_point(owner, pin["position"])
        axis = mechanics._rotate(pin["entry_direction"], owner["quaternion"])
        length = feature_map[pin["feature_refs"][0]]["geometry"]["length_m"]
        for peer in sites:
            if peer["owner_ref"] not in participants or peer["owner_ref"] == pin["owner_ref"] or peer["role"] != "housing_mount":
                continue
            other = participants[peer["owner_ref"]]
            direction = mechanics._rotate(peer["entry_direction"], other["quaternion"])
            distance, depth = _axis_distance(point, semantics._world_point(other, peer["position"]), axis)
            if mechanics._dot(axis, direction) >= .999 and distance <= tolerance and -tolerance <= depth <= length + tolerance:
                result.append((pin, peer))
    return result


def _supplement(identifier, review, label, kind, position, axis, sources, evidence):
    geometry = ({"type": "screw", "shaft_radius_m": .0013, "shaft_length_m": .006, "head_radius_m": .0025, "head_length_m": .0015}
                if kind == "screw" else {"type": "cap", "outer_radius_m": .0045, "inner_radius_m": .0014, "thickness_m": .0015})
    return {"id": identifier, "review_ref": review, "label": label, "kind": kind, "status": "illustrative_unconfirmed", "domain": "synthetic", "bom_status": "not_confirmed", "role": "retention",
            "pose": {"frame": "world", "position": position, "quaternion": _quaternion_z(axis), "scale": [1., 1., 1.]}, "geometry": geometry,
            "parameter_basis": "manufacturer_general_with_illustrative_dimensions",
            "unconfirmed_fields": ["Microduck actual use", "exact geometry and dimensions", "thread", "engagement", "torque", "motion ownership"],
            "source_refs": sorted(set(sources)), "evidence_refs": sorted(set(evidence))}


def _pair_reviews(base, scene, openings, bounds, knowledge):
    threshold = knowledge["connection_review"]["proximity_threshold_m"] if knowledge else .002
    tolerance = knowledge["connection_review"]["axis_alignment_tolerance_m"] if knowledge else patterns.FIT_M
    device = scene["parts"][0]["id"].split(":")[1]
    configuration = "configuration:" + device + ":source-qpos0"
    observations = defaultdict(list); references = defaultdict(list)
    for item in base["reference_observations"]:
        participants = frozenset(p["part_ref"] for p in item["participants"])
        if len(participants) == 2:
            observations[participants].append(item)
    for item in base["reference_mounts"]:
        references[frozenset(p["part_ref"] for p in item["participants"])].append(item)
    screening, reviews, supplements = [], [], []
    for a, b in combinations(sorted(scene["parts"], key=lambda p: p["id"]), 2):
        pair = frozenset((a["id"], b["id"]))
        token = mounting._token("|".join(sorted(pair)))
        screen_id, review_id = "pair-screening:" + device + ":" + token, "connection-review:" + device + ":" + token
        separation = _distance(bounds[a["id"]], bounds[b["id"]])
        nearby = separation <= threshold or bool(observations[pair]) or bool(references[pair])
        screening.append({"id": screen_id, "configuration_ref": configuration, "part_refs": sorted(pair), "method": "world-aabb-separation/1",
                          "distance_m": separation, "threshold_m": threshold, "status": "review_required" if nearby else "bounds_separated", "review_ref": review_id if nearby else None})
        if not nearby:
            continue
        matches = _axis_matches(openings, base["features"], a, b, tolerance) + _axis_matches(openings, base["features"], b, a, tolerance)
        pin_matches = _pin_matches(base["mounting_sites"], base["features"], a, b, tolerance)
        site_refs = {s["id"] for match in pin_matches for s in match}
        site_refs |= {s for mount in references[pair] for participant in mount["participants"] for s in participant["site_refs"]}
        sites = [s for s in base["mounting_sites"] if s["id"] in site_refs]
        basis = ["source_bounds"]
        if observations[pair]:
            basis.append("source_reference_geometry")
        if references[pair]:
            basis.append("reference_mount")
        if matches:
            basis.append("coaxial_axis_opening")
        if pin_matches:
            basis.append("integral_pin_function_hypothesis")
        source_refs = sorted(set(a["sourceIds"] + b["sourceIds"]))
        evidence = sorted(set(a["evidenceIds"] + b["evidenceIds"]))
        if knowledge:
            source_refs.append(mounting.KNOWLEDGE_SOURCE); evidence.append(REQUEST_EVIDENCE)
        participants = []
        for part in (a, b):
            related_features = sorted({f for o in observations[pair] for p in o["participants"] if p["part_ref"] == part["id"] for f in p["feature_refs"]}
                                      | {f["id"] for _, f, _, _ in matches if f["owner_ref"] == part["id"]}
                                      | {ref for s in sites if s["owner_ref"] == part["id"] for ref in s["feature_refs"]})
            participants.append({"part_ref": part["id"], "feature_refs": related_features,
                                 "opening_refs": sorted({o["id"] for o, _, _, _ in matches if o["owner_ref"] == part["id"]}),
                                 "site_refs": [s["id"] for s in sites if s["owner_ref"] == part["id"]]})
        roles = [{"role": "location", "status": "reference_supported" if references[pair] else "hypothesis" if matches or pin_matches or observations[pair] else "unresolved",
                  "description": "分别核对源位姿中的孔轴、有限几何及已有参考映射；相邻或投影重叠不能代替定位结构。" + ("四个锥形特征中，本对实际对轴的柱仅作为定位用途推断，不能称为用户确认的完整接口。" if pin_matches else ""), "component_refs": [], "evidence_refs": list(evidence)},
                 {"role": "retention", "status": "unresolved", "description": "尚未由面投影或共轴证明保持、接合、螺钉规格及实际连接件；需要继续核对完整保持链。", "component_refs": [], "evidence_refs": list(evidence)},
                 {"role": "motion", "status": "unresolved", "description": "舵机壳体、输出舵盘、惰轮、轴承及支架的活动归属分别待核定；源网格可能合并舵盘外形，来源 body／hinge 不证明物理固定。", "component_refs": [], "evidence_refs": list(evidence)}]
        if any(p["kind"] == "bearing" or "rigidity" in p["meshKey"] for p in (a, b)):
            roles[0]["description"] = "本对涉及轴承或加强板，应核查轴／孔、承接面和中间件；来源近接只标明需审查，不能自动定义支承或固定接口。"
        alternatives = [{"id": "unresolved-retention", "label": "保持方式待核查", "status": "unverified", "component_refs": [], "requirements": ["本设备装配／BOM 依据", "有限配合与保持结构", "活动框架归属"]}]
        # Source meshes may include the horn or idler in a single actuator
        # visual. Show a possible third-body chain without inventing real Parts.
        thigh_matches = [(o, f, d, x) for o, f, d, x in matches if next(p for p in (a, b) if p["id"] == o["owner_ref"])["meshKey"] in ("upper_leg_left", "upper_leg_right")
                         and next(p for p in (a, b) if p["id"] == f["owner_ref"])["meshKey"] == "xl330" and o["geometry"]["radius_m"] >= .0025]
        if thigh_matches:
            roles[0]["description"] = "两处大圆开口分别与相邻两台舵机的中心轴对齐；同轴圆孔及座面、锥柱定位推断和中央保持候选应分开分析，不能用整面重叠或四柱代替完整连接链。"
            if knowledge and knowledge["connection_review"]["manufacturer_source_refs"]:
                documents = knowledge["connection_review"]["manufacturer_source_refs"]
                doc_evidence = ["evidence:microduck:supporting-document:" + doc for doc in documents]
                outer = max(thigh_matches, key=lambda m: abs(mechanics._dot(m[0]["geometry"]["center"], m[0]["geometry"]["normal"])))[0]
                owner = next(p for p in (a, b) if p["id"] == outer["owner_ref"])
                point = semantics._world_point(owner, outer["geometry"]["center"])
                outward = mechanics._rotate(outer["geometry"]["normal"], owner["quaternion"])
                inward = [-v for v in outward]
                ids = ["supplement:" + device + ":" + token + ":axis-screw", "supplement:" + device + ":" + token + ":idler-cap"]
                supplement_evidence = evidence + doc_evidence
                # The illustrative cap sits OUTSIDE the selected opening;
                # its center is halfway through its own thickness. Screw
                # shafts start at the outer cap face and point inward.
                cap_thickness = .0015
                supplements.append(_supplement(ids[0], review_id, "轴心保持螺钉 · 待确认示意", "screw", [point[i] - inward[i] * cap_thickness for i in range(3)], inward, source_refs + documents, supplement_evidence))
                supplements.append(_supplement(ids[1], review_id, "压盖／惰轮盖 · 待确认示意", "cap", [point[i] - inward[i] * cap_thickness / 2 for i in range(3)], inward, source_refs + documents, supplement_evidence))
                alternatives = [{"id": "manufacturer-idler-retaining-option", "label": "惰轮盖与中央螺钉候选", "status": "unverified", "component_refs": ids,
                                 "requirements": ["厂家通用示例不证明 Microduck 实际采用", "核对惰轮／舵盘归属与具体零件", "核对尺寸、螺纹、保持及允许运动"]},
                                {"id": "access-or-clearance-opening", "label": "轴端／工具通道或其他固定方案", "status": "unverified", "component_refs": [], "requirements": ["本设备 CAD 或装配依据"]}]
                roles[1]["component_refs"] = ids
                roles[1]["evidence_refs"] = sorted(set(supplement_evidence))
                source_refs = sorted(set(source_refs + documents)); evidence = sorted(set(supplement_evidence))
        if references[pair] and knowledge:
            site_map = {s["id"]: s for s in base["mounting_sites"]}
            part_map = {p["id"]: p for p in (a, b)}
            feature_map = {f["id"]: f for f in base["features"]}
            documents = knowledge["connection_review"]["manufacturer_source_refs"]
            generic_evidence = ["evidence:microduck:supporting-document:" + doc for doc in documents]
            connector_ids = []
            for mount in references[pair]:
                for number, path in enumerate(mount["site_pairs"], 1):
                    member_sites = [site_map[s] for s in path["site_refs"]]
                    entry = next((s for s in member_sites if s["role"] == "bracket_mount"), member_sites[-1])
                    owner = part_map[entry["owner_ref"]]
                    point = semantics._world_point(owner, entry["position"])
                    axis = mechanics._rotate(entry["entry_direction"], owner["quaternion"])
                    identifier = "supplement:" + device + ":" + token + ":reference-screw-" + mounting._token(mount["id"] + ":" + "|".join(path["site_refs"]))
                    component = _supplement(identifier, review_id, "参考双孔紧固件路径 " + str(number) + " · 待确认示意", "screw", point, axis, source_refs + documents, evidence + generic_evidence)
                    radii = [feature_map[ref]["geometry"]["radius_m"] for site in member_sites for ref in site["feature_refs"] if feature_map[ref]["geometry"]["type"] == "cylinder"]
                    component["geometry"].update(shaft_radius_m=min(radii) if radii else .001, head_radius_m=.0019)
                    component["parameter_basis"] = "reference_role_with_illustrative_dimensions"
                    supplements.append(component); connector_ids.append(identifier)
            roles[1]["component_refs"] = connector_ids
            roles[1]["description"] = "已有标准参考关系明确了双孔对应及未绑定紧固件角色；暂按配对孔径及厂家一般框架装配示例绘出路径，实际型号、尺寸、螺纹和保持状态仍未知。"
            roles[1]["evidence_refs"] = sorted(set(evidence + generic_evidence))
            alternatives = [{"id": "reference-unbound-fastener-paths", "label": "参考安装的未绑定紧固件路径", "status": "unverified", "component_refs": connector_ids,
                             "requirements": ["实际紧固件身份和规格", "允许长度及保持结构", "工程与装配路径核定"]}]
            source_refs = sorted(set(source_refs + documents)); evidence = sorted(set(evidence + generic_evidence))
        reviews.append({"id": review_id, "configuration_ref": configuration, "screening_ref": screen_id, "status": "reference_supported" if references[pair] else "unresolved",
                        "participants": participants, "basis": basis, "geometry_observation_refs": [o["id"] for o in observations[pair]], "reference_mount_refs": [r["id"] for r in references[pair]],
                        "role_paths": roles, "alternatives": alternatives, "assessments": {k: "unknown" for k in ("mechanical", "engineering", "task", "completion")},
                        "missing_requirements": ["实际保持机制和中间参与件", "本设备装配及紧固件规格", "轴承／舵盘／轴的活动框架映射", "路径、载荷、工程及完成状态验证"],
                        "source_refs": sorted(set(source_refs)), "evidence_refs": sorted(set(evidence))})
    return screening, reviews, supplements


def augment_analysis(base, scene, package_root, assembly_knowledge=None):
    root = Path(package_root)
    result = mounting.augment_analysis(base, scene, root, None)
    features, sites = patterns._pin_features(scene, root)
    result["features"].extend(features); result["mounting_sites"].extend(sites)
    if assembly_knowledge is not None:
        validate_knowledge(assembly_knowledge)
        if {p["id"].split(":")[1] for p in scene["parts"]} != {assembly_knowledge["device_id"]}:
            raise ValueError("Connection review declaration belongs to another device")
        source = next((s for s in scene["sources"] if s["id"] == mounting.KNOWLEDGE_SOURCE), None)
        if source is None:
            raise ValueError("Connection review requires a captured assertion source")
        raw = mechanics._asset(root, source["url"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["digest"].removeprefix("sha256:") or json.loads(raw) != assembly_knowledge:
            raise ValueError("Connection review declaration differs from captured source")
        required = {mounting.KNOWLEDGE_EVIDENCE, REQUEST_EVIDENCE} | {"evidence:microduck:mounting-assertion:" + a["id"] for a in assembly_knowledge["mounting_assertions"]}
        required |= {"evidence:microduck:supporting-document:" + d["id"] for d in assembly_knowledge["supporting_documents"]}
        if not required <= {e["id"] for e in scene.get("evidence", [])}:
            raise ValueError("Every connection claim and supporting document requires its captured evidence")
        source_map = {s["id"]: s for s in scene["sources"]}
        for document in assembly_knowledge["supporting_documents"]:
            captured = source_map.get(document["id"])
            if captured is None or captured["digest"].removeprefix("sha256:") != document["sha256"] or hashlib.sha256(mechanics._asset(root, captured["url"]).read_bytes()).hexdigest() != document["sha256"]:
                raise ValueError("Supporting manufacturer document differs from captured bytes")
        legacy = patterns._legacy_knowledge(_legacy_assertions(assembly_knowledge))
        interfaces, families = mounting._family_interfaces(result, scene, legacy, result["mounting_sites"])
        references = mounting._reference_mounts(result, scene, legacy, result["mounting_sites"], interfaces, families)
        for interface in interfaces:
            interface["label"] = "舵机壳体安装孔位" if interface["role"] == "housing_mount" else "连杆中部双孔安装位"
        interfaces.extend(patterns._asserted_interfaces(result, scene, _legacy_assertions(assembly_knowledge), result["mounting_sites"]))
        inferred = {a["id"] for a in assembly_knowledge["mounting_assertions"] if a["assertion_basis"] == "project_inference"}
        for record in result["mounting_sites"] + interfaces:
            if inferred.intersection(record["assertion_refs"]):
                record["status"] = "project_inferred"
        result.update(mounting_interfaces=interfaces, reference_mounts=references)
    openings, cavities, bounds = _opening_records(scene, root)
    screening, reviews, supplements = _pair_reviews(result, scene, openings, bounds, assembly_knowledge)
    result.update(circular_openings=openings, passage_hypotheses=cavities, pair_screenings=screening, connection_reviews=reviews, supplemental_components=supplements)
    result["analysis"].update(method=METHOD, features_count=len(result["features"]), mounting_sites_count=len(result["mounting_sites"]),
                              mounting_interfaces_count=len(result["mounting_interfaces"]), reference_mounts_count=len(result["reference_mounts"]),
                              **{name + "_count": len(result[name]) for name in ("circular_openings", "passage_hypotheses", "pair_screenings", "connection_reviews", "supplemental_components")})
    result["analysis"]["coverage"]["primitive_types"].extend(["conical_frustum", "circular_inner_boundary", "variable_radius_cavity"])
    result["analysis"]["limitations"].extend([
        "All source Part pairs are screened by world AABB separation at the fixed source configuration; this is broad-phase coverage, not complete mechanical connection discovery.",
        "Circular openings retain real finite inner contours; cavity records witness connected source surface patches, not a certified solid-volume passage, screw thread or installation role.",
        "Integral-pin mounting function is project inference; the user statement only reports a missing interface and cannot certify each feature role.",
        "Surface overlap is auxiliary geometry only. Location, retention, intermediate participants and active motion frames are reviewed separately with unknown mechanical assessments.",
        "Supplemental screw and cap geometry is an unconfirmed synthetic illustration of a manufacturer-general option, not a source Part, confirmed Microduck BOM, installation instruction or completed connection."])
    return result


def analysis_for(scene, package_root, assembly_knowledge=None):
    return augment_analysis(semantics.analysis_for(scene, package_root), scene, package_root, assembly_knowledge)


# Profile 1.6 above is frozen. The following correction is only dispatched by
# source-model/1.7, so historical manifests retain their exact replay semantics.
PIN_FIT_METHOD = "source-pose-pin-housing-fit/1"


def _uniform_scale(part):
    scale = part.get("scale", [1., 1., 1.])
    if len(scale) != 3 or min(scale) <= 0 or max(scale) - min(scale) > 1e-10:
        return None
    return scale[0]


def measure_pin_hole_pair(pin, hole, features, participants):
    """Measure finite cone/bore overlap, without a retaining or press-fit claim."""
    pin_part, hole_part = participants[pin["owner_ref"]], participants[hole["owner_ref"]]
    pin_scale, hole_scale = _uniform_scale(pin_part), _uniform_scale(hole_part)
    if pin_scale is None or hole_scale is None or len(pin["feature_refs"]) != 1:
        return None
    pin_feature = features[pin["feature_refs"][0]]
    geometry = pin_feature["geometry"]
    if geometry["type"] != "conical_frustum":
        return None
    base = semantics._world_point(pin_part, geometry["origin"])
    tip = semantics._world_point(pin_part, [geometry["origin"][i] + geometry["axis"][i] * geometry["length_m"] for i in range(3)])
    vector = mechanics._sub(tip, base)
    length = mechanics._length(vector)
    if length <= 0:
        return None
    axis = [v / length for v in vector]
    entry = semantics._world_point(hole_part, hole["position"])
    hole_axis = mechanics._rotate(hole["entry_direction"], hole_part["quaternion"])
    magnitude = mechanics._length(hole_axis)
    hole_axis = [v / magnitude for v in hole_axis]
    cosine = max(-1., min(1., mechanics._dot(axis, hole_axis)))
    angle = math.acos(cosine)
    distance, _ = _axis_distance(base, entry, hole_axis)
    candidates = []
    for ref in hole["feature_refs"]:
        feature = features[ref]
        cylinder = feature["geometry"]
        if feature["kind"] != "bore_wall" or cylinder["type"] != "cylinder":
            continue
        endpoints = [semantics._world_point(hole_part, [cylinder["origin"][i] + cylinder["axis"][i] * value for i in range(3)]) for value in cylinder["axial_range_m"]]
        positions = sorted(mechanics._dot(mechanics._sub(point, base), axis) for point in endpoints)
        low, high = max(0., positions[0]), min(length, positions[1])
        if high <= low:
            continue
        radius = cylinder["radius_m"] * hole_scale
        r0, r1 = geometry["radius_start_m"] * pin_scale, geometry["radius_end_m"] * pin_scale
        entry_radius = r0 + (r1 - r0) * low / length
        end_radius = r0 + (r1 - r0) * high / length
        candidates.append((high - low, ref, low, high, radius, entry_radius, end_radius))
    if not candidates:
        return None
    overlap, ref, low, high, radius, entry_radius, end_radius = max(candidates)
    return {"pin_site_ref": pin["id"], "hole_site_ref": hole["id"], "pin_feature_ref": pin_feature["id"], "hole_feature_refs": [ref],
            "geometry": {"frame": "world", "pin_base": base, "pin_tip": tip, "pin_axis": axis, "hole_entry": entry, "hole_axis": hole_axis,
                         "overlap_start": [base[i] + axis[i] * low for i in range(3)], "overlap_end": [base[i] + axis[i] * high for i in range(3)]},
            "measurements": {"basis": "calculated_from_source_geometry", "unit": "m", "axis_distance_m": distance, "axis_angle_rad": angle,
                             "insertion_length_m": overlap, "hole_diameter_m": 2 * radius, "pin_diameter_at_entry_m": 2 * entry_radius,
                             "pin_diameter_at_overlap_end_m": 2 * end_radius, "pin_tip_diameter_m": 2 * geometry["radius_end_m"] * pin_scale,
                             "radial_clearance_at_entry_m": radius - entry_radius, "radial_clearance_at_overlap_end_m": radius - end_radius}}


def pin_hole_fit_records(base, scene, tolerance=patterns.FIT_M):
    """One measured two-site reference group for each actual opposing Part pair."""
    parts = {part["id"]: part for part in scene["parts"]}
    features = {feature["id"]: feature for feature in base["features"]}
    sites = {site["id"]: site for site in base["mounting_sites"]}
    records = []
    for review in base["connection_reviews"]:
        a, b = [parts[participant["part_ref"]] for participant in review["participants"]]
        grouped = defaultdict(list)
        owner_ids = {a["id"], b["id"]}
        for pin in sites.values():
            if pin["owner_ref"] not in owner_ids or pin.get("site_kind") != "integral_pin" or pin["role"] != "mounting_feature":
                continue
            for hole in sites.values():
                if hole["owner_ref"] not in owner_ids or hole["owner_ref"] == pin["owner_ref"] or hole["role"] != "housing_mount":
                    continue
                measured = measure_pin_hole_pair(pin, hole, features, parts)
                if measured is not None and measured["measurements"]["axis_angle_rad"] <= math.radians(.1) and measured["measurements"]["axis_distance_m"] <= tolerance:
                    grouped[(pin["owner_ref"], hole["owner_ref"])].append(measured)
        for (pin_owner, hole_owner), pairs in grouped.items():
            # A two-member measured correspondence is a reference grouping,
            # not a minimum-count rule or an allowed physical selection set.
            if len(pairs) != 2 or len({p["pin_site_ref"] for p in pairs}) != 2 or len({p["hole_site_ref"] for p in pairs}) != 2:
                continue
            pairs.sort(key=lambda pair: pair["pin_site_ref"])
            pin_spacing = mechanics._length(mechanics._sub(pairs[0]["geometry"]["pin_tip"], pairs[1]["geometry"]["pin_tip"]))
            hole_spacing = mechanics._length(mechanics._sub(pairs[0]["geometry"]["hole_entry"], pairs[1]["geometry"]["hole_entry"]))
            pin_part, hole_part = parts[pin_owner], parts[hole_owner]
            token = mounting._token(PIN_FIT_METHOD + ":" + "|".join(pair["pin_site_ref"] + ":" + pair["hole_site_ref"] for pair in pairs))
            device = pin_owner.split(":")[1]
            participants = [
                {"part_ref": pin_owner, "role": "pin_carrier", "site_refs": [p["pin_site_ref"] for p in pairs], "feature_refs": [p["pin_feature_ref"] for p in pairs]},
                {"part_ref": hole_owner, "role": "housing_hole_carrier", "site_refs": [p["hole_site_ref"] for p in pairs],
                 "feature_refs": sorted({ref for pair in pairs for ref in pair["hole_feature_refs"]})}]
            records.append({"id": "pin-hole-fit:" + device + ":" + token, "review_ref": review["id"], "configuration_ref": review["configuration_ref"],
                            "status": "source_pose_geometric_fit", "inference_scope": "installation_location_only",
                            "grouping": {"kind": "reference_pair", "selection_status": "unknown"}, "participants": participants, "pairs": pairs,
                            "measurements": {"basis": "calculated_from_source_geometry", "unit": "m", "member_count": 2,
                                             "pin_spacing_m": pin_spacing, "hole_spacing_m": hole_spacing, "spacing_error_m": abs(pin_spacing - hole_spacing)},
                            "assessments": {"location": "geometric_support", **{key: "unknown" for key in ("retention", "load_capacity", "mechanical", "engineering", "task", "completion")}},
                            "source_refs": sorted(set(pin_part["sourceIds"] + hole_part["sourceIds"])),
                            "evidence_refs": sorted(set(pin_part["evidenceIds"] + hole_part["evidenceIds"])),
                            "unresolved_requirements": ["The measured pair supports an installation-location inference only; it does not establish a retaining, load-bearing or completed connection.",
                                                        "Source reference placement and cone/bore dimensions do not establish a press fit, friction coefficient, snap action or resistance to withdrawal.",
                                                        "The two observed members do not define minimum-count, allowed-subset or actual-engagement rules.",
                                                        "Outer coaxial openings and manufacturer-general screw/cap examples are excluded from this pin/housing location evidence.",
                                                        "Physical tolerances, material, active frames, retention, loads and assembly path require separate evidence."]})
    return sorted(records, key=lambda record: record["id"])


def correct_pin_hole_analysis(base, scene, tolerance=patterns.FIT_M):
    """Apply 1.7 authority boundaries without changing frozen 1.6 helpers."""
    result = deepcopy(base)
    fits = pin_hole_fit_records(result, scene, tolerance)
    fits_by_review = defaultdict(list)
    for record in fits:
        fits_by_review[record["review_ref"]].append(record)
    components = {component["id"]: component for component in result["supplemental_components"]}
    for review in result["connection_reviews"]:
        reference = {ref for role in review["role_paths"] if role["role"] == "retention" and review["reference_mount_refs"] for ref in role["component_refs"]}
        for component in components.values():
            if component["review_ref"] == review["id"]:
                component["usage"] = "reference_connector" if component["id"] in reference else "unverified_alternative"
        for role in review["role_paths"]:
            role["component_refs"] = [ref for ref in role["component_refs"] if components[ref]["usage"] == "reference_connector"]
            if role["role"] == "retention" and not role["component_refs"]:
                role["status"] = "unresolved"
                role["description"] = "保持方式尚未知；相向面、圆洞同轴和厂家通用示例不能证明本设备采用轴心螺钉、压盖或实际抗拔结构。"
        unverified = {c["id"] for c in components.values() if c["review_ref"] == review["id"] and c["usage"] == "unverified_alternative"}
        referenced_alternatives = {ref for alternative in review["alternatives"] for ref in alternative["component_refs"]}
        missing = sorted(unverified - referenced_alternatives)
        if missing:
            review["alternatives"].append({"id": "unverified-manufacturer-illustration", "label": "厂家通用固定件示例 · 与本连接实际保持方式无绑定", "status": "unverified",
                                           "component_refs": missing, "requirements": ["本设备原始装配和实际零件依据", "独立验证保持、尺寸、螺纹和运动归属"]})
        if fits_by_review[review["id"]]:
            review["basis"] = [basis for basis in review["basis"] if basis != "coaxial_axis_opening"]
            if "pin_hole_source_fit" not in review["basis"]:
                review["basis"].append("pin_hole_source_fit")
            for role in review["role_paths"]:
                if role["role"] == "location":
                    role.update(status="hypothesis", description="两根一体锥柱分别与同台舵机的两个壳体孔在来源位姿下配对；有限插入和径向间隙支持安装定位用途推断，不能证明过盈、保持或承载。外侧圆洞仅保留为用途未知的几何。",
                                component_refs=[], evidence_refs=sorted({ref for fit in fits_by_review[review["id"]] for ref in fit["evidence_refs"]}))
        elif not review["reference_mount_refs"]:
            review["basis"] = [basis for basis in review["basis"] if basis != "integral_pin_function_hypothesis"]
            for role in review["role_paths"]:
                if role["role"] == "location":
                    role.update(status="unresolved", description="来源近接、圆洞同轴或未获功能角色的一体柱均仅为几何观察；实际用途及是否参与定位或保持待设备资料核实，厂家通用方案不构成本连接依据。", component_refs=[])
    result["pin_hole_fits"] = fits
    result["analysis"].update(method=PIN_FIT_METHOD, pin_hole_fits_count=len(fits))
    result["analysis"]["limitations"].extend([
        "Pin/housing groups are finite source-pose one-to-one measurements, not physical selection rules, press-fit assertions, load approval or completed connections.",
        "Circular cone/bore dimensions currently require positive uniform source scale; unsupported transforms remain unresolved.",
        "Outer coaxial circular openings have unresolved function and are not members or location warrants of pin/housing groups.",
        "Unverified alternative supplemental components are not used in a connection role; reference connectors remain illustrative unbound reference paths."])
    return result


def analysis_for_v17(scene, package_root, assembly_knowledge=None):
    tolerance = assembly_knowledge["connection_review"]["axis_alignment_tolerance_m"] if assembly_knowledge else patterns.FIT_M
    return correct_pin_hole_analysis(analysis_for(scene, package_root, assembly_knowledge), scene, tolerance)


def analysis_for_v18(scene, package_root, assembly_knowledge=None):
    from .connector_paths import augment_analysis
    return augment_analysis(analysis_for_v17(scene, package_root, assembly_knowledge), scene)
