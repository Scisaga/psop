"""Bounded, witnessed repair of reference translations; never alter mesh facts.

The device input identifies finite mating regions and an engineering correction
budget. A minimum-norm translation is inferred from their constraints, checked
against every declared neighboring relation, and published as a derived frame.
This is reference-data reconciliation, not general assembly or path solving.
"""
from copy import deepcopy
import hashlib
import math
from pathlib import Path
import struct

from .capability_catalog import canonical
from . import mechanics as m

METHOD = "witnessed-minimum-reference-translation/1"
INPUT_PATH = "sources/SRC-REFERENCE-ADJUSTMENTS.json"
REPORT_PATH = "indexes/reference-alignment.json"


def _unit(v):
    n = m._length(v)
    if n < 1e-15:
        raise ValueError("Reference alignment requires a finite nonzero direction")
    return [x/n for x in v]


def _point(part, value):
    v = m._rotate([a*b for a, b in zip(value, part.get("scale", [1, 1, 1]))], part.get("quaternion", [0, 0, 0, 1]))
    return [a+b for a, b in zip(part.get("position", [0, 0, 0]), v)]


def _direction(part, value):
    return _unit(m._rotate(value, part.get("quaternion", [0, 0, 0, 1])))


def _basis(axis):
    helper = min(([1, 0, 0], [0, 1, 0], [0, 0, 1]), key=lambda v: abs(m._dot(v, axis)))
    u = _unit(m._cross(axis, helper))
    return u, _unit(m._cross(axis, u))


def _minimum_translation(rows, tolerance):
    # Orthogonal row reduction gives the unique minimum-length solution even
    # when constraints intentionally leave sliding directions unconstrained.
    basis, values = [], []
    for normal, target in rows:
        normal = list(normal)
        for axis, value in zip(basis, values):
            projection = m._dot(normal, axis)
            normal = [x-projection*y for x, y in zip(normal, axis)]
            target -= projection*value
        size = m._length(normal)
        if size < 1e-10:
            if abs(target) > tolerance:
                raise ValueError("Reference alignment constraints contradict each other")
            continue
        basis.append([x/size for x in normal])
        values.append(target/size)
    if not basis:
        raise ValueError("Reference alignment has no independent geometric constraint")
    return [sum(value*axis[k] for axis, value in zip(basis, values)) for k in range(3)]


def _geometry(ref, features, parts):
    f = features[ref]
    p = parts[f["owner_ref"]]
    if any(abs(x-1) > 1e-12 for x in p.get("scale", [1, 1, 1])):
        raise ValueError("Reference translation currently requires unit source scale")
    g = f["geometry"]
    return f, p, g, _point(p, g["origin"])


def _metrics(check, features, parts):
    af, ap, a, ac = _geometry(check["feature_a_ref"], features, parts)
    bf, bp, b, bc = _geometry(check["feature_b_ref"], features, parts)
    delta = m._sub(bc, ac)
    kind = check["kind"]
    if kind == "plane_contact":
        if a["type"] != "plane" or b["type"] != "plane":
            raise ValueError("Plane contact requires two measured finite planes")
        normal = _direction(ap, a["normal"])
        if m._dot(normal, _direction(bp, b["normal"])) > -.999999:
            raise ValueError("Reference contact normals are not opposed")
        return {"signed_gap_m": m._dot(delta, normal)}
    if kind not in {"axis_alignment", "cylindrical_fit"} or any(g["type"] not in {"cylinder", "conical_frustum"} for g in (a, b)):
        raise ValueError("Unsupported reference alignment constraint")
    if kind == "cylindrical_fit" and any(g["type"] != "cylinder" for g in (a, b)):
        raise ValueError("Conical fit needs a separate shape assessment; translation alone does not qualify it")
    axis = _direction(ap, a["axis"])
    angle = math.acos(min(1., abs(m._dot(axis, _direction(bp, b["axis"])))))
    distance = m._length([x-m._dot(delta, axis)*v for x, v in zip(delta, axis)])
    intervals = []
    for part, g in ((ap, a), (bp, b)):
        ends = [_point(part, [x+t*v for x, v in zip(g["origin"], g["axis"])]) for t in g.get("axial_range_m", [0., g.get("length_m", 0.)])]
        intervals.append(sorted(m._dot(m._sub(v, ac), axis) for v in ends))
    overlap = min(x[1] for x in intervals)-max(x[0] for x in intervals)
    result = {"axis_distance_m": distance, "axis_angle_rad": angle,
        "finite_axial_overlap_m": max(0., overlap), "finite_axial_gap_m": max(0., -overlap)}
    if kind == "cylindrical_fit":
        if {af["kind"], bf["kind"]} != {"bore_wall", "shaft_wall"}:
            raise ValueError("Cylindrical fit requires a finite bore and shaft")
        bore, shaft = (a, b) if af["kind"] == "bore_wall" else (b, a)
        result["radial_clearance_m"] = bore["radius_m"]-shaft["radius_m"]-distance
    return result


def _passed(check, result, tolerance):
    if check["kind"] == "plane_contact":
        return abs(result["signed_gap_m"]-check.get("target_gap_m", 0.)) <= tolerance
    return (result["axis_distance_m"] <= check.get("maximum_axis_distance_m", tolerance)+tolerance
        and result["axis_angle_rad"] <= check.get("maximum_angle_rad", 1e-5)
        and result["finite_axial_overlap_m"]+tolerance >= check.get("minimum_axial_overlap_m", 0.)
        and result["finite_axial_gap_m"] <= check.get("maximum_axial_gap_m", 0.)+tolerance
        and result.get("radial_clearance_m", 0.)+tolerance >= check.get("minimum_radial_clearance_m", 0.))


def _overlap(a, b):
    # Sutherland-Hodgman on finite source triangles, not plane/AABB filling.
    def cross(v, w): return v[0]*w[1]-v[1]*w[0]
    if cross(m._sub(b[1], b[0]), m._sub(b[2], b[0])) < 0:
        b = list(reversed(b))
    poly = list(a)
    for p, q in zip(b, b[1:]+b[:1]):
        if not poly:
            break
        output = []
        for start, end in zip(poly, poly[1:]+poly[:1]):
            ds = cross(m._sub(q, p), m._sub(start, p))
            de = cross(m._sub(q, p), m._sub(end, p))
            if ds >= -1e-20:
                output.append(start)
            if (ds >= -1e-20) != (de >= -1e-20):
                t = ds/(ds-de)
                output.append([x+t*(y-x) for x, y in zip(start, end)])
        poly = output
    return abs(sum(cross(a, b) for a, b in zip(poly, poly[1:]+poly[:1])))/2 if len(poly) >= 3 else 0.


def _finite_overlap(check, features, parts, root):
    _, part, g, origin = _geometry(check["feature_a_ref"], features, parts)
    normal = _direction(part, g["normal"])
    u, v = _basis(normal)
    triangles = []
    for ref in ("feature_a_ref", "feature_b_ref"):
        f = features[check[ref]]
        p = parts[f["owner_ref"]]
        raw = (Path(root)/p["geometryUrl"]).read_bytes()
        found = []
        for i in f["geometry"]["triangle_indices"]:
            values = struct.unpack_from("<12fH", raw, 84+i*50)
            points = [_point(p, values[j:j+3]) for j in (3, 6, 9)]
            if any(abs(m._dot(m._sub(point, _point(p, f["geometry"]["origin"])), _direction(p, f["geometry"]["normal"]))) > 2e-8 for point in points):
                raise ValueError("Reference contact witness is not a finite source plane")
            found.append([[m._dot(m._sub(point, origin), d) for d in (u, v)] for point in points])
        triangles.append(found)
    return sum(_overlap(a, b) for a in triangles[0] for b in triangles[1])


def reconcile(scene, catalog, root, request):
    if request.get("schema") != "psop.reference-adjustments/1" or request.get("device_id") != scene["meta"]["deviceId"]:
        raise ValueError("Reference adjustment input belongs to another contract/device")
    parts = {p["id"]: deepcopy(p) for p in scene["parts"]}
    features = {f["id"]: f for f in catalog["features"]}
    evidence_ids = {e["id"] for e in scene.get("evidence", [])}
    tolerance = request["numerical_tolerance_m"]
    budget = request["maximum_translation_m"]
    if not (0 < tolerance <= 1e-6 and math.isfinite(budget) and 0 < budget):
        raise ValueError("Reference adjustment needs an explicit bounded engineering budget, separate from numerical tolerance")
    sources = {s["id"]: s["digest"] for s in scene["sources"]}
    if any(sources.get(k) != v for k, v in request["source_locks"].items()):
        raise ValueError("Reference adjustment source revision changed")
    report = {"schema": "psop.reference-alignment/1", "method": METHOD, "basis": "engineering_inference",
        "source_configuration_ref": "configuration:"+request["device_id"]+":source-qpos0",
        "configuration_ref": "configuration:"+request["device_id"]+":reconciled-qpos0",
        "title": request["title"], "rationale": request["rationale"], "numerical_tolerance_m": tolerance,
        "maximum_translation_m": budget, "geometry_modified": False, "actions": [],
        "validation_scope": "Declared finite mating regions and neighboring constraints; no whole-assembly collision, path, retention or load qualification"}
    touched, ids = set(), set()
    for action in request["actions"]:
        moved = set(action["part_refs"])
        if action["id"] in ids or not moved or moved & touched or not moved <= parts.keys():
            raise ValueError("Reference adjustment action has duplicate or unknown moving identities")
        ids.add(action["id"]); touched.update(moved)
        if not action["rationale"] or not action["evidence_refs"] or not set(action["evidence_refs"]) <= evidence_ids:
            raise ValueError("Reference adjustment requires attributed engineering evidence")
        checks = action["constraints"]
        if len(checks) < 2 or not any(c.get("role") == "neighbor" for c in checks):
            raise ValueError("Reference correction requires mating and neighboring constraints")
        if len({c["id"] for c in checks}) != len(checks):
            raise ValueError("Reference constraint identities must be unique")
        rows, repairs = [], []
        for check in checks:
            for field in ("feature_a_ref", "feature_b_ref"):
                if check[field] not in features or features[check[field]]["geometry_source_ref"] not in request["source_locks"]:
                    raise ValueError("Reference adjustment requires source-locked finite features")
            result = _metrics(check, features, parts)
            if check.get("role") != "repair":
                continue
            af, ap, a, ac = _geometry(check["feature_a_ref"], features, parts)
            bf, bp, b, bc = _geometry(check["feature_b_ref"], features, parts)
            coefficient = int(bf["owner_ref"] in moved)-int(af["owner_ref"] in moved)
            if not coefficient:
                raise ValueError("Repair constraints must connect a moving part to an anchored part")
            if check["kind"] == "plane_contact":
                normal = _direction(ap, a["normal"])
                rows.append(([x*coefficient for x in normal], check.get("target_gap_m", 0.)-result["signed_gap_m"]))
            else:
                if result["axis_angle_rad"] > check.get("maximum_angle_rad", 1e-5):
                    raise ValueError("Translation cannot repair angular misalignment")
                for normal in _basis(_direction(ap, a["axis"])):
                    rows.append(([x*coefficient for x in normal], -m._dot(m._sub(bc, ac), normal)))
            repairs.append(check["id"])
        if not repairs:
            raise ValueError("Reference adjustment has no witnessed repair target")
        translation = _minimum_translation(rows, tolerance)
        if m._length(translation) > budget:
            raise ValueError("Reference adjustment exceeds the declared engineering correction budget")
        before = deepcopy(parts)
        for owner in sorted(moved):
            parts[owner]["position"] = [a+b for a, b in zip(parts[owner]["position"], translation)]
        verified = []
        for check in checks:
            previous = _metrics(check, features, before); current = _metrics(check, features, parts)
            if not _passed(check, current, tolerance):
                raise ValueError("Reference adjustment breaks a mating/neighbor constraint: "+check["id"])
            if check["kind"] == "plane_contact":
                current["finite_overlap_area_m2"] = _finite_overlap(check, features, parts, root)
                if current["finite_overlap_area_m2"] < check["minimum_overlap_area_m2"]:
                    raise ValueError("Reference contact lacks actual finite material overlap")
            verified.append({**check, "before": previous, "after": current, "passed": True})
        report["actions"].append({"id": action["id"], "rationale": action["rationale"], "evidence_refs": action["evidence_refs"],
            "translation_m": translation, "constraints": verified,
            "placements": [{"part_ref": owner, "source_position": before[owner]["position"], "position": parts[owner]["position"],
                "quaternion": parts[owner]["quaternion"]} for owner in sorted(moved)]})
    report["presentation"] = deepcopy(request.get("presentation", {}))
    available = {c["id"] for a in report["actions"] for c in a["constraints"]}
    connections = {c["id"]: c for c in catalog["reference_connections"]}
    interface_owners = {i["id"]: i["owner_ref"] for i in catalog["interfaces"]}
    checked = {c["id"]: c for a in report["actions"] for c in a["constraints"]}
    for update in report["presentation"].get("connections", []):
        if update["connection_ref"] not in connections or not update["check_refs"] or not set(update["check_refs"]) <= available:
            raise ValueError("Derived reference relation lacks checked geometric witnesses")
        owners = {interface_owners[e["interface_ref"]] for e in connections[update["connection_ref"]]["endpoints"]}
        if any({features[checked[ref][field]]["owner_ref"] for field in ("feature_a_ref", "feature_b_ref")} != owners for ref in update["check_refs"]):
            raise ValueError("Derived relation checks belong to other parts")
    interface_ids = {i["id"] for i in catalog["interfaces"]}
    if any(x["interface_ref"] not in interface_ids for x in report["presentation"].get("interfaces", [])) or any(x["owner_ref"] not in parts for x in report["presentation"].get("part_notes", [])):
        raise ValueError("Reference presentation has an unknown interface or part")
    report["request_sha256"] = hashlib.sha256(canonical(request)).hexdigest()
    return report


def summary(report):
    return {"path": REPORT_PATH, "configuration_ref": report["configuration_ref"], "source_configuration_ref": report["source_configuration_ref"],
        "title": report["title"], "basis": report["basis"], "rationale": report["rationale"],
        "placements": [p for a in report["actions"] for p in a["placements"]], "presentation": report["presentation"]}
