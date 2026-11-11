"""Finite planar geometry for source-model 1.2, independent of body grouping.

The frozen 1.1 cylinder analysis is retained verbatim. Added plane patches have
source triangle witnesses and complete outer/inner boundary loops. A surface
pair requires opposed finite planes *and* actual triangle-region intersection.
Neither contact candidates nor local translation halfspaces prove assembly,
snap retention, a reachable path, elasticity, friction or engineering fitness.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
from itertools import product
import math
from pathlib import Path

from . import mechanics

METHOD = "finite-surface-and-cylinder-patches/1"
PLANE_METHOD = "finite-planar-patches/1"
FIT_M = 1e-6
MIN_PATCH_AREA_M2 = 5e-7
MIN_OVERLAP_AREA_M2 = 2.5e-7
NORMAL_ANGLE_RAD = math.radians(.1)
PLANE_GAP_M = 5e-5
CONTACT_GAP_M = 2e-6
_PLANAR_CACHE: dict[str, dict] = {}


def _area_vector(vertices):
    a, b, c = vertices
    return mechanics._cross(mechanics._sub(b, a), mechanics._sub(c, a))


def _boundary_loops(vertices, faces, selected):
    edges = defaultdict(list)
    for triangle in selected:
        face = faces[triangle]
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append((a, b))
    outgoing, incoming = defaultdict(list), defaultdict(list)
    for pair in edges.values():
        if len(pair) == 1:
            a, b = pair[0]
            outgoing[a].append(b)
            incoming[b].append(a)
        elif len(pair) != 2 or pair[0] != pair[1][::-1]:
            return None
    if not outgoing or any(len(v) != 1 for v in outgoing.values()) or any(len(v) != 1 for v in incoming.values()):
        return None
    if set(outgoing) != set(incoming):
        return None
    remaining = set(outgoing)
    loops = []
    while remaining:
        first = min(remaining)
        current, loop = first, []
        while current in remaining:
            remaining.remove(current)
            loop.append(list(vertices[current]))
            current = outgoing[current][0]
        if current != first or len(loop) < 3:
            return None
        loop.append(list(vertices[first]))
        loops.append(loop)
    return loops


def _orientation(vertices, faces):
    """Conservative outward-winding precondition for local material halfspaces."""
    edges = defaultdict(list)
    for triangle, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append((triangle, a, b))
    if any(len(pair) != 2 or pair[0][1:] != pair[1][1:][::-1] for pair in edges.values()):
        return False
    adjacency = [[] for _ in faces]
    for pair in edges.values():
        a, b = pair[0][0], pair[1][0]
        adjacency[a].append(b)
        adjacency[b].append(a)
    remaining = set(range(len(faces)))
    while remaining:
        seed = min(remaining)
        remaining.remove(seed)
        stack, volume = [seed], 0.
        while stack:
            triangle = stack.pop()
            a, b, c = (vertices[v] for v in faces[triangle])
            volume += mechanics._dot(a, mechanics._cross(b, c)) / 6
            for neighbor in adjacency[triangle]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    stack.append(neighbor)
        # Negative separate cavity shells may be valid, but need a containment
        # analysis; this narrow assessment deliberately returns unknown for them.
        if volume <= 1e-15:
            return False
    return bool(faces)


def _planar_mesh(raw):
    digest = hashlib.sha256(raw).hexdigest()
    key = PLANE_METHOD + ":" + digest
    if key in _PLANAR_CACHE:
        return _PLANAR_CACHE[key]
    vertices, faces, normals, adjacency = mechanics._mesh(raw)
    areas = [mechanics._length(_area_vector([vertices[v] for v in face])) / 2 for face in faces]
    cylindrical = {t for feature in mechanics._extract(raw)["features"] for t in feature["triangles"]}
    # A tessellated cylinder strip is also a pair of coplanar triangles. Its
    # already-recognized wall belongs to the cylindrical primitive; preserve
    # adjacent caps and annular seating faces for the planar pass.
    available = {i for i, area in enumerate(areas) if area > 1e-18 and i not in cylindrical}
    patches = []
    cosine = math.cos(math.radians(.05))
    for seed in sorted(available, key=lambda i: (-areas[i], i)):
        if seed not in available:
            continue
        available.remove(seed)
        seed_normal = normals[seed]
        seed_point = vertices[faces[seed][0]]
        stack, patch = [seed], []
        while stack:
            triangle = stack.pop()
            patch.append(triangle)
            for neighbor in adjacency[triangle]:
                if neighbor not in available or mechanics._dot(seed_normal, normals[neighbor]) < cosine:
                    continue
                if any(abs(mechanics._dot(seed_normal, mechanics._sub(vertices[v], seed_point))) > FIT_M for v in faces[neighbor]):
                    continue
                available.remove(neighbor)
                stack.append(neighbor)
        area = sum(areas[t] for t in patch)
        if len(patch) < 2 or area < MIN_PATCH_AREA_M2:
            continue
        vector = [sum(normals[t][i] * areas[t] for t in patch) for i in range(3)]
        magnitude = mechanics._length(vector)
        if magnitude < 1e-18:
            continue
        normal = [v / magnitude for v in vector]
        origin = [sum(sum(vertices[v][i] for v in faces[t]) / 3 * areas[t] for t in patch) / area for i in range(3)]
        support = {v for t in patch for v in faces[t]}
        distances = [abs(mechanics._dot(normal, mechanics._sub(vertices[v], origin))) for v in support]
        maximum = max(distances)
        if maximum > 2 * FIT_M:
            continue
        loops = _boundary_loops(vertices, faces, patch)
        if loops is None:
            continue
        patches.append({"origin": origin, "normal": normal, "area": area, "triangles": sorted(patch), "loops": loops,
                        "rms": math.sqrt(sum(d * d for d in distances) / len(distances)), "maximum": maximum})
    patches.sort(key=lambda p: (p["normal"], p["origin"], p["triangles"]))
    result = {"digest": digest, "vertices": vertices, "faces": faces, "patches": patches,
              "outward_orientation_supported": _orientation(vertices, faces)}
    _PLANAR_CACHE[key] = result
    return result


def _world_patch(feature, part, mesh):
    scale = part.get("scale", [1., 1., 1.])
    if len(scale) != 3 or any(not math.isfinite(v) or abs(v) < 1e-12 for v in scale):
        return None
    def point(local):
        rotated = mechanics._rotate([local[i] * scale[i] for i in range(3)], part["quaternion"])
        return [rotated[i] + part["position"][i] for i in range(3)]
    geometry = feature["geometry"]
    normal = mechanics._rotate([geometry["normal"][i] / scale[i] for i in range(3)], part["quaternion"])
    normal_length = mechanics._length(normal)
    normal = [v / normal_length for v in normal]
    local_vertices = mesh["vertices"]
    selected = geometry["triangle_indices"]
    world_vertices = {v: point(local_vertices[v]) for t in selected for v in mesh["faces"][t]}
    triangles = [[world_vertices[v] for v in mesh["faces"][t]] for t in selected]
    values = list(world_vertices.values())
    return {"feature": feature, "part": part, "normal": normal, "origin": point(geometry["origin"]),
            "triangles": triangles, "vertices": values,
            "bounds": [(min(v[i] for v in values), max(v[i] for v in values)) for i in range(3)],
            "outward_orientation_supported": mesh["outward_orientation_supported"]}


def _signed_area(polygon):
    return sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(polygon, polygon[1:] + polygon[:1])) / 2 if len(polygon) >= 3 else 0.


def _side(a, b, point):
    return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])


def _intersection_area(subject, clipping):
    """Convex triangle clipping; holes stay absent because we sum triangles."""
    if _signed_area(clipping) < 0:
        clipping = clipping[::-1]
    for a, b in zip(clipping, clipping[1:] + clipping[:1]):
        if not subject:
            return 0.
        output = []
        previous = subject[-1]
        previous_side = _side(a, b, previous)
        for current in subject:
            current_side = _side(a, b, current)
            if (current_side >= 0) != (previous_side >= 0):
                fraction = previous_side / (previous_side - current_side)
                output.append((previous[0] + fraction * (current[0] - previous[0]), previous[1] + fraction * (current[1] - previous[1])))
            if current_side >= 0:
                output.append(current)
            previous, previous_side = current, current_side
        subject = output
    return abs(_signed_area(subject))


def _projected_triangles(patch, drop):
    key = "projected-" + str(drop)
    if key not in patch:
        projected = []
        radial = [i for i in range(3) if i != drop]
        for triangle in patch["triangles"]:
            polygon = [(v[radial[0]], v[radial[1]]) for v in triangle]
            projected.append((polygon, [(min(v[i] for v in polygon), max(v[i] for v in polygon)) for i in range(2)]))
        patch[key] = projected
    return patch[key]


def _surface_pair(left, right):
    cosine = max(-1., min(1., mechanics._dot(left["normal"], right["normal"])))
    if cosine > -math.cos(NORMAL_ANGLE_RAD):
        return None
    if any(left["bounds"][i][1] < right["bounds"][i][0] - PLANE_GAP_M or
           right["bounds"][i][1] < left["bounds"][i][0] - PLANE_GAP_M for i in range(3)):
        return None
    gap = max(max(abs(mechanics._dot(left["normal"], mechanics._sub(v, left["origin"]))) for v in right["vertices"]),
              max(abs(mechanics._dot(right["normal"], mechanics._sub(v, right["origin"]))) for v in left["vertices"]))
    if gap > PLANE_GAP_M:
        return None
    drop = max(range(3), key=lambda i: abs(left["normal"][i]))
    overlap = 0.
    for polygon_a, bounds_a in _projected_triangles(left, drop):
        for polygon_b, bounds_b in _projected_triangles(right, drop):
            if any(bounds_a[i][1] < bounds_b[i][0] or bounds_b[i][1] < bounds_a[i][0] for i in range(2)):
                continue
            overlap += _intersection_area(polygon_a[:], polygon_b[:])
    overlap /= abs(left["normal"][drop])
    if overlap < MIN_OVERLAP_AREA_M2:
        return None
    return {"feature_refs": [left["feature"]["id"], right["feature"]["id"]], "overlap_area_m2": overlap,
            "plane_gap_m": gap, "normal_angle_rad": math.acos(cosine)}


def _direction_assessment(part, left_patches, right_patches, pairs):
    supported = bool(left_patches) and bool(right_patches) and all(p["outward_orientation_supported"] for p in (*left_patches.values(), *right_patches.values()))
    near = {pair["feature_refs"][0] for pair in pairs if pair["plane_gap_m"] <= CONTACT_GAP_M}
    directions = []
    for axis in range(3):
        for sign in (1., -1.):
            vector = [sign if i == axis else 0. for i in range(3)]
            blocking = sorted(feature for feature in near if mechanics._dot(left_patches[feature]["normal"], vector) > 1e-6) if supported else []
            directions.append({"vector": vector, "result": "unknown" if not supported else "locally_blocked" if blocking else "not_blocked_by_selected_surfaces",
                               "blocking_feature_refs": blocking})
    return {"status": "partial" if supported else "unknown", "basis": "reference-planar-normal-halfspaces", "moving_part_ref": part,
            "frame": "world", "directions": directions,
            "limitations": ["Only selected near-coplanar source-reference surfaces with gap at most 2 micrometres are considered, as an explicit numerical near-contact approximation rather than established physical contact.",
                            "Outward normals require a closed consistently wound mesh with positive signed volume for every connected shell; otherwise results are unknown.",
                            "A local normal halfspace is not a swept-volume test, reachable insertion/removal path, collision clearance, snap engagement or retaining-force result.",
                            "Rotations, other surfaces, material compliance, friction and tolerances are not evaluated."]}


def _nearby_pairs(worlds):
    """Spatial broad phase only; every yielded pair still needs exact clipping."""
    if not worlds:
        return
    span = max(max(p["bounds"][i][1] for p in worlds) - min(p["bounds"][i][0] for p in worlds) for i in range(3))
    cell_size = max(1e-4, span / 32)
    grid = defaultdict(list)
    for i, patch in enumerate(worlds):
        cells = [range(math.floor((a - PLANE_GAP_M) / cell_size), math.floor((b + PLANE_GAP_M) / cell_size) + 1)
                 for a, b in patch["bounds"]]
        keys = list(product(*cells))
        possible = set()
        for key in keys:
            possible.update(grid[key])
        for j in sorted(possible):
            previous = worlds[j]
            if previous["part"]["id"] != patch["part"]["id"]:
                yield previous, patch
        for key in keys:
            grid[key].append(i)


def analysis_for(scene: dict, package_root: Path) -> dict:
    combined = mechanics.analysis_for(scene, package_root)
    root = Path(package_root)
    source_map = {source["url"]: source for source in scene["sources"]}
    worlds, local_meshes, part_by_id = [], {}, {part["id"]: part for part in scene["parts"]}
    plane_features = []
    for part in scene["parts"]:
        relative = part["geometryUrl"]
        if relative not in local_meshes:
            raw = mechanics._asset(root, relative).read_bytes()
            local_meshes[relative] = _planar_mesh(raw)
        mesh = local_meshes[relative]
        source = source_map[relative]
        if source["digest"].removeprefix("sha256:") != mesh["digest"]:
            raise ValueError("Planar feature geometry digest disagrees with source registry")
        suffix = part["id"].removeprefix("part:")
        for patch in mesh["patches"]:
            token = hashlib.sha256((PLANE_METHOD + ":" + mesh["digest"] + ":" + ",".join(map(str, patch["triangles"]))).encode()).hexdigest()[:12]
            feature = {"id": "feature:" + suffix + ":plane-" + token, "owner_ref": part["id"],
                       "frame_ref": "frame:" + suffix + ":source-mesh", "kind": "planar_patch",
                       "geometry_source_ref": source["id"], "geometry_digest": "sha256:" + mesh["digest"],
                       "geometry": {"type": "plane", "origin": list(patch["origin"]), "normal": list(patch["normal"]),
                                    "area_m2": patch["area"], "triangle_indices": list(patch["triangles"]),
                                    "boundary_loops": [[list(v) for v in loop] for loop in patch["loops"]]},
                       "measurement": {"basis": "calculated", "method": PLANE_METHOD, "fit_rms_m": patch["rms"],
                                       "fit_max_m": patch["maximum"], "coverage": 1.},
                       "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])}
            plane_features.append(feature)
            world = _world_patch(feature, part, mesh)
            if world:
                worlds.append(world)
    matches = defaultdict(list)
    world_by_feature = {world["feature"]["id"]: world for world in worlds}
    for left, right in _nearby_pairs(worlds):
        pair = _surface_pair(left, right)
        if pair:
            matches[(left["part"]["id"], right["part"]["id"])].append(pair)
    interfaces, candidates = [], []
    for (left_part, right_part), pairs in matches.items():
        pair_token = hashlib.sha256((left_part + "|" + right_part).encode()).hexdigest()[:16]
        left_refs = sorted({p["feature_refs"][0] for p in pairs})
        right_refs = sorted({p["feature_refs"][1] for p in pairs})
        normals = [world_by_feature[f]["normal"] for f in left_refs]
        # This describes opposed finite support surfaces in multiple directions;
        # it does not establish an insertion axis, undercut, snap or lock state.
        noncollinear = any(abs(mechanics._dot(a, b)) < math.cos(math.radians(30)) for a in normals for b in normals)
        opposed_sides = any(mechanics._dot(a, b) < -math.cos(math.radians(30)) for a in normals for b in normals)
        multiple_directions = noncollinear and opposed_sides
        mechanism = "guided_enclosure" if multiple_directions else "surface_seating"
        endpoints = []
        for owner, refs in ((left_part, left_refs), (right_part, right_refs)):
            part = part_by_id[owner]
            suffix = owner.removeprefix("part:")
            interface = {"id": "interface:" + suffix + ":surface-" + pair_token, "owner_ref": owner,
                         "frame_ref": "frame:" + suffix + ":source-mesh", "kind": "surface_fit", "feature_refs": refs,
                         "status": "candidate", "mechanism_candidates": [mechanism],
                         "unresolved_requirements": ["Finite source-reference surface overlap does not establish manufacturing fit, contact state, snap geometry or retention.",
                                                     "Insertion/removal paths, elastic deformation, friction and loads remain unverified."],
                         "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])}
            interfaces.append(interface)
            endpoints.append({"part_ref": owner, "interface_ref": interface["id"], "feature_refs": refs})
        left, right = part_by_id[left_part], part_by_id[right_part]
        device = left_part.split(":")[1]
        candidates.append({"id": "connection-candidate:" + device + ":surface-" + pair_token,
                           "configuration_ref": "configuration:" + device + ":source-qpos0", "endpoint_refs": endpoints,
                           "kind": "surface_fit", "status": "geometric_candidate", "surface_pairs": pairs,
                           "checks": [{"kind": "opposed_normals", "result": "pass", "residual": max(math.pi - p["normal_angle_rad"] for p in pairs), "threshold": NORMAL_ANGLE_RAD, "unit": "rad"},
                                      {"kind": "plane_gap", "result": "pass", "residual": max(p["plane_gap_m"] for p in pairs), "threshold": PLANE_GAP_M, "unit": "m"},
                                      {"kind": "finite_surface_overlap", "result": "pass", "residual": sum(p["overlap_area_m2"] for p in pairs), "threshold": MIN_OVERLAP_AREA_M2, "unit": "m2"}],
                           "direction_assessment": _direction_assessment(left_part, {f: world_by_feature[f] for f in left_refs},
                                                                         {f: world_by_feature[f] for f in right_refs}, pairs),
                           "unresolved_requirements": ["The matched finite surfaces are a reference-pose geometric candidate, not a confirmed InterfaceConnection.",
                                                       "Tabs, slots, undercuts, compliant snap action, assembly paths, retaining forces and engineering acceptance have not been solved."],
                           "source_refs": sorted(set(left["sourceIds"] + right["sourceIds"])),
                           "evidence_refs": sorted(set(left["evidenceIds"] + right["evidenceIds"]))})
    regions_examined = len(plane_features)
    published_planes = {feature for candidate in candidates for pair in candidate["surface_pairs"] for feature in pair["feature_refs"]}
    plane_features = [feature for feature in plane_features if feature["id"] in published_planes]
    combined["features"].extend(plane_features)
    combined["interfaces"].extend(interfaces)
    combined["connection_candidates"].extend(candidates)
    analysis = combined["analysis"]
    analysis.update({"method": METHOD, "features_count": len(combined["features"]), "interfaces_count": len(combined["interfaces"]),
                     "connection_candidates_count": len(combined["connection_candidates"])})
    planar_owners = {feature["owner_ref"] for feature in plane_features}
    owners = {feature["owner_ref"] for feature in combined["features"]}
    unparsed = ["slots_keys", "undercuts_shoulders", "threads_fasteners", "curved_mates", "snap_geometry", "elastic_retention", "assembly_paths", "electrical_interfaces", "engineering_limits"]
    analysis["coverage"].update({"primitive_types": ["cylinder", "plane"], "parts_with_features": len(owners),
                                 "parts_without_features": len(scene["parts"]) - len(owners),
                                 "planar_features_count": len(plane_features), "parts_with_planar_features": len(planar_owners),
                                 "planar_regions_examined_count": regions_examined,
                                 "unpaired_planar_regions_count": regions_examined - len(plane_features),
                                 "surface_interface_count": len(interfaces), "surface_candidate_count": len(candidates),
                                 "surface_pairs_count": sum(len(c["surface_pairs"]) for c in candidates),
                                 "feature_type_status": {"cylindrical_geometry": "partial", "planar_geometry": "partial", **{key: "not_analyzed" for key in unparsed}},
                                 "part_gaps": [{"part_ref": part["id"], "unresolved_types": list(unparsed)}
                                               for part in scene["parts"]]})
    analysis["limitations"].extend(["Plane patches need at least two connected triangles, finite traceable boundary loops, area at least 0.5 square millimetres and numerical planarity within 2 micrometres.",
                                    "Triangles already explained by the frozen cylindrical wall detector are excluded from planar patches; adjacent end faces are retained. Remaining planar facets are mesh geometry, not proof of an analytic CAD plane.",
                                    "Every source part is scanned, but only finite planar regions participating in a source-reference surface pair are published as plane Features; unpaired regions remain in the complete STL and do not establish the absence of an interface.",
                                    "Surface pairings use opposed normals, a maximum finite-support plane gap of 50 micrometres and triangle-region overlap of at least 0.25 square millimetres; bounds alone never establish a match.",
                                    "Plane area and boundaries are unscaled source-mesh-local values; pairing areas and local direction checks use the full source-reference world transform.",
                                    "Guided enclosure describes multi-direction finite surface geometry only; tabs, slots, undercuts, snap retention and elastic engagement remain not analyzed.",
                                    "All contacts are source-reference candidates; mesh self-intersections, collision-free paths, compliance and physical assembly state are not verified."])
    return combined
