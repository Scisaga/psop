"""Finite consistency of explicitly hypothetical through-bracket schematics.

This verifies source-pose geometry, not a continuous path, threads or retention.
The validator checks source constraints independently of pose generation.
"""
from copy import deepcopy
import math

from . import mechanics, semantics
from .connection_review import _quaternion_z

METHOD = "reference-connector-direction/1"
TOL = .00002


def _sub(a, b):
    return [x - y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _close(a, b, tolerance=TOL):
    return len(a) == len(b) and all(abs(x - y) <= tolerance for x, y in zip(a, b))


def _direction(part, vector):
    result = mechanics._rotate(vector, part["quaternion"])
    length = math.sqrt(_dot(result, result))
    return [value / length for value in result]


def _sections(hole, part, features, seat, direction):
    scale = part["scale"]
    if min(scale) <= 0 or max(scale) - min(scale) > 1e-9:
        raise ValueError("Connector hypothesis requires positive uniform source scale")
    result = []
    for ref in hole["wall_feature_refs"]:
        feature = features[ref]
        g = feature["geometry"]
        if feature["owner_ref"] != part["id"] or feature["kind"] != "bore_wall" or g["type"] != "cylinder":
            raise ValueError("Unsupported finite through-bracket hole geometry")
        axis = _direction(part, g["axis"])
        if abs(_dot(axis, direction)) < .999999:
            raise ValueError("Connector section axis is not aligned")
        ends = [semantics._world_point(part, [g["origin"][i] + g["axis"][i] * t for i in range(3)]) for t in g["axial_range_m"]]
        for point in ends:
            delta = _sub(point, seat)
            depth = _dot(delta, direction)
            if math.sqrt(sum((delta[i] - depth * direction[i]) ** 2 for i in range(3))) > TOL:
                raise ValueError("Connector section is laterally displaced")
        interval = sorted(_dot(_sub(point, seat), direction) for point in ends)
        result.append({"part_ref": part["id"], "hole_ref": hole["id"], "feature_ref": ref, "range_m": interval})
    if not result:
        raise ValueError("Connector hypothesis requires finite source walls")
    return result


def _bindings(data, scene, mount, pair):
    sites = {s["id"]: s for s in data["mounting_sites"]}
    parts = {p["id"]: p for p in scene["parts"]}
    holes = {h["id"]: h for h in data["logical_holes"]}
    members = [sites[ref] for ref in pair["site_refs"]]
    bracket = next(s for s in members if s["role"] == "bracket_mount")
    housing = next(s for s in members if s["role"] == "housing_mount")
    if bracket["owner_ref"] == housing["owner_ref"] or {p["part_ref"] for p in mount["participants"]} != {bracket["owner_ref"], housing["owner_ref"]}:
        raise ValueError("Connector binding requires the actual two reference participants")
    return bracket, housing, parts, holes


def _candidate(data, scene, mount, pair, component):
    bracket, housing, parts, holes = _bindings(data, scene, mount, pair)
    carrier, target_part = parts[bracket["owner_ref"]], parts[housing["owner_ref"]]
    hole = holes[bracket["hole_ref"]]
    target = semantics._world_point(target_part, housing["position"])
    direction = _direction(target_part, housing["entry_direction"])
    candidates = []
    for portal in hole["portals"]:
        seat = semantics._world_point(carrier, portal["position"])
        outward = _direction(carrier, portal["normal"])
        delta = _sub(target, seat)
        depth = _dot(delta, direction)
        if portal["status"] == "opening" and _dot(outward, direction) < -.999999 and depth > TOL and math.sqrt(sum((delta[i] - depth * direction[i]) ** 2 for i in range(3))) <= TOL:
            candidates.append((portal, seat))
    if len(candidates) != 1:
        raise ValueError("Outer entry is not uniquely supported by the declared through-bracket hypothesis")
    portal, seat = candidates[0]
    features = {f["id"]: f for f in data["features"]}
    sections = _sections(hole, carrier, features, seat, direction) + _sections(holes[housing["hole_ref"]], target_part, features, seat, direction)
    return {"status": "illustrative_hypothesis", "hypothesis": "through_bracket_toward_housing", "reference_mount_ref": mount["id"],
            "configuration_ref": mount["configuration_ref"], "site_refs": sorted(pair["site_refs"]), "entry_part_ref": carrier["id"],
            "entry_portal_ref": portal["id"], "target_site_ref": housing["id"], "head_seat_world": seat, "axis_world": direction,
            "sections": sections, "checks": {"finite_geometry": "pass", "continuous_path": "not_evaluated", "retention": "unknown"}}


def augment_analysis(base, scene):
    result = deepcopy(base)
    reviews = {r["id"]: r for r in result["connection_reviews"]}
    mounts = {m["id"]: m for m in result["reference_mounts"]}
    kept, omitted, omitted_reviews = [], set(), set()
    for component in result["supplemental_components"]:
        component["insertion"] = None
        if component["usage"] == "reference_connector":
            review = reviews[component["review_ref"]]
            matches = []
            # IDs locate an existing binding; their order never selects a direction.
            from . import mounting
            for ref in review["reference_mount_refs"]:
                mount = mounts[ref]
                for pair in mount["site_pairs"]:
                    token = mounting._token(mount["id"] + ":" + "|".join(pair["site_refs"]))
                    if component["id"].endswith(":reference-screw-" + token):
                        matches.append((mount, pair))
            try:
                if len(matches) != 1:
                    raise ValueError("Unresolved reference connector binding")
                component["insertion"] = _candidate(result, scene, *matches[0], component)
                component["pose"]["position"] = component["insertion"]["head_seat_world"][:]
                component["pose"]["quaternion"] = _quaternion_z(component["insertion"]["axis_world"])
                component["unconfirmed_fields"].append("actual device insertion side and head seat")
                validate_component(result, scene, component)
            except (ValueError, KeyError, StopIteration):
                omitted.add(component["id"]); omitted_reviews.add(component["review_ref"])
                continue
        kept.append(component)
    result["supplemental_components"] = kept
    for review in result["connection_reviews"]:
        for path in review["role_paths"] + review["alternatives"]:
            path["component_refs"] = [ref for ref in path["component_refs"] if ref not in omitted]
        if review["id"] in omitted_reviews:
            review["missing_requirements"].append("Reference connector schematic omitted: no supported finite insertion hypothesis.")
    result["analysis"].update(method=METHOD, supplemental_components_count=len(kept))
    result["analysis"]["limitations"].append("Reference connector insertion is an explicitly unconfirmed through-bracket hypothesis checked against finite source walls; thread, continuous motion, real dimensions and retention are not established.")
    return result


def validate_component(data, scene, component):
    """Check constraints from source geometry without calling the pose generator."""
    path = component.get("insertion")
    if component["usage"] != "reference_connector":
        if path is not None:
            raise ValueError("Alternative illustration cannot acquire a checked reference insertion")
        return
    if not path or path["status"] != "illustrative_hypothesis" or path["hypothesis"] != "through_bracket_toward_housing" or path["checks"] != {"finite_geometry": "pass", "continuous_path": "not_evaluated", "retention": "unknown"}:
        raise ValueError("Reference schematic must retain its limited hypothesis status")
    mount = next(m for m in data["reference_mounts"] if m["id"] == path["reference_mount_ref"])
    review = next(r for r in data["connection_reviews"] if r["id"] == component["review_ref"])
    if mount["id"] not in review["reference_mount_refs"] or path["configuration_ref"] != mount["configuration_ref"]:
        raise ValueError("Insertion borrows another reference binding")
    pair = next(p for p in mount["site_pairs"] if sorted(p["site_refs"]) == path["site_refs"])
    bracket, housing, parts, holes = _bindings(data, scene, mount, pair)
    carrier, target_part = parts[bracket["owner_ref"]], parts[housing["owner_ref"]]
    portal = next(p for p in holes[bracket["hole_ref"]]["portals"] if p["id"] == path["entry_portal_ref"])
    seat = semantics._world_point(carrier, portal["position"])
    direction = mechanics._rotate([0., 0., 1.], component["pose"]["quaternion"])
    if path["entry_part_ref"] != carrier["id"] or path["target_site_ref"] != housing["id"] or portal["status"] != "opening":
        raise ValueError("Insertion must use its own reference hole and target")
    if component["pose"]["scale"] != [1., 1., 1.] or not _close(seat, component["pose"]["position"], 1e-8) or not _close(seat, path["head_seat_world"], 1e-8) or not _close(direction, path["axis_world"], 1e-8):
        raise ValueError("Schematic head seat or local shaft axis contradicts the insertion")
    if _dot(_direction(carrier, portal["normal"]), direction) > -.999999 or _dot(_direction(target_part, housing["entry_direction"]), direction) < .999999:
        raise ValueError("Schematic shaft points away from its declared entrance or target")
    target = semantics._world_point(target_part, housing["position"])
    delta = _sub(target, seat)
    target_depth = _dot(delta, direction)
    length = component["geometry"]["shaft_length_m"]
    if target_depth <= TOL or target_depth >= length - TOL:
        raise ValueError("Finite schematic shaft does not reach its target")
    features = {f["id"]: f for f in data["features"]}
    sections = _sections(holes[bracket["hole_ref"]], carrier, features, seat, direction) + _sections(holes[housing["hole_ref"]], target_part, features, seat, direction)
    if len(sections) != len(path["sections"]) or any({k: v for k, v in expected.items() if k != "range_m"} != {k: v for k, v in actual.items() if k != "range_m"} or not _close(expected["range_m"], actual["range_m"], 1e-9) for expected, actual in zip(sections, path["sections"])):
        raise ValueError("Finite insertion sections contradict source geometry")
    first = [s["range_m"] for s in sections if s["part_ref"] == carrier["id"]]
    second = [s["range_m"] for s in sections if s["part_ref"] == target_part["id"]]
    if abs(min(s[0] for s in first)) > TOL or max(s[1] for s in first) > target_depth + TOL or any(s[1] <= max(0., s[0]) + TOL for s in second) or not any(min(s[1], length) > max(s[0], 0.) + TOL for s in second):
        raise ValueError("Finite material sections are not ordered or covered by the declared shaft")


def validate(data, scene):
    for component in data["supplemental_components"]:
        try:
            validate_component(data, scene, component)
        except (KeyError, StopIteration) as error:
            raise ValueError("Unresolved insertion source reference") from error
