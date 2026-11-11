"""Finite polyhedral profile candidates, with topology and free-side evidence.

Profiles describe local shape. They neither name a functional counterpart nor
confirm retention, assembly direction, clearance, material compliance or load.
The geometric source partition stays in capability_geometry; these composites
may deliberately reference several of its existing finite surface patches.
"""
from __future__ import annotations

from collections import OrderedDict, defaultdict
from copy import deepcopy
import hashlib
import math

from .capability_geometry import extract, _basis, _cross, _dot, _mesh, _sub, _topology, _unit

METHOD = "finite-polyhedral-profile-discovery/1"
PARAMETERS = {"method": METHOD, "opposed_normal_angle_rad": math.radians(20),
              "base_parallel_angle_rad": math.radians(12), "minimum_dimension_m": 2e-5,
              "maximum_profile_height_m": .05, "minimum_base_area_ratio": 1.5,
              "minimum_guide_aspect_ratio": 4., "source_plane_tolerance_m": 3e-7,
              "minimum_oblique_angle_rad": math.radians(15), "maximum_oblique_angle_rad": math.radians(165),
              "orthogonal_guide_exclusion_angle_rad": math.radians(12), "empty_gap_sample_count": 5,
              "closed_source_required_for_empty_channel": True, "ray_boundary_tolerance_m": 1e-7,
              "support_rule": "shared-source-edges; same-facing larger base for protrusions; inward walls and empty source-solid samples for channels"}
_CACHE = OrderedDict()


def _mean(points):
    return tuple(sum(p[k] for p in points) / len(points) for k in range(3))


class _RayMesh:
    """Small triangle BVH for a source-solid parity check, without dependencies."""
    def __init__(self, vertices, faces):
        self.vertices, self.faces = vertices, faces
        self.bounds = [(tuple(min(vertices[j][k] for j in f) for k in range(3)),
                        tuple(max(vertices[j][k] for j in f) for k in range(3))) for f in faces]
        def build(ids):
            lo = tuple(min(self.bounds[i][0][k] for i in ids) for k in range(3))
            hi = tuple(max(self.bounds[i][1][k] for i in ids) for k in range(3))
            if len(ids) <= 12:
                return lo, hi, ids, None
            axis = max(range(3), key=lambda k: hi[k] - lo[k])
            ids.sort(key=lambda i: self.bounds[i][0][axis] + self.bounds[i][1][axis])
            mid = len(ids) // 2
            return lo, hi, build(ids[:mid]), build(ids[mid:])
        self.root = build(list(range(len(faces)))) if faces else None

    def _inside(self, point, direction):
        inverse = tuple(1. / x for x in direction)
        stack, hits = [self.root], []
        while stack:
            node = stack.pop()
            if node is None:
                continue
            lo, hi, a, b = node
            minimum, maximum = 0., float("inf")
            for k in range(3):
                x, y = (lo[k] - point[k]) * inverse[k], (hi[k] - point[k]) * inverse[k]
                minimum, maximum = max(minimum, min(x, y)), min(maximum, max(x, y))
            if maximum < minimum:
                continue
            if b is not None:
                stack.extend((a, b))
                continue
            for i in a:
                p, q, r = (self.vertices[j] for j in self.faces[i])
                e1, e2 = _sub(q, p), _sub(r, p)
                h = _cross(direction, e2)
                determinant = _dot(e1, h)
                if abs(determinant) < 1e-16:
                    continue
                inv = 1. / determinant
                s = _sub(point, p)
                u = inv * _dot(s, h)
                if u < -1e-8 or u > 1 + 1e-8:
                    continue
                cross = _cross(s, e1)
                v = inv * _dot(direction, cross)
                if v < -1e-8 or u + v > 1 + 1e-8:
                    continue
                distance = inv * _dot(e2, cross)
                if distance > 2e-8:
                    hits.append(distance)
        unique = []
        for hit in sorted(hits):
            if not unique or hit - unique[-1] > 1e-7:
                unique.append(hit)
        return bool(len(unique) % 2)

    def inside(self, point):
        directions = ((1., .371, .217), (.193, 1., .417), (.293, .173, 1.))
        return sum(self._inside(point, d) for d in directions) >= 2


def _points(plane, vertices, faces):
    return [vertices[j] for j in sorted({j for i in plane["support"] for j in faces[i]})]


def _extent(points, direction):
    values = [_dot(p, direction) for p in points]
    return min(values), max(values)


def _feature(role, form, support, vertices, faces, normal, basis, dimensions, evidence):
    support = sorted(set(support))
    origin = _mean([vertices[j] for i in support for j in faces[i]])
    return {"kind": "surface_region", "geometry": {"type": "source_region", "origin": list(origin),
            "normal": list(_unit(normal)), "triangle_indices": support}, "function_status": "unknown",
            "semantic_role": role, "profile_form": form, "profile_dimensions_m": dimensions,
            "measurement": {"method": METHOD, "parameterization": "finite_polyhedral_composite",
            "support_triangle_count": len(support), "local_basis": {"origin": list(origin),
            "u": list(basis[0]), "v": list(basis[1]), "axis": list(basis[2])}, **evidence},
            "conditions": ["Geometric profile only; functional role and counterpart remain unknown.",
                           "Counterpart cross section, entry direction and finite swept overlap require a separate check.",
                           "Clearance, draft allowance, retention and material deformation are not established."]}


def _discover(raw, features):
    vertices, faces, normals, _ = _mesh(raw)
    edges, _ = _topology(faces)
    planes, owner = [], {}
    for feature_index, feature in enumerate(features):
        g = feature["geometry"]
        if g["type"] != "plane":
            continue
        support = g["triangle_indices"]
        if not support or any(i < 0 or i >= len(faces) for i in support):
            raise ValueError("Profile input has invalid source triangle support")
        normal = tuple(g["normal"])
        if abs(_dot(normal, normal) - 1.) > 1e-5:
            raise ValueError("Profile input plane has a non-unit source normal")
        if any(abs(_dot(_sub(vertices[j], g["origin"]), normal)) > 3e-7 for i in support for j in faces[i]):
            raise ValueError("Profile input plane disagrees with its raw source vertices")
        plane = {"feature_index": feature_index, "support": support, "normal": normal,
                 "origin": tuple(g["origin"]), "area": g["area_m2"], "feature": feature}
        plane["points"] = _points(plane, vertices, faces)
        index = len(planes)
        planes.append(plane)
        for i in support:
            owner[i] = index
    adjacency = defaultdict(set)
    shared = defaultdict(list)
    for edge, ts in edges.items():
        if len(ts) != 2 or ts[0] not in owner or ts[1] not in owner:
            continue
        a, b = owner[ts[0]], owner[ts[1]]
        if a == b:
            continue
        adjacency[a].add(b)
        adjacency[b].add(a)
        shared[tuple(sorted((a, b)))].append((edge, ts))

    def witnesses(a, b):
        return [sorted(ts) for _, ts in shared.get(tuple(sorted((a, b))), [])]

    result, recorded = [], set()
    opposed = -math.cos(math.radians(20))
    parallel = math.cos(math.radians(12))

    # A protrusion requires a small cap, opposite finite flanks, and a larger
    # same-facing base reached through both flanks. A plain box face fails
    # that last condition: its opposite face points the other way.
    for cap_index, cap in enumerate(planes):
        cap_normal = cap["normal"]
        sides = [i for i in adjacency[cap_index] if abs(_dot(planes[i]["normal"], cap_normal)) < .3]
        candidates = []
        for ai, a in enumerate(sides):
            for b in sides[ai + 1:]:
                pa, pb = planes[a], planes[b]
                if _dot(pa["normal"], pb["normal"]) > opposed:
                    continue
                side_depth = (_dot(_sub(pa["origin"], cap["origin"]), cap_normal) +
                              _dot(_sub(pb["origin"], cap["origin"]), cap_normal)) / 2
                if side_depth >= -2e-5:
                    continue
                bases = [i for i in adjacency[a] & adjacency[b] if i != cap_index and
                         _dot(planes[i]["normal"], cap_normal) > parallel and planes[i]["area"] > cap["area"] * 1.5]
                for base_index in bases:
                    base = planes[base_index]
                    height = _dot(_sub(cap["origin"], base["origin"]), cap_normal)
                    if not 2e-5 <= height <= .05:
                        continue
                    width_axis = _unit(_sub(pa["normal"], pb["normal"]))
                    width_axis = _unit(tuple(width_axis[k] - cap_normal[k] * _dot(width_axis, cap_normal) for k in range(3)))
                    axial = _unit(_cross(width_axis, cap_normal))
                    lo, hi = _extent(cap["points"], axial)
                    def width(offset):
                        values = []
                        for side in (pa, pb):
                            denominator = _dot(side["normal"], width_axis)
                            if abs(denominator) < .5:
                                return 0.
                            values.append((_dot(_sub(side["origin"], cap["origin"]), side["normal"]) -
                                           offset * _dot(side["normal"], cap_normal)) / denominator)
                        return abs(values[0] - values[1])
                    cap_width, base_width = width(0.), width(-height)
                    if min(cap_width, base_width, hi - lo) < 2e-5:
                        continue
                    candidates.append((min(pa["area"], pb["area"]), a, b, base_index, height, cap_width, base_width, hi - lo, width_axis, axial))
        if not candidates:
            continue
        _, a, b, base_index, height, cap_width, base_width, length, width_axis, axial = max(candidates)
        support = set(cap["support"]) | set(planes[a]["support"]) | set(planes[b]["support"])
        local_base = {t for pair in witnesses(a, base_index) + witnesses(b, base_index) for t in pair if owner.get(t) == base_index}
        support.update(local_base)
        role = "key" if cap["feature"].get("semantic_role") == "rectangular_planar_surface" else "tab"
        result.append(_feature(role, "capped_protrusion", support, vertices, faces, cap_normal,
                      (width_axis, cap_normal, axial), {"width_m": min(cap_width, base_width), "width_at_cap_m": cap_width,
                      "width_at_base_m": base_width, "height_m": height, "length_m": length},
                      {"source_surface_indices": [cap["feature_index"], planes[a]["feature_index"], planes[b]["feature_index"], planes[base_index]["feature_index"]],
                       "shared_edge_triangle_pairs": witnesses(cap_index, a) + witnesses(cap_index, b) + witnesses(a, base_index) + witnesses(b, base_index),
                       "profile_polarity": "convex", "solid_side": "negative_cap_normal", "free_side": "positive_cap_normal",
                       "orientation_basis": "source_triangle_winding", "base_area_ratio": planes[base_index]["area"] / cap["area"],
                       "side_face_angle_rad": math.acos(max(-1., min(1., _dot(planes[a]["normal"], planes[b]["normal"]))))}))
        recorded.add(tuple(sorted((a, b))))

    # Opposing inward-facing planar walls can bound an open slot even without
    # a floor. They must overlap finitely, share a real end surface, and have
    # an empty sampled gap in the closed source solid.
    ray_mesh = None
    source_closed = bool(edges) and all(len(ts) == 2 for ts in edges.values())
    for a, pa in enumerate(planes):
        for b in range(a + 1, len(planes)):
            if (a, b) in recorded:
                continue
            pb = planes[b]
            if _dot(pa["normal"], pb["normal"]) > opposed:
                continue
            delta = _sub(pb["origin"], pa["origin"])
            if _dot(delta, pa["normal"]) <= 2e-5 or _dot(tuple(-x for x in delta), pb["normal"]) <= 2e-5:
                continue
            common = adjacency[a] & adjacency[b]
            if not common:
                continue
            normal = _unit(_sub(pa["normal"], pb["normal"]))
            u, v = _basis(normal)
            a_u, b_u = _extent(pa["points"], u), _extent(pb["points"], u)
            a_v, b_v = _extent(pa["points"], v), _extent(pb["points"], v)
            lo_u, hi_u = max(a_u[0], b_u[0]), min(a_u[1], b_u[1])
            lo_v, hi_v = max(a_v[0], b_v[0]), min(a_v[1], b_v[1])
            if min(hi_u - lo_u, hi_v - lo_v) < 2e-5:
                continue
            width = abs(_dot(delta, normal))
            if width > .05:
                continue
            middle = (_dot(pa["origin"], normal) + _dot(pb["origin"], normal)) / 2
            samples = [tuple(normal[k] * middle + u[k] * (lo_u + fu * (hi_u - lo_u)) + v[k] * (lo_v + fv * (hi_v - lo_v)) for k in range(3))
                       for fu, fv in ((.5, .5), (.25, .5), (.75, .5), (.5, .25), (.5, .75))]
            if not source_closed:
                continue
            if ray_mesh is None:
                ray_mesh = _RayMesh(vertices, faces)
            empty = [not ray_mesh.inside(p) for p in samples]
            if not all(empty):
                continue
            axial, transverse = (u, v) if hi_u - lo_u >= hi_v - lo_v else (v, u)
            length, height = max(hi_u - lo_u, hi_v - lo_v), min(hi_u - lo_u, hi_v - lo_v)
            support = set(pa["support"]) | set(pb["support"])
            shared_pairs = []
            for c in common:
                pairs = witnesses(a, c) + witnesses(b, c)
                shared_pairs.extend(pairs)
                support.update(t for pair in pairs for t in pair)
            role = "guide" if length / max(width, height) >= 4 else "slot"
            result.append(_feature(role, "opposed_empty_channel", support, vertices, faces, normal,
                          (normal, transverse, axial), {"width_m": width, "height_m": height, "length_m": length},
                          {"source_surface_indices": [pa["feature_index"], pb["feature_index"]] + [planes[c]["feature_index"] for c in sorted(common)],
                           "shared_edge_triangle_pairs": shared_pairs, "profile_polarity": "concave", "empty_gap_samples": [list(p) for p in samples],
                           "empty_gap_sample_results": empty, "source_closed": True, "solid_side": "negative_each_wall_normal",
                           "free_side": "between_opposed_wall_normals", "orientation_basis": "source_winding_and_three_ray_parity"}))
            recorded.add((a, b))

    # Long non-orthogonal neighbouring faces retain a rail/groove profile.
    # Requiring a narrow flank, a larger neighbouring face and an oblique
    # dihedral avoids renaming every ordinary rectangular box edge a guide.
    for (a, b), entries in sorted(shared.items()):
        pa, pb = planes[a], planes[b]
        cosine = _dot(pa["normal"], pb["normal"])
        angle = math.acos(max(-1., min(1., cosine)))
        if not math.radians(15) < angle < math.radians(165) or abs(angle - math.pi / 2) < math.radians(12):
            continue
        if max(pa["area"], pb["area"]) < min(pa["area"], pb["area"]) * 1.5:
            continue
        axis = _unit(_cross(pa["normal"], pb["normal"]))
        u, v = _basis(axis)
        points = pa["points"] + pb["points"]
        lo, hi = _extent([vertices[j] for edge, _ in entries for j in edge], axis)
        au, bu = _extent(points, u);av, bv = _extent(points, v)
        length, width, height = hi - lo, bu - au, bv - av
        transverse = min(width, height)
        if min(length, transverse) < 2e-5 or length / max(transverse, 2e-5) < 4:
            continue
        sa = _dot(_sub(pa["origin"], pb["origin"]), pb["normal"])
        sb = _dot(_sub(pb["origin"], pa["origin"]), pa["normal"])
        if sa * sb <= 0:
            continue
        polarity = "concave" if sa > 0 else "convex"
        support = set(pa["support"]) | set(pb["support"])
        result.append(_feature("guide", "oblique_face_profile", support, vertices, faces, pa["normal"],
                      (u, v, axis), {"width_m": width, "height_m": height, "length_m": length},
                      {"source_surface_indices": [pa["feature_index"], pb["feature_index"]],
                       "shared_edge_triangle_pairs": witnesses(a, b), "profile_polarity": polarity,
                       "face_angle_rad": angle, "solid_side": "negative_each_face_normal", "free_side": "positive_each_face_normal",
                       "orientation_basis": "source_triangle_winding", "aspect_ratio": length / transverse}))

    result.sort(key=lambda f: (f["semantic_role"], f["profile_form"], f["geometry"]["origin"], f["geometry"]["triangle_indices"]))
    return result


def discover_profiles(raw, features=None):
    """Return conditional finite key/tab/slot/guide shape candidates from raw STL."""
    digest = hashlib.sha256(raw).hexdigest()
    if features is None:
        features = extract(raw)["features"]
    # Include exact hints in the key: a caller cannot reuse cached profiles
    # with a different set of finite plane supports.
    signature = tuple((tuple(f["geometry"]["triangle_indices"]), tuple(f["geometry"]["origin"]),
                       tuple(f["geometry"]["normal"])) for f in features if f["geometry"]["type"] == "plane")
    key = METHOD, digest, signature
    if key not in _CACHE:
        _CACHE[key] = _discover(raw, features)
        if len(_CACHE) > 64:
            _CACHE.popitem(last=False)
    _CACHE.move_to_end(key)
    return deepcopy(_CACHE[key])
