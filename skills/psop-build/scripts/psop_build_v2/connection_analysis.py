"""Source-bound ConnectionReview -> local pairing -> reviewed mechanism results.

The 1.10 interpreter remains frozen.  This layer inventories the actual local
evidence of every review, but only executed, captured studies can establish an
investigated outcome.  Candidate measurements never establish a mechanism.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
import json
import math

from . import investigation as geometric
from . import relationship_investigation as historical
from .microduck import rotate

INPUT_SCHEMA = "psop.interface-investigation/1.2"
KEYS = (*historical.KEYS, "connection_review_findings", "connection_analysis_coverage", "connection_relation_contexts")


def _legacy(value):
    return {**value, "schema": historical.INPUT_SCHEMA} if value and value.get("schema") == INPUT_SCHEMA else value


def validate_input(value, scene):
    historical.validate_input(_legacy(value), scene)
    if value.get("schema") != INPUT_SCHEMA:
        if any(k in value for k in ("connection_review_studies", "expected_review_findings", "relation_contexts")):
            raise ValueError("Connection review interpretation requires investigation/1.2")
        return value
    parts = {p["id"]: p for p in scene["parts"]}
    sources = {s["id"] for s in scene["sources"]} | {s["id"] for s in value["sources"] if s.get("capture_path")}
    studies = value.get("connection_review_studies", [])
    seen = set()
    for study in studies:
        historical._text(study.get("id"), "connection study identity")
        if study["id"] in seen:
            raise ValueError("Duplicate connection study")
        seen.add(study["id"])
        if study.get("work_status") != "investigated" or study.get("outcome") not in {"supported_hypothesis", "insufficient"}:
            raise ValueError("Connection research must separate executed work from its evidence outcome")
        participants = study.get("participants", [])
        if len(participants) != 2 or len({p.get("part_ref") for p in participants}) != 2:
            raise ValueError("A pair review needs two distinct finite participants")
        for p in participants:
            if p.get("part_ref") not in parts or not p.get("position_local_m") or len(p["position_local_m"]) != 3:
                raise ValueError("Connection study needs a source-local position for both participants")
            original = next(s for s in scene["sources"] if s["id"] == parts[p["part_ref"]]["sourceIds"][-1])
            if p.get("geometry_sha256") != original["digest"]:
                raise ValueError("Connection study is not bound to the participant's source SHA")
            if not p.get("structure_refs"):
                raise ValueError("Connection study needs finite source structures, including rejected counterparts")
        for key in ("title", "stop_reason"):
            historical._text(study.get(key), "connection study " + key)
        for key in ("actions", "findings", "counterevidence", "alternatives", "missing_evidence", "next_actions", "roles", "mechanism_candidates"):
            if not study.get(key):
                raise ValueError("Executed connection research lacks " + key)
        if {r.get("role") for r in study["roles"]} != {"location", "retention", "motion", "limit"}:
            raise ValueError("Connection explanation must separately assess all four mechanical roles")
        for role in study["roles"]:
            historical._text(role.get("statement"), "specific mechanical role explanation")
            if role.get("status") not in {"unknown", "geometric_support", "supported_hypothesis", "contradicted"}:
                raise ValueError("Connection analysis cannot assert engineering or engagement")
        if next(r for r in study["roles"] if r["role"] == "retention")["status"] not in {"unknown", "contradicted"}:
            raise ValueError("A research mechanism does not prove actual retention")
        for action in study["actions"]:
            historical._text(action.get("method"), "executed connection method")
            historical._text(action.get("observation"), "observed connection result")
            if not action.get("source_refs") or not set(action["source_refs"]) <= sources:
                raise ValueError("Connection research must cite actual captured/model originals")
        if study["outcome"] == "supported_hypothesis":
            if not study.get("hypothesis") or study["hypothesis"].get("mechanism", {}).get("kind") != "screw_clamp":
                raise ValueError("Only source-checked clamp mechanisms are implemented for review conversion")
            if not study["hypothesis"].get("supporting_evidence") or not study.get("geometry_requirements"):
                raise ValueError("A converted review needs separate mechanism evidence and finite compatibility requirements")
            annotations = {(s["part_ref"], f["id"]) for s in value["samples"] for f in s["expected_features"]}
            for p in participants:
                if not p.get("annotation_refs") or any((p["part_ref"], ref) not in annotations for ref in p["annotation_refs"]):
                    raise ValueError("Converted hypothesis needs independent raw-source annotations at both ends")
    for expected in value.get("expected_review_findings", []):
        if len(set(expected.get("part_refs", []))) != 2 or not set(expected["part_refs"]) <= set(parts):
            raise ValueError("Independent connection acceptance must bind concrete source Parts")
        historical._text(expected.get("basis"), "independent connection acceptance basis")
    for context in value.get("relation_contexts", []):
        if len(set(context.get("part_refs", []))) < 3 or not set(context["part_refs"]) <= set(parts):
            raise ValueError("Multi-Part relation context must identify at least three actual source Parts")
        historical._text(context.get("statement"), "bounded multi-Part explanation")
    return value


def capture_input(scene, root, path, supporting_paths=None):
    return geometric.capture_input(scene, root, path, supporting_paths, validator=validate_input)


def _length(v):
    return math.sqrt(sum(x*x for x in v))


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _finite(candidate, part):
    g = candidate["geometry"]
    if g["type"] != "cylinder" or max(part["scale"])-min(part["scale"]) > 1e-9:
        return None
    return historical._cylinder(candidate, part)


def local_pairings(part_refs, candidates, parts, max_gap_m=.005):
    """Measure finite structures under one common pose, keeping incompatibility.

    This accepts neither long infinite axes nor a fitted per-hole transform.
    The 5 mm search envelope is a review aid, not a connection tolerance.
    """
    groups = []
    for ref in part_refs:
        unique = {}
        for c in candidates.values():
            if c["owner_ref"] != ref or c["kind"] not in {"bore_wall", "shaft_wall"}:
                continue
            finite = _finite(c, parts[ref])
            if finite is None:
                continue
            key = (c["kind"], *(round(x, 6) for x in c["geometry"]["center"]), round(finite["radius"], 6), *(round(x, 5) for x in finite["axis"]))
            if key not in unique or c["measurement"].get("coverage", 0) > unique[key][0]["measurement"].get("coverage", 0):
                unique[key] = (c, finite)
        groups.append(list(unique.values()))
    matches = []
    for left, a in groups[0]:
        for right, b in groups[1]:
            alignment = abs(_dot(a["axis"], b["axis"]))
            if alignment < .999:
                continue
            delta = _sub(b["center"], a["center"])
            along = _dot(delta, a["axis"])
            distance = _length(_sub(delta, [along*x for x in a["axis"]]))
            gap = max(0., abs(along)-a["half"]-b["half"])
            if distance > .00015 or gap > max_gap_m:
                continue
            overlap = max(0., min(a["half"], along+b["half"])-max(-a["half"], along-b["half"]))
            diameters = [2*a["radius"], 2*b["radius"]]
            kinds = [left["kind"], right["kind"]]
            statement = (f"两侧 {diameters[0]*1000:.3f}/{diameters[1]*1000:.3f} mm {'孔壁' if kinds[0] == kinds[1] == 'bore_wall' else '圆柱结构'}，"
                         f"轴距 {distance*1000:.4f} mm，有限间隔 {gap*1000:.4f} mm，重叠 {overlap*1000:.4f} mm。")
            matches.append({"participant_refs": list(part_refs), "structure_refs": [left["id"], right["id"]],
                "feature_refs": sorted(set(left["related_feature_refs"] + right["related_feature_refs"])),
                "kinds": kinds, "geometry_checks": [
                    {"name": "孔／轴径", "value": diameters, "unit": "m"},
                    {"name": "轴距", "value": distance, "unit": "m"},
                    {"name": "有限间隔", "value": gap, "unit": "m"},
                    {"name": "有限重叠", "value": overlap, "unit": "m"},
                    {"name": "壁长", "value": [2*a["half"], 2*b["half"]], "unit": "m"}],
                "statement": statement, "status": "geometry_only"})
    return sorted(matches, key=lambda r: (r["geometry_checks"][2]["value"], r["geometry_checks"][1]["value"], r["structure_refs"]))


def _participants(review, pairings, candidates, parts, geometry):
    result = []
    for p in review["participants"]:
        ref = p["part_ref"]
        local = [candidates[r] for pair in pairings for r in pair["structure_refs"] if candidates[r]["owner_ref"] == ref]
        if not local:
            local = [c for c in candidates.values() if c["owner_ref"] == ref and set(c["related_feature_refs"]) & set(p["feature_refs"])]
        explicit = [geometry[r]["geometry"] for r in p["opening_refs"] + p["feature_refs"] if r in geometry]
        position = local[0]["geometry"]["center"] if local else geometric._center(explicit[0]) if explicit else None
        result.append({**p, "structure_refs": sorted({c["id"] for c in local}), "position_local_m": position,
            "label": parts[ref]["name"] + (" · 有限结构" if local else " · 原审查局部证据" if explicit else " · 尚未定位双方局部结构"), "role": "review_participant"})
    return result


def _hypothesis(study, finding, result, scene, review):
    candidates = {c["id"]: c for c in result["structure_candidates"]}
    parts = {p["id"]: p for p in scene["parts"]}
    annotations = {(r["part_ref"], r["id"]): r["candidate_refs"] for r in result["review_coverage"]["independent_features"]["matches"]}
    participants = []
    for participant in study["participants"]:
        walls = []
        for annotation in participant["annotation_refs"]:
            located = [candidates[ref] for ref in annotations.get((participant["part_ref"], annotation), []) if candidates[ref]["kind"] == "bore_wall"]
            if len(located) != 1:
                raise ValueError("Connection conversion lacks a unique independent finite wall: " + annotation)
            walls.append(located[0]["id"])
        participants.append({**next(p for p in finding["participants"] if p["part_ref"] == participant["part_ref"]), "wall_refs": walls})
    measurements = historical.measure_pairs(participants, candidates, parts, study["geometry_requirements"])
    hyp = study["hypothesis"]
    return {"id": "installation-hypothesis:" + study["id"], "title": study["title"], "status": "supported_hypothesis",
        "assertion_basis": "project_inference", "configuration_ref": finding["configuration_ref"], "mechanism": hyp["mechanism"],
        "participants": [{k: v for k, v in p.items() if k not in {"wall_refs", "site_refs", "geometry_sha256", "annotation_refs"}} for p in participants],
        "roles": study["roles"], "measurements": measurements,
        "supporting_evidence": [{**s, "source_refs": historical._source_refs(s["source_refs"], review, scene),
            "evidence_refs": historical._evidence_refs(historical._source_refs(s["source_refs"], review, scene), scene)} for s in hyp["supporting_evidence"]],
        "counterevidence": study["counterevidence"], "alternatives": study["alternatives"], "intermediate_components": study.get("intermediate_components", []),
        "unresolved_requirements": study["missing_evidence"], "source_refs": finding["source_refs"], "evidence_refs": finding["evidence_refs"],
        "investigation_ref": "investigation:" + study["id"]}


def augment_analysis(base, scene, root, review=None):
    if review:
        validate_input(review, scene)
    result = historical.augment_analysis(base, scene, root, _legacy(review))
    candidates = {c["id"]: c for c in result["structure_candidates"]}
    parts = {p["id"]: p for p in scene["parts"]}
    geometry = {g["id"]: g for key in ("features", "circular_openings") for g in result.get(key, [])}
    studies = {tuple(sorted(p["part_ref"] for p in s["participants"])): s for s in (review or {}).get("connection_review_studies", [])}
    findings = []
    reviewed_studies = set()
    for connection in result["connection_reviews"]:
        refs = [p["part_ref"] for p in connection["participants"]]
        pairings = local_pairings(refs, candidates, parts)
        existing = [h for h in result["installation_hypotheses"] if {p["part_ref"] for p in h["participants"]} == set(refs)]
        finding = {"id": "connection-finding:" + connection["id"].split(":", 2)[-1], "review_ref": connection["id"],
            "configuration_ref": connection["configuration_ref"], "title": " ↔ ".join(parts[r]["name"] for r in refs),
            "work_status": "not_investigated", "evidence_status": "geometry_only",
            "participants": _participants(connection, pairings, candidates, parts, geometry), "local_pairings": pairings,
            "geometry_observation_refs": connection["geometry_observation_refs"], "reference_mount_refs": connection["reference_mount_refs"],
            "mechanism_candidates": [], "roles": [], "actions": [], "findings": [p["statement"] for p in pairings[:8]],
            "counterevidence": [], "alternatives": [], "intermediate_components": [],
            "missing_evidence": list(connection["missing_requirements"]), "next_actions": [],
            "hypothesis_refs": [h["id"] for h in existing], "source_refs": connection["source_refs"], "evidence_refs": connection["evidence_refs"]}
        if not pairings:
            finding["findings"] = ["当前审查只有来源包围盒或面投影线索；在相同参考构型下，未检出轴距≤0.15 mm 且有限间隔≤5 mm 的双方圆柱结构配对。"]
        finding["next_actions"] = ["按双方已列局部结构分别隔离/剖切，检查其入口、有限接触面及中间件；仅包围盒相邻的区域还需定位具体结构。",
            "对照固定装配图或源 CAD，核对上述孔/轴结构是否被实际选用，以及螺纹、保持件和活动区域；当前尚未执行该项功能调查。"]
        for pair in pairings[:8]:
            ds = pair["geometry_checks"][0]["value"]
            if pair["kinds"] == ["bore_wall", "bore_wall"] and min(ds) <= .0021 and .002 <= max(ds) <= .003:
                finding["mechanism_candidates"].append({"kind": "screw_clamp", "status": "geometry_only",
                    "summary": pair["statement"] + "可执行的调查方向是通过孔—接收孔或穿透螺钉方案；尚缺实际承接和夹紧证据。"})
                break
        if existing:
            finding.update(work_status="investigated", evidence_status="supported_hypothesis",
                mechanism_candidates=[{**h["mechanism"], "status": h["status"]} for h in existing], roles=existing[0]["roles"],
                counterevidence=existing[0]["counterevidence"], alternatives=existing[0]["alternatives"], intermediate_components=existing[0]["intermediate_components"],
                missing_evidence=existing[0]["unresolved_requirements"])
            records = [r for r in result["investigation_records"] if r["id"] == existing[0]["investigation_ref"]]
            if records:
                finding.update(actions=records[0]["actions"], findings=records[0]["findings"], next_actions=records[0]["missing_evidence"])
            finding["participants"] = existing[0]["participants"]
        study = studies.get(tuple(sorted(refs)))
        if study:
            reviewed_studies.add(study["id"])
            for participant in study["participants"]:
                if any(ref not in candidates or candidates[ref]["owner_ref"] != participant["part_ref"] for ref in participant["structure_refs"]):
                    raise ValueError("Connection study refers to missing or foreign finite source structures")
            source_refs = historical._source_refs([ref for action in study["actions"] for ref in action["source_refs"]], review, scene)
            finding.update({key: deepcopy(study[key]) for key in ("title", "work_status", "findings", "roles", "counterevidence", "alternatives", "missing_evidence", "next_actions", "mechanism_candidates")})
            finding.update(evidence_status=study["outcome"], participants=[{**next(p for p in finding["participants"] if p["part_ref"] == x["part_ref"]), **x} for x in study["participants"]],
                actions=[{**a, "source_refs": historical._source_refs(a["source_refs"], review, scene)} for a in study["actions"]],
                intermediate_components=study.get("intermediate_components", []), source_refs=source_refs,
                evidence_refs=historical._evidence_refs(source_refs, scene), stop_reason=study["stop_reason"], study_ref=study["id"])
            if study["outcome"] == "supported_hypothesis":
                hyp = _hypothesis(study, finding, result, scene, review)
                result["installation_hypotheses"].append(hyp)
                finding["hypothesis_refs"].append(hyp["id"])
            first = finding["participants"][0]
            result["investigation_records"].append({"id": "investigation:" + study["id"], "title": study["title"],
                **{k: first[k] for k in ("part_ref", "structure_refs", "opening_refs", "feature_refs", "position_local_m")},
                "work_status": "investigated", "evidence_status": study["outcome"], "actions": finding["actions"],
                "findings": study["findings"], "missing_evidence": study["missing_evidence"], "hypothesis_refs": finding["hypothesis_refs"],
                "stop_reason": study["stop_reason"], "source_refs": source_refs, "evidence_refs": finding["evidence_refs"]})
            for p in finding["participants"]:
                for ref in p["structure_refs"]:
                    c = candidates[ref]
                    c.update(work_status="investigated", review_status="reviewed")
                    c["investigation_refs"] = sorted(set(c["investigation_refs"] + ["investigation:" + study["id"]]))
                    c["hypothesis_refs"] = sorted(set(c["hypothesis_refs"] + finding["hypothesis_refs"]))
                    if finding["hypothesis_refs"] and c["function_status"] == "unknown":
                        c["function_status"] = "installation_hypothesis_available"
        findings.append(finding)
    if reviewed_studies != {s["id"] for s in studies.values()}:
        raise ValueError("Frozen connection study has no actual ConnectionReview: " + ", ".join(sorted({s["id"] for s in studies.values()}-reviewed_studies)))
    result["connection_review_findings"] = findings
    result["connection_relation_contexts"] = []
    for context in (review or {}).get("relation_contexts", []):
        linked = [f for f in findings if {p["part_ref"] for p in f["participants"]} <= set(context["part_refs"])]
        result["connection_relation_contexts"].append({**context, "finding_refs": [f["id"] for f in linked], "status": "investigated_insufficient"})
    result["connection_analysis_coverage"] = analysis_coverage(result, scene, review)
    result["review_coverage"]["function_status"] = dict(Counter(c["function_status"] for c in candidates.values()))
    result["relationship_coverage"] = historical.expectation_coverage(result, _legacy(review))
    acceptance = result["connection_analysis_coverage"]["independent_review_findings"]
    if acceptance["missing"]:
        raise ValueError("Independent connection analysis missing: " + ", ".join(acceptance["missing"]))
    return result


def independent_acceptance(analysis, review):
    missing, matches = [], []
    for expected in (review or {}).get("expected_review_findings", []):
        found = [f for f in analysis.get("connection_review_findings", [])
            if {p["part_ref"] for p in f.get("participants", [])} == set(expected["part_refs"])
            and f.get("work_status") == "investigated" and f.get("evidence_status") == expected["outcome"]
            and f.get("actions") and f.get("findings") and f.get("counterevidence") and f.get("alternatives") and f.get("missing_evidence")
            and all(p.get("structure_refs") and p.get("position_local_m") is not None for p in f["participants"])
            and {r["role"] for r in f.get("roles", [])} == {"location", "retention", "motion", "limit"}
            and any(m["kind"] == expected["mechanism"] for m in f.get("mechanism_candidates", []))]
        if len(found) == 1 and expected["outcome"] == "supported_hypothesis":
            f = found[0]
            hypotheses = [h for h in analysis.get("installation_hypotheses", []) if h.get("id") in f.get("hypothesis_refs", [])
                and {p["part_ref"] for p in h.get("participants", [])} == set(expected["part_refs"])
                and h.get("mechanism", {}).get("kind") == expected["mechanism"] and h.get("measurements") and h.get("supporting_evidence")]
            if len(hypotheses) != 1:
                found = []
        if len(found) != 1:
            missing.append(expected["id"])
        else:
            matches.append({"id": expected["id"], "finding_ref": found[0]["id"], "hypothesis_refs": found[0]["hypothesis_refs"]})
    return {"expected_count": len((review or {}).get("expected_review_findings", [])), "located_count": len(matches), "matches": matches, "missing": missing}


def analysis_coverage(analysis, scene, review):
    findings = analysis["connection_review_findings"]
    rows = []
    for part in scene["parts"]:
        related = [f for f in findings if any(p["part_ref"] == part["id"] for p in f["participants"])]
        hypotheses = [h["id"] for h in analysis["installation_hypotheses"] if any(p["part_ref"] == part["id"] for p in h["participants"])]
        definitions = [d["id"] for d in analysis.get("mounting_interfaces", []) if d["owner_ref"] == part["id"]]
        rows.append({"part_ref": part["id"], "name": part["name"], "installation_definition_refs": definitions,
            "hypothesis_refs": hypotheses, "finding_refs": [f["id"] for f in related],
            "investigated_insufficient_refs": [f["id"] for f in related if f["work_status"] == "investigated" and f["evidence_status"] == "insufficient"],
            "geometry_only_refs": [f["id"] for f in related if f["work_status"] == "not_investigated" and f["local_pairings"]],
            "uninvestigated_refs": [f["id"] for f in related if f["work_status"] == "not_investigated"],
            "mechanisms": sorted({m["kind"] for f in related if f["work_status"] == "investigated" for m in f["mechanism_candidates"]}),
            "context_refs": [c["id"] for c in analysis.get("connection_relation_contexts", []) if part["id"] in c["part_refs"]]})
    review_pairs = {tuple(sorted(p["part_ref"] for p in r["participants"])): r["id"] for r in analysis["connection_reviews"]}
    candidates = {c["id"]: c for c in analysis["structure_candidates"]}
    pending = {}
    for c in candidates.values():
        for proposal in c.get("counterpart_proposals", []):
            other = proposal.get("part_ref")
            if not other or other == c["owner_ref"]:
                continue
            pair = tuple(sorted([c["owner_ref"], other]))
            if pair in review_pairs:
                continue
            entry = pending.setdefault(pair, {"part_refs": list(pair), "structure_refs": [], "work_status": "not_investigated", "evidence_status": "geometry_only",
                "next_action": "原候选已有有限圆柱对端线索但尚无连接审查；先核对共同构型的有限间隔、互补与第三件，再查功能依据。"})
            entry["structure_refs"] = sorted(set(entry["structure_refs"] + [c["id"], proposal["structure_ref"]]))
    parts = {p["id"]: p for p in scene["parts"]}
    for entry in pending.values():
        entry["participants"] = [{"part_ref": ref, "structure_refs": [r for r in entry["structure_refs"] if candidates[r]["owner_ref"] == ref],
            "positions_local_m": [candidates[r]["geometry"]["center"] for r in entry["structure_refs"] if candidates[r]["owner_ref"] == ref]}
            for ref in entry["part_refs"]]
        entry["local_pairings"] = local_pairings(entry["part_refs"], candidates, parts, max_gap_m=.012)
        entry["geometry_findings"] = [p["statement"] for p in entry["local_pairings"]]
        if not entry["geometry_findings"]:
            entry["geometry_findings"] = ["原对端提议来自开口或平面轴向投影；本轮圆柱有限壁复核没有发现双方实际圆柱壁配对。需检查有限面重叠及中间件，不能用平面中心的轴代替接触。"]
        names = " ↔ ".join(parts[ref]["name"] for ref in entry["part_refs"])
        entry["next_action"] = names + "：在列出的源局部结构处剖切，核对上述有限间隔/直径与实际中间件。" + (
            "双方孔壁已有几何数据，优先核对是否穿透螺钉/隔柱或仅同轴让位；固定本地资料缺少该对的逐孔装配及保持依据。" if entry["local_pairings"] else
            "先定位真正相对的有限面或孔壁；当前只是开口/平面轴向投影，不能直接形成机制假设。")
    return {"parts_count": len(rows), "parts": rows, "reviews_count": len(findings), "work_status": dict(Counter(f["work_status"] for f in findings)),
        "evidence_status": dict(Counter(f["evidence_status"] for f in findings)), "unreviewed_geometric_pairs": list(pending.values()),
        "multi_part_contexts_count": len(analysis.get("connection_relation_contexts", [])),
        "independent_review_findings": independent_acceptance(analysis, review), "complete": False,
        "scope": "All Part instances and existing reviews are inventoried. Geometry pairing, executed research, hypotheses, installation definitions and actual engagement remain distinct; unreviewed source regions remain open."}


def validate_coverage(knowledge, scene, root):
    source = next((s for s in scene["sources"] if s["id"] == geometric.SOURCE), None)
    review = validate_input(json.loads((root / geometric.SOURCE_PATH).read_bytes()), scene) if source else None
    coverage = geometric.independent_coverage(knowledge["structure_candidates"], review)
    if coverage != knowledge["review_coverage"]["independent_features"] or coverage["missing"]:
        raise ValueError("Independent feature coverage missing or inconsistent")
    if historical.expectation_coverage(knowledge, _legacy(review))["missing"]:
        raise ValueError("Independent relationship coverage missing")
    acceptance = independent_acceptance(knowledge, review)
    if acceptance["missing"]:
        raise ValueError("Independent connection analysis missing: " + ", ".join(acceptance["missing"]))
    reviews = {r["id"] for r in knowledge["connection_reviews"]}
    findings = knowledge["connection_review_findings"]
    if len(findings) != len(reviews) or {f["review_ref"] for f in findings} != reviews:
        raise ValueError("Connection review analysis inventory is incomplete")
    expected = analysis_coverage(knowledge, scene, review)
    if expected != knowledge["connection_analysis_coverage"]:
        raise ValueError("Connection analysis coverage differs from actual evidence stages")
    for key in KEYS:
        if scene["analysis"].get(key) != knowledge[key]:
            raise ValueError("Connection analysis projections disagree: " + key)
