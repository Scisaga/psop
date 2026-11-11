"""Freeze completed research as bounded, measured installation hypotheses.

Geometry discovery remains independent from these interpretation records. A
study must cite inspected originals, identify both finite participants, and
pass explicit dimensional and common-configuration checks. Nothing here makes
a hypothesis into a qualified Interface or an executed/retained connection.
The interpreter is device- and name-independent and performs no network I/O.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import json
import math
from pathlib import Path, PurePosixPath

from . import investigation as geometric
from .microduck import rotate

INPUT_SCHEMA = "psop.interface-investigation/1.1"
KEYS = (*geometric.KEYS, "installation_hypotheses", "investigation_records", "relationship_coverage")


def _text(value, label):
    if not isinstance(value, str) or not value.strip() or "\ufffd" in value or not any(character.isalnum() for character in value):
        raise ValueError("Research requires a concrete " + label)
    return value


def validate_input(value, scene):
    if value.get("schema") not in {INPUT_SCHEMA, geometric.INPUT_SCHEMA}:
        raise ValueError("Unsupported relationship investigation input")
    geometric.validate_input({**value, "schema": geometric.INPUT_SCHEMA}, scene)
    if value.get("schema") == geometric.INPUT_SCHEMA:
        if any(key in value for key in ("relation_studies", "expected_relations")):
            raise ValueError("Relationship studies require investigation/1.1")
        return value
    parts = {p["id"] for p in scene["parts"]}
    annotations = {(sample["part_ref"], feature["id"]) for sample in value["samples"] for feature in sample["expected_features"]}
    sources = {s["id"] for s in scene["sources"]} | {s["id"] for s in value["sources"] if s.get("capture_path")}
    studies = value.get("relation_studies")
    if not isinstance(studies, list) or len(studies) > 256:
        raise ValueError("Investigation/1.1 requires bounded relation studies")
    seen = set()
    for study in studies:
        identifier = _text(study.get("id"), "study identity")
        if identifier in seen:
            raise ValueError("Duplicate research study")
        seen.add(identifier)
        _text(study.get("title"), "study title")
        if study.get("work_status") != "investigated":
            raise ValueError("A completed study needs an explicit investigated work status")
        if study.get("outcome") not in {"supported_hypothesis", "insufficient"}:
            raise ValueError("A study outcome must distinguish evidence from work status")
        if not study.get("actions") or not study.get("findings") or not study.get("missing_evidence"):
            raise ValueError("An investigated study needs actual checks, findings and specific missing evidence")
        for field in ("findings", "missing_evidence"):
            for item in study[field]:
                _text(item, "specific " + field)
        _text(study.get("stop_reason"), "scope-specific stop reason")
        for action in study["actions"]:
            _text(action.get("method"), "executed research method")
            _text(action.get("observation"), "observed research result")
            if not action.get("source_refs") or not set(action["source_refs"]) <= sources:
                raise ValueError("Executed research must cite captured or model originals")
        participants = study.get("participants", [])
        if not participants or len(participants) > 4:
            raise ValueError("Research must identify finite local participants")
        for participant in participants:
            _text(participant.get("role"), "participant role")
            _text(participant.get("label"), "participant label")
            if participant.get("part_ref") not in parts or not participant.get("annotation_refs"):
                raise ValueError("Research participant needs source-bound local annotations")
            if any((participant["part_ref"], ref) not in annotations for ref in participant["annotation_refs"]):
                raise ValueError("Research references an absent independent geometry annotation")
        if study["outcome"] == "supported_hypothesis":
            if len(participants) != 2 or participants[0]["part_ref"] == participants[1]["part_ref"]:
                raise ValueError("Installation hypothesis needs two distinct finite counterpart Parts")
            for key in ("mechanism", "roles", "supporting_evidence", "counterevidence", "alternatives", "intermediate_components", "geometry_requirements"):
                if not study.get(key):
                    raise ValueError("Concrete installation hypothesis lacks " + key)
            if study["mechanism"].get("kind") != "screw_clamp":
                raise ValueError("Unsupported research mechanism; retain it as an unresolved study")
            _text(study["mechanism"].get("summary"), "mechanism explanation")
            for support in study["supporting_evidence"]:
                _text(support.get("claim"), "bounded evidence claim")
                if not support.get("source_refs") or not set(support["source_refs"]) <= sources:
                    raise ValueError("Hypothesis evidence must cite available originals")
            if {role["role"] for role in study["roles"]} != {"location", "retention", "motion", "limit"}:
                raise ValueError("Hypothesis must separately assess location, retention, motion and limits")
            for role in study["roles"]:
                _text(role.get("statement"), "mechanism role explanation")
            for item in (*study["counterevidence"], *study["alternatives"]):
                _text(item, "counterevidence or alternative explanation")
            for item in study["intermediate_components"]:
                _text(item.get("statement"), "intermediate component explanation")
            if any(role["status"] not in {"supported_hypothesis", "unknown"} for role in study["roles"]):
                raise ValueError("Research may not assert engagement or engineering confirmation")
            if next(role for role in study["roles"] if role["role"] == "retention")["status"] != "unknown":
                raise ValueError("Screw hypothesis does not establish actual retaining contact")
    expected = value.get("expected_relations")
    if not isinstance(expected, list):
        raise ValueError("Investigation/1.1 requires independently grounded relationship expectations")
    for item in expected:
        if item.get("study_ref") not in seen or len(set(item.get("part_refs", []))) != 2:
            raise ValueError("Expected relationship must bind a study and two concrete Parts")
        _text(item.get("basis"), "independent relationship acceptance basis")
    return value


def capture_input(scene, root: Path, path, supporting_paths=None):
    return geometric.capture_input(scene, root, path, supporting_paths, validator=validate_input)


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _norm(a):
    return math.sqrt(_dot(a, a))


def _source_refs(refs, review, scene):
    existing = {s["id"] for s in scene["sources"]}
    original = {s["id"]: s for s in review["sources"]}
    return sorted({ref if ref in existing else PurePosixPath(geometric.document_path(original[ref])).stem for ref in refs})


def _evidence_refs(refs, scene):
    wanted = set(refs)
    return sorted(item["id"] for item in scene["evidence"] if item["sourceId"] in wanted)


def _cylinder(candidate, part):
    g = candidate["geometry"]
    if g["type"] != "cylinder" or min(part["scale"]) <= 0 or max(part["scale"])-min(part["scale"]) > 1e-9:
        raise ValueError("Research fit requires finite cylindrical source walls and uniform positive scale")
    scale = part["scale"][0]
    axis = rotate(part["quaternion"], g["axis"])
    return {"center": geometric._world(part, g["center"]), "axis": axis,
            "half": (g["axial_range_m"][1]-g["axial_range_m"][0])*scale/2,
            "radius": g["radius_m"]*scale}


def measure_pairs(participants, candidates, parts, requirements):
    """One shared source Configuration, finite ranges, complementary diameters,
    and all member distances; never independently register each matching hole.
    """
    groups = []
    for participant in participants:
        group = [_cylinder(candidates[ref], parts[participant["part_ref"]]) for ref in participant["wall_refs"]]
        if any(candidates[ref]["kind"] != "bore_wall" or candidates[ref].get("measurement", {}).get("coverage", 0) < .95 for ref in participant["wall_refs"]):
            raise ValueError("Screw interpretation requires source-witnessed complete bore sections")
        groups.append(group)
    if len(groups[0]) != len(groups[1]) or not groups[0]:
        raise ValueError("Hypothesis needs one-to-one common-configuration member correspondences")
    nominal = requirements["nominal_connector_diameter_m"]
    distances, gaps, diameters, wall_lengths = [], [], [], []
    for left, right in zip(*groups):
        alignment = abs(_dot(left["axis"], right["axis"]))
        delta = _sub(right["center"], left["center"])
        along = _dot(delta, left["axis"])
        distance = math.sqrt(max(0, _dot(delta, delta)-along*along))
        gap = max(0, abs(along)-left["half"]-right["half"])
        if alignment < .999 or distance > requirements["axis_tolerance_m"] or gap > requirements["max_finite_gap_m"]:
            raise ValueError("Hypothesis fails finite common-configuration axis/range compatibility")
        # A supported tapping/clamp interpretation needs a larger through bore
        # and a separately supported smaller receiving bore. This is an
        # interpretation envelope, never proof of manufactured threads.
        clearance, receiver = (left, right) if requirements.get("clearance_participant", 0) == 0 else (right, left)
        if clearance["radius"]*2 < nominal or not 0 < receiver["radius"]*2 <= nominal + 1e-6:
            raise ValueError("Hypothesis lacks complementary clearance and receiving diameters")
        distances.append(distance); gaps.append(gap)
        diameters.extend([left["radius"]*2, right["radius"]*2])
        wall_lengths.extend([2*left["half"], 2*right["half"]])
    spacing_a, spacing_b = [], []
    for i in range(len(groups[0])):
        for j in range(i+1, len(groups[0])):
            spacing_a.append(_norm(_sub(groups[0][i]["center"], groups[0][j]["center"])))
            spacing_b.append(_norm(_sub(groups[1][i]["center"], groups[1][j]["center"])))
    spacing_error = max([abs(a-b) for a, b in zip(spacing_a, spacing_b)], default=0.)
    if spacing_error > requirements["axis_tolerance_m"]:
        raise ValueError("Hypothesis fails shared group-spacing compatibility")
    return [{"name": "对应孔位", "value": len(distances), "unit": "count", "basis": "source_geometry"},
        {"name": "各孔轴线偏差", "value": distances, "unit": "m", "basis": "source_geometry"},
        {"name": "有限壁段间隔", "value": gaps, "unit": "m", "basis": "source_geometry"},
        {"name": "本件／对端孔径（逐对）", "value": diameters, "unit": "m", "basis": "source_geometry"},
        {"name": "本件／对端有限壁长（逐对）", "value": wall_lengths, "unit": "m", "basis": "source_geometry"},
        {"name": "本件孔组全部间距", "value": spacing_a, "unit": "m", "basis": "source_geometry"},
        {"name": "对端孔组全部间距", "value": spacing_b, "unit": "m", "basis": "source_geometry"},
        {"name": "最大组距差", "value": spacing_error, "unit": "m", "basis": "source_geometry"}]


def augment_analysis(base, scene, root, review=None):
    result = geometric.augment_analysis(base, scene, root, review)
    candidates = {item["id"]: item for item in result["structure_candidates"]}
    parts = {part["id"]: part for part in scene["parts"]}
    annotations = {(row["part_ref"], row["id"]): row["candidate_refs"] for row in result["review_coverage"]["independent_features"]["matches"]}
    for item in candidates.values():
        item.update(work_status="not_investigated", investigation_refs=[], hypothesis_refs=[])
    hypotheses, records = [], []
    for study in (review or {}).get("relation_studies", []):
        participants = []
        for participant in study["participants"]:
            walls = []
            refs = []
            for annotation in participant["annotation_refs"]:
                matches = [candidates[ref] for ref in annotations.get((participant["part_ref"], annotation), [])]
                wall = [item for item in matches if item["kind"] == "bore_wall"]
                if len(wall) != 1:
                    raise ValueError("Research requires a uniquely located finite source wall: " + annotation)
                walls.append(wall[0]["id"]); refs.extend(item["id"] for item in matches)
            # Include same-source entrance and finite wall identities without
            # asserting that all coaxial boundaries form one physical channel.
            openings = sorted({ref for wall in walls for ref in candidates[wall]["related_opening_refs"]})
            source_features = sorted({ref for wall in walls for ref in candidates[wall]["related_feature_refs"]})
            for opening in result.get("circular_openings", []):
                if opening["owner_ref"] != participant["part_ref"]:
                    continue
                for wall_ref in walls:
                    wall = candidates[wall_ref]["geometry"]
                    axis = wall["axis"]; delta = _sub(opening["geometry"]["center"], wall["center"])
                    along = _dot(delta, axis)
                    if abs(_dot(opening["geometry"]["normal"], axis)) > .999 and _norm(_sub(delta, [along*x for x in axis])) < 1e-5 and abs(opening["geometry"]["radius_m"]-wall["radius_m"]) < 1e-5 and abs(along) <= (wall["axial_range_m"][1]-wall["axial_range_m"][0])/2+1e-5:
                        openings.append(opening["id"])
            position = [sum(candidates[ref]["geometry"]["center"][i] for ref in walls)/len(walls) for i in range(3)]
            participants.append({"part_ref": participant["part_ref"], "role": participant["role"], "label": participant["label"],
                "structure_refs": sorted(set(refs)), "feature_refs": source_features, "opening_refs": sorted(set(openings)),
                "position_local_m": position, "wall_refs": walls})
        identifier = "investigation:" + study["id"]
        source_refs = _source_refs([ref for action in study["actions"] for ref in action["source_refs"]], review, scene)
        record = {"id": identifier, "title": study["title"], "part_ref": participants[0]["part_ref"],
            "structure_refs": participants[0]["structure_refs"], "opening_refs": participants[0]["opening_refs"],
            "feature_refs": participants[0]["feature_refs"], "position_local_m": participants[0]["position_local_m"],
            "work_status": "investigated", "evidence_status": study["outcome"],
            "actions": [{**action, "source_refs": _source_refs(action["source_refs"], review, scene)} for action in study["actions"]],
            "findings": study["findings"], "missing_evidence": study["missing_evidence"], "hypothesis_refs": [],
            "stop_reason": study["stop_reason"], "source_refs": source_refs, "evidence_refs": _evidence_refs(source_refs, scene)}
        if study["outcome"] == "supported_hypothesis":
            measurements = measure_pairs(participants, candidates, parts, study["geometry_requirements"])
            hypothesis = {"id": "installation-hypothesis:" + study["id"], "title": study["title"],
                "status": "supported_hypothesis", "assertion_basis": "project_inference",
                "configuration_ref": "configuration:" + review["device_id"] + ":source-qpos0", "mechanism": study["mechanism"],
                "participants": [{key: value for key, value in item.items() if key != "wall_refs"} for item in participants],
                "roles": study["roles"], "measurements": measurements,
                "supporting_evidence": [{**support, "source_refs": _source_refs(support["source_refs"], review, scene),
                    "evidence_refs": _evidence_refs(_source_refs(support["source_refs"], review, scene), scene)} for support in study["supporting_evidence"]],
                "counterevidence": study["counterevidence"], "alternatives": study["alternatives"],
                "intermediate_components": study["intermediate_components"], "unresolved_requirements": study["missing_evidence"],
                "source_refs": source_refs, "evidence_refs": _evidence_refs(source_refs, scene), "investigation_ref": identifier}
            hypotheses.append(hypothesis); record["hypothesis_refs"].append(hypothesis["id"])
        records.append(record)
        for participant in participants:
            for ref in participant["structure_refs"]:
                candidate = candidates[ref]
                candidate["work_status"] = "investigated"
                candidate["investigation_refs"].append(identifier)
                candidate["hypothesis_refs"].extend(record["hypothesis_refs"])
                candidate["review_status"] = "reviewed"
                if record["hypothesis_refs"] and candidate["function_status"] == "unknown":
                    candidate["function_status"] = "installation_hypothesis_available"
                candidate["missing_evidence"] = list(study["missing_evidence"])
                candidate["stop_reason"] = study["stop_reason"]
    result.update(installation_hypotheses=hypotheses, investigation_records=records)
    result["review_coverage"]["function_status"] = dict(Counter(item["function_status"] for item in candidates.values()))
    result["relationship_coverage"] = expectation_coverage(result, review)
    if result["relationship_coverage"]["missing"]:
        raise ValueError("Independent relationship coverage missing: " + ", ".join(result["relationship_coverage"]["missing"]))
    return result


def expectation_coverage(analysis, review, *, allow_empty_counterevidence=False):
    """Result acceptance uses frozen evidence/geometry expectations, not replay.

    Recounting candidates, rewriting totals, or replacing a relationship with
    generic next actions cannot satisfy a required mechanism-level result.
    """
    expected = (review or {}).get("expected_relations", [])
    missing, matches = [], []
    for item in expected:
        matches_for_item = [h for h in analysis["installation_hypotheses"]
            if h.get("investigation_ref") == "investigation:" + item["study_ref"]
            and {p["part_ref"] for p in h.get("participants", [])} == set(item["part_refs"])
            and h.get("status") == "supported_hypothesis"
            and h.get("mechanism", {}).get("kind") == item["mechanism"]
            and all(p.get("structure_refs") and p.get("position_local_m") is not None for p in h["participants"])
            and h.get("measurements") and h.get("supporting_evidence") and (isinstance(h.get("counterevidence"), list) if allow_empty_counterevidence else h.get("counterevidence"))
            and h.get("intermediate_components") and h.get("unresolved_requirements")
            and {r["role"] for r in h.get("roles", [])} == {"location", "retention", "motion", "limit"}]
        if len(matches_for_item) != 1:
            missing.append(item["id"])
        else:
            matches.append({"id": item["id"], "hypothesis_ref": matches_for_item[0]["id"]})
    return {"expected_count": len(expected), "located_count": len(matches), "matches": matches, "missing": missing,
        "installation_hypotheses_count": len(analysis["installation_hypotheses"]),
        "installation_definitions_count": len(analysis.get("mounting_interfaces", [])),
        "qualified_interfaces_count": len(analysis.get("interfaces", [])), "engineering_confirmed_count": 0,
        "scope": "Only independently frozen relationship expectations; no whole-part completion or engineered retention claim."}


def validate_coverage(knowledge, scene, root):
    source = next((s for s in scene["sources"] if s["id"] == geometric.SOURCE), None)
    review = validate_input(json.loads((root / geometric.SOURCE_PATH).read_bytes()), scene) if source else None
    coverage = geometric.independent_coverage(knowledge["structure_candidates"], review)
    if coverage != knowledge["review_coverage"]["independent_features"] or coverage["missing"]:
        raise ValueError("Independent feature coverage missing or inconsistent")
    relation_coverage = expectation_coverage(knowledge, review)
    if relation_coverage["missing"]:
        raise ValueError("Independent relationship coverage missing: " + ", ".join(relation_coverage["missing"]))
    if relation_coverage != knowledge["relationship_coverage"]:
        raise ValueError("Independent relationship coverage differs from frozen evidence expectations")
    if scene["analysis"].get("installation_hypotheses") != knowledge["installation_hypotheses"]:
        raise ValueError("Installation hypothesis projections disagree")
