"""Source geometry, logical passages and patterns without invented function.

This profile replays the frozen 1.2 numerical analysis, then explicitly removes
its ungrounded Interface/connection classification. Geometry and reference-pose
observations are retained. No mechanism, active rigid frame, fastener selection,
assembly path or successful engagement is inferred from proximity or patterns.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
import math
from pathlib import Path

from . import mechanics, surfaces

METHOD = "geometry-and-functional-separation/1"
TOPOLOGY_METHOD = "bore-boundaries-and-annular-shoulders/1"
PATTERN_METHOD = "coplanar-hole-patterns/1"
TOPOLOGY_TOLERANCE_M = 2e-6
_TOPOLOGY_CACHE = {}


def _token(value):
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def _edges(faces, selected):
    counts = defaultdict(int)
    for triangle in selected:
        face = faces[triangle]
        for a, b in zip(face, face[1:] + face[:1]):
            counts[tuple(sorted((a, b)))] += 1
    return {edge for edge, count in counts.items() if count == 1}


def _ordered_ring(edges, vertices):
    adjacent = defaultdict(list)
    for a, b in edges:
        adjacent[a].append(b)
        adjacent[b].append(a)
    if len(adjacent) < 3 or any(len(v) != 2 for v in adjacent.values()):
        return []
    first = min(adjacent)
    previous, current, ring = None, first, []
    while current not in ring:
        ring.append(current)
        following = [v for v in sorted(adjacent[current]) if v != previous]
        previous, current = current, following[0]
    if current != first or len(ring) != len(adjacent):
        return []
    return ring


def _loop_edges(loop, vertex_lookup):
    try:
        ids = [vertex_lookup[tuple(round(v / mechanics.WELD_M) for v in point)] for point in loop[:-1]]
    except KeyError:
        return set()
    return {tuple(sorted((a, b))) for a, b in zip(ids, ids[1:] + ids[:1])}


def _topology(raw):
    """Join walls only through an actual two-rim annular material shoulder."""
    digest = hashlib.sha256(raw).hexdigest()
    key = TOPOLOGY_METHOD + ":" + digest
    if key in _TOPOLOGY_CACHE:
        return _TOPOLOGY_CACHE[key]
    mesh = surfaces._planar_mesh(raw)
    vertices, faces = mesh["vertices"], mesh["faces"]
    walls = [p for p in mechanics._extract(raw)["features"] if p["kind"] == "bore_wall"]
    edge_faces = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edge_faces[tuple(sorted((a, b)))].append(i)
    lookup = {tuple(round(v / mechanics.WELD_M) for v in point): i for i, point in enumerate(vertices)}
    ends = []
    for index, wall in enumerate(walls):
        boundary = _edges(faces, wall["triangles"])
        support = set(wall["triangles"])
        axis = wall["axis_index"]
        for sign in (-1, 1):
            coordinate = wall["origin"][axis] + sign * wall["length"] / 2
            selected = {edge for edge in boundary if all(abs(vertices[v][axis] - coordinate) <= mechanics.WELD_M * 2 for v in edge)}
            ring = _ordered_ring(selected, vertices)
            # A rim must be a full finite circular boundary, not an arbitrary
            # planar cap near a coaxial feature or a fragmented exit contour.
            if ring:
                radial = [i for i in range(3) if i != axis]
                error = max(abs(math.hypot(*(vertices[v][i] - wall["origin"][i] for i in radial)) - wall["radius"]) for v in ring)
                if error > TOPOLOGY_TOLERANCE_M:
                    ring = []
            neighbors = {t for edge in selected for t in edge_faces[edge] if t not in support}
            position = list(wall["origin"])
            position[axis] = coordinate
            ends.append({"wall": index, "sign": sign, "coordinate": coordinate, "edges": selected,
                         "ring": ring, "position": position, "neighbors": neighbors, "status": "unresolved"})
    links, internal = [], set()
    for patch in mesh["patches"]:
        loop_edges = [_loop_edges(loop, lookup) for loop in patch["loops"]]
        matches = []
        for loop_index, loop in enumerate(loop_edges):
            if not loop:
                continue
            matching = [i for i, end in enumerate(ends) if end["ring"] and end["edges"] == loop]
            for end_index in matching:
                end = ends[end_index]
                wall = walls[end["wall"]]
                if abs(patch["normal"][wall["axis_index"]]) < .999999:
                    continue
                # Directed source boundary winding distinguishes an opening
                # (inner rim) from a planar disk closing the passage.
                vector = [0., 0., 0.]
                points = patch["loops"][loop_index]
                for a, b in zip(points, points[1:]):
                    cross = mechanics._cross(a, b)
                    vector = [vector[i] + cross[i] for i in range(3)]
                end["status"] = "opening" if mechanics._dot(vector, patch["normal"]) < 0 else "closed"
                end["support"] = sorted(end["neighbors"])
                matches.append((loop_index, end_index))
        if len(loop_edges) != 2 or len(matches) != 2 or matches[0][0] == matches[1][0]:
            continue
        ia, ib = matches[0][1], matches[1][1]
        ea, eb = ends[ia], ends[ib]
        wa, wb = walls[ea["wall"]], walls[eb["wall"]]
        if ea["wall"] == eb["wall"] or wa["axis_index"] != wb["axis_index"]:
            continue
        axis = wa["axis_index"]
        radial = [i for i in range(3) if i != axis]
        same_line = math.hypot(*(wa["origin"][i] - wb["origin"][i] for i in radial)) <= TOPOLOGY_TOLERANCE_M
        # Opposite sides of the shoulder are necessary: back-to-back blind
        # disks or the two walls of one open annular groove are not one bore.
        opposite_segments = (wa["origin"][axis] - patch["origin"][axis]) * (wb["origin"][axis] - patch["origin"][axis]) < 0
        if same_line and opposite_segments and abs(ea["coordinate"] - eb["coordinate"]) <= TOPOLOGY_TOLERANCE_M:
            links.append({"walls": [ea["wall"], eb["wall"]], "triangles": list(patch["triangles"])})
            internal.update((ia, ib))
    # A conical terminal whose triangles share one on-axis tip is a geometric
    # closure witness. It is not a thread or permissible screw-depth claim.
    for end in ends:
        if end["status"] != "unresolved" or not end["ring"] or not end["neighbors"]:
            continue
        common = set.intersection(*(set(faces[t]) for t in end["neighbors"]))
        wall = walls[end["wall"]]
        radial = [i for i in range(3) if i != wall["axis_index"]]
        if any(math.hypot(*(vertices[v][i] - wall["origin"][i] for i in radial)) <= TOPOLOGY_TOLERANCE_M for v in common):
            end["status"] = "closed"
            end["support"] = sorted(end["neighbors"])
    parents = list(range(len(walls)))
    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index
    for link in links:
        a, b = (root(i) for i in link["walls"])
        parents[b] = a
    groups = defaultdict(list)
    for i in range(len(walls)):
        groups[root(i)].append(i)
    result = {"walls": walls, "groups": list(groups.values()), "links": links,
              "ends": [{"wall": end["wall"], "sign": end["sign"], "position": end["position"], "status": end["status"],
                        "support": end.get("support", sorted(end["neighbors"])),
                        "boundary": [list(vertices[v]) for v in end["ring"]] if end["ring"] else [], "internal": i in internal}
                       for i, end in enumerate(ends)]}
    _TOPOLOGY_CACHE[key] = result
    return result


def _pattern_geometry(points, normal):
    origin = [sum(point[i] for point in points) / len(points) for i in range(3)]
    axis = max(range(3), key=lambda i: abs(normal[i]))
    radial = [i for i in range(3) if i != axis]
    centered = [(point[radial[0]] - origin[radial[0]], point[radial[1]] - origin[radial[1]]) for point in points]
    distances = [math.hypot(*point) for point in centered]
    kind, diameter, spacing, symmetry = "coplanar_collection", None, [], 1
    if len(points) == 2:
        kind, spacing, symmetry = "linear", [mechanics._length(mechanics._sub(points[1], points[0]))], 2
    elif len(points) >= 3:
        radius = sum(distances) / len(distances)
        angles = sorted(math.atan2(y, x) for x, y in centered)
        gaps = [b - a for a, b in zip(angles, angles[1:])] + [angles[0] + 2 * math.pi - angles[-1]]
        if radius > TOPOLOGY_TOLERANCE_M and max(abs(d - radius) for d in distances) <= TOPOLOGY_TOLERANCE_M and max(abs(gap - 2 * math.pi / len(points)) for gap in gaps) < .001:
            kind, diameter, symmetry = "circular", radius * 2, len(points)
            spacing = [2 * radius * math.sin(math.pi / len(points))]
        elif len(points) == 4:
            ordered = [point for _, point in sorted(zip((math.atan2(y, x) for x, y in centered), centered))]
            edges = [(ordered[(i + 1) % 4][0] - ordered[i][0], ordered[(i + 1) % 4][1] - ordered[i][1]) for i in range(4)]
            lengths = [math.hypot(*edge) for edge in edges]
            perpendicular = all(abs(mechanics._dot(edges[i], edges[(i + 1) % 4])) <= max(lengths[i] * lengths[(i + 1) % 4] * .001, 1e-14) for i in range(4))
            if perpendicular and abs(lengths[0] - lengths[2]) <= TOPOLOGY_TOLERANCE_M and abs(lengths[1] - lengths[3]) <= TOPOLOGY_TOLERANCE_M:
                kind, spacing, symmetry = "rectangular", sorted(lengths[:2]), 2
    return {"type": kind, "origin": origin, "normal": list(normal), "member_centers": points,
            "pitch_circle_diameter_m": diameter, "spacing_m": spacing, "rotational_symmetry_order": symmetry}


def _world_point(part, point):
    rotated = mechanics._rotate([point[i] * part.get("scale", [1., 1., 1.])[i] for i in range(3)], part["quaternion"])
    return [rotated[i] + part["position"][i] for i in range(3)]


def _normal_test(candidate, features, parts):
    owner = candidate["endpoint_refs"][0]["part_ref"]
    part = parts[owner]
    normals, gaps = {}, {}
    for pair in candidate["surface_pairs"]:
        feature = pair["feature_refs"][0]
        scale = part.get("scale", [1., 1., 1.])
        normal = mechanics._rotate([features[feature]["geometry"]["normal"][i] / scale[i] for i in range(3)], part["quaternion"])
        magnitude = mechanics._length(normal)
        normals[feature] = [v / magnitude for v in normal]
        gaps[feature] = min(gaps.get(feature, math.inf), pair["plane_gap_m"])
    samples = []
    for axis in range(3):
        for sign in (1., -1.):
            vector = [sign if i == axis else 0. for i in range(3)]
            samples.append({"vector": vector, "projections": [{"feature_ref": feature, "value": max(-1., min(1., mechanics._dot(normal, vector))),
                                                               "near_contact": gaps[feature] <= surfaces.CONTACT_GAP_M}
                                                              for feature, normal in sorted(normals.items())]})
    return {"status": "numerical_only", "basis": "source-reference-normal-projections", "moving_part_ref": owner, "frame": "world",
            "orientation_support": "closed_outward" if candidate.get("direction_assessment", {}).get("status") == "partial" else "unresolved",
            "near_contact_tolerance_m": surfaces.CONTACT_GAP_M, "samples": samples,
            "limitations": ["Values are dot products of source facet normals and sample vectors; they are not motion constraints or evidence of blocking.",
                            "Near-contact is a numerical distance test, not established material contact, snap retention, assembly reachability or successful engagement."]}


def analysis_for(scene: dict, package_root: Path) -> dict:
    base = surfaces.analysis_for(scene, package_root)
    parts = {part["id"]: part for part in scene["parts"]}
    feature_map = {feature["id"]: feature for feature in base["features"]}
    sources = {source["url"]: source for source in scene["sources"]}
    holes, patterns, hole_for_wall, portal_private = [], [], {}, {}
    for frame in base["frames"]:
        part = parts[frame["owner_ref"]]
        source = sources[part["geometryUrl"]]
        frame.pop("attached_to", None)
        frame.update({"kind": "source_geometry_measurement", "geometry_source_ref": source["id"],
                      "geometry_digest": "sha256:" + source["digest"].removeprefix("sha256:"), "motion_ownership": "unresolved"})
    for part in parts.values():
        raw = mechanics._asset(Path(package_root), part["geometryUrl"]).read_bytes()
        topology = _topology(raw)
        wall_map = {tuple(f["geometry"]["triangle_indices"]): f for f in base["features"] if f["owner_ref"] == part["id"] and f["kind"] == "bore_wall"}
        owned_holes, portal_groups = [], []
        for group in topology["groups"]:
            wall_features = [wall_map[tuple(topology["walls"][i]["triangles"])] for i in group]
            wall_refs = sorted(f["id"] for f in wall_features)
            identifier = "logical-hole:" + part["id"].removeprefix("part:") + ":" + _token("|".join(wall_refs))
            axis_index = topology["walls"][group[0]]["axis_index"]
            minimum = min(topology["walls"][i]["origin"][axis_index] - topology["walls"][i]["length"] / 2 for i in group)
            maximum = max(topology["walls"][i]["origin"][axis_index] + topology["walls"][i]["length"] / 2 for i in group)
            origin = [sum(topology["walls"][i]["origin"][k] for i in group) / len(group) for k in range(3)]
            origin[axis_index] = (minimum + maximum) / 2
            portals = []
            for end in topology["ends"]:
                if end["wall"] not in group or end["internal"]:
                    continue
                portal = {"id": identifier + ":end-" + str(end["wall"]) + ("-negative" if end["sign"] < 0 else "-positive"),
                          "position": list(end["position"]), "normal": [float(end["sign"]) if i == axis_index else 0. for i in range(3)],
                          "status": end["status"], "support_triangle_indices": list(end["support"]),
                          "boundary_vertices": deepcopy(end["boundary"])}
                portals.append(portal)
                portal_private[portal["id"]] = {"hole": identifier, "radius": topology["walls"][end["wall"]]["radius"], "portal": portal, "part": part}
                if portal["status"] == "opening":
                    placed = False
                    for collection in portal_groups:
                        first = collection[0]
                        if first["portal"]["normal"] == portal["normal"] and abs(first["radius"] - portal_private[portal["id"]]["radius"]) <= TOPOLOGY_TOLERANCE_M and abs(mechanics._dot(portal["normal"], mechanics._sub(portal["position"], first["portal"]["position"]))) <= TOPOLOGY_TOLERANCE_M:
                            collection.append(portal_private[portal["id"]])
                            placed = True
                            break
                    if not placed:
                        portal_groups.append([portal_private[portal["id"]]])
            links = [{"kind": "annular_shoulder", "wall_feature_refs": [wall_map[tuple(topology["walls"][i]["triangles"])]["id"] for i in link["walls"]],
                      "triangle_indices": list(link["triangles"])} for link in topology["links"] if all(i in group for i in link["walls"])]
            source = sources[part["geometryUrl"]]
            hole = {"id": identifier, "owner_ref": part["id"], "frame_ref": wall_features[0]["frame_ref"],
                    "geometry_source_ref": source["id"], "geometry_digest": "sha256:" + source["digest"].removeprefix("sha256:"),
                    "status": "geometry_only", "motion_ownership": "unresolved", "kind": "stepped_bore" if len(group) > 1 else "single_bore",
                    "wall_feature_refs": wall_refs, "axis": {"origin": origin, "direction": [1. if i == axis_index else 0. for i in range(3)],
                                                            "axial_range_m": [minimum - origin[axis_index], maximum - origin[axis_index]]},
                    "portals": portals, "topology_links": links, "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])}
            holes.append(hole)
            owned_holes.append(hole)
            for ref in wall_refs:
                hole_for_wall[ref] = identifier
        for collection in portal_groups:
            if len(collection) < 2:
                continue
            collection.sort(key=lambda item: item["portal"]["id"])
            portal_refs = [item["portal"]["id"] for item in collection]
            patterns.append({"id": "feature-pattern:" + part["id"].removeprefix("part:") + ":" + _token("|".join(portal_refs)),
                             "owner_ref": part["id"], "frame_ref": "frame:" + part["id"].removeprefix("part:") + ":source-mesh",
                             "status": "geometry_only", "motion_ownership": "unresolved", "kind": "geometry_only",
                             "logical_hole_refs": [item["hole"] for item in collection], "portal_refs": portal_refs,
                             "geometry": _pattern_geometry([item["portal"]["position"] for item in collection], collection[0]["portal"]["normal"]),
                             "witness": {"method": PATTERN_METHOD, "support_triangle_indices": sorted({t for item in collection for t in item["portal"]["support_triangle_indices"]})},
                             "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"])})
    patterns_for_hole = defaultdict(list)
    for pattern in patterns:
        for hole in pattern["logical_hole_refs"]:
            patterns_for_hole[hole].append(pattern)
    observations = []
    raw_candidates = base["connection_candidates"]
    for candidate in raw_candidates:
        cylinder_kinds = {feature_map[f]["kind"] for end in candidate["endpoint_refs"] for f in end["feature_refs"]}
        kind = "finite_surface_overlap" if candidate.get("kind") == "surface_fit" else "coaxial_bores" if cylinder_kinds == {"bore_wall"} else "finite_cylinder_containment"
        participants = []
        for end in candidate["endpoint_refs"]:
            hole_refs = sorted({hole_for_wall[f] for f in end["feature_refs"] if f in hole_for_wall})
            participants.append({"part_ref": end["part_ref"], "feature_refs": list(end["feature_refs"]), "logical_hole_refs": hole_refs,
                                 "pattern_refs": sorted({p["id"] for h in hole_refs for p in patterns_for_hole[h]})})
        observation = {"id": candidate["id"].replace("connection-candidate:", "reference-observation:", 1), "kind": kind,
                       "status": "geometry_only", "configuration_ref": candidate["configuration_ref"], "participants": participants,
                       "checks": deepcopy(candidate["checks"]), "source_refs": list(candidate["source_refs"]), "evidence_refs": list(candidate["evidence_refs"]),
                       "unresolved_requirements": ["Reference geometry is not a warranted mechanical Interface, mode, selected fastener set or engaged connection.",
                                                   "Functional roles, active frame ownership, engineering acceptance, assembly paths and completion remain unresolved."]}
        if candidate.get("kind") == "surface_fit":
            observation["surface_pairs"] = deepcopy(candidate["surface_pairs"])
            observation["normal_halfspace_test"] = _normal_test(candidate, feature_map, parts)
        observations.append(observation)
    # Pattern parents preserve the atom measurements and their exact source
    # placement. They neither pick an allowed S nor declare any hole engaged.
    pattern_pairs = defaultdict(list)
    for observation in observations:
        if observation["kind"] != "coaxial_bores" or any(len(p["logical_hole_refs"]) != 1 or len(p["feature_refs"]) != 1 for p in observation["participants"]):
            continue
        left, right = observation["participants"]
        for pa in patterns_for_hole[left["logical_hole_refs"][0]]:
            for pb in patterns_for_hole[right["logical_hole_refs"][0]]:
                porta = next(portal_private[ref] for ref in pa["portal_refs"] if portal_private[ref]["hole"] == left["logical_hole_refs"][0])
                portb = next(portal_private[ref] for ref in pb["portal_refs"] if portal_private[ref]["hole"] == right["logical_hole_refs"][0])
                if mechanics._length(mechanics._sub(_world_point(porta["part"], porta["portal"]["position"]), _world_point(portb["part"], portb["portal"]["position"]))) <= mechanics.AXIAL_GAP_M:
                    pattern_pairs[(pa["id"], pb["id"])].append(observation)
    pattern_map = {pattern["id"]: pattern for pattern in patterns}
    parent_observations = []
    for pair, members in pattern_pairs.items():
        if len(members) < 2:
            continue
        pa, pb = (pattern_map[identifier] for identifier in pair)
        participants = []
        for index, pattern in enumerate((pa, pb)):
            participants.append({"part_ref": pattern["owner_ref"], "feature_refs": sorted({f for member in members for f in member["participants"][index]["feature_refs"]}),
                                 "logical_hole_refs": sorted({h for member in members for h in member["participants"][index]["logical_hole_refs"]}), "pattern_refs": [pattern["id"]]})
        parent_observations.append({"id": "reference-observation:pattern:" + _token("|".join(pair)), "kind": "hole_pattern_alignment", "status": "geometry_only",
                                    "configuration_ref": members[0]["configuration_ref"], "participants": participants,
                                    "checks": [deepcopy(check) for member in members for check in member["checks"]],
                                    "member_observation_refs": [member["id"] for member in members],
                                    "member_correspondences": [{"logical_hole_refs": [p["logical_hole_refs"][0] for p in member["participants"]],
                                                                "feature_refs": [p["feature_refs"][0] for p in member["participants"]]} for member in members],
                                    "reference_placements": [{"part_ref": pattern["owner_ref"], "position": list(parts[pattern["owner_ref"]]["position"]),
                                                              "quaternion": list(parts[pattern["owner_ref"]]["quaternion"]), "scale": list(parts[pattern["owner_ref"]].get("scale", [1., 1., 1.]))} for pattern in (pa, pb)],
                                    "source_refs": sorted({r for member in members for r in member["source_refs"]}),
                                    "evidence_refs": sorted({r for member in members for r in member["evidence_refs"]}),
                                    "unresolved_requirements": ["This parent summarizes atomic measurements under the same source-reference placements; no independent per-hole transforms are fitted.",
                                                                "The geometric pattern does not establish a unique functional group, allowed subset S, actual used holes, selected fasteners or assembly success.",
                                                                "Rotationally symmetric geometric correspondences do not establish an allowed assembly phase."]})
    observations.extend(parent_observations)
    base.update({"logical_holes": holes, "feature_patterns": patterns, "reference_observations": observations,
                 "interfaces": [], "connection_candidates": []})
    metadata = base["analysis"]
    metadata.update({"method": METHOD, "interfaces_count": 0, "connection_candidates_count": 0, "logical_holes_count": len(holes),
                     "feature_patterns_count": len(patterns), "raw_observations_count": len(raw_candidates),
                     "reference_observations_count": len(observations), "pattern_alignment_count": len(parent_observations)})
    metadata["coverage"].pop("surface_interface_count", None)
    metadata["coverage"].pop("surface_candidate_count", None)
    metadata["coverage"].update({"raw_cylinder_observations_count": sum(c.get("kind") != "surface_fit" for c in raw_candidates),
                                  "raw_surface_observations_count": sum(c.get("kind") == "surface_fit" for c in raw_candidates)})
    metadata["limitations"] = ["Source-mesh frames are measurement coordinates only; actual rigid segments and motion ownership are unresolved.",
                               "Bare bores, shafts, planar patches, coaxial measurements and reference-pose overlap are geometry, not warranted Interfaces or connections.",
                               "Logical bore walls join only through a traceable two-rim annular shoulder with opposite axial segments; nearby coaxial blind holes are not joined.",
                               "Opening/closure labels describe mesh-boundary topology; they do not establish thread, permissible screw depth, material or manufacturing accuracy.",
                               "Patterns group equal-radius opening portals on one measurement plane; recognized shape, source-reference alignment and full membership do not define allowed functional subsets or actual engagement.",
                               "No functional warrant, active kinematic frame, fastener binding, engineering acceptance, task result, assembly path or completion is established."]
    return base
