"""Preparation-time structure discovery and independently scoped review coverage.

No network, model calls or functional qualification occur here. Frozen review
inputs are evidence about explicitly named source regions, never a detector's
own denominator and never authority to declare an engaged connection.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
from pathlib import PurePosixPath

from . import mechanics
from .microduck import rotate

INPUT_SCHEMA = "psop.interface-investigation/1.0"
METHOD = "source-structure-investigation/1"
SOURCE = "SRC-INTERFACE-INVESTIGATION"
SOURCE_PATH = "sources/SRC-INTERFACE-INVESTIGATION.json"
EVIDENCE = "evidence:interface-investigation:input"
KEYS = ("structure_candidates", "part_investigations", "review_regions", "review_coverage")


def _token(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()[:20]


def _distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))


def _center(geometry):
    if "center" in geometry:
        return list(geometry["center"])
    origin = geometry.get("origin", geometry.get("position", [0., 0., 0.]))
    axis = geometry.get("axis", [0., 0., 1.])
    interval = geometry.get("axial_range_m", [0., geometry.get("length_m", 0.) if geometry.get("type") == "conical_frustum" else 0.])
    return [origin[i] + axis[i] * sum(interval)/2 for i in range(3)]


def _axis(geometry):
    return geometry.get("axis", geometry.get("normal"))


def _world(part, point):
    value = rotate(part["quaternion"], [point[i]*part["scale"][i] for i in range(3)])
    return [value[i] + part["position"][i] for i in range(3)]


def validate_input(value, scene):
    if not isinstance(value, dict) or value.get("schema") != INPUT_SCHEMA:
        raise ValueError("Unsupported interface investigation input")
    if not value.get("device_id") or any(not p["id"].startswith("part:"+value["device_id"]+":") for p in scene["parts"]):
        raise ValueError("Interface investigation belongs to a different device")
    if not isinstance(value.get("samples"), list) or not isinstance(value.get("sources"), list):
        raise ValueError("Investigation requires explicit samples and source records")
    if len(value["samples"]) > len(scene["parts"]) or len(value["sources"]) > 64:
        raise ValueError("Independent investigation exceeds its source-model scope")
    parts = {p["id"]: p for p in scene["parts"]}
    sources = {s["id"]: s for s in scene["sources"]}
    seen = set()
    for sample in value["samples"]:
        part = parts.get(sample.get("part_ref"))
        if part is None or sample["part_ref"] in seen:
            raise ValueError("Investigation sample has an absent or duplicate Part")
        seen.add(part["id"])
        source = sources[part["sourceIds"][-1]]
        if sample.get("geometry_sha256") != source["digest"]:
            raise ValueError("Independent annotation geometry SHA differs from the actual Part source")
        if not isinstance(sample.get("regions"), list) or not isinstance(sample.get("expected_features"), list):
            raise ValueError("Independent sample requires named regions and expected features")
        feature_ids = set()
        for feature in sample["expected_features"]:
            if not feature.get("id") or feature["id"] in feature_ids:
                raise ValueError("Independent feature identities must be unique within a sample")
            feature_ids.add(feature["id"])
            if any(not isinstance(feature.get(key), str) or not feature[key].strip() for key in ("kind", "annotation_basis", "next_action")):
                raise ValueError("Independent feature requires a kind, annotation basis and specific next action")
            for key in ("center_local_m", "axis_local"):
                vector = feature.get(key)
                if not isinstance(vector, list) or len(vector) != 3 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in vector):
                    raise ValueError("Independent feature requires finite local coordinates and axis")
            if abs(sum(x*x for x in feature["axis_local"])-1.) > 1e-5:
                raise ValueError("Independent feature requires a unit axis")
            if not 0 < feature.get("tolerance_m", 0) <= .001:
                raise ValueError("Independent feature requires a bounded positive matching tolerance")
            if not feature.get("triangle_witnesses") or not feature.get("annotation_basis"):
                raise ValueError("Independent feature requires source triangles and an annotation basis")
    return value


def document_path(source):
    suffix = PurePosixPath(source["capture_path"]).suffix.lower()
    if suffix not in {".md", ".json", ".txt", ".png"}:
        raise ValueError("Investigation originals must be bounded text, JSON or PNG sources")
    return "sources/SRC-INVESTIGATION-"+_token(source["id"]).upper()+suffix


def freeze_documents(review, original_root: Path, work: Path):
    records = []
    for source in review["sources"]:
        relative = source.get("capture_path")
        if relative is None:
            continue
        item = PurePosixPath(relative)
        if item.is_absolute() or any(p in {"..", "."} for p in item.parts) or str(item) != relative or ":" in relative or "\\" in relative:
            raise ValueError("Investigation capture_path must remain inside its input directory")
        original = (original_root / relative).resolve(strict=True)
        if not original.is_relative_to(original_root.resolve()):
            raise ValueError("Investigation original escapes its input directory")
        raw = original.read_bytes()
        if len(raw) > 4*1024*1024 or hashlib.sha256(raw).hexdigest() != source.get("sha256"):
            raise ValueError("Investigation original differs from its declared source SHA")
        target = "inputs/investigation-sources/"+PurePosixPath(document_path(source)).name
        (work / target).parent.mkdir(parents=True, exist_ok=True)
        (work / target).write_bytes(raw)
        records.append({"id": source["id"], "path": target, "sha256": source["sha256"]})
    if len({r["id"] for r in records}) != len(records) or len(records) > 32:
        raise ValueError("Investigation source identities must be unique and bounded")
    return records


def document_inputs(review, records, root: Path, published=False):
    from .package import local_path
    expected = {source["id"]: source for source in review["sources"] if source.get("capture_path")}
    if {record["id"] for record in records} != set(expected) or len(records) != len(expected):
        raise ValueError("Investigation source byte locks differ from captured originals")
    result = {}
    for record in records:
        source = expected[record["id"]]
        wanted = document_path(source) if published else "inputs/investigation-sources/"+PurePosixPath(document_path(source)).name
        if record["path"] != wanted or record["sha256"] != source["sha256"]:
            raise ValueError("Investigation original input lock differs from frozen review")
        path = local_path(root, wanted)
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Investigation original byte identity mismatch")
        result[source["id"]] = path
    return result


def capture_input(scene, root: Path, path: Path | None, supporting_paths=None, *, validator=None):
    if path is None:
        return None
    raw = path.read_bytes()
    if not raw or len(raw) > 16*1024*1024:
        raise ValueError("Investigation input must be nonempty and bounded to 16 MiB")
    value = (validator or validate_input)(json.loads(raw), scene)
    target = root / SOURCE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    scene["sources"].append({"id": SOURCE, "title": "独立结构标注与调查记录", "path": "supplemental/interface-investigation.json",
        "format": "JSON", "bytes": len(raw), "digest": hashlib.sha256(raw).hexdigest(), "scope": "package", "url": SOURCE_PATH,
        "text": raw.decode("utf-8"), "supplemented": True})
    scene["evidence"].append({"id": EVIDENCE, "sourceId": SOURCE, "title": "源模型独立复核与明确检查范围", "kind": "source-file",
        "excerpt": "独立标注限定于输入列明的源几何 SHA、区域和结构；功能未知不等于未发现，样例通过不代表整机召回。"})
    for source in value["sources"]:
        if not source.get("capture_path"):
            continue
        if not supporting_paths or source["id"] not in supporting_paths:
            raise ValueError("Investigation requires captured original source bytes")
        raw = supporting_paths[source["id"]].read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError("Investigation supporting source SHA mismatch")
        relative = document_path(source)
        identifier = PurePosixPath(relative).stem
        (root / relative).write_bytes(raw)
        scene["sources"].append({"id": identifier, "title": source["id"], "path": source["capture_path"],
            "format": PurePosixPath(relative).suffix[1:].upper(), "bytes": len(raw), "digest": source["sha256"], "scope": "package", "url": relative,
            "text": raw.decode("utf-8") if not relative.endswith(".png") else "", "supplemented": True,
            "originalUrl": source["url"]})
        scene["evidence"].append({"id": EVIDENCE+":"+_token(source["id"]), "sourceId": identifier, "title": "调查原件："+source["id"],
            "kind": "source-file", "excerpt": json.dumps({key: source[key] for key in ("url", "revision", "supports", "limitations", "observed", "conflicts") if key in source}, ensure_ascii=False)})
    scene["meta"]["counts"].update(sources=len(scene["sources"]), evidence=len(scene["evidence"]))
    return value


def independent_coverage(candidates, review):
    """Match locked annotations to source-local geometry, without replaying discovery.

    Triangle witnesses AND location/direction must agree. Recounting detector
    output cannot shrink the independently frozen expected-feature list.
    """
    result = {"status": "not_supplied" if review is None else "pass", "expected_count": 0, "located_count": 0,
              "matches": [], "missing": [], "scope": "Only source-SHA-bound independently annotated samples",
              "limitations": ["No whole-device or arbitrary-geometry recall claim; unannotated and occluded regions remain open."]}
    for sample in (review or {}).get("samples", []):
        for expected in sample["expected_features"]:
            result["expected_count"] += 1
            matches = []
            for candidate in candidates:
                if candidate["owner_ref"] != sample["part_ref"] or candidate["geometry_sha256"] != sample["geometry_sha256"]:
                    continue
                if not set(expected["triangle_witnesses"]) & set(candidate["support_triangle_indices"]):
                    continue
                geometry = candidate["geometry"]
                axis = _axis(geometry)
                if axis is None or abs(sum(x*y for x, y in zip(axis, expected["axis_local"]))) < .995:
                    continue
                center = _center(geometry)
                # A ring may annotate the entrance of a finite wall. Compare
                # its transverse location and finite axial extent separately.
                delta = [expected["center_local_m"][i]-center[i] for i in range(3)]
                axial = sum(delta[i]*axis[i] for i in range(3))
                radial = math.sqrt(max(0., sum(x*x for x in delta)-axial*axial))
                extent = geometry.get("axial_range_m", [0., geometry.get("length_m", 0.)])
                half = abs(extent[1]-extent[0])/2
                tolerance = expected["tolerance_m"]
                if radial > tolerance or abs(axial) > half+tolerance:
                    continue
                radius = geometry.get("radius_m")
                if expected.get("radius_m") is not None and radius is not None and abs(expected["radius_m"]-radius) > tolerance:
                    continue
                equivalents = {"circular_opening": {"circular_opening", "bore_wall"},
                    "bore_wall": {"bore_wall"}, "cylindrical_wall": {"bore_wall", "shaft_wall", "cylinder_surface"},
                    "integral_pin": {"integral_pin", "shaft_wall"}, "shaft_wall": {"shaft_wall"},
                    "slot": {"slot"}, "capsule_opening": {"slot"}, "rounded_rectangle_opening": {"slot"}}
                if candidate["kind"] not in equivalents.get(expected["kind"], {expected["kind"]}):
                    continue
                matches.append(candidate["id"])
            row = {"id": expected["id"], "part_ref": sample["part_ref"], "center_local_m": expected["center_local_m"], "candidate_refs": sorted(matches)}
            if matches:
                result["located_count"] += 1
                result["matches"].append(row)
            else:
                result["missing"].append({**row, "reason": "No source-triangle, local-position, finite-extent and direction match", "next_action": expected["next_action"]})
    if result["missing"]:
        result["status"] = "incomplete"
    elif result["expected_count"] == 0:
        result["status"] = "not_supplied"
    return result


def _regions(raw, part, source):
    vertices, faces, normals, _ = mechanics._mesh(raw)
    bins = defaultdict(list)
    for index, normal in enumerate(normals):
        axis = max(range(3), key=lambda i: abs(normal[i]))
        bins[(axis, "+" if normal[axis] >= 0 else "-")].append(index)
    result = []
    for (axis, sign), triangles in sorted(bins.items()):
        points = [vertices[v] for t in triangles for v in faces[t]]
        result.append({"id": "review-region:"+_token([part["id"], source["digest"], axis, sign]), "owner_ref": part["id"],
            "geometry_source_ref": source["id"], "label": "source normal "+sign+"XYZ"[axis], "triangle_indices": triangles,
            "center": [sum(p[i] for p in points)/len(points) for i in range(3)], "review_status": "auto_screened",
            "evidence_refs": list(part["evidenceIds"]), "limitations": ["Raw mesh normal sector was enumerated; inner, backside, occluded and noncylindrical structures are not independently exhausted."],
            "next_actions": ["Inspect this region from both sides and in section; annotate suspected structures independently of the recognizer."]})
    return result, len(faces)


def _candidate(part, source, item, feature_refs=(), opening_refs=()):
    geometry = deepcopy(item["geometry"])
    geometry["center"] = _center(geometry)
    triangles = sorted(set(item.get("support_triangle_indices", geometry.get("triangle_indices", geometry.get("support_triangle_indices", [])))))
    return {"id": "structure:"+_token([part["id"], source["digest"], item["kind"], triangles]), "owner_ref": part["id"],
        "kind": item["kind"], "geometry_source_ref": source["id"], "geometry_sha256": source["digest"], "geometry": geometry,
        "support_triangle_indices": triangles, "source_refs": [source["id"]], "evidence_refs": list(part["evidenceIds"]),
        "related_feature_refs": sorted(feature_refs), "related_opening_refs": sorted(opening_refs), "function_status": "unknown",
        "review_status": "unreviewed", "method": item.get("method", "published-source-geometry"), "counterpart_proposals": [],
        "missing_evidence": ["Device-specific functional role, installation side, retention and connector specification have not been established."],
        "next_actions": ["Inspect raw source region and assembly drawings for this exact geometry revision.", "Compare finite geometry and evidence for adjacent Parts and any intermediate connector."],
        "stop_reason": "Preparation discovered finite geometry; no source-specific functional evidence supports qualification.",
        "limitations": list(item.get("limitations", [])), "measurement": deepcopy(item.get("measurement", {}))}


def _counterparts(candidates, scene):
    parts = {part["id"]: part for part in scene["parts"]}
    rows = []
    for item in candidates:
        axis = _axis(item["geometry"])
        part = parts[item["owner_ref"]]
        if axis is None or min(part["scale"]) <= 0 or max(part["scale"])-min(part["scale"]) > 1e-9:
            item["limitations"].append("Axis counterpart analysis unavailable for this geometry or nonuniform/nonpositive instance scale; an empty proposal list does not establish absence of a mate.")
            continue
        center = _world(part, item["geometry"]["center"])
        world_axis = rotate(part["quaternion"], axis)
        extent = item["geometry"].get("axial_range_m", [0., item["geometry"].get("length_m", 0.)])
        half = abs(extent[1]-extent[0])/2*part["scale"][0]
        rows.append((item, center, world_axis, half))
    # Finite local structures are compared independently of whole-Part AABB
    # proximity. Source-pose absence never means permanently unmountable.
    for index, (item, center, axis, half) in enumerate(rows):
        for other, other_center, other_axis, other_half in rows[index+1:]:
            if item["owner_ref"] == other["owner_ref"]:
                continue
            if abs(sum(x*y for x, y in zip(axis, other_axis))) < .995:
                continue
            delta = [other_center[i]-center[i] for i in range(3)]
            axial = sum(delta[i]*axis[i] for i in range(3))
            transverse = math.sqrt(max(0., sum(x*x for x in delta)-axial*axial))
            gap = max(0., abs(axial)-half-other_half)
            if transverse > .00015 or gap > .012:
                continue
            for a, b in ((item, other), (other, item)):
                a["counterpart_proposals"].append({"part_ref": b["owner_ref"], "structure_ref": b["id"], "basis": "parallel_source_axes_and_finite_transverse_proximity",
                    "axis_distance_m": transverse, "axial_gap_m": gap, "status": "geometry_only",
                    "limitations": ["No functional complementarity, retention, motion ownership, connector or continuous path is established."]})


def augment_analysis(base, scene, root: Path, review=None):
    result = deepcopy(base)
    parts = {p["id"]: p for p in scene["parts"]}
    sources = {s["id"]: s for s in scene["sources"]}
    samples = {s["part_ref"]: s for s in (review or {}).get("samples", [])}
    candidates, regions, inventory = [], [], []
    extracted = {}
    for part in scene["parts"]:
        source = sources[part["sourceIds"][-1]]
        raw = (root / source["url"]).read_bytes()
        if source["digest"] not in extracted:
            extracted[source["digest"]] = mechanics.discover_structures(raw)
        items = [_candidate(part, source, x) for x in extracted[source["digest"]]]
        for feature in base["features"]:
            if feature["owner_ref"] == part["id"]:
                item = _candidate(part, source, feature, [feature["id"]])
                duplicate = next((x for x in items if x["kind"] == item["kind"] and x["support_triangle_indices"] == item["support_triangle_indices"]), None)
                if duplicate:
                    duplicate["related_feature_refs"].append(feature["id"])
                else:
                    items.append(item)
        for opening in base.get("circular_openings", []):
            if opening["owner_ref"] == part["id"]:
                items.append(_candidate(part, source, {**opening, "kind": "circular_opening"}, opening_refs=[opening["id"]]))
        for slot in base.get("slot_features", []):
            if slot["owner_ref"] == part["id"]:
                items.append(_candidate(part, source, {**slot, "kind": "slot"}, feature_refs=[slot["id"]]))
        # Instance records remain separate even when their mesh discovery was
        # reused. The raw normal sectors provide a detector-independent scope.
        own_regions, face_count = _regions(raw, part, source)
        sample = samples.get(part["id"])
        for annotated in (sample or {}).get("regions", []):
            triangles = annotated["triangle_indices"]
            if any(type(t) is not int or t < 0 or t >= face_count for t in triangles):
                raise ValueError("Independent region triangle lies outside its source mesh")
            if annotated["review_status"] == "reviewed" and (not triangles or not annotated.get("evidence")):
                raise ValueError("Reviewed source region requires triangles and independent evidence")
            own_regions.append({"id": "review-region:"+_token([part["id"], annotated["id"]]), "owner_ref": part["id"], "geometry_source_ref": source["id"],
                "label": annotated["label"], "triangle_indices": triangles, "center": list(annotated.get("center_local_m", [0., 0., 0.])),
                "review_status": annotated["review_status"], "evidence_refs": [EVIDENCE], "limitations": annotated.get("limitations", []),
                "next_actions": annotated.get("next_actions", ["Review remaining adjacent, inner and occluded source regions."])})
        for expected in (sample or {}).get("expected_features", []):
            if any(type(t) is not int or t < 0 or t >= face_count for t in expected["triangle_witnesses"]):
                raise ValueError("Independent feature triangle lies outside its source mesh")
        known_feature_refs = {ref for site in base.get("mounting_sites", []) if site["owner_ref"] == part["id"] and site["status"] != "geometry_candidate" for ref in site["feature_refs"]}
        for item in items:
            if set(item["related_feature_refs"]) & known_feature_refs:
                item["function_status"] = "installation_evidence_available"
                item["missing_evidence"] = ["Only the related installation declaration's scope is supported; actual engagement, retaining mechanism, connector specification, motion ownership, continuous path and engineering acceptance remain unresolved."]
                item["stop_reason"] = "Only the related published installation evidence applies; retention and engineering remain separately unresolved."
        candidates.extend(items)
        regions.extend(own_regions)
        inventory.append({"part_ref": part["id"], "geometry_source_ref": source["id"], "geometry_sha256": source["digest"],
            "geometry_asset_ref": part["meshKey"], "source_refs": list(part["sourceIds"]), "evidence_refs": list(part["evidenceIds"]),
            "instance_context": {"source_body": part.get("body"), "position": part["position"], "quaternion": part["quaternion"], "scale": part["scale"], "motion_ownership": "unresolved"},
            "region_refs": [r["id"] for r in own_regions], "candidate_refs": [c["id"] for c in items], "status": "partial", "source_triangle_count": face_count,
            "limitations": ["Automatic source-region screening does not exhaust hidden, noncircular, flexible or unsupported connection structures."],
            "next_actions": ["Inspect all source regions, capture independent annotations and investigate remaining functional evidence."]})
    candidates.sort(key=lambda x: x["id"])
    _counterparts(candidates, scene)
    coverage = independent_coverage(candidates, review)
    by_id = {c["id"]: c for c in candidates}
    expected_by_id = {(sample["part_ref"], expected["id"]): expected for sample in (review or {}).get("samples", []) for expected in sample["expected_features"]}
    input_sources = {source["id"]: source for source in (review or {}).get("sources", [])}
    for match in coverage["matches"]:
        expected = expected_by_id[(match["part_ref"], match["id"])]
        for ref in match["candidate_refs"]:
            candidate = by_id[ref]
            candidate["review_status"] = "reviewed"
            candidate["evidence_refs"].append(EVIDENCE)
            candidate["next_actions"] = list(dict.fromkeys([expected["next_action"], *candidate["next_actions"]]))
            if candidate["function_status"] == "unknown":
                candidate["stop_reason"] = expected.get("stop_reason", "Independently observed geometry is located; device-specific function or retaining evidence may still be missing.")
                if expected.get("missing_evidence"):
                    candidate["missing_evidence"] = [expected["missing_evidence"]]
            candidate["limitations"].append("Independent inspection: "+expected["annotation_basis"]+"; only the annotated source region and finite wall are reviewed.")
            for identifier in expected.get("inspected_materials", []):
                source = input_sources.get(identifier)
                if source and source.get("capture_path"):
                    candidate["source_refs"].append(PurePosixPath(document_path(source)).stem)
                    candidate["evidence_refs"].append(EVIDENCE+":"+_token(identifier))
                elif identifier in sources:
                    candidate["source_refs"].append(identifier)
            candidate["source_refs"] = sorted(set(candidate["source_refs"]))
            candidate["evidence_refs"] = sorted(set(candidate["evidence_refs"]))
    statuses = Counter(r["review_status"] for r in regions)
    result.update(structure_candidates=candidates, part_investigations=inventory, review_regions=regions,
        review_coverage={"schema": "psop.interface-review-coverage/1.0", "region_review": {"total": len(regions),
            **{key: statuses[key] for key in ("reviewed", "auto_screened", "blocked", "unreviewed")}, "complete": False},
            "independent_features": coverage, "part_count": len(parts), "geometry_asset_count": len({x["geometry_source_ref"] for x in inventory}),
            "function_status": dict(Counter(c["function_status"] for c in candidates))})
    return result


def validate_coverage(knowledge, scene, root: Path):
    source = next((s for s in scene["sources"] if s["id"] == SOURCE), None)
    review = validate_input(json.loads((root / SOURCE_PATH).read_bytes()), scene) if source else None
    coverage = independent_coverage(knowledge["structure_candidates"], review)
    if coverage != knowledge["review_coverage"]["independent_features"]:
        raise ValueError("Independent feature coverage differs from the frozen source annotations")
    if coverage["missing"]:
        names = ", ".join(row["id"] for row in coverage["missing"])
        raise ValueError("Independent feature coverage missing: "+names)
    parts = {p["id"] for p in scene["parts"]}
    if {x["part_ref"] for x in knowledge["part_investigations"]} != parts:
        raise ValueError("Investigation inventory must include every source Part instance")
    for item in knowledge["structure_candidates"]:
        if item["function_status"] not in {"unknown", "installation_evidence_available"} or not item["next_actions"] or not item["stop_reason"]:
            raise ValueError("Investigation cannot promote geometry to functional confirmation or discard follow-up")
    if knowledge["review_coverage"]["region_review"]["complete"]:
        raise ValueError("Automatic investigation does not establish exhaustive region review")
