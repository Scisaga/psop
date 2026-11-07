#!/usr/bin/env python3
"""Bounded group queries and source geometry context; no assembly execution."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
BUILD_SCRIPTS = REPO / "skills/psop-build/scripts"
ASSEMBLY_PACKAGE = REPO / "packages/assembly"
SOURCE_PROFILE = "psop.hardware.source-model/1.3"
MOUNTING_PROFILE = "psop.hardware.source-model/1.4"
MOUNTING_PATTERNS_PROFILE = "psop.hardware.source-model/1.5"
CONNECTION_REVIEW_PROFILE = "psop.hardware.source-model/1.6"
PIN_HOLE_FIT_PROFILE = "psop.hardware.source-model/1.7"
CONNECTOR_DIRECTION_PROFILE = "psop.hardware.source-model/1.8"
INVESTIGATION_PROFILE = "psop.hardware.source-model/1.9"
RELATIONSHIP_PROFILE = "psop.hardware.source-model/1.10"
MOUNTING_PROFILES = {MOUNTING_PROFILE, MOUNTING_PATTERNS_PROFILE, CONNECTION_REVIEW_PROFILE, PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, RELATIONSHIP_PROFILE}


def _status():
    return {"schema": "psop.simulate.status/2.0-draft.2", "stage": "simulate", "status": "partial", "available": True,
            "reason": "bounded_group_query_only", "capabilities": {
                "assembly": {"status": "unavailable"}, "rendering": {"status": "unavailable"}, "model_testing": {"status": "unavailable"},
                "group_query": {"status": "partial", "scope": "Read validated Build installation knowledge and reference mappings, inspect historical 1.3 geometry, or evaluate explicit bounded rigid group definitions."}},
            "workbench": "apps/workbench", "execution_performed": False,
            "message": "提供有界孔组查询；物理装配、路径、弹性、渲染及模型测试执行器尚未实现。"}


def _write_result(result, output=None):
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if output:
        destination = Path(output).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
    print(text, end="")


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


def _dkp_query(path, part_a, part_b):
    if not part_a or not part_b or part_a == part_b:
        raise ValueError("DKP query requires two distinct --part-a and --part-b identifiers")
    sys.path.insert(0, str(BUILD_SCRIPTS))
    from psop_build_v2.package import validate, read_json, local_path
    root = Path(path).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("--dkp must be a published data-only DKP directory")
    manifest = read_json(root / "manifest.json")
    if manifest.get("profile") not in {SOURCE_PROFILE, *MOUNTING_PROFILES}:
        raise ValueError("DKP query requires an explicitly supported source-model/1.3 through 1.10 contract")
    validation = validate(root)
    if not validation.get("valid"):
        raise ValueError("DKP validation did not succeed")
    knowledge = read_json(local_path(root, manifest["entrypoints"]["knowledge"]))
    scene = read_json(local_path(root, manifest["entrypoints"]["scene"]))
    requested = {part_a, part_b}
    part_map = {part["id"]: part for part in knowledge["parts"]}
    if not requested <= part_map.keys():
        raise ValueError("A requested part is not present in this package")
    observations = [observation for observation in knowledge["reference_observations"]
                    if requested <= {participant["part_ref"] for participant in observation["participants"]}]
    holes = [hole for hole in knowledge["logical_holes"] if hole["owner_ref"] in requested]
    patterns = [pattern for pattern in knowledge["feature_patterns"] if pattern["owner_ref"] in requested]
    feature_refs = {ref for hole in holes for ref in hole["wall_feature_refs"]}
    feature_refs.update(ref for site in knowledge.get("mounting_sites", []) if site["owner_ref"] in requested for ref in site["feature_refs"])
    feature_refs.update(ref for observation in observations for participant in observation["participants"] for ref in participant["feature_refs"])
    features = [feature for feature in knowledge["features"] if feature["id"] in feature_refs]
    selected_entities = holes + patterns + features + observations
    modern = validation["profile"] in MOUNTING_PROFILES
    sites = [site for site in knowledge.get("mounting_sites", []) if site["owner_ref"] in requested]
    interfaces = [interface for interface in knowledge.get("mounting_interfaces", []) if interface["owner_ref"] in requested]
    mounts = [mount for mount in knowledge.get("reference_mounts", []) if requested == {p["part_ref"] for p in mount["participants"]}]
    slots = [slot for slot in knowledge.get("slot_features", []) if slot["owner_ref"] in requested]
    selected_entities += sites + interfaces + mounts + slots
    openings = [item for item in knowledge.get("circular_openings", []) if item["owner_ref"] in requested]
    passages = [item for item in knowledge.get("passage_hypotheses", []) if item["owner_ref"] in requested]
    screenings = [item for item in knowledge.get("pair_screenings", []) if set(item["part_refs"]) == requested]
    reviews = [item for item in knowledge.get("connection_reviews", []) if {p["part_ref"] for p in item["participants"]} == requested]
    review_refs = {item["id"] for item in reviews}
    components = [item for item in knowledge.get("supplemental_components", []) if item["review_ref"] in review_refs]
    pin_fits = [item for item in knowledge.get("pin_hole_fits", []) if {participant["part_ref"] for participant in item["participants"]} == requested]
    selected_entities += openings + passages + reviews + components + pin_fits
    structures = [item for item in knowledge.get("structure_candidates", []) if item["owner_ref"] in requested]
    regions = [item for item in knowledge.get("review_regions", []) if item["owner_ref"] in requested]
    hypotheses = [item for item in knowledge.get("installation_hypotheses", []) if {p["part_ref"] for p in item["participants"]} == requested]
    investigations = [item for item in knowledge.get("investigation_records", []) if item["part_ref"] in requested]
    selected_entities += structures + regions + hypotheses + investigations
    source_refs = {ref for entity in selected_entities for ref in entity.get("source_refs", [])}
    evidence_refs = {ref for entity in selected_entities for ref in entity.get("evidence_refs", [])}
    evidence = read_json(local_path(root, manifest["entrypoints"]["evidence"]))["items"]
    source_refs.update(item["sourceId"] for item in evidence if item["id"] in evidence_refs)
    result = {"schema": "psop.simulate.query/1.0", "ok": True, "status": "unknown", "basis": "validated_source_geometry",
            "execution_performed": False, "reason": "functional_interface_modes_not_qualified",
            "query": {"part_a": part_a, "part_b": part_b},
            "package": {"path": str(root), "profile": validation["profile"], "package_id": validation["package_id"],
                        "package_version": validation["package_version"], "package_digest": validation["package_digest"]},
            "functional_interfaces": [], "modes": [],
            "assessment": {"mechanical": "unknown", "engineering": "unknown", "task": "unknown", "completion": "unknown"},
            "geometry_context": {"parts": [part_map[identifier] for identifier in (part_a, part_b)],
                                 "measurement_frames": [frame for frame in knowledge["frames"] if frame["owner_ref"] in requested],
                                 "logical_holes": holes, "feature_patterns": patterns, "features": features,
                                 "reference_observations": observations, "sources": [source for source in scene["sources"] if source["id"] in source_refs],
                                 "evidence": [item for item in evidence if item["id"] in evidence_refs]},
            "unresolved_requirements": ["No functional Interface/mode warrant or active frame ownership is qualified in this source profile.",
                                        "Geometric patterns and reference observations do not define allowed subset S, actual used holes, bound fasteners or completed engagement.",
                                        "Engineering, task acceptance, assembly paths and elastic retention remain unknown."],
            "limitations": ["Unknown does not mean there is no possible assembly; it means the functional definition required to enumerate assemblies is absent.",
                            "This command performs a query only and executes no installation, simulation step or modification to the package."]}
    if modern:
        result.update({"basis": "published_mounting_knowledge",
            "status": "reference_matches" if mounts else "mounting_knowledge" if interfaces else "unknown",
            "reason": "build_reference_assemblies_available" if mounts else "build_mounting_knowledge_available" if interfaces else "functional_mounting_knowledge_not_supplied",
            "functional_interfaces": interfaces,
            "modes": [{"interface_ref": interface["id"], "selection_rule": interface["selection_rule"]} for interface in interfaces],
            "mounting_sites": sites, "reference_mounts": mounts, "slot_features": slots,
            "scope": {"kind": "published_static_mounting_knowledge", "enumeration_performed": False,
                      "reference_configuration": knowledge["configurations"][0]["id"]},
            "unresolved_requirements": ["Supplied installation rules and source-reference mappings are static Build knowledge, not an executed installation.",
                "Connector entities, actual engagement, retaining contact, engineering acceptance, paths and elasticity are not established by this read query."],
            "limitations": ["Reference matches retain the supplied assertion provenance and frozen source Configuration; they do not enumerate all other possible installations.",
                "User-asserted mounting sites retain their shared underlying holes; two entry sites do not create two independent physical resources.",
                "This command executes no installation, simulation step or modification to the package."]})
    if validation["profile"] in {CONNECTION_REVIEW_PROFILE, PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, RELATIONSHIP_PROFILE}:
        result.update({"basis": "published_connection_reviews", "status": "reference_matches" if mounts else "connection_review" if reviews else "unknown",
            "reason": "source_pair_connection_review_available" if reviews else "pair_outside_bounded_review_scope",
            "functional_interfaces": [], "installation_definitions": interfaces,
            "modes": [{"interface_ref": interface["id"], "selection_rule": interface["selection_rule"],
                       "assertion_status": interface["status"], "mechanism": interface["mechanism"]} for interface in interfaces],
            "circular_openings": openings, "passage_hypotheses": passages, "pair_screenings": screenings,
            "connection_reviews": reviews, "supplemental_components": components,
            "scope": {"kind": "published_static_connection_review", "enumeration_performed": False,
                      "reference_configuration": knowledge["configurations"][0]["id"],
                      "source_pair_screenings": len(knowledge["pair_screenings"]), "requested_pair_screenings": len(screenings)},
            "unresolved_requirements": ["A source opening, axis alignment or finite face projection alone does not establish its retaining mechanism.",
                "Project-inferred roles and manufacturer-general examples are distinct from user-confirmed device assembly facts.",
                "Supplemental components are explicitly unconfirmed synthetic schematics, not actual participants or confirmed BOM items.",
                "Motion ownership, actual connection, retaining, engineering, paths and completion remain unresolved as recorded."],
            "limitations": ["All-pair bounded screening records its scope; a separated bound is not proof that no indirect or alternative connection exists.",
                "Connection reviews and illustrative connector models are read-only Build knowledge, not a simulated assembly or a qualified complete interface.",
                "This command executes no installation, simulation step or modification to the package."]})
    if validation["profile"] in {PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, RELATIONSHIP_PROFILE}:
        result.update({"pin_hole_fits": pin_fits,
            "reference_connector_schematics": [item for item in components if item["usage"] == "reference_connector"],
            "unverified_alternative_schematics": [item for item in components if item["usage"] == "unverified_alternative"]})
    if validation["profile"] in {INVESTIGATION_PROFILE, RELATIONSHIP_PROFILE}:
        result.update(structure_candidates=structures, review_regions=regions,
            part_investigations=[item for item in knowledge["part_investigations"] if item["part_ref"] in requested],
            review_coverage=knowledge["review_coverage"])
    if validation["profile"] == RELATIONSHIP_PROFILE:
        result.update(installation_hypotheses=hypotheses, investigation_records=investigations,
            relationship_coverage=knowledge["relationship_coverage"])
        if hypotheses:
            result.update(status="installation_hypotheses", basis="published_completed_relationship_research",
                reason="bounded_counterpart_mechanism_and_evidence_available")
    return result


def _definition_query(path):
    definition_path = Path(path).resolve(strict=True)
    if not definition_path.is_file() or definition_path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Definition must be a bounded JSON file")
    raw = definition_path.read_bytes()
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate definition JSON key: " + key)
            result[key] = value
        return result
    def constant(value):
        raise ValueError("Non-finite definition JSON number: " + value)
    definition = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant)
    sys.path.insert(0, str(ASSEMBLY_PACKAGE))
    from psop_assembly import query_definition
    result = query_definition(definition)
    return {"schema": "psop.simulate.query/1.0", "ok": True, "status": result.get("status", "unknown"),
            "basis": result.get("basis", "explicit_definition"), "execution_performed": False,
            "definition": {"path": str(definition_path), "sha256": hashlib.sha256(raw).hexdigest()},
            "result": result,
            "limitations": ["Bounded rigid group reasoning is not a physics, insertion-path, elasticity or load validation engine.",
                            "A selected subset S is a proposed selection, not the set of already engaged holes."]}


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = list(sys.argv[1:] if argv is None else argv)
    if args in (["doctor"], ["doctor", "--json"]):
        _write_result({"ok": True, "command": "doctor", **_status()})
        return 0
    if not args or args[0] != "query":
        _write_result({"ok": False, "command": args[0] if args else None, **_status(),
                       "error": {"code": "V2_EXECUTOR_UNAVAILABLE", "supported_commands": ["doctor", "query"],
                                 "message": "旧 core、独立 App 与装配执行入口已退役；当前仅支持 doctor 和有界 query。"}})
        return 2
    parser = _Parser(prog="psop_simulate.py query", description="Read validated Build mounting knowledge or historical source geometry, or query explicit bounded rigid definitions; no assembly execution.")
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--dkp")
    inputs.add_argument("--definition")
    parser.add_argument("--part-a")
    parser.add_argument("--part-b")
    parser.add_argument("--output")
    try:
        options = parser.parse_args(args[1:])
        if options.definition and (options.part_a or options.part_b):
            raise ValueError("--part-a/--part-b apply to --dkp; definition queries use their explicit interface definitions")
        if options.output:
            destination = Path(options.output).resolve()
            if options.dkp and destination.is_relative_to(Path(options.dkp).resolve()):
                raise ValueError("--output cannot add to or modify any path inside the immutable input DKP")
            if options.definition and destination == Path(options.definition).resolve():
                raise ValueError("--output cannot overwrite its definition input")
            if destination.exists():
                raise ValueError("--output requires a new artifact path; existing files are never overwritten")
        result = _dkp_query(options.dkp, options.part_a, options.part_b) if options.dkp else _definition_query(options.definition)
        _write_result(result, options.output)
        return 0
    except (ValueError, OSError, KeyError, TypeError, IndexError, StopIteration, ImportError) as error:
        _write_result({"schema": "psop.simulate.query/1.0", "ok": False, "status": "unknown", "execution_performed": False,
                       "error": {"code": "QUERY_REJECTED", "message": str(error) or "Definition does not match the supported query contract"}})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
