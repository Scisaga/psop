"""Frozen, data-only publication for source-model/1.15.

Discovery and inference run in prepare. Freeze checks independent expectations
and seals the complete work set. Finalize only copies and labels sealed bytes.
Historical package profiles are handled by their unchanged implementation.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import gzip
import json
from itertools import combinations
from pathlib import Path
import re
import shutil
import tempfile
import time

from .capability_catalog import PROFILE, SCHEMA, build_catalog, validate_catalog, canonical, key

ENTRYPOINTS = {"knowledge": "knowledge/entities.json", "sources": "knowledge/sources.json",
    "evidence": "knowledge/evidence.json", "gaps": "knowledge/gaps.json", "scene": "indexes/scene.json",
    "capabilities": "indexes/capabilities.json", "compatibility": "indexes/compatibility.json", "coverage": "indexes/coverage.json"}
CAPABILITIES = {
    "source_registry": {"status": "complete", "scope": "Captured unchanged source bytes and separate source-instance identities"},
    "part_capabilities": {"status": "partial", "scope": "Finite measured geometry, physical resources, potential modes and explicit residual source regions; independent scope is published"},
    "cross_part_candidates": {"status": "complete", "scope": "Every distinct source-instance pair has a disposition for every declared local-geometry template; unresolved specifications are retained"},
    "reference_assembly": {"status": "partial", "scope": "Attributed reference uses and configuration-bound conflicts, separate from potential compatibility"},
    "mechanical_validation": {"status": "unavailable", "scope": "No common placement, collision, holding, elastic engagement or load qualification"},
    "path_validation": {"status": "unavailable", "scope": "Assembly and insertion paths remain Simulate work"},
    "variant_design_execution": {"status": "unavailable", "scope": "Build publishes consumable capabilities; Simulate search and interactive assembly are not implemented"},
}


def _capabilities(root):
    """Preserve historical manifests; screening is a captured opt-in policy."""
    result=deepcopy(CAPABILITIES)
    authored=root/'sources/SRC-MD-ASSEMBLY-CATALOG.json'
    if authored.is_file() and _read(authored).get('provenance',{}).get('compatibility_interface_policy',{}).get('whole_part_interference'):
        result['mechanical_validation']={'status':'partial','scope':'Complete functional interfaces and whole unchanged closed source solids at published finite boundary seats; paths, retention, moving subframes and loads remain unqualified'}
    return result


def _p():
    from . import package
    return package


def _write(path, value):
    # Compact large detail shards. Canonical serialization is deterministic.
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = canonical(value)+b"\n"
    if path.name.endswith(".json.gz"):
        raw = gzip.compress(raw, compresslevel=6, mtime=0)
        raw = raw[:9]+b"\xff"+raw[10:]  # portable OS header, no filename
    path.write_bytes(raw)


def _read(path):
    with path.open("rb") as stream:
        magic = stream.read(2)
    if magic != b"\x1f\x8b":
        return _p().read_json(path)
    with gzip.open(path, "rb") as stream:
        raw = stream.read(128*1024*1024+1)
    if len(raw) > 128*1024*1024:
        raise ValueError("Expanded capability shard exceeds its bounded size")
    def pairs(items):
        result = {}
        for name, value in items:
            if name in result:
                raise ValueError("Duplicate JSON key in compressed capability shard: "+name)
            result[name] = value
        return result
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
        parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Non-finite JSON: "+value)))


def _files(root):
    return [{"path": p.relative_to(root).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size}
            for p in sorted(root.rglob("*")) if p.is_file()]


def _verify_files(root, records):
    paths = set()
    for record in records:
        if record["path"] in paths:
            raise ValueError("Duplicate frozen file")
        paths.add(record["path"])
        path = _p().local_path(root, record["path"])
        if path.stat().st_size != record["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Frozen file changed: "+record["path"])
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    if paths != actual:
        raise ValueError("Unlisted or absent frozen artifacts")


def _prepare_details(scene, catalog, compatibility, root, requirements, review):
    part_index = {}
    separate='assembly_policy' in compatibility
    if separate:catalog['analysis']['assembly_policy']=compatibility['assembly_policy']
    pair_index = []
    use_reviews = {p["owner_ref"]: p for p in review.get("reference_uses", {}).get("parts", [])}
    by_owner = {part["id"]: [] for part in scene["parts"]}
    by_pair = defaultdict(list)
    clues_by_pair = defaultdict(list)
    exclusions_by_pair = defaultdict(list)
    for candidate in compatibility["candidates"]:
        pair = tuple(e["owner_ref"] for e in candidate["endpoints"])
        by_pair[pair].append(candidate)
    for clue in compatibility.get("local_geometry_clues",[]):
        clues_by_pair[tuple(e["owner_ref"] for e in clue["endpoints"])].append(clue)
    for exclusion in compatibility.get('placement_exclusions',[]):
        exclusions_by_pair[tuple(exclusion['owner_refs'])].append(exclusion)
    screening = {tuple(row["owner_refs"]): row for row in compatibility["coverage"]["pair_dispositions"]}
    for a, b in combinations(sorted(by_owner), 2):
        candidates = by_pair[(a, b)]
        pid = "pair:"+key([a, b])
        path = "details/pairs/"+key([a, b])+".json.gz"
        summary = {"id": pid, "owner_refs": [a, b], "path": path, "candidate_count": len(candidates),
            "template_counts": dict(Counter(c["template_ref"] for c in candidates))}
        if "local_geometry_clues" in compatibility:
            summary.update(interface_match_count=sum(len(c["interface_matches"]) for c in candidates),local_geometry_count=len(clues_by_pair[(a,b)]))
        if 'placement_exclusions' in compatibility:
            summary.update(placement_evaluated=True,excluded_placement_count=sum(len(e['alignment_options']) for e in exclusions_by_pair[(a,b)]))
        pair_index.append(summary)
        by_owner[a].append(summary)
        by_owner[b].append(summary)
        _write(root/path, {"schema": "psop.compatibility-pair/2" if separate else "psop.compatibility-pair/1", "owner_refs": [a, b],
            "candidates": candidates, "screening": screening[(a, b)],
            **({'placement_exclusions':exclusions_by_pair[(a,b)]} if 'placement_exclusions' in compatibility else {}),
            **({"local_geometry_clues":clues_by_pair[(a,b)]} if "local_geometry_clues" in compatibility else {})})
    for part in sorted(scene["parts"], key=lambda p: p["id"]):
        owner = part["id"]
        fs = [f for f in catalog["features"] if f["owner_ref"] == owner]
        interfaces = [i for i in catalog["interfaces"] if i["owner_ref"] == owner]
        ir = {i["id"] for i in interfaces}
        detail = {"schema": "psop.part-capabilities/1", "owner_ref": owner, "features": fs, "interfaces": interfaces,
            "resources": [r for r in catalog["resources"] if r["owner_ref"] == owner],
            "frames": [f for f in catalog["frames"] if f["owner_ref"] == owner],
            "reference_connections": [c for c in catalog["reference_connections"] if any(e["interface_ref"] in ir for e in c["endpoints"])],
            "compatibility_pairs": by_owner[owner], "instance_review": next(r for r in catalog["instance_reviews"] if r["owner_ref"] == owner)}
        if owner in use_reviews:
            detail["reference_use_review"] = use_reviews[owner]
        path = "details/parts/"+key(owner)+".json.gz"
        _write(root/path, detail)
        part_index[owner] = {"path": path, "feature_count": len(fs), "interface_count": len(interfaces),
            "candidate_count": sum(p["candidate_count"] for p in by_owner[owner])}
    capability_index = {"parts": part_index, "compatibility": {"index_path": ENTRYPOINTS["compatibility"]}, "review_path": ENTRYPOINTS["coverage"]}
    if separate:capability_index["assembly_policy"]=compatibility["assembly_policy"]
    scene["assembly"]["capability_index"] = capability_index
    # Scene is a browsing summary, not an eager duplicate of all new details.
    _write(root/ENTRYPOINTS["scene"], scene)
    _write(root/ENTRYPOINTS["capabilities"], {"schema": "psop.capability-index/1", **capability_index,
        "analysis": catalog["analysis"], "migrations": catalog["migrations"]})
    _write(root/ENTRYPOINTS["compatibility"], {"schema": "psop.compatibility-index/2" if separate else "psop.compatibility-index/1", "pairs": pair_index,
        **({"assembly_policy":compatibility["assembly_policy"]} if separate else {}),
        "templates": compatibility["templates"], "scope": "complete_interfaces_with_separate_assembly_assessment" if separate else "complete_interfaces_with_clear_fixed_source_pose" if 'placement_exclusions' in compatibility else "complete_functional_interfaces" if "local_geometry_clues" in compatibility else "pose_independent_geometry", "placement_evaluated": 'placement_exclusions' in compatibility})
    _write(root/ENTRYPOINTS["coverage"], {"schema": "psop.capability-coverage/1", "geometry": review,
        "candidate_coverage": compatibility["coverage"], "analysis": catalog["analysis"]})
    _write(root/"knowledge/catalog-metadata.json", {k: catalog[k] for k in ("schema", "part_notes", "migrations", "analysis")})
    _write(root/"sources/SRC-CAPABILITY-REQUIREMENTS.json", requirements)


def prepare(input_path, work, device_id, name, xml=None, ontology=None, *, assembly_knowledge=None, requirements=None, reference_adjustments=None):
    p = _p()
    if requirements is None:
        requirements = p.REPO/"device-materials/assembly/capability-review.json"
    requirements = requirements.resolve(strict=True)
    # The old authored catalog is an attributed semantic/reference overlay only.
    # Its discovery behavior remains frozen and is not used to enumerate facts.
    started = time.perf_counter()
    analysis_tool_sha = p.tool_digest()
    result = p.prepare(input_path, work, device_id, name, xml, ontology,
        profile=p.PROFILE if assembly_knowledge else p.LEGACY_PROFILE, assembly_knowledge=assembly_knowledge)
    try:
        intake = _read(work/"intake.json")
        shutil.copyfile(requirements, work/"inputs/capability-requirements.json")
        req = _read(work/"inputs/capability-requirements.json")
        root = work/"prepared"
        scene = p.project(work/"inputs/materials.zip", root, work/"inputs/hardware-ontology.md", xml_path=work/"inputs/model.xml", device_id=device_id, title=name)
        declaration = None
        if assembly_knowledge:
            path = work/"inputs/assembly-knowledge.json"
            supporting = p.supporting_input_paths(intake["inputs"].get("supporting_documents", []), _read(path), work, published=False)
            declaration = p.capture_assembly_knowledge(scene, root, path, p.PROFILE, supporting)
            p.enrich_scene(scene, root, p.PROFILE, declaration)
        else:
            scene["assembly"] = {"features": [], "interfaces": [], "connections": [], "part_notes": []}
        for reference in req.get("provenance", []):
            if not reference.get("capture_path"):
                continue
            source_path = p.local_path(requirements.parent, reference["capture_path"])
            raw_document = source_path.read_bytes()
            sha = hashlib.sha256(raw_document).hexdigest()
            if sha != reference["sha256"]:
                raise ValueError("Independent supporting review document changed")
            sid = "SRC-CAPABILITY-REVIEW-"+sha[:16]
            relative = "sources/"+sid+".json"
            (root/relative).write_bytes(raw_document)
            input_relative = "inputs/"+sid+".json"
            (work/input_relative).write_bytes(raw_document)
            intake["inputs"]["review_document_"+sha[:16]] = {"path": input_relative, "sha256": sha, "published_path": relative}
            scene["sources"].append({"id": sid, "title": reference["artifact"], "path": reference["capture_path"],
                "format": "JSON", "bytes": len(raw_document), "digest": sha, "scope": "package", "url": relative, "supplemented": True})
            scene.setdefault("evidence", []).append({"id": "evidence:capability-review:"+sha[:16], "sourceId": sid,
                "title": "独立原始顶点与边界复核", "kind": "source-file", "excerpt": "原三角、分层圆缘及单曲面反例；不代表制造公差或已完成装配。"})
        scene["meta"]["counts"].update(sources=len(scene["sources"]), evidence=len(scene["evidence"]))
        scene["meta"]["deviceId"] = device_id
        if reference_adjustments is not None:
            from .reference_alignment import INPUT_PATH
            raw = reference_adjustments.resolve(strict=True).read_bytes()
            (work/"inputs/reference-adjustments.json").write_bytes(raw)
            (root/INPUT_PATH).write_bytes(raw)
            sha = hashlib.sha256(raw).hexdigest()
            intake["inputs"]["reference_adjustments"] = {"path": "inputs/reference-adjustments.json", "sha256": sha, "published_path": INPUT_PATH}
            scene["sources"].append({"id": "SRC-REFERENCE-ADJUSTMENTS", "title": "参考装配合理修正依据与有限约束", "path": reference_adjustments.name,
                "format": "JSON", "bytes": len(raw), "digest": sha, "scope": "package", "url": INPUT_PATH, "supplemented": True})
            scene["meta"]["counts"]["sources"] = len(scene["sources"])
        catalog = build_catalog(scene, root, scene["assembly"], measurement_cache=work.parent/"measurement-cache-v1",
            progress=lambda status: _write(work/"progress.json", status))
        if reference_adjustments is not None:
            from .reference_alignment import INPUT_PATH, REPORT_PATH, reconcile, summary
            request = _read(root/INPUT_PATH)
            p.validate_shape(request, _read(p.SKILL/"schemas/reference-adjustments-1.schema.json"))
            report = reconcile(scene, catalog, root, request)
            _write(root/REPORT_PATH, report)
            scene["reference_alignment"] = summary(report)
        from .compatibility import build_candidates
        from .interface_policy import validate_evidence
        validate_evidence((declaration or {}).get("provenance",{}).get("compatibility_interface_policy",{}),[e["id"] for e in scene.get("evidence",[])])
        measured_at = time.perf_counter()
        _write(work/"progress.json", {"phase": "compatibility", "geometry_seconds": measured_at-started})
        compatibility = build_candidates(scene["parts"], catalog,interface_policy=(declaration or {}).get("provenance",{}).get("compatibility_interface_policy"),geometry_root=root,
            progress=lambda status:_write(work/'progress.json',status))
        candidates_at = time.perf_counter()
        review = validate_catalog(catalog, scene, root, req)
        _write(work/"progress.json", {"phase": "detail_shards", "candidate_count": len(compatibility["candidates"])})
        _prepare_details(scene, catalog, compatibility, root, req, review)
        # Retain the independently supplied bytes, including their original
        # serialization, so the published lock is the input lock.
        shutil.copyfile(work/"inputs/capability-requirements.json", root/"sources/SRC-CAPABILITY-REQUIREMENTS.json")
        _write(root/"knowledge/sources.json", {"schema": "psop.build.sources/2.0-draft.1", "items": scene["sources"]})
        _write(root/"knowledge/evidence.json", {"schema": "psop.build.evidence/2.0-draft.1", "items": scene["evidence"]})
        _write(root/"knowledge/gaps.json", {"schema": "psop.build.gaps/2.0-draft.1", "items": [
            {"id": "gap:simulate", "status": "not_implemented", "scope": "Insertion path, moving subframe, holding, load and engineering checks" if 'placement_exclusions' in compatibility else "Common placement, whole-Part collision, insertion path, holding and engineering checks"},
            {"id": "gap:residual-regions", "status": "explicit_finite_geometry", "scope": "Unparameterized finite source regions require further shape interpretation; not qualified interfaces"}]})
        _write(root/"knowledge/connector-types.json", {"schema": "psop.connector-types/1", "version": 1,
            "allowed": [{"kind": "through_bolt_with_nut_and_optional_washers", "specification": "parameterized_clearance_and_unknown_stack"},
                        {"kind": "screw", "specification": "source_thread_or_receiver_condition_required"},
                        {"kind": "standard_pin", "specification": "parameterized_diameter_length_and_retaining_condition"}],
            "sku_selected": False, "quantity_established": False, "modification_or_custom_adapter_allowed": False})
        shutil.copyfile(work/"inputs/materials.zip", root/"inputs-materials.zip")
        for filename in ("manifest-source-model-1.15.schema.json", "source-model-1.15.schema.json", "assembly-catalog-3.schema.json", "assembly-requirements-2.schema.json", "reference-adjustments-1.schema.json", "reference-use-review-1.schema.json", "reference-connection-assessment-1.schema.json"):
            target = root/"schemas"/filename
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(p.SKILL/"schemas"/filename, target)
        if analysis_tool_sha != p.tool_digest():
            raise ValueError("Builder changed during analysis; prepare again (valid source measurements may be reused)")
        intake.update({"profile": PROFILE, "tool": {"name": "psop-build", "version": p.VERSION, "sha256": analysis_tool_sha},
            "requirements": {"path": "inputs/capability-requirements.json", "sha256": hashlib.sha256(requirements.read_bytes()).hexdigest()},
            "performance": {"prepare_seconds": time.perf_counter()-started, "geometry_and_capture_seconds": measured_at-started,
                "candidate_seconds": candidates_at-measured_at},
            "capability_counts": {"features": len(catalog["features"]), "interfaces": len(catalog["interfaces"]), "resources": len(catalog["resources"]),
                "candidates": len(compatibility["candidates"]), "instance_pairs": len(compatibility["coverage"]["pair_dispositions"])}})
        _write(work/"intake.json", intake)
        _write(work/"review.json", {"schema": "psop.build.review/2", "profile": PROFILE, "independent": review,
            "counts": intake["capability_counts"], "performance": intake["performance"], "capabilities": _capabilities(root)})
        return {**result, "profile": PROFILE, "counts": intake["capability_counts"], "next": "freeze", "performance": intake["performance"]}
    except Exception:
        # An unsuccessful prepare is visible and cannot be frozen or published.
        intake = _read(work/"intake.json")
        intake.update({"profile": PROFILE, "analysis_status": "incomplete"})
        _write(work/"intake.json", intake)
        raise


def _load_catalog(root, scene):
    idx = _read(root/ENTRYPOINTS["capabilities"])
    use_reviews = {p["owner_ref"]: p for p in _read(root/ENTRYPOINTS["coverage"])["geometry"].get("reference_uses", {}).get("parts", [])}
    metadata = _read(root/"knowledge/catalog-metadata.json")
    if idx.get("migrations") != metadata["migrations"] or idx.get("analysis") != metadata["analysis"]:
        raise ValueError("Capability index changes the frozen catalog metadata")
    pair_index = _read(root/ENTRYPOINTS["compatibility"])
    pairs_by_owner = defaultdict(list)
    for pair in pair_index["pairs"]:
        for owner in pair["owner_refs"]:
            pairs_by_owner[owner].append(pair)
    catalog = {**metadata, "features": [], "interfaces": [], "resources": [], "frames": [], "reference_connections": [], "instance_reviews": []}
    refs = {}
    for owner, record in sorted(idx["parts"].items()):
        detail = _read(_p().local_path(root, record["path"]))
        if detail.get("schema") != "psop.part-capabilities/1" or detail.get("owner_ref") != owner:
            raise ValueError("Invalid capability detail owner")
        if detail.get("reference_use_review") != use_reviews.get(owner):
            raise ValueError("Part reference-use explanation differs from the independent coverage report")
        for collection in ("features", "interfaces", "resources", "frames"):
            if any(item.get("owner_ref") != owner for item in detail[collection]):
                raise ValueError("Part capability shard contains another owner's records")
            catalog[collection].extend(detail[collection])
        catalog["instance_reviews"].append(detail["instance_review"])
        for connection in detail["reference_connections"]:
            if connection["id"] in refs and refs[connection["id"]] != connection:
                raise ValueError("Reference connection copies disagree")
            refs[connection["id"]] = connection
        if record["feature_count"] != len(detail["features"]) or record["interface_count"] != len(detail["interfaces"]):
            raise ValueError("Capability detail index differs")
        if detail["compatibility_pairs"] != pairs_by_owner[owner] or record["candidate_count"] != sum(p["candidate_count"] for p in pairs_by_owner[owner]):
            raise ValueError("Part-local compatibility list loses or changes pair coverage")
    catalog["reference_connections"] = list(refs.values())
    summary_keys=("parts", "compatibility", "review_path")+(("assembly_policy",) if 'assembly_policy' in idx else ())
    if set(idx["parts"]) != {p["id"] for p in scene["parts"]} or scene["assembly"]["capability_index"] != {k: idx[k] for k in summary_keys}:
        raise ValueError("Scene capability index differs from complete instance scope")
    return catalog


def _validate_prepared(root, verify_candidates=True):
    scene = _read(root/ENTRYPOINTS["scene"])
    authored = root/"sources/SRC-MD-ASSEMBLY-CATALOG.json"
    if authored.is_file() and {k: v for k, v in scene["assembly"].items() if k != "capability_index"} != _read(authored)["catalog"]:
        raise ValueError("Browsing reference summary differs from the captured attributed catalog")
    catalog = _load_catalog(root, scene)
    from .reference_alignment import INPUT_PATH, REPORT_PATH, reconcile, summary
    if (root/INPUT_PATH).is_file():
        request = _read(root/INPUT_PATH)
        _p().validate_shape(request, _read(_p().SKILL/"schemas/reference-adjustments-1.schema.json"))
        report = reconcile(scene, catalog, root, request)
        if _read(root/REPORT_PATH) != report or scene.get("reference_alignment") != summary(report):
            raise ValueError("Reference alignment differs from source-locked geometric constraints")
    elif scene.get("reference_alignment") or (root/REPORT_PATH).exists():
        raise ValueError("Reference alignment has no captured source-locked request")
    req = _read(root/"sources/SRC-CAPABILITY-REQUIREMENTS.json")
    if req.get("reference_adjustments"):
        lock = req["reference_adjustments"]
        if not (root/INPUT_PATH).is_file() or hashlib.sha256((root/INPUT_PATH).read_bytes()).hexdigest() != lock["sha256"] or scene.get("reference_alignment", {}).get("configuration_ref") != lock["configuration_ref"]:
            raise ValueError("Independent reference alignment requirement is missing or changed")
    report = validate_catalog(catalog, scene, root, req)
    coverage = _read(root/ENTRYPOINTS["coverage"])
    if report != coverage["geometry"]:
        raise ValueError("Independent review report differs from witnessed requirements")
    index = _read(root/ENTRYPOINTS["compatibility"])
    pairs = list(combinations(sorted(p["id"] for p in scene["parts"]), 2))
    if [tuple(r["owner_refs"]) for r in index["pairs"]] != pairs:
        raise ValueError("Compatibility pair coverage incomplete or duplicated")
    expected, expected_by_pair, expected_clues_by_pair, expected_exclusions = None, defaultdict(list), defaultdict(list), defaultdict(list)
    policy=_read(authored).get("provenance",{}).get("compatibility_interface_policy") if authored.is_file() else None
    from .interface_policy import validate_evidence
    validate_evidence(policy or {},[e["id"] for e in scene.get("evidence",[])])
    screened=bool((policy or {}).get('whole_part_interference'))
    separate=(policy or {}).get('schema')=='psop.interface-matching-policy/3'
    if index.get('schema')!=('psop.compatibility-index/2' if separate else 'psop.compatibility-index/1'):raise ValueError('Compatibility schema does not match captured policy')
    if verify_candidates:
        from .compatibility import build_candidates
        expected = build_candidates(scene["parts"], catalog,interface_policy=policy,geometry_root=root)
        for candidate in expected["candidates"]:
            expected_by_pair[tuple(e["owner_ref"] for e in candidate["endpoints"])].append(candidate)
        for clue in expected.get("local_geometry_clues",[]):
            expected_clues_by_pair[tuple(e["owner_ref"] for e in clue["endpoints"])].append(clue)
        for exclusion in expected.get('placement_exclusions',[]):expected_exclusions[tuple(exclusion['owner_refs'])].append(exclusion)
    actual_count, screens = 0, []
    for record in index["pairs"]:
        detail = _read(_p().local_path(root, record["path"]))
        if detail["owner_refs"] != record["owner_refs"] or detail["schema"] != ("psop.compatibility-pair/2" if separate else "psop.compatibility-pair/1"):
            raise ValueError("Pair detail owner mismatch")
        cs = detail["candidates"]
        if record["candidate_count"] != len(cs) or record["template_counts"] != dict(Counter(c["template_ref"] for c in cs)):
            raise ValueError("Candidate index does not match details")
        if any(c.get("assessment_scope") != ('complete_interface_fixed_pose' if screened else "pose_independent_geometry") or c.get("placement_evaluated") is not screened or any(k in c for k in ("placement", "pose", "assembled", "retained")) for c in cs):
            raise ValueError("Compatibility candidate must not claim a solved assembly")
        if screened and (record.get('placement_evaluated') is not True or any(not c.get('whole_part_collision_evaluated') or any((o.get('assembly_assessment',{}).get('decision') not in {'allow','allow_with_note'} if separate else o.get('interference',{}).get('status')!='clear') for m in c.get('interface_matches',[]) for o in m['alignment_options']) for c in cs)):
            raise ValueError('Published placement does not satisfy its captured assembly policy')
        if verify_candidates and canonical(sorted(cs, key=lambda c: c["id"])) != canonical(expected_by_pair[tuple(detail["owner_refs"])]):
            raise ValueError("Candidate witness, mapping or full template coverage differs from finite geometry")
        if verify_candidates and "local_geometry_clues" in expected:
            expected_clues=expected_clues_by_pair[tuple(detail["owner_refs"])]
            if canonical(detail.get("local_geometry_clues"))!=canonical(expected_clues) or record.get("interface_match_count")!=sum(len(c["interface_matches"]) for c in cs) or record.get("local_geometry_count")!=len(expected_clues):
                raise ValueError("Complete interface matches or retained local geometry differ from the exhaustive analysis")
        if verify_candidates and screened:
            es=expected_exclusions[tuple(detail['owner_refs'])]
            if canonical(detail.get('placement_exclusions'))!=canonical(es) or record.get('excluded_placement_count')!=sum(len(e['alignment_options']) for e in es):
                raise ValueError('Whole-source placement exclusions differ from captured meshes')
        actual_count += len(cs)
        screens.append(detail["screening"])
    if verify_candidates:
        if screens != expected["coverage"]["pair_dispositions"] or index["templates"] != expected["templates"] or coverage["candidate_coverage"] != expected["coverage"]:
            raise ValueError("Candidate witness, mapping or full template coverage differs from finite geometry")
    return {"scene": scene, "catalog": catalog, "review": report, "candidate_count": actual_count, "pair_count": len(pairs)}


def freeze(work):
    p = _p()
    intake = _read(work/"intake.json")
    if intake.get("profile") != PROFILE or intake.get("analysis_status") == "incomplete":
        raise ValueError("freeze requires a completed source-model/1.15 prepare")
    if intake["tool"]["sha256"] != p.tool_digest():
        raise ValueError("Builder changed after analysis; prepare again before freezing")
    for record in [*p.locked_input_records(intake["inputs"]), intake["requirements"]]:
        if hashlib.sha256(p.local_path(work, record["path"]).read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Analysis input changed; prepare again")
        if record.get("published_path") and hashlib.sha256(p.local_path(work/"prepared", record["published_path"]).read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Published independent review differs from the locked input")
    for relative, expected in (("sources/SRC-CAPABILITY-REQUIREMENTS.json", intake["requirements"]["sha256"]),
            ("inputs-materials.zip", intake["inputs"]["archive"]["sha256"]),
            ("sources/SRC-PSOP-ONTOLOGY.md", intake["inputs"]["ontology"]["sha256"])):
        if hashlib.sha256(p.local_path(work/"prepared", relative).read_bytes()).hexdigest() != expected:
            raise ValueError("Prepared artifact differs from locked independent input: "+relative)
    result = _validate_prepared(work/"prepared")
    sealed = {"schema": "psop.build.freeze/1", "profile": PROFILE, "tool_sha256": p.tool_digest(),
        "intake_sha256": hashlib.sha256((work/"intake.json").read_bytes()).hexdigest(),
        "files": _files(work/"prepared"), "counts": intake["capability_counts"],
        "requirements_sha256": intake["requirements"]["sha256"]}
    sealed["digest"] = hashlib.sha256(canonical(sealed)).hexdigest()
    _write(work/"freeze.json", sealed)
    return {"ok": True, "command": "freeze", "work": str(work.resolve()), "digest": sealed["digest"], "counts": intake["capability_counts"]}


def finalize(work, output, version):
    p = _p()
    if output.exists() or not re.fullmatch(r"[0-9][A-Za-z0-9.+-]{0,95}", version):
        raise ValueError("Use a new immutable output directory and portable version")
    intake = _read(work/"intake.json")
    sealed = _read(work/"freeze.json")
    if sealed["tool_sha256"] != p.tool_digest() or sealed["intake_sha256"] != hashlib.sha256((work/"intake.json").read_bytes()).hexdigest():
        raise ValueError("Frozen builder or intake changed; prepare and freeze again")
    for record in [*p.locked_input_records(intake["inputs"]), intake["requirements"]]:
        if hashlib.sha256(p.local_path(work, record["path"]).read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Frozen analysis input changed; prepare and freeze again")
    if sealed["digest"] != hashlib.sha256(canonical({k: v for k, v in sealed.items() if k != "digest"})).hexdigest():
        raise ValueError("Freeze seal invalid")
    _verify_files(work/"prepared", sealed["files"])
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".capabilities-publish-", dir=output.parent))
    try:
        shutil.copytree(work/"prepared", staging, dirs_exist_ok=True)
        scene = _read(staging/ENTRYPOINTS["scene"])
        capabilities=_capabilities(staging)
        device = intake["device"]
        package_id = "psop."+device["id"]
        scene["meta"].update({"version": version, "snapshot": package_id+"@"+version, "generatedAt": intake["prepared_at"],
            "packageId": package_id, "packageVersion": version, "packageDigest": None, "dkpSchema": p.SCHEMA,
            "inputKind": "dkp", "capabilities": capabilities, "profile": PROFILE})
        _write(staging/ENTRYPOINTS["scene"], scene)
        knowledge = _knowledge_projection(scene, device["id"])
        _write(staging/ENTRYPOINTS["knowledge"], knowledge)
        manifest = {"schema": p.SCHEMA, "profile": PROFILE, "package_id": package_id, "package_version": version,
            "device": device, "created_at": intake["prepared_at"],
            "ontology": {"id": "psop.hardware", "version": p.ONTOLOGY, "path": "sources/SRC-PSOP-ONTOLOGY.md", "sha256": intake["inputs"]["ontology"]["sha256"]},
            "adapter": {"id": "microduck-mjcf/1.0", "commit": p.COMMIT, "xml_sha256": p.XML_SHA256},
            "inputs": {"archive": {"path": "inputs-materials.zip", "sha256": intake["inputs"]["archive"]["sha256"]},
                "requirements": {"path": "sources/SRC-CAPABILITY-REQUIREMENTS.json", "sha256": intake["requirements"]["sha256"]}},
            "toolchain": {"name": "psop-build", "version": p.VERSION, "sha256": sealed["tool_sha256"]},
            "entrypoints": ENTRYPOINTS, "counts": {**scene["meta"]["counts"], **intake["capability_counts"]},
            "capabilities": capabilities, "freeze": {"digest": sealed["digest"], "requirements_sha256": sealed["requirements_sha256"]},
            "performance": intake["performance"], "files": _files(staging)}
        if "assembly_knowledge" in intake["inputs"]:
            manifest["inputs"]["assembly_knowledge"] = {"path": "sources/SRC-MD-ASSEMBLY-CATALOG.json",
                "sha256": intake["inputs"]["assembly_knowledge"]["sha256"]}
        for name, record in intake["inputs"].items():
            if name.startswith("review_document_") or name == "reference_adjustments":
                manifest["inputs"][name] = {"path": record["published_path"], "sha256": record["sha256"]}
        if scene.get("reference_alignment"):
            manifest["entrypoints"] = {**ENTRYPOINTS, "reference_alignment": scene["reference_alignment"]["path"]}
        manifest["package_digest"] = hashlib.sha256(canonical(manifest)).hexdigest()
        _write(staging/"manifest.json", manifest)
        # Publication itself consumes no inference. validate is a separate stage.
        p.publish_directory(staging, output)
        return {"ok": True, "command": "finalize", "output": str(output.resolve()), "package_digest": manifest["package_digest"],
            "profile": PROFILE, "counts": manifest["counts"], "next": "validate"}
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def _knowledge_projection(scene, device_id):
    result = {"schema": PROFILE, "ontology_target": _p().ONTOLOGY, "device_id": device_id,
        "parts": [{"id": part["id"], "name": part["name"], "source_refs": part["sourceIds"], "stock_quantity": None} for part in scene["parts"]],
        "configurations": [{"id": "configuration:"+device_id+":source-qpos0", "record_type": "reference_configuration",
            "part_refs": [part["id"] for part in scene["parts"]], "placements": [{"part_ref": part["id"], "position": part["position"], "quaternion": part["quaternion"]} for part in scene["parts"]]}],
        "catalog_ref": ENTRYPOINTS["capabilities"], "compatibility_ref": ENTRYPOINTS["compatibility"], "coverage_ref": ENTRYPOINTS["coverage"]}
    if scene.get("reference_alignment"):
        alignment = scene["reference_alignment"]
        changed = {p["part_ref"]: p for p in alignment["placements"]}
        result["configurations"].append({"id": alignment["configuration_ref"], "record_type": "reference_configuration",
            "basis": "engineering_inference", "derived_from": alignment["source_configuration_ref"], "adjustment_ref": alignment["path"],
            "part_refs": [p["id"] for p in scene["parts"]], "placements": [{"part_ref": p["id"],
                "position": changed.get(p["id"], p)["position"], "quaternion": p["quaternion"]} for p in scene["parts"]]})
        result["default_configuration_ref"] = alignment["source_configuration_ref"] if scene.get("assembly",{}).get("capability_index",{}).get("assembly_policy") else alignment["configuration_ref"]
    return result


def _validate_source_registry(expected, actual):
    actual_by_id = {source["id"]: source for source in actual}
    if len(actual_by_id) != len(actual):
        raise ValueError("Duplicate captured source identity")
    for source in expected:
        published = actual_by_id.get(source["id"])
        # Published scene summaries omit inline document bodies and load the
        # captured source URL on demand. All provenance fields remain exact;
        # if an inline body is present it must also match the original bytes.
        projected = dict(source)
        if published is not None and "text" not in published:
            projected.pop("text", None)
        if published != projected:
            raise ValueError("Captured source registry differs from original archive")


def validate(root):
    p = _p()
    manifest = _read(root/"manifest.json")
    expected_entries = dict(ENTRYPOINTS)
    if "reference_adjustments" in manifest.get("inputs", {}):
        from .reference_alignment import REPORT_PATH
        expected_entries["reference_alignment"] = REPORT_PATH
    if manifest.get("profile") != PROFILE or manifest.get("entrypoints") != expected_entries or manifest.get("capabilities") != _capabilities(root):
        raise ValueError("Unknown capability publication contract")
    p.validate_shape(manifest, _read(p.SKILL/"schemas/manifest-source-model-1.15.schema.json"))
    if manifest["package_digest"] != hashlib.sha256(canonical({k: v for k, v in manifest.items() if k != "package_digest"})).hexdigest():
        raise ValueError("Package manifest digest invalid")
    actual_files = {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}-{ "manifest.json" }
    if len(manifest["files"]) != len({f["path"] for f in manifest["files"]}):
        raise ValueError("Duplicate manifest file descriptor")
    if any(not (name.startswith(("sources/", "schemas/", "knowledge/", "indexes/", "details/")) or name == "inputs-materials.zip")
           or Path(name).suffix.lower() not in {".json", ".md", ".xml", ".stl", ".csv", ".png", ".jpg", ".pdf", ".zip", ".txt", ".svg", ".webp", ".step", ".mp4", ".gz"}
           for name in actual_files):
        raise ValueError("Capability package contains an unsupported or executable artifact")
    if actual_files != {f["path"] for f in manifest["files"]}:
        raise ValueError("Package contains absent, unlisted or duplicate files")
    for record in manifest["files"]:
        path = p.local_path(root, record["path"])
        if path.stat().st_size != record["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Package artifact digest invalid: "+record["path"])
    for record in manifest["inputs"].values():
        if hashlib.sha256(p.local_path(root, record["path"]).read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Published input lock invalid")
    if manifest["ontology"]["version"] != p.ONTOLOGY or hashlib.sha256(p.local_path(root, manifest["ontology"]["path"]).read_bytes()).hexdigest() != manifest["ontology"]["sha256"]:
        raise ValueError("Ontology declaration differs from captured source")
    if manifest["adapter"] != {"id": "microduck-mjcf/1.0", "commit": p.COMMIT, "xml_sha256": p.XML_SHA256}:
        raise ValueError("Source adapter provenance differs from the pinned captured model")
    started = time.perf_counter()
    result = _validate_prepared(root)
    from .reference_alignment import INPUT_PATH
    if (root/INPUT_PATH).is_file() != ("reference_adjustments" in manifest["inputs"]):
        raise ValueError("Reference correction input must be explicitly locked in the manifest")
    scene = result["scene"]
    expected_counts = {**scene["meta"]["counts"], "features": len(result["catalog"]["features"]),
        "interfaces": len(result["catalog"]["interfaces"]), "resources": len(result["catalog"]["resources"]),
        "candidates": result["candidate_count"], "instance_pairs": result["pair_count"]}
    if manifest["counts"] != expected_counts:
        raise ValueError("Published counts differ from the complete witnessed records")
    for field, expected in (("packageId", manifest["package_id"]), ("packageVersion", manifest["package_version"]), ("profile", PROFILE)):
        if scene["meta"].get(field) != expected:
            raise ValueError("Scene package metadata differs from manifest")
    if _read(root/ENTRYPOINTS["sources"]) != {"schema": "psop.build.sources/2.0-draft.1", "items": scene["sources"]} or _read(root/ENTRYPOINTS["evidence"]) != {"schema": "psop.build.evidence/2.0-draft.1", "items": scene["evidence"]}:
        raise ValueError("Knowledge source or Evidence registry differs from the frozen scene")
    # Reconstruct only source identity/projection using pinned captured bytes;
    # geometry inference is checked above and never depends on world placement.
    with tempfile.TemporaryDirectory(prefix="psop-source-check-") as temp:
        expected = p.project(p.local_path(root, manifest["inputs"]["archive"]["path"]), Path(temp),
            p.local_path(root, manifest["ontology"]["path"]), xml_path=p.local_path(root, "sources/SRC-MD-MJCF.xml"),
            device_id=manifest["device"]["id"], title=manifest["device"]["name"])
        if scene["parts"] != expected["parts"]:
            raise ValueError("Source-instance identities or reference placements differ from captured model")
        _validate_source_registry(expected["sources"], scene["sources"])
    knowledge = _read(root/ENTRYPOINTS["knowledge"])
    if knowledge != _knowledge_projection(scene, manifest["device"]["id"]):
        raise ValueError("Knowledge identities, stock claims or reference configuration differ from the captured source")
    p.validate_shape(knowledge, _read(p.SKILL/"schemas/source-model-1.15.schema.json"))
    return {"ok": True, "valid": True, "schema": p.SCHEMA, "profile": PROFILE,
        "package_id": manifest["package_id"], "package_version": manifest["package_version"],
        "device": manifest["device"], "capabilities": manifest["capabilities"],
        "package_digest": manifest["package_digest"], "counts": manifest["counts"], "validation_seconds": time.perf_counter()-started,
        "scope": "Independent finite geometry requirements and complete pose-independent candidate template coverage; no solved assembly"}
