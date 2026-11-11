"""Measured source geometry with explicit finite triangle support.

This pass is independent of assembly declarations and the frozen cylinder
detectors. Circular rims and curved surface patches propose axes; source
vertices, rather than a strict normal threshold, decide the final support.
Unparameterized material remains a source region, never an inferred interface.
All coordinates and fit residuals are in metres.
"""
from __future__ import annotations

from collections import OrderedDict, defaultdict, deque
from copy import deepcopy
import hashlib
import heapq
import math

from .mechanics import _mesh, _solve

METHOD = "finite-source-surface-discovery/1"
_CACHE = OrderedDict()
_CACHE_LIMIT = 64
_TAU = 2 * math.pi
_AXIAL_MIN = 2e-5
_RADIAL_MIN = 1e-5
_PLANE_TOL = 2e-7
PARAMETERS = {"method": METHOD, "coordinate_unit": "m", "minimum_radius_m": _RADIAL_MIN,
              "minimum_axial_extent_m": _AXIAL_MIN, "absolute_vertex_fit_tolerance_m": 3e-7,
              "relative_vertex_fit_tolerance": 1e-4, "minimum_angular_coverage": .2,
              "maximum_facet_angle_rad": math.radians(22), "plane_distance_tolerance_m": _PLANE_TOL,
              "normal_axis_proposal_limit": 24, "normal_seed_gates": [.005, .16],
              "circular_rim_minimum_vertices": 12, "minimum_wall_triangles": 12,
              "maximum_radius_gradient": 20., "radial_law_fit_iterations": 8,
              "minimum_plane_triangles": 2, "minimum_plane_area_m2": 1e-10,
              "minimum_plane_area_fraction": .00005, "residual_crease_angle_rad": math.radians(60),
              "residual_small_patch_triangles": 24, "proposal_position_snap_m": 1e-8,
              "proposal_axis_snap": 1e-6, "proposal_gradient_snap": 1e-5,
              "coaxial_minimum_angular_coverage": .02, "coaxial_gradient_bin": .001,
              "coaxial_radius_intercept_bin_m": 1e-6, "coaxial_axis_line_snap_m": 1e-6,
              "coaxial_partial_minimum_radius_gradient": .01, "coaxial_triangle_minimum_extent_m": 1e-7,
              "rim_plane_minimum_triangles": 8}


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    length = math.sqrt(_dot(a, a))
    return tuple(x / length for x in a) if length else (0., 0., 0.)


def _canonical(a):
    a = _unit(a)
    return tuple(-x for x in a) if a[max(range(3), key=lambda i: abs(a[i]))] < 0 else a


def _basis(axis):
    helper = min(range(3), key=lambda i: abs(axis[i]))
    u = _unit(_cross(axis, tuple(float(i == helper) for i in range(3))))
    return u, _cross(axis, u)


def _tolerance(radius):
    return max(3e-7, abs(radius) * 1e-4)


def _eigen_normal(points):
    center = tuple(sum(p[k] for p in points) / len(points) for k in range(3))
    ds = [_sub(p, center) for p in points]
    matrix = [[sum(d[i] * d[j] for d in ds) for j in range(3)] for i in range(3)]
    vectors = [[float(i == j) for j in range(3)] for i in range(3)]
    for _ in range(32):
        p, q = max(((0, 1), (0, 2), (1, 2)), key=lambda pair: abs(matrix[pair[0]][pair[1]]))
        if abs(matrix[p][q]) < 1e-24:
            break
        angle = .5 * math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p])
        c, s = math.cos(angle), math.sin(angle)
        for k in range(3):
            matrix[k][p], matrix[k][q] = c * matrix[k][p] - s * matrix[k][q], s * matrix[k][p] + c * matrix[k][q]
        for k in range(3):
            matrix[p][k], matrix[q][k] = c * matrix[p][k] - s * matrix[q][k], s * matrix[p][k] + c * matrix[q][k]
            vectors[k][p], vectors[k][q] = c * vectors[k][p] - s * vectors[k][q], s * vectors[k][p] + c * vectors[k][q]
    k = min(range(3), key=lambda i: matrix[i][i])
    return center, _canonical(tuple(vectors[i][k] for i in range(3)))


def _circle_xy(points):
    if len(points) < 8:
        return None
    ox, oy = (sum(p[i] for p in points) / len(points) for i in range(2))
    rows = [(p[0] - ox, p[1] - oy, 1.) for p in points]
    targets = [-r[0] ** 2 - r[1] ** 2 for r in rows]
    fit = _solve([[sum(r[i] * r[j] for r in rows) for j in range(3)] for i in range(3)],
                 [sum(r[i] * t for r, t in zip(rows, targets)) for i in range(3)])
    if fit is None:
        return None
    return ox - fit[0] / 2, oy - fit[1] / 2


def _ring(points):
    if len(points) < 12:
        return None
    center, axis = _eigen_normal(points)
    if max(abs(_dot(_sub(p, center), axis)) for p in points) > _PLANE_TOL:
        return None
    u, v = _basis(axis)
    coordinates = [(_dot(_sub(p, center), u), _dot(_sub(p, center), v)) for p in points]
    fit = _circle_xy(coordinates)
    if fit is None:
        return None
    cu, cv = fit
    radii = [math.hypot(p[0] - cu, p[1] - cv) for p in coordinates]
    radius = sum(radii) / len(radii)
    if radius < _RADIAL_MIN or max(abs(r - radius) for r in radii) > _tolerance(radius):
        return None
    angles = sorted(math.atan2(p[1] - cv, p[0] - cu) for p in coordinates)
    if max(b - a for a, b in zip(angles, angles[1:] + [angles[0] + _TAU])) > math.radians(22):
        return None
    center = tuple(center[i] + u[i] * cu + v[i] * cv for i in range(3))
    return {"axis": axis, "center": center, "radius": radius}


def _topology(faces):
    edges = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            edges[tuple(sorted((a, b)))].append(i)
    adjacent = [[] for _ in faces]
    for support in edges.values():
        if len(support) == 2:
            a, b = support
            adjacent[a].append(b)
            adjacent[b].append(a)
    return edges, adjacent


def _edge_chains(edge_set, vertices):
    graph = defaultdict(list)
    for a, b in edge_set:
        graph[a].append(b)
        graph[b].append(a)
    remaining = set(edge_set)
    result = []
    while remaining:
        a, current = min(remaining)
        remaining.remove((a, current))
        previous, chain = a, [a]
        while current != a:
            chain.append(current)
            choices = [n for n in graph[current] if tuple(sorted((current, n))) in remaining]
            if not choices:
                break
            direction = _unit(_sub(vertices[current], vertices[previous]))
            following = max(choices, key=lambda n: (_dot(direction, _unit(_sub(vertices[n], vertices[current]))), -n))
            remaining.remove(tuple(sorted((current, following))))
            previous, current = current, following
        result.append((chain, current == a))
    return result


def _rings(vertices, edges, normals, faces=None, adjacent=None):
    sharp = {edge for edge, support in edges.items() if len(support) != 2 or
             _dot(normals[support[0]], normals[support[1]]) < math.cos(math.radians(22))}
    boundaries = [sharp]
    # At a branching crease, a greedy whole-graph chain can enter a generator
    # instead of following the circular rim. A real coplanar cap gives an
    # independent boundary graph with those unrelated generators removed.
    if faces is not None and adjacent is not None:
        seen = set()
        for seed in range(len(faces)):
            if seed in seen:
                continue
            seen.add(seed)
            normal, p0 = normals[seed], vertices[faces[seed][0]]
            stack, support = [seed], []
            while stack:
                i = stack.pop()
                support.append(i)
                for j in adjacent[i]:
                    if j not in seen and _dot(normals[j], normal) > .999999 and all(abs(_dot(_sub(vertices[k], p0), normal)) < _PLANE_TOL for k in faces[j]):
                        seen.add(j)
                        stack.append(j)
            if len(support) < 8:
                continue
            local = defaultdict(int)
            for i in support:
                a, b, c = faces[i]
                for edge in (tuple(sorted((a, b))), tuple(sorted((b, c))), tuple(sorted((c, a)))):
                    local[edge] += 1
            boundaries.append({edge for edge, count in local.items() if count == 1})
    rings, signatures = [], set()
    for boundary in boundaries:
        for chain, closed in _edge_chains(boundary, vertices):
            if closed:
                ring = _ring([vertices[i] for i in chain])
                if ring:
                    signature = (tuple(round(x / 1e-6) for x in ring["axis"]), tuple(round(x / 1e-8) for x in ring["center"]), round(ring["radius"] / 1e-8))
                    if signature in signatures:
                        continue
                    signatures.add(signature)
                    ring["axis_support_triangle_indices"] = sorted({t for a, b in zip(chain, chain[1:] + chain[:1])
                                                                   for t in edges[tuple(sorted((a, b)))]})
                    rings.append(ring)
    return rings


def _coordinates(vertices, axis):
    u, v = _basis(axis)
    return u, v, [(_dot(p, u), _dot(p, v), _dot(p, axis)) for p in vertices]


def _fit_radial(points, center=None):
    """Fit a common axis center and r(t), including an exactly constant radius."""
    if len(points) < 12:
        return None
    if center is None:
        center = _circle_xy(points)
    if center is None:
        return None
    cu, cv = center
    t0 = sum(p[2] for p in points) / len(points)
    radial = [math.hypot(p[0] - cu, p[1] - cv) for p in points]
    radius = sum(radial) / len(radial)
    variance = sum((p[2] - t0) ** 2 for p in points)
    if variance < 1e-18:
        return None
    slope = sum((p[2] - t0) * (r - radius) for p, r in zip(points, radial)) / variance
    # Source units are small. Scaling axial coordinates keeps the normal
    # equations well conditioned without requiring a numerical dependency.
    scale = max(p[2] for p in points) - min(p[2] for p in points)
    if scale < _AXIAL_MIN:
        return None
    gradient = slope * scale
    initial_error = max(abs(rr - radius - gradient * ((p[2] - t0) / scale)) for p, rr in zip(points, radial))
    if initial_error > max(_tolerance(radius) * 50, radius * .025):
        return None
    for _ in range(8):
        matrix, target = [[0.] * 4 for _ in range(4)], [0.] * 4
        for p in points:
            dx, dy = p[0] - cu, p[1] - cv
            rr = math.hypot(dx, dy)
            if rr < 1e-12:
                return None
            tt = (p[2] - t0) / scale
            error = rr - radius - gradient * tt
            row = (-dx / rr, -dy / rr, -1., -tt)
            for i in range(4):
                target[i] -= row[i] * error
                for j in range(4):
                    matrix[i][j] += row[i] * row[j]
        step = _solve(matrix, target)
        if step is None:
            return None
        cu, cv, radius, gradient = (x + d for x, d in zip((cu, cv, radius, gradient), step))
        if max(abs(x) for x in step) < 1e-12:
            break
    slope = gradient / scale
    minimum, maximum = min(p[2] for p in points), max(p[2] for p in points)
    r0, r1 = radius + slope * (minimum - t0), radius + slope * (maximum - t0)
    if min(r0, r1) < _RADIAL_MIN or abs(slope) > 20.:
        return None
    residuals = [math.hypot(p[0] - cu, p[1] - cv) - radius - slope * (p[2] - t0) for p in points]
    maximum_error = max(abs(e) for e in residuals)
    if maximum_error > _tolerance(max(r0, r1)):
        return None
    return {"cu": cu, "cv": cv, "t0": t0, "radius": radius, "slope": slope,
            "minimum": minimum, "maximum": maximum, "max_error": maximum_error,
            "rms": math.sqrt(sum(e * e for e in residuals) / len(residuals))}


def _components(support, adjacent):
    remaining = set(support)
    while remaining:
        seed = min(remaining)
        remaining.remove(seed)
        stack, group = [seed], []
        while stack:
            i = stack.pop()
            group.append(i)
            for j in adjacent[i]:
                if j in remaining:
                    remaining.remove(j)
                    stack.append(j)
        yield sorted(group)


def _angular_coverage(coordinates, faces, support, cu, cv):
    intervals = []
    largest_facet = 0.
    for i in support:
        angles = [math.atan2(coordinates[j][1] - cv, coordinates[j][0] - cu) for j in faces[i]]
        base = angles[0]
        angles = [base + (angle - base + math.pi) % _TAU - math.pi for angle in angles]
        lo, hi = min(angles), max(angles)
        largest_facet = max(largest_facet, hi - lo)
        while lo < 0:
            lo, hi = lo + _TAU, hi + _TAU
        if hi > _TAU:
            intervals.extend(((lo, _TAU), (0., hi - _TAU)))
        else:
            intervals.append((lo, hi))
    total, low, high = 0., 0., 0.
    for a, b in sorted(intervals):
        if a > high + 1e-10:
            total += high - low
            low, high = a, b
        else:
            high = max(high, b)
    return min(1., (total + high - low) / _TAU), largest_facet


def _support_for(model, coordinates, faces):
    tolerance = _tolerance(model["radius"])
    cu, cv, radius, slope, t0 = (model[k] for k in ("cu", "cv", "radius", "slope", "t0"))
    valid = [abs(math.hypot(p[0] - cu, p[1] - cv) - radius - slope * (p[2] - t0)) <= tolerance for p in coordinates]
    support = []
    for i, (a, b, c) in enumerate(faces):
        if valid[a] and valid[b] and valid[c]:
            ta, tb, tc = coordinates[a][2], coordinates[b][2], coordinates[c][2]
            if max(ta, tb, tc) - min(ta, tb, tc) > 1e-9:
                support.append(i)
    return support


def _wall(axis, u, v, coordinates, vertices, faces, normals, support, proposal=None):
    ids = sorted({j for i in support for j in faces[i]})
    center = (proposal["cu"], proposal["cv"]) if proposal else None
    model = _fit_radial([coordinates[j] for j in ids], center=center)
    if model is None:
        return None
    coverage, largest = _angular_coverage(coordinates, faces, support, model["cu"], model["cv"])
    minimum_coverage = .02 if proposal and proposal.get("axis_support_triangle_indices") and abs(model["slope"]) > .01 else .2
    if coverage < minimum_coverage or largest > math.radians(22):
        return None
    if minimum_coverage < .2 and math.hypot(model["cu"] - center[0], model["cv"] - center[1]) > _tolerance(model["radius"]) * 2:
        return None
    minimum, maximum = model["minimum"], model["maximum"]
    midpoint = (minimum + maximum) / 2
    radius = model["radius"] + model["slope"] * (midpoint - model["t0"])
    origin = [u[k] * model["cu"] + v[k] * model["cv"] + axis[k] * midpoint for k in range(3)]
    winding = []
    for i in support:
        p = tuple(sum(vertices[j][k] for j in faces[i]) / 3 for k in range(3))
        delta = _sub(p, origin)
        axial = _dot(delta, axis)
        radial = tuple(delta[k] - axial * axis[k] for k in range(3))
        length = math.sqrt(_dot(radial, radial))
        if length:
            winding.append(_dot(radial, normals[i]) / length)
    alignment = sum(winding) / len(winding) if winding else 0.
    if abs(alignment) * math.sqrt(1 + model["slope"] ** 2) < .85:
        return None
    kind = "bore_wall" if alignment < 0 else "shaft_wall"
    conical = abs(model["slope"] * (maximum - minimum)) > max(8e-7, radius * 2e-4)
    geometry = {"type": "conical_frustum" if conical else "cylinder", "origin": origin,
                "axis": list(axis), "triangle_indices": support}
    if conical:
        geometry["origin"] = [origin[k] + axis[k] * (minimum - midpoint) for k in range(3)]
        geometry.update(radius_start_m=radius + model["slope"] * (minimum - midpoint),
                        radius_end_m=radius + model["slope"] * (maximum - midpoint), length_m=maximum - minimum)
        dimensions = {"radius_start": geometry["radius_start_m"], "radius_end": geometry["radius_end_m"], "axial_extent": maximum - minimum}
    else:
        geometry.update(radius_m=radius, axial_range_m=[minimum - midpoint, maximum - midpoint])
        dimensions = {"radius": radius, "axial_extent": maximum - minimum}
    feature = {"kind": kind, "geometry": geometry, "measurement": {"method": METHOD,
               "fit_max_m": model["max_error"], "fit_rms_m": model["rms"], "angular_coverage": coverage,
               "normal_radial_alignment": alignment, "radius_gradient": model["slope"],
               "support_triangle_count": len(support)}, "function_status": "unknown",
               "semantic_role": ("conical" if conical else "cylindrical") + ("_inner_wall" if alignment < 0 else "_outer_wall"),
               "profile_dimensions_m": dimensions}
    if proposal and proposal.get("axis_support_triangle_indices"):
        feature["measurement"].update(axis_source=proposal.get("axis_source", "independent_coaxial_surface"),
                                      axis_support_triangle_indices=proposal["axis_support_triangle_indices"])
        model["axis_support_triangle_indices"] = proposal["axis_support_triangle_indices"]
        model["axis_source"] = proposal.get("axis_source", "independent_coaxial_surface")
    return feature, model


def _normal_axes(normals, adjacent, excluded=()):
    bins = defaultdict(list)
    excluded = set(excluded)
    for i, neighbors in enumerate(adjacent):
        if i in excluded:
            continue
        for j in neighbors:
            if j <= i or j in excluded or _dot(normals[i], normals[j]) < math.cos(math.radians(22)):
                continue
            vector = _cross(normals[i], normals[j])
            length = math.sqrt(_dot(vector, vector))
            if length < math.sin(math.radians(.5)):
                continue
            vector = _canonical(vector)
            bins[tuple(round(x / .002) for x in vector)].append(vector)
    axes = [(1., 0., 0.), (0., 1., 0.), (0., 0., 1.)]
    for _, vectors in sorted(bins.items(), key=lambda item: (-len(item[1]), item[0])):
        if len(vectors) < 12:
            continue
        axis = _canonical(tuple(sum(v[k] for v in vectors) for k in range(3)))
        if any(abs(_dot(axis, a)) > math.cos(.001) for a in axes):
            continue
        axes.append(axis)
        if len(axes) == 24:
            break
    return axes


def _plane(vertices, faces, normals, support, edges, total_area):
    if len(support) < 2:
        return None
    normal = normals[support[0]]
    ids = {j for i in support for j in faces[i]}
    p0 = vertices[faces[support[0]][0]]
    errors = [abs(_dot(_sub(vertices[j], p0), normal)) for j in ids]
    if max(errors) > _PLANE_TOL:
        return None
    support_set = set(support)
    local_edges = {tuple(sorted((a, b))) for i in support for a, b in
                   ((faces[i][0], faces[i][1]), (faces[i][1], faces[i][2]), (faces[i][2], faces[i][0]))}
    boundary = {edge for edge in local_edges if sum(t in support_set for t in edges[edge]) == 1}
    area, weighted = 0., [0., 0., 0.]
    for i in support:
        a, b, c = (vertices[j] for j in faces[i])
        cr = _cross(_sub(b, a), _sub(c, a))
        ar = math.sqrt(_dot(cr, cr)) / 2
        area += ar
        for k in range(3):
            weighted[k] += ar * (a[k] + b[k] + c[k]) / 3
    if area < max(1e-10, total_area * .00005):
        return None
    sharp_length = boundary_length = 0.
    for edge in boundary:
        d = _sub(vertices[edge[0]], vertices[edge[1]])
        length = math.sqrt(_dot(d, d))
        boundary_length += length
        outside = [i for i in edges[edge] if i not in support_set]
        if not outside or all(abs(_dot(normals[i], normal)) < math.cos(math.radians(20)) for i in outside):
            sharp_length += length
    # Curved tessellation facets remain source regions rather than thousands
    # of misleading planar entries. A sizeable genuine planar patch survives
    # even where a fillet joins it tangentially.
    if (not boundary_length or sharp_length / boundary_length < .65) and len(support) < 8 and area < total_area * .03:
        return None
    chains = _edge_chains(boundary, vertices)
    loops = [[list(vertices[j]) for j in chain + [chain[0]]] for chain, closed in chains if closed]
    origin = [x / area for x in weighted]
    feature = {"kind": "planar_patch", "geometry": {"type": "plane", "origin": origin,
               "normal": list(normal), "area_m2": area, "boundary_loops": loops, "triangle_indices": support},
               "measurement": {"method": METHOD, "fit_max_m": max(errors),
               "fit_rms_m": math.sqrt(sum(e * e for e in errors) / len(errors)), "support_triangle_count": len(support),
               "boundary_closed": all(closed for _, closed in chains)}, "function_status": "unknown", "semantic_role": "planar_surface"}
    if len(chains) == 1 and chains[0][1]:
        points = [vertices[j] for j in chains[0][0]]
        corners = []
        for i, p in enumerate(points):
            a, b = _unit(_sub(p, points[i - 1])), _unit(_sub(points[(i + 1) % len(points)], p))
            if _dot(a, b) < math.cos(math.radians(2)):
                corners.append(p)
        if len(corners) == 4:
            sides = [_sub(corners[(i + 1) % 4], corners[i]) for i in range(4)]
            lengths = [math.sqrt(_dot(side, side)) for side in sides]
            if min(lengths) > 0 and all(abs(_dot(_unit(sides[i]), _unit(sides[(i + 1) % 4]))) < .01 for i in range(4)):
                feature["semantic_role"] = "rectangular_planar_surface"
                feature["profile_dimensions_m"] = {"width": max(lengths), "height": min(lengths)}
    return feature


def _extract_uncached(raw):
    vertices, faces, normals, smooth = _mesh(raw)
    edges, adjacent = _topology(faces)
    rings = _rings(vertices, edges, normals, faces, adjacent)
    walls, wall_supports = [], []
    coordinate_cache = {}
    proposed_models = set()

    def coordinates(axis):
        key = tuple(round(x, 9) for x in axis)
        if key not in coordinate_cache:
            coordinate_cache[key] = _coordinates(vertices, axis)
        return coordinate_cache[key]

    def accept_model(axis, model):
        u, v, xyz = coordinates(axis)
        line_origin = tuple(u[k] * model["cu"] + v[k] * model["cv"] for k in range(3))
        key = (tuple(round(x / 1e-6) for x in axis), tuple(round(x / 1e-8) for x in line_origin),
               round((model["radius"] - model["slope"] * model["t0"]) / 1e-8), round(model["slope"] / 1e-5),
               bool(model.get("axis_support_triangle_indices")))
        if key in proposed_models:
            return
        proposed_models.add(key)
        selected = _support_for(model, xyz, faces)
        for support in _components(selected, adjacent):
            if len(support) < 12:
                continue
            proposed = set(support)
            if any(len(proposed) <= len(previous) * 1.02 and len(proposed & previous) / min(len(proposed), len(previous)) > .95 for previous in wall_supports):
                continue
            measured = _wall(axis, u, v, xyz, vertices, faces, normals, support, model)
            if not measured:
                continue
            feature, refined = measured
            # A locally cylindrical proposal may reveal a shallow cone. Expand
            # using the fitted radial law, then split by real mesh connectivity.
            expanded = _support_for(refined, xyz, faces)
            seed = set(support)
            for group in _components(expanded, adjacent):
                if not seed.intersection(group):
                    continue
                again = _wall(axis, u, v, xyz, vertices, faces, normals, group, refined)
                if again:
                    feature, _ = again
                break
            ids = set(feature["geometry"]["triangle_indices"])
            if any(len(ids) <= len(previous) and len(ids & previous) / min(len(ids), len(previous)) > .85 for previous in wall_supports):
                continue
            walls.append(feature)
            wall_supports.append(ids)

    # Every circular rim is sufficient to propose a cylinder. Pairs on the
    # same axis also propose drafted walls, regardless of their normal tilt.
    for ring in rings:
        axis = ring["axis"]
        u, v, _ = coordinates(axis)
        accept_model(axis, {"cu": _dot(ring["center"], u), "cv": _dot(ring["center"], v),
                           "t0": _dot(ring["center"], axis), "radius": ring["radius"], "slope": 0.})
    for i, a in enumerate(rings):
        axis = a["axis"]
        for b in rings[i + 1:]:
            if abs(_dot(axis, b["axis"])) < .9999995:
                continue
            delta = _sub(b["center"], a["center"])
            distance = _dot(delta, axis)
            perpendicular = tuple(delta[k] - distance * axis[k] for k in range(3))
            if abs(distance) < _AXIAL_MIN or math.sqrt(_dot(perpendicular, perpendicular)) > 8e-7:
                continue
            slope = (b["radius"] - a["radius"]) / distance
            if abs(slope) > 20.:
                continue
            u, v, _ = coordinates(axis)
            accept_model(axis, {"cu": _dot(a["center"], u), "cv": _dot(a["center"], v),
                               "t0": _dot(a["center"], axis), "radius": a["radius"], "slope": slope})

    # Curved intersections can remove both planar rims (a radial hole is an
    # example). Normal directions only propose patches here: final support is
    # expanded and checked using every source vertex, without that normal gate.
    represented = set().union(*wall_supports) if wall_supports else set()
    for axis in _normal_axes(normals, adjacent, represented):
        _, _, xyz = coordinates(axis)
        for gate in (.005, .16):
            represented = set().union(*wall_supports) if wall_supports else set()
            eligible = {i for i, n in enumerate(normals) if i not in represented and abs(_dot(n, axis)) <= gate}
            for support in _components(eligible, smooth):
                if len(support) < 12:
                    continue
                ids = sorted({j for i in support for j in faces[i]})
                model = _fit_radial([xyz[j] for j in ids])
                if model:
                    accept_model(axis, model)

    # A thin drafted flange can join a larger profile without leaving a closed
    # sharp rim. Use an independently established axis line to segment radial
    # laws, rather than forcing every connected surface into one radius law.
    # The bins only propose groups; the complete vertex fit still accepts or
    # rejects each proposed finite wall.
    coaxial = set()
    coaxial_faces = {}
    coaxial_seeds = [{"axis": ring["axis"], "origin": ring["center"],
                     "triangle_indices": ring["axis_support_triangle_indices"], "axis_source": "circular_rim"} for ring in rings]
    coaxial_seeds.extend({**feature["geometry"], "axis_source": "independent_coaxial_surface"} for feature in walls
                         if feature["measurement"]["angular_coverage"] >= .35)
    for geometry in coaxial_seeds:
        axis = tuple(geometry["axis"])
        u, v, xyz = coordinates(axis)
        cu, cv = _dot(geometry["origin"], u), _dot(geometry["origin"], v)
        key = tuple(round(x / 1e-6) for x in axis), round(cu / 1e-6), round(cv / 1e-6)
        if key in coaxial:
            continue
        coaxial.add(key)
        t_ref = _dot(geometry["origin"], axis)
        radial = [math.hypot(p[0] - cu, p[1] - cv) for p in xyz]
        bins = defaultdict(list)
        represented = set().union(*wall_supports) if wall_supports else set()
        axis_key = tuple(round(x, 9) for x in axis)
        if axis_key not in coaxial_faces:
            coaxial_faces[axis_key] = [(i, face, [xyz[j][2] for j in face]) for i, face in enumerate(faces)
                                      if i not in represented and max(xyz[j][2] for j in face) - min(xyz[j][2] for j in face) >= 1e-7]
        for i, face, ts in coaxial_faces[axis_key]:
            if i in represented:
                continue
            rs = [radial[j] for j in face]
            lo, hi = min(ts), max(ts)
            if hi - lo < 1e-7:
                continue
            mt, mr = sum(ts) / 3, sum(rs) / 3
            denominator = sum((t - mt) ** 2 for t in ts)
            slope = sum((t - mt) * (r - mr) for t, r in zip(ts, rs)) / denominator
            if abs(slope) > 20 or max(abs(r - mr - slope * (t - mt)) for t, r in zip(ts, rs)) > _tolerance(mr):
                continue
            bins[(round(slope / .001), round((mr + slope * (t_ref - mt)) / 1e-6))].append(i)
        for bucket in bins.values():
            for support in _components(bucket, adjacent):
                if len(support) < 12:
                    continue
                ids = {j for i in support for j in faces[i]}
                model = _fit_radial([xyz[j] for j in ids], center=(cu, cv))
                if model:
                    model["axis_support_triangle_indices"] = geometry["triangle_indices"]
                    model["axis_source"] = geometry["axis_source"]
                    accept_model(axis, model)

    # Prefer the largest validated support when several proposals refer to the
    # same source wall. No triangles are filled between disconnected patches.
    walls.sort(key=lambda f: (-len(f["geometry"]["triangle_indices"]), f["measurement"]["fit_max_m"]))
    selected, assigned = [], set()
    for feature in walls:
        support = [i for i in feature["geometry"]["triangle_indices"] if i not in assigned]
        if len(support) < 12:
            continue
        if len(support) != len(feature["geometry"]["triangle_indices"]):
            axis = tuple(feature["geometry"]["axis"])
            u, v, xyz = coordinates(axis)
            origin = feature["geometry"]["origin"]
            proposal = {"cu": _dot(origin, u), "cv": _dot(origin, v)}
            if feature["measurement"].get("axis_support_triangle_indices"):
                proposal["axis_support_triangle_indices"] = feature["measurement"]["axis_support_triangle_indices"]
            again = _wall(axis, u, v, xyz, vertices, faces, normals, support, proposal)
            if not again:
                continue
            feature, _ = again
        selected.append(feature)
        assigned.update(support)

    total_area = sum(math.sqrt(_dot(c, c)) / 2 for face in faces
                     for c in [_cross(_sub(vertices[face[1]], vertices[face[0]]), _sub(vertices[face[2]], vertices[face[0]]))])
    remaining = set(range(len(faces))) - assigned
    while remaining:
        seed = min(remaining)
        normal = normals[seed]
        p0 = vertices[faces[seed][0]]
        remaining.remove(seed)
        stack, support = [seed], []
        while stack:
            i = stack.pop()
            support.append(i)
            for j in adjacent[i]:
                if j in remaining and _dot(normal, normals[j]) > .999999 and all(abs(_dot(_sub(vertices[k], p0), normal)) < _PLANE_TOL for k in faces[j]):
                    remaining.remove(j)
                    stack.append(j)
        plane = _plane(vertices, faces, normals, sorted(support), edges, total_area)
        if plane:
            selected.append(plane)
            assigned.update(support)

    remaining = set(range(len(faces))) - assigned
    regions = []
    region_adjacent = [[j for j in adjacent[i] if _dot(normals[i], normals[j]) > .5 or
                        _dot(normals[i], normals[i]) < .1 or _dot(normals[j], normals[j]) < .1]
                       for i in range(len(faces))]
    groups = [set(group) for group in _components(remaining, region_adjacent)]
    labels = {i: g for g, group in enumerate(groups) for i in group}
    small = [(len(group), g) for g, group in enumerate(groups) if len(group) < 24]
    heapq.heapify(small)
    while small:
        count, g = heapq.heappop(small)
        if count != len(groups[g]) or not count or count >= 24:
            continue
        neighbors = defaultdict(int)
        for i in groups[g]:
            for j in adjacent[i]:
                other = labels.get(j, g)
                if other != g:
                    neighbors[other] += 1
        if not neighbors:
            continue
        target = max(neighbors, key=lambda other: (neighbors[other], len(groups[other]), -other))
        for i in groups[g]:
            labels[i] = target
        groups[target].update(groups[g])
        groups[g].clear()
        if len(groups[target]) < 24:
            heapq.heappush(small, (len(groups[target]), target))
    for group in groups:
        if not group:
            continue
        pending = set(group)
        while pending:
            seed = min(pending)
            pending.remove(seed)
            queue, support = deque([seed]), []
            while queue and len(support) < 4096:
                i = queue.popleft()
                support.append(i)
                for j in adjacent[i]:
                    if j in pending:
                        pending.remove(j)
                        queue.append(j)
            # Re-queue the frontier as pending material so each emitted chunk
            # remains connected rather than slicing triangle-number ranges.
            pending.update(queue)
            support.sort()
            points = [vertices[j] for i in support for j in faces[i]]
            origin = [sum(p[k] for p in points) / len(points) for k in range(3)]
            normal = _unit(tuple(sum(normals[i][k] for i in support) for k in range(3)))
            if _dot(normal, normal) < .5:
                normal = next((normals[i] for i in support if _dot(normals[i], normals[i]) > .5), (0., 0., 1.))
            region = {"kind": "surface_region", "geometry": {"type": "source_region", "origin": origin,
                      "normal": list(normal), "triangle_indices": support}, "measurement": {"method": METHOD,
                      "parameterization": "none", "normal_role": "reference_only", "support_triangle_count": len(support)},
                      "function_status": "unknown", "semantic_role": "unparameterized_surface"}
            regions.append(region)
    selected.extend(regions)
    selected.sort(key=lambda f: (f["geometry"]["type"], f["kind"], f["geometry"]["origin"], f["geometry"]["triangle_indices"][0]))
    analytic = sum(len(f["geometry"]["triangle_indices"]) for f in selected if f["geometry"]["type"] != "source_region")
    represented = sum(len(f["geometry"]["triangle_indices"]) for f in selected)
    return {"method": METHOD, "features": selected, "regions": regions, "triangle_count": len(faces),
            "coverage": {"total_triangles": len(faces), "analytic_triangle_count": analytic,
                         "source_region_triangle_count": represented - analytic, "represented_triangle_count": represented,
                         "unrepresented_triangle_count": len(faces) - represented,
                         "analytic_fraction": analytic / len(faces) if faces else 1.,
                         "represented_fraction": represented / len(faces) if faces else 1.},
            "limitations": ["Measured surface coverage does not establish interface function or completed engineering review.",
                            "Analytic surfaces describe only the indexed source triangles; clipped rims, holes and disconnected material remain finite.",
                            "Unparameterized source regions preserve material without asserting a geometric primitive or mating role."]}


def extract(raw):
    """Return finite geometry and a complete, non-overlapping triangle census."""
    digest = hashlib.sha256(raw).hexdigest()
    key = METHOD + ":" + digest
    if key not in _CACHE:
        result = _extract_uncached(raw)
        result["geometry_digest"] = "sha256:" + digest
        _CACHE[key] = result
        if len(_CACHE) > _CACHE_LIMIT:
            _CACHE.popitem(last=False)
    _CACHE.move_to_end(key)
    return deepcopy(_CACHE[key])


def discover(raw):
    """Discover geometry directly from binary STL; all function stays unknown."""
    return extract(raw)["features"]
