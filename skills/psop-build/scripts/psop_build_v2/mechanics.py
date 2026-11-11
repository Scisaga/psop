"""Replayable mesh feature and compatibility *candidates*, never assembly proof.

Only finite cylinders aligned with a source mesh's X/Y/Z axes are supported.
Source triangle winding distinguishes inward and outward walls. Facet residuals
describe numerical mesh fitting, not manufacturing or measurement uncertainty.
Matching uses the source-reference world placement; MJCF grouping is recorded
separately and is never used to decide whether two interfaces are compatible.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
import math
from pathlib import Path, PurePosixPath
import struct

METHOD = "axis-aligned-cylinder-patches/1"
WELD_M = 1e-8
AXIS_TOLERANCE_RAD = math.radians(.1)
COAXIAL_TOLERANCE_M = 2e-5
AXIAL_GAP_M = 1e-4
MIN_OVERLAP_M = 2e-4
MAX_CLEARANCE_M = 3e-4
BORE_RADIUS_DIFFERENCE_M = 7.5e-4
_CACHE: dict[str, dict] = {}

# Discovery is a separate, versioned pass.  The historical extractor below is
# deliberately unchanged: old packages must replay their original measurements.
DISCOVERY_METHOD = "normal-axis-validated-cylinder-discovery/1"
_DISCOVERY_CACHE: dict[str, list[dict]] = {}


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _length(a):
    return math.sqrt(_dot(a, a))


def _solve(matrix, values):
    rows = [list(row) + [value] for row, value in zip(matrix, values)]
    for column in range(len(rows)):
        pivot = max(range(column, len(rows)), key=lambda i: abs(rows[i][column]))
        if abs(rows[pivot][column]) < 1e-20:
            return None
        rows[pivot], rows[column] = rows[column], rows[pivot]
        factor = rows[column][column]
        rows[column] = [v / factor for v in rows[column]]
        for i in range(len(rows)):
            if i != column:
                factor = rows[i][column]
                rows[i] = [x - factor * y for x, y in zip(rows[i], rows[column])]
    return [row[-1] for row in rows]


def _mesh(raw):
    if len(raw) < 84:
        raise ValueError("Mechanical feature analysis requires a binary STL")
    count = struct.unpack_from("<I", raw, 80)[0]
    if count > 2_000_000 or len(raw) != 84 + count * 50:
        raise ValueError("Invalid or unbounded binary STL for feature analysis")
    vertices, faces, normals = [], [], []
    vertex_ids = {}
    for i in range(count):
        values = struct.unpack_from("<12fH", raw, 84 + 50 * i)
        ids = []
        for offset in (3, 6, 9):
            vertex = tuple(values[offset:offset + 3])
            if not all(math.isfinite(v) for v in vertex):
                raise ValueError("Non-finite STL coordinate")
            key = tuple(round(v / WELD_M) for v in vertex)
            if key not in vertex_ids:
                vertex_ids[key] = len(vertices)
                vertices.append(vertex)
            ids.append(vertex_ids[key])
        faces.append(ids)
        a, b, c = (vertices[j] for j in ids)
        normal = _cross(_sub(b, a), _sub(c, a))
        magnitude = _length(normal)
        normals.append(tuple(v / magnitude for v in normal) if magnitude else (0., 0., 0.))
    edges = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            edges[tuple(sorted((a, b)))].append(i)
    adjacent = [[] for _ in faces]
    for triangles in edges.values():
        if len(triangles) == 2:
            a, b = triangles
            if _dot(normals[a], normals[b]) > math.cos(math.radians(20)):
                adjacent[a].append(b)
                adjacent[b].append(a)
    return vertices, faces, normals, adjacent


def _coverage(vertices, faces, patch, radial, center):
    """Union of facet angular intervals, including the seam of a closed wall."""
    tau = 2 * math.pi
    intervals = []
    for triangle in patch:
        angles = [math.atan2(vertices[v][radial[1]] - center[1], vertices[v][radial[0]] - center[0]) % tau
                  for v in faces[triangle]]
        base = angles[0]
        angles = [base + ((angle - base + math.pi) % tau - math.pi) for angle in angles]
        low, high = min(angles), max(angles)
        while low < 0:
            low += tau
            high += tau
        if high > tau:
            intervals.extend(((low, tau), (0., high - tau)))
        else:
            intervals.append((low, high))
    total = 0.
    low, high = 0., 0.
    for a, b in sorted(intervals):
        if a > high + 1e-10:
            total += high - low
            low, high = a, b
        else:
            high = max(high, b)
    return min(1., (total + high - low) / tau)


def _extract(raw):
    """Return immutable-by-convention local mesh primitives, cached by bytes."""
    digest = hashlib.sha256(raw).hexdigest()
    cache_key = METHOD + ":" + digest
    if cache_key in _CACHE:
        return deepcopy(_CACHE[cache_key])
    vertices, faces, normals, adjacent = _mesh(raw)
    features = []
    for axis in range(3):
        radial = [i for i in range(3) if i != axis]
        eligible = {i for i, n in enumerate(normals) if _length(n) > .9 and abs(n[axis]) < .0001}
        while eligible:
            seed = min(eligible)
            eligible.remove(seed)
            stack, patch = [seed], []
            while stack:
                triangle = stack.pop()
                patch.append(triangle)
                for candidate in adjacent[triangle]:
                    if candidate in eligible:
                        eligible.remove(candidate)
                        stack.append(candidate)
            if len(patch) < 12:
                continue
            vertex_set = {v for t in patch for v in faces[t]}
            points = [(vertices[v][radial[0]], vertices[v][radial[1]]) for v in vertex_set]
            ox = sum(p[0] for p in points) / len(points)
            oy = sum(p[1] for p in points) / len(points)
            rows = [(x - ox, y - oy, 1.) for x, y in points]
            targets = [-row[0] ** 2 - row[1] ** 2 for row in rows]
            fit = _solve([[sum(r[i] * r[j] for r in rows) for j in range(3)] for i in range(3)],
                         [sum(r[i] * target for r, target in zip(rows, targets)) for i in range(3)])
            if fit is None:
                continue
            cx, cy = ox - fit[0] / 2, oy - fit[1] / 2
            radii = [math.hypot(x - cx, y - cy) for x, y in points]
            radius = sum(radii) / len(radii)
            rms = math.sqrt(sum((r - radius) ** 2 for r in radii) / len(radii))
            max_error = max(abs(r - radius) for r in radii)
            if not (.0005 <= radius <= .05) or rms > max(1e-7, radius * 1e-3) or max_error > max(5e-7, radius * 3e-3):
                continue
            minimum = min(vertices[v][axis] for v in vertex_set)
            maximum = max(vertices[v][axis] for v in vertex_set)
            if maximum - minimum < .00015:
                continue
            coverage = _coverage(vertices, faces, patch, radial, (cx, cy))
            if coverage < .35:
                continue
            origin = [0., 0., 0.]
            origin[radial[0]], origin[radial[1]], origin[axis] = cx, cy, (minimum + maximum) / 2
            radial_dots = []
            for triangle in patch:
                midpoint = [sum(vertices[v][k] for v in faces[triangle]) / 3 for k in range(3)]
                vector = [0., 0., 0.]
                vector[radial[0]], vector[radial[1]] = midpoint[radial[0]] - cx, midpoint[radial[1]] - cy
                radial_dots.append(_dot(vector, normals[triangle]) / max(_length(vector), 1e-20))
            winding = sum(radial_dots) / len(radial_dots)
            features.append({"kind": "bore_wall" if winding < -.95 else "shaft_wall" if winding > .95 else "cylinder_surface",
                             "axis_index": axis, "origin": origin, "radius": radius, "length": maximum - minimum,
                             "coverage": coverage, "rms": rms, "max_error": max_error, "triangles": sorted(patch)})
    features.sort(key=lambda f: (f["axis_index"], f["origin"], f["radius"]))
    result = {"digest": digest, "triangle_count": len(faces), "features": features}
    _CACHE[cache_key] = deepcopy(result)
    return result


def _discovery_axes(normals, adjacent):
    """Propose directions from neighbouring curved facets, including oblique axes.

    The broad normal gate is only a proposal mechanism.  Exported skinny
    triangles can have noisy normals even when their vertices lie on the same
    cylinder; every accepted patch is independently checked against its finite
    radial geometry.  No source-part identity or assembly declaration is used.
    """
    bins = defaultdict(list)
    for triangle, neighbors in enumerate(adjacent):
        for neighbor in neighbors:
            if neighbor <= triangle:
                continue
            vector = _cross(normals[triangle], normals[neighbor])
            length = _length(vector)
            if length < math.sin(math.radians(.5)):
                continue
            vector = [value / length for value in vector]
            principal = max(range(3), key=lambda i: abs(vector[i]))
            if vector[principal] < 0:
                vector = [-value for value in vector]
            bins[tuple(round(value / .002) for value in vector)].append(vector)
    axes = [[float(i == axis) for i in range(3)] for axis in range(3)]
    for _, vectors in sorted(bins.items(), key=lambda item: (-len(item[1]), item[0])):
        if len(vectors) < 12:
            continue
        vector = [sum(value[i] for value in vectors) / len(vectors) for i in range(3)]
        length = _length(vector)
        vector = [value / length for value in vector]
        if any(abs(_dot(vector, previous)) > math.cos(.001) for previous in axes):
            continue
        axes.append(vector)
        if len(axes) >= 64:
            break
    return axes


def _discovery_coordinates(vertices, axis):
    helper = min(range(3), key=lambda i: abs(axis[i]))
    radial_a = _cross(axis, [float(i == helper) for i in range(3)])
    length = _length(radial_a)
    radial_a = [value / length for value in radial_a]
    radial_b = _cross(axis, radial_a)
    return radial_a, radial_b, [(_dot(point, radial_a), _dot(point, radial_b), _dot(point, axis)) for point in vertices]


def _discovery_patch(vertices, faces, normals, patch, axis, coordinates, radial_a, radial_b):
    if len(patch) < 12:
        return None
    support = sorted({vertex for triangle in patch for vertex in faces[triangle]})
    points = [coordinates[vertex] for vertex in support]
    ox, oy = (sum(point[i] for point in points) / len(points) for i in range(2))
    rows = [(point[0] - ox, point[1] - oy, 1.) for point in points]
    targets = [-row[0] ** 2 - row[1] ** 2 for row in rows]
    fit = _solve([[sum(row[i] * row[j] for row in rows) for j in range(3)] for i in range(3)],
                 [sum(row[i] * target for row, target in zip(rows, targets)) for i in range(3)])
    if fit is None:
        return None
    cx, cy = ox - fit[0] / 2, oy - fit[1] / 2
    radii = [math.hypot(point[0] - cx, point[1] - cy) for point in points]
    radius = sum(radii) / len(radii)
    if not .0005 <= radius <= .05:
        return None
    rms = math.sqrt(sum((value - radius) ** 2 for value in radii) / len(radii))
    maximum_error = max(abs(value - radius) for value in radii)
    # These vertex checks are tighter than the frozen detector.  A relaxed
    # normal proposal must not turn elliptical, drafted or curved-shell patches
    # into fictitious circular walls.
    if rms > max(1e-7, radius * 1e-4) or maximum_error > max(5e-7, radius * 1e-4):
        return None
    minimum, maximum = min(point[2] for point in points), max(point[2] for point in points)
    if maximum - minimum < .00015:
        return None
    coverage = _coverage(coordinates, faces, patch, (0, 1), (cx, cy))
    if coverage < .35:
        return None
    midpoint = (minimum + maximum) / 2
    origin = [radial_a[i] * cx + radial_b[i] * cy + axis[i] * midpoint for i in range(3)]
    winding = []
    for triangle in patch:
        center = [sum(vertices[vertex][i] for vertex in faces[triangle]) / 3 for i in range(3)]
        delta = _sub(center, origin)
        projection = _dot(delta, axis)
        radial = [delta[i] - projection * axis[i] for i in range(3)]
        winding.append(_dot(radial, normals[triangle]) / max(_length(radial), 1e-20))
    average_winding = sum(winding) / len(winding)
    kind = "bore_wall" if average_winding < -.95 else "shaft_wall" if average_winding > .95 else "cylinder_surface"
    return {"kind": kind, "geometry": {"type": "cylinder", "origin": origin, "axis": list(axis),
             "radius_m": radius, "axial_range_m": [minimum - midpoint, maximum - midpoint]},
            "support_triangle_indices": sorted(patch), "method": DISCOVERY_METHOD,
            "measurement": {"fit_rms_m": rms, "fit_max_m": maximum_error, "coverage": coverage,
                            "normal_radial_alignment": average_winding},
            "limitations": ["This is measured finite wall geometry, not a functional interface, thread, through-hole or confirmed connection.",
                            "Partial angular coverage and clipped ends remain partial; the analytic cylinder does not fill missing source material.",
                            "Search uses at most 64 normal-derived axis proposals, radius 0.5–50 mm, wall extent at least 0.15 mm and angular coverage at least 35%; other structures require another method."]}


def discover_structures(raw):
    """Discover traceable cylindrical wall candidates without functional claims.

    Returned origins/axes/ranges are in the source mesh frame, in metres.
    Triangle witnesses always address the supplied binary STL.  Results do not
    depend on Part names, selectors, reference-pose mates or known hole counts.
    """
    key = DISCOVERY_METHOD + ":" + hashlib.sha256(raw).hexdigest()
    if key in _DISCOVERY_CACHE:
        return deepcopy(_DISCOVERY_CACHE[key])
    vertices, faces, normals, adjacent = _mesh(raw)
    candidates = []
    for axis in _discovery_axes(normals, adjacent):
        radial_a, radial_b, coordinates = _discovery_coordinates(vertices, axis)
        eligible = {i for i, normal in enumerate(normals)
                    if _length(normal) > .9 and abs(_dot(normal, axis)) <= .005}
        for seed in sorted(eligible):
            if seed not in eligible:
                continue
            eligible.remove(seed)
            stack, patch = [seed], []
            while stack:
                triangle = stack.pop()
                patch.append(triangle)
                for neighbor in adjacent[triangle]:
                    if neighbor in eligible:
                        eligible.remove(neighbor)
                        stack.append(neighbor)
            candidate = _discovery_patch(vertices, faces, normals, patch, axis, coordinates, radial_a, radial_b)
            if candidate:
                candidates.append(candidate)
    # Equivalent normal hypotheses must not duplicate a measured finite wall.
    selected, supports = [], []
    for candidate in sorted(candidates, key=lambda value: (-len(value["support_triangle_indices"]),
                             value["measurement"]["fit_rms_m"], value["geometry"]["axis"])):
        support = set(candidate["support_triangle_indices"])
        if any(len(support & previous) / min(len(support), len(previous)) > .8
               and abs(_dot(candidate["geometry"]["axis"], item["geometry"]["axis"])) > .999
               for item, previous in zip(selected, supports)):
            continue
        selected.append(candidate)
        supports.append(support)
    selected.sort(key=lambda value: (value["geometry"]["axis"], value["geometry"]["origin"], value["geometry"]["radius_m"]))
    _DISCOVERY_CACHE[key] = deepcopy(selected)
    return selected


def _rotate(vector, quaternion):
    x, y, z, w = quaternion
    magnitude = math.sqrt(x * x + y * y + z * z + w * w)
    if magnitude < 1e-12:
        raise ValueError("Invalid source placement quaternion")
    q = (x / magnitude, y / magnitude, z / magnitude)
    w /= magnitude
    uv = _cross(q, vector)
    uuv = _cross(q, uv)
    return [vector[i] + 2 * (w * uv[i] + uuv[i]) for i in range(3)]


def _world(feature, part):
    geometry = feature["geometry"]
    # A nonuniform transform turns a circular cylinder into an ellipse. Skip it.
    scale = part.get("scale", [1., 1., 1.])
    if max(scale) - min(scale) > 1e-10 or min(scale) <= 0:
        return None
    origin = _rotate([value * scale[i] for i, value in enumerate(geometry["origin"])], part["quaternion"])
    axis = _rotate(geometry["axis"], part["quaternion"])
    origin = [value + part["position"][i] for i, value in enumerate(origin)]
    return {"origin": origin, "axis": axis, "radius": geometry["radius_m"] * scale[0],
            "half_length": geometry["axial_range_m"][1] * scale[0], "feature": feature}


def _groups(features):
    """Join neighbouring coaxial walls of one kind into one stepped interface."""
    groups = []
    for feature in features:
        geometry = feature["geometry"]
        attached = []
        for i, group in enumerate(groups):
            if group[0]["kind"] != feature["kind"]:
                continue
            for existing in group:
                previous = existing["geometry"]
                if previous["axis"] != geometry["axis"]:
                    continue
                delta = _sub(previous["origin"], geometry["origin"])
                offset = abs(_dot(delta, geometry["axis"]))
                radial = _length(_cross(delta, geometry["axis"]))
                gap = max(0., offset - previous["axial_range_m"][1] - geometry["axial_range_m"][1])
                if radial <= 2e-6 and gap <= 1e-5:
                    attached.append(i)
                    break
        if not attached:
            groups.append([feature])
        else:
            target = groups[attached[0]]
            target.append(feature)
            for i in reversed(attached[1:]):
                target.extend(groups.pop(i))
    return groups


def _pair(a, b):
    """Require actual transformed cylinder compatibility, independent of bodies."""
    angle = math.acos(min(1., abs(_dot(a[0]["axis"], b[0]["axis"]))))
    if angle > AXIS_TOLERANCE_RAD:
        return None
    delta = _sub(b[0]["origin"], a[0]["origin"])
    distance = _length(_cross(delta, a[0]["axis"]))
    if distance > COAXIAL_TOLERANCE_M:
        return None
    axis = a[0]["axis"]
    intervals = []
    for group in (a, b):
        intervals.append((min(_dot(v["origin"], axis) - v["half_length"] for v in group),
                          max(_dot(v["origin"], axis) + v["half_length"] for v in group)))
    overlap = min(i[1] for i in intervals) - max(i[0] for i in intervals)
    kinds = (a[0]["feature"]["kind"], b[0]["feature"]["kind"])
    checks = [{"kind": "axis_angle", "result": "pass", "residual": angle, "threshold": AXIS_TOLERANCE_RAD, "unit": "rad"},
              {"kind": "axis_distance", "result": "pass", "residual": distance, "threshold": COAXIAL_TOLERANCE_M, "unit": "m"}]
    if kinds == ("bore_wall", "bore_wall"):
        # Disjoint adjacent finite bore segments may admit a shared fastener.
        # A hole does not couple directly to another hole; retain this explicitly.
        if overlap > AXIAL_GAP_M or overlap < -AXIAL_GAP_M:
            return None
        difference = abs(min(v["radius"] for v in a) - min(v["radius"] for v in b))
        if difference > BORE_RADIUS_DIFFERENCE_M:
            return None
        checks.extend(({"kind": "finite_axial_gap", "result": "pass", "residual": abs(overlap), "threshold": AXIAL_GAP_M, "unit": "m"},
                       {"kind": "bore_radius_difference", "result": "pass", "residual": difference, "threshold": BORE_RADIUS_DIFFERENCE_M, "unit": "m"}))
        unresolved = ["Shared fastener, thread, head seating and retention are not established by the mesh.",
                      "Supporting-face contact, assembly state and joint rigidity require additional evidence."]
    elif set(kinds) == {"bore_wall", "shaft_wall"}:
        if overlap < MIN_OVERLAP_M:
            return None
        bores, shafts = (a, b) if kinds[0] == "bore_wall" else (b, a)
        compatible = []
        for bore in bores:
            for shaft in shafts:
                clearance = bore["radius"] - shaft["radius"]
                lower = max(_dot(bore["origin"], axis) - bore["half_length"], _dot(shaft["origin"], axis) - shaft["half_length"])
                upper = min(_dot(bore["origin"], axis) + bore["half_length"], _dot(shaft["origin"], axis) + shaft["half_length"])
                if -2e-6 <= clearance <= MAX_CLEARANCE_M and upper - lower >= MIN_OVERLAP_M:
                    compatible.append((abs(clearance), clearance, upper - lower))
        if not compatible:
            return None
        _, clearance, finite_overlap = min(compatible)
        checks.extend(({"kind": "finite_axial_overlap", "result": "pass", "residual": finite_overlap, "threshold": MIN_OVERLAP_M, "unit": "m"},
                       {"kind": "radial_clearance", "result": "pass", "residual": clearance, "threshold": MAX_CLEARANCE_M, "unit": "m"}))
        unresolved = ["Fit class, manufacturing tolerances, insertion path, retention and contact are not established.",
                      "This source-reference overlap does not establish an assembled or load-bearing connection."]
    else:
        return None
    return checks, unresolved


def _asset(root, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or any(p in {"..", "."} for p in path.parts) or "\\" in relative or ":" in relative:
        raise ValueError("Unsafe source geometry path")
    target = (root / Path(*path.parts)).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("Geometry path escapes package")
    return target


def analysis_for(scene: dict, package_root: Path) -> dict:
    """Deterministically rebuild versioned candidates from packaged source bytes."""
    root = Path(package_root)
    parts = scene["parts"]
    sources = {s["url"]: s for s in scene["sources"]}
    frames, features, interfaces = [], [], []
    by_interface, mesh_results = {}, {}
    for part in parts:
        relative = part["geometryUrl"]
        if relative not in mesh_results:
            raw = _asset(root, relative).read_bytes()
            mesh_results[relative] = _extract(raw)
        extracted = mesh_results[relative]
        source = sources[relative]
        if source["digest"].removeprefix("sha256:") != extracted["digest"]:
            raise ValueError("Feature geometry digest disagrees with source registry")
        suffix = part["id"].removeprefix("part:")
        frame_id = "frame:" + suffix + ":source-mesh"
        evidence = list(part["evidenceIds"])
        frames.append({"id": frame_id, "owner_ref": part["id"], "attached_to": part["id"] + "#source-mesh",
                       "pose": {"expressed_in": part["id"], "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.]},
                       "revision": "source-mesh@" + extracted["digest"][:16], "evidence_refs": evidence})
        owned = []
        for primitive in extracted["features"]:
            token = hashlib.sha256((extracted["digest"] + ":" + ",".join(map(str, primitive["triangles"]))).encode()).hexdigest()[:12]
            half = primitive["length"] / 2
            feature = {"id": "feature:" + suffix + ":" + token, "owner_ref": part["id"], "frame_ref": frame_id,
                       "kind": primitive["kind"], "geometry_source_ref": source["id"], "geometry_digest": "sha256:" + extracted["digest"],
                       "geometry": {"type": "cylinder", "axis": [1. if i == primitive["axis_index"] else 0. for i in range(3)],
                                    "origin": primitive["origin"], "radius_m": primitive["radius"], "axial_range_m": [-half, half],
                                    "triangle_indices": primitive["triangles"]},
                       "measurement": {"basis": "calculated", "method": METHOD, "fit_rms_m": primitive["rms"],
                                       "fit_max_m": primitive["max_error"], "coverage": primitive["coverage"]},
                       "source_refs": list(part["sourceIds"]), "evidence_refs": evidence}
            features.append(feature)
            owned.append(feature)
        # Partial walls are visible measured features, but not independent interfaces.
        for group in _groups([f for f in owned if f["measurement"]["coverage"] >= .95 and f["kind"] in {"bore_wall", "shaft_wall"}]):
            feature_refs = sorted(f["id"] for f in group)
            token = hashlib.sha256("|".join(feature_refs).encode()).hexdigest()[:12]
            interface = {"id": "interface:" + suffix + ":" + token, "owner_ref": part["id"], "frame_ref": frame_id,
                         "feature_refs": feature_refs, "status": "candidate",
                         "mechanism_candidates": ["fastened_mount", "cylindrical_fit"] if group[0]["kind"] == "bore_wall" else ["cylindrical_fit"],
                         "unresolved_requirements": ["Cylindrical geometry alone does not establish thread, tolerance, mate identity or actual engagement."],
                         "source_refs": list(part["sourceIds"]), "evidence_refs": evidence}
            interfaces.append(interface)
            transformed = [_world(f, part) for f in group]
            if all(transformed):
                by_interface[interface["id"]] = transformed
    candidates = []
    device_id = parts[0]["id"].split(":")[1] if parts else "unknown"
    for i, left in enumerate(interfaces):
        if left["id"] not in by_interface:
            continue
        for right in interfaces[i + 1:]:
            if left["owner_ref"] == right["owner_ref"] or right["id"] not in by_interface:
                continue
            pairing = _pair(by_interface[left["id"]], by_interface[right["id"]])
            if pairing is None:
                continue
            checks, unresolved = pairing
            token = hashlib.sha256((left["id"] + "|" + right["id"]).encode()).hexdigest()[:16]
            candidates.append({"id": "connection-candidate:" + device_id + ":" + token,
                               "configuration_ref": "configuration:" + device_id + ":source-qpos0",
                               "endpoint_refs": [{"part_ref": item["owner_ref"], "interface_ref": item["id"], "feature_refs": item["feature_refs"]}
                                                 for item in (left, right)], "status": "geometric_candidate", "checks": checks,
                               "unresolved_requirements": unresolved,
                               "source_refs": sorted(set(left["source_refs"] + right["source_refs"])),
                               "evidence_refs": sorted(set(left["evidence_refs"] + right["evidence_refs"]))})
    bodies = {body["name"]: body for body in scene.get("bodies", [])}
    part_map = {p["id"]: p for p in parts}
    relations = []
    for body in bodies.values():
        references = list(body["partIds"])
        if len(references) > 1:
            relations.append({"id": "reference-relation:" + body["id"] + ":members", "kind": "same_source_body",
                              "part_refs": references, "source_body_ref": body["id"],
                              "evidence_refs": sorted({e for p in references for e in part_map[p]["evidenceIds"] if e.endswith(":xml")})})
    for joint in scene.get("joints", []):
        body, parent = bodies[joint["body"]], bodies[joint["parent"]]
        references = parent["partIds"] + body["partIds"]
        relations.append({"id": "reference-relation:" + joint["id"], "kind": "source_joint", "part_refs": references,
                          "source_body_ref": body["id"], "source_joint_ref": joint["id"],
                          "evidence_refs": sorted({e for p in references for e in part_map[p]["evidenceIds"] if e.endswith(":xml")})})
    with_features = {f["owner_ref"] for f in features}
    return {"frames": frames, "features": features, "interfaces": interfaces, "connection_candidates": candidates,
            "reference_relations": relations, "analysis": {
                "method": METHOD, "unit": "m", "features_count": len(features), "interfaces_count": len(interfaces),
                "connection_candidates_count": len(candidates), "meshes_analyzed": len(mesh_results),
                "coverage": {"mesh_count": len(mesh_results), "part_count": len(parts), "parts_with_features": len(with_features),
                             "parts_without_features": len(parts) - len(with_features), "primitive_types": ["cylinder"]},
                "limitations": ["Only axis-aligned cylindrical patches in the source mesh are searched; unsupported shapes are not evidence of no interface.",
                                "Detection requires radius 0.5–50 mm, axial wall extent at least 0.15 mm and adequately resolved smooth facets; only walls with at least 95% angular coverage become interface candidates.",
                                "Bore/shaft labels follow source facet winding; no thread or through-hole classification is inferred.",
                                "Mesh-fit errors are numerical residuals, not dimensional uncertainty or manufacturing tolerance.",
                                "Candidate pairings use the source qpos0 reference placement, without exploded display offsets.",
                                "No thread, fastener, electrical pinout, engagement, motion freedom or load capacity is confirmed.",
                                "MJCF body and joint relations describe the source model, not a whitelist of valid physical connections."]}}
