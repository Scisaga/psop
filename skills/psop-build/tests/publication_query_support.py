"""Read-only projection of frozen Build publications for regression tests.

This preserves the historical data checks after the Simulate CLI was removed.
It performs no assembly search or execution and is not a public CLI/API.
"""
from pathlib import Path

from psop_build_v2.package import validate, read_json, local_path

SOURCE_PROFILE = "psop.hardware.source-model/1.3"
MOUNTING_PROFILE = "psop.hardware.source-model/1.4"
MOUNTING_PATTERNS_PROFILE = "psop.hardware.source-model/1.5"
CONNECTION_REVIEW_PROFILE = "psop.hardware.source-model/1.6"
PIN_HOLE_FIT_PROFILE = "psop.hardware.source-model/1.7"
CONNECTOR_DIRECTION_PROFILE = "psop.hardware.source-model/1.8"
INVESTIGATION_PROFILE = "psop.hardware.source-model/1.9"
RELATIONSHIP_PROFILE = "psop.hardware.source-model/1.10"
CONNECTION_ANALYSIS_PROFILE = "psop.hardware.source-model/1.11"
LOCAL_ENDPOINT_PROFILE = "psop.hardware.source-model/1.12"
RELATIONSHIP_PROFILES = {RELATIONSHIP_PROFILE, CONNECTION_ANALYSIS_PROFILE, LOCAL_ENDPOINT_PROFILE}
MOUNTING_PROFILES = {MOUNTING_PROFILE, MOUNTING_PATTERNS_PROFILE, CONNECTION_REVIEW_PROFILE, PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, *RELATIONSHIP_PROFILES}


def query_part_pair(path, part_a, part_b):
    if not part_a or not part_b or part_a == part_b:
        raise ValueError("DKP query requires two distinct --part-a and --part-b identifiers")
    root = Path(path).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("--dkp must be a published data-only DKP directory")
    manifest = read_json(root / "manifest.json")
    if manifest.get("profile") not in {SOURCE_PROFILE, *MOUNTING_PROFILES}:
        raise ValueError("DKP query requires an explicitly supported source-model/1.3 through 1.12 contract")
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
    findings = [item for item in knowledge.get("connection_review_findings", []) if item["review_ref"] in review_refs]
    finding_studies = {"investigation:" + item["study_ref"] for item in findings if item.get("study_ref")}
    investigations = [item for item in knowledge.get("investigation_records", []) if item["part_ref"] in requested or item["id"] in finding_studies]
    selected_entities += structures + regions + hypotheses + investigations + findings
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
    if validation["profile"] in {CONNECTION_REVIEW_PROFILE, PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, *RELATIONSHIP_PROFILES}:
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
    if validation["profile"] in {PIN_HOLE_FIT_PROFILE, CONNECTOR_DIRECTION_PROFILE, INVESTIGATION_PROFILE, *RELATIONSHIP_PROFILES}:
        result.update({"pin_hole_fits": pin_fits,
            "reference_connector_schematics": [item for item in components if item["usage"] == "reference_connector"],
            "unverified_alternative_schematics": [item for item in components if item["usage"] == "unverified_alternative"]})
    if validation["profile"] in {INVESTIGATION_PROFILE, *RELATIONSHIP_PROFILES}:
        result.update(structure_candidates=structures, review_regions=regions,
            part_investigations=[item for item in knowledge["part_investigations"] if item["part_ref"] in requested],
            review_coverage=knowledge["review_coverage"])
    if validation["profile"] in RELATIONSHIP_PROFILES:
        result.update(installation_hypotheses=hypotheses, investigation_records=investigations,
            relationship_coverage=knowledge["relationship_coverage"])
        if hypotheses:
            result.update(status="installation_hypotheses", basis="published_completed_relationship_research",
                reason="bounded_counterpart_mechanism_and_evidence_available")
    if validation["profile"] == CONNECTION_ANALYSIS_PROFILE:
        result.update(connection_review_findings=findings,
            connection_relation_contexts=[c for c in knowledge["connection_relation_contexts"] if requested <= set(c["part_refs"])],
            connection_analysis_coverage=knowledge["connection_analysis_coverage"])
    return result
