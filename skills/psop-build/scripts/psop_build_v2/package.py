"""Versioned data-only DKP publication and verification for the source-model profile.

This profile verifies provenance and source-reference projection. It does not
verify mechanical feasibility, physical identity, engineering or task success.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import tempfile
from datetime import datetime, timezone

from .microduck import project, rotate, XML_SHA256, XML_URL, COMMIT

SCHEMA = "psop.dkp/2.0-draft.1"
ONTOLOGY = "psop.hardware/2.0-draft.4"
LEGACY_PROFILE = "psop.hardware.source-model/1.0"
CYLINDER_PROFILE = "psop.hardware.source-model/1.1"
SURFACE_PROFILE = "psop.hardware.source-model/1.2"
SEMANTIC_PROFILE = "psop.hardware.source-model/1.3"
FROZEN_MOUNTING_PROFILE = "psop.hardware.source-model/1.4"
FROZEN_PATTERNS_PROFILE = "psop.hardware.source-model/1.5"
FROZEN_CONNECTION_PROFILE = "psop.hardware.source-model/1.6"
FROZEN_PIN_FIT_PROFILE = "psop.hardware.source-model/1.7"
PROFILE = "psop.hardware.source-model/1.8"
VERSION = "3.0.0-draft.9"
PIN_FIT_PROFILES = {FROZEN_PIN_FIT_PROFILE, PROFILE}
REVIEW_PROFILES = {FROZEN_CONNECTION_PROFILE, *PIN_FIT_PROFILES}
PATTERNS_PROFILES = {FROZEN_PATTERNS_PROFILE, *REVIEW_PROFILES}
MOUNTING_PROFILES = {FROZEN_MOUNTING_PROFILE, *PATTERNS_PROFILES}
SEMANTIC_PROFILES = {SEMANTIC_PROFILE, *MOUNTING_PROFILES}
SKILL = Path(__file__).resolve().parents[2]
REPO = SKILL.parents[1]
ENTRYPOINTS = {
    "knowledge": "knowledge/entities.json", "sources": "knowledge/sources.json",
    "evidence": "knowledge/evidence.json", "gaps": "knowledge/gaps.json",
    "scene": "indexes/scene.json",
}
LEGACY_CAPABILITIES = {
    "source_registry": {"status": "complete", "scope": "captured source bytes, paths and digests"},
    "source_model_projection": {"status": "complete", "scope": "frozen Microduck MJCF visual model at qpos0"},
    "hardware_knowledge": {"status": "partial", "scope": "model-domain Part identities and source-reference Configuration only"},
    "mechanical_validation": {"status": "unavailable", "scope": "interfaces, connection mechanisms, contact and motion constraints not extracted"},
    "engineering_validation": {"status": "unavailable", "scope": "materials, tolerances, manufacturing and load acceptance not established"},
    "path_validation": {"status": "unavailable", "scope": "presentation explosion is not a disassembly or motion proof"},
    "training_data": {"status": "unavailable", "scope": "no training dataset, canonical multiview render or use authorization is published"},
}
CYLINDER_CAPABILITIES = {
    **LEGACY_CAPABILITIES,
    "hardware_knowledge": {"status": "partial", "scope": "model-domain Parts, measured mesh features, interface candidates and source-reference relationships"},
    "interface_analysis": {"status": "partial", "scope": "source-axis cylindrical mesh features and grouped interface candidates; unsupported features remain unresolved"},
    "connection_candidates": {"status": "partial", "scope": "reference-configuration geometric alignment and finite axial compatibility; no engagement or retaining claim"},
    "mechanical_validation": {"status": "unavailable", "scope": "geometric compatibility candidates do not establish engagement, retaining, contact, motion or engineering acceptance"},
}
SURFACE_CAPABILITIES = {
    **CYLINDER_CAPABILITIES,
    "interface_analysis": {"status": "partial", "scope": "source-axis cylindrical and finite planar mesh features; surface seating and enclosure candidates without latch, elasticity or retaining confirmation"},
    "connection_candidates": {"status": "partial", "scope": "reference-configuration finite cylindrical compatibility and opposed finite surface overlap; no engagement, locking, retaining or path claim"},
}
SEMANTIC_CAPABILITIES = {
    **LEGACY_CAPABILITIES,
    "hardware_knowledge": {"status": "partial", "scope": "model-domain Parts, measured geometry, logical-hole hypotheses, feature patterns and source-reference observations"},
    "geometric_analysis": {"status": "partial", "scope": "finite cylindrical and planar source regions and qpos0 proximity/alignment observations; no contact or assembly state confirmation"},
    "interface_analysis": {"status": "unavailable", "scope": "mechanism, complementary functional roles and applicability warrants are not established for the captured Microduck Parts"},
    "connection_candidates": {"status": "unavailable", "scope": "raw geometry observations are not qualified interfaces or mechanism-level connection candidates"},
    "mechanical_validation": {"status": "unavailable", "scope": "no confirmed interface connection, retaining, motion constraint, assembly path or mechanical success is published"},
}
FROZEN_MOUNTING_CAPABILITIES = {
    **SEMANTIC_CAPABILITIES,
    "hardware_knowledge": {"status": "partial", "scope": "measured geometry, addressable mounting sites, supplied user-asserted mounting rules and source-reference site mappings"},
    "geometric_analysis": {"status": "partial", "scope": "finite cylinders, planar regions, logical holes and measured capsule openings; unsupported shapes remain explicit"},
    "interface_analysis": {"status": "partial", "scope": "supplied mounting assertions bind finite sites, entry sides and adjacency rules; physical mechanism validation remains unavailable"},
    "reference_mounting": {"status": "partial", "scope": "supplied standard-assembly assertions checked against the frozen source placements and mapped site axes; no executed engagement is published"},
}
FROZEN_PATTERNS_CAPABILITIES = {
    **FROZEN_MOUNTING_CAPABILITIES,
    "geometric_analysis": {"status": "partial", "scope": "finite cylinders, planar regions, logical holes, rounded openings and measured integral tapered pins; unsupported shapes remain explicit"},
    "interface_analysis": {"status": "partial", "scope": "supplied assertions identify mounting sites and distinguish known selection rules from unknown mechanism and subset constraints"},
}
FROZEN_CONNECTION_CAPABILITIES = {
    **FROZEN_PATTERNS_CAPABILITIES,
    "hardware_knowledge": {"status": "partial", "scope": "source geometry, attributed installation knowledge, all-pair bounded screening and complete-connection review records; unresolved retention remains explicit"},
    "geometric_analysis": {"status": "partial", "scope": "finite source geometry including circular inner openings and witnessed variable-radius cavity patches; bounds and projection are geometry evidence only"},
    "interface_analysis": {"status": "partial", "scope": "connection reviews separate declared knowledge from project-inferred roles and manufacturer-general examples; no complete physical interface qualification"},
    "connection_review": {"status": "partial", "scope": "all source Part pairs are screened in the frozen source pose; reviews retain location, retention, motion ownership, third-piece alternatives and missing evidence"},
    "supplemental_components": {"status": "partial", "scope": "explicitly illustrative unconfirmed connector schematics, separately identified from source Parts and confirmed BOM items"},
}
FROZEN_PIN_FIT_CAPABILITIES = {
    **FROZEN_CONNECTION_CAPABILITIES,
    "hardware_knowledge": {"status": "partial", "scope": "source geometry, finite pin/housing reference-pair location evidence and separately identified unverified connector alternatives; retention remains unknown"},
    "connection_review": {"status": "partial", "scope": "source-pose pin/housing fits support installation-location inference only; outer circular openings and manufacturer-general illustrations do not establish retaining roles"},
    "supplemental_components": {"status": "partial", "scope": "illustrative reference connectors and unverified alternatives have explicit distinct usage; alternative geometry is not bound to connection roles"},
}
CAPABILITIES = {
    **FROZEN_PIN_FIT_CAPABILITIES,
    "supplemental_components": {"status": "partial", "scope": "reference connector schematics use explicit through-bracket hypotheses with independently checked finite entrance, head seat, shaft direction and target coverage; actual installation side, thread, continuous path and retention remain unverified"},
}
PROFILE_SCHEMAS = {
    LEGACY_PROFILE: ("manifest.schema.json", "source-model.schema.json"),
    CYLINDER_PROFILE: ("manifest-source-model-1.1.schema.json", "source-model-1.1.schema.json"),
    SURFACE_PROFILE: ("manifest-source-model-1.2.schema.json", "source-model-1.2.schema.json"),
    SEMANTIC_PROFILE: ("manifest-source-model-1.3.schema.json", "source-model-1.3.schema.json"),
    FROZEN_MOUNTING_PROFILE: ("manifest-source-model-1.4.schema.json", "source-model-1.4.schema.json"),
    FROZEN_PATTERNS_PROFILE: ("manifest-source-model-1.5.schema.json", "source-model-1.5.schema.json"),
    FROZEN_CONNECTION_PROFILE: ("manifest-source-model-1.6.schema.json", "source-model-1.6.schema.json"),
    FROZEN_PIN_FIT_PROFILE: ("manifest-source-model-1.7.schema.json", "source-model-1.7.schema.json"),
    PROFILE: ("manifest-source-model-1.8.schema.json", "source-model-1.8.schema.json"),
}


def profile_contract(profile: str) -> tuple[tuple[str, str], dict]:
    if profile not in PROFILE_SCHEMAS:
        raise ValueError(f"Unsupported source-model profile: {profile}")
    capabilities = {LEGACY_PROFILE: LEGACY_CAPABILITIES, CYLINDER_PROFILE: CYLINDER_CAPABILITIES,
                    SURFACE_PROFILE: SURFACE_CAPABILITIES, SEMANTIC_PROFILE: SEMANTIC_CAPABILITIES,
                    FROZEN_MOUNTING_PROFILE: FROZEN_MOUNTING_CAPABILITIES,
                    FROZEN_PATTERNS_PROFILE: FROZEN_PATTERNS_CAPABILITIES,
                    FROZEN_CONNECTION_PROFILE: FROZEN_CONNECTION_CAPABILITIES, FROZEN_PIN_FIT_PROFILE: FROZEN_PIN_FIT_CAPABILITIES, PROFILE: CAPABILITIES}
    return PROFILE_SCHEMAS[profile], capabilities[profile]


def capture_assembly_knowledge(scene: dict, root: Path, path: Path | None, profile: str = PROFILE,
                               supporting_paths: dict[str, Path] | None = None) -> dict | None:
    """Register an explicitly supplied assertion file as frozen source bytes."""
    if path is None:
        return None
    raw = path.read_bytes()
    if not raw or len(raw) > 4 * 1024 * 1024:
        raise ValueError("Assembly knowledge must be a bounded nonempty JSON source")
    declaration = read_json(path)
    if not isinstance(declaration, dict):
        raise ValueError("Assembly knowledge must be a JSON object")
    if profile == FROZEN_MOUNTING_PROFILE:
        from .mounting import validate_knowledge
    elif profile == FROZEN_PATTERNS_PROFILE:
        from .mounting_patterns import validate_knowledge
    elif profile in REVIEW_PROFILES:
        from .connection_review import validate_knowledge
    else:
        raise ValueError("This source profile cannot consume assembly knowledge")
    validate_knowledge(declaration)
    relative = "sources/SRC-MD-ASSEMBLY-KNOWLEDGE.json"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    text = raw.decode("utf-8")
    scene["sources"].append({"id": "SRC-MD-ASSEMBLY-KNOWLEDGE", "title": "安装声明与连接审查依据" if profile in REVIEW_PROFILES else "用户确认的安装知识", "path": "supplemental/microduck-assembly-knowledge.json",
        "format": "JSON", "bytes": len(raw), "digest": digest(raw), "scope": "package", "url": relative, "text": text,
        "supplemented": True})
    provenance = declaration.get("provenance", {})
    statement = provenance.get("statement", "") if isinstance(provenance, dict) else ""
    assertion_evidence = {"id": "evidence:microduck:assembly-knowledge", "sourceId": "SRC-MD-ASSEMBLY-KNOWLEDGE",
        "title": "安装规则与标准装配的用户声明", "kind": "source-file",
        "excerpt": "用户声明：" + str(statement) + "\n声明文件的规则身份与原文保留；这不是厂家工程验收、已执行装配或实时接合状态。"}
    if statement:
        token = json.dumps(statement, ensure_ascii=False)
        line = next((index for index, value in enumerate(text.splitlines(), 1) if token in value), None)
        if line is not None:
            assertion_evidence.update({"lineStart": line, "lineEnd": line})
    scene["evidence"].append(assertion_evidence)
    if profile in PATTERNS_PROFILES:
        for assertion in declaration["mounting_assertions"]:
            statement = assertion["provenance"]["statement"]
            token = json.dumps(statement, ensure_ascii=False)
            line = next((index for index, value in enumerate(text.splitlines(), 1) if token in value), None)
            item = {"id": "evidence:microduck:mounting-assertion:" + assertion["id"],
                    "sourceId": "SRC-MD-ASSEMBLY-KNOWLEDGE", "title": assertion["label"],
                    "kind": "source-file", "excerpt": statement}
            if profile in REVIEW_PROFILES and assertion["assertion_basis"] == "project_inference":
                item["title"] = "Project inference cites this request; the user did not confirm the inferred functional role"
            if line is not None:
                item.update(lineStart=line, lineEnd=line)
            scene["evidence"].append(item)
    if profile in REVIEW_PROFILES:
        request = declaration["connection_review"]["statement"]
        token = json.dumps(request, ensure_ascii=False)
        line = next((index for index, value in enumerate(text.splitlines(), 1) if token in value), None)
        item = {"id": "evidence:microduck:connection-review-request", "sourceId": "SRC-MD-ASSEMBLY-KNOWLEDGE",
                "title": "Complete-connection review request", "kind": "source-file", "excerpt": request}
        if line is not None:
            item.update(lineStart=line, lineEnd=line)
        scene["evidence"].append(item)
        capture_supporting_documents(scene, root, declaration, supporting_paths or {})
    scene["meta"]["counts"].update({"sources": len(scene["sources"]), "evidence": len(scene["evidence"])})
    return declaration


def enrich_scene(scene: dict, root: Path, profile: str, assembly_knowledge: dict | None = None) -> None:
    if profile != LEGACY_PROFILE:
        if profile == CYLINDER_PROFILE:
            from .mechanics import analysis_for
        elif profile == SURFACE_PROFILE:
            from .surfaces import analysis_for
        elif profile == SEMANTIC_PROFILE:
            from .semantics import analysis_for
        elif profile == FROZEN_MOUNTING_PROFILE:
            from .mounting import analysis_for
        elif profile == FROZEN_PATTERNS_PROFILE:
            from .mounting_patterns import analysis_for
        elif profile == FROZEN_CONNECTION_PROFILE:
            from .connection_review import analysis_for
        elif profile == FROZEN_PIN_FIT_PROFILE:
            from .connection_review import analysis_for_v17 as analysis_for
        else:
            from .connection_review import analysis_for_v18 as analysis_for
        analysis = analysis_for(scene, root, assembly_knowledge) if profile in MOUNTING_PROFILES else analysis_for(scene, root)
        scene["evidence"].extend(analysis.pop("evidence", []))
        scene["meta"]["counts"]["evidence"] = len(scene["evidence"])
        scene["analysis"] = analysis


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))


def read_json(path: Path):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key in {path}: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Non-finite JSON: {value}")))


def local_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative or ":" in relative:
        raise ValueError(f"Not a portable package path: {relative!r}")
    item = PurePosixPath(relative)
    if item.is_absolute() or any(part in {"..", "."} for part in item.parts) or str(item) != relative:
        raise ValueError(f"Unsafe package path: {relative!r}")
    current = root
    for part in item.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Symlink is not a package asset: {relative}")
    resolved = current.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError(f"Package path escapes root: {relative}")
    return resolved


def supporting_source_path(document: dict) -> str:
    identifier = document.get("id")
    if not isinstance(identifier, str) or not re.fullmatch(r"SRC-[A-Z0-9-]{3,100}", identifier):
        raise ValueError("Supporting source requires a portable explicit source ID")
    relative = document.get("path")
    # local_path is also used when consuming this path, before any copy/read.
    if not isinstance(relative, str):
        raise ValueError("Supporting document path must be a string")
    suffix = PurePosixPath(relative).suffix.lower()
    if suffix not in {".md", ".png"}:
        raise ValueError("Supporting manufacturer inputs currently accept bounded MD or PNG originals")
    return "sources/" + identifier + suffix


def freeze_supporting_inputs(declaration: dict, original_root: Path, work: Path) -> list[dict]:
    """Copy explicit local originals once; subsequent phases use only locked bytes."""
    if len(declaration["supporting_documents"]) > 16:
        raise ValueError("Supporting document scope exceeds the bounded source budget")
    records = []
    for document in declaration["supporting_documents"]:
        supporting_source_path(document)
        original = local_path(original_root, document["path"])
        if not original.is_file() or original.stat().st_size > 8 * 1024 * 1024:
            raise ValueError("Supporting input must be a bounded ordinary file")
        raw = original.read_bytes()
        if not raw or digest(raw) != document["sha256"]:
            raise ValueError("Supporting input does not match its declared digest")
        relative = "inputs/supporting/" + document["path"]
        target = local_path(work, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        records.append({"id": document["id"], "path": relative, "sha256": document["sha256"]})
    return records


def supporting_input_paths(records: list[dict], declaration: dict, root: Path, *, published: bool) -> dict[str, Path]:
    if not isinstance(records, list) or len(records) != len(declaration["supporting_documents"]):
        raise ValueError("Supporting input locks differ from the declaration")
    indexed = {record.get("id"): record for record in records if isinstance(record, dict)}
    if len(indexed) != len(records):
        raise ValueError("Duplicate supporting input lock")
    output = {}
    for document in declaration["supporting_documents"]:
        record = indexed.get(document["id"])
        expected_path = supporting_source_path(document) if published else "inputs/supporting/" + document["path"]
        if (not record or set(record) != {"id", "path", "sha256"} or record["path"] != expected_path
                or record["sha256"] != document["sha256"]):
            raise ValueError("Supporting input lock does not bind its declared source")
        target = local_path(root, record["path"])
        if not target.is_file() or target.stat().st_size > 8 * 1024 * 1024 or digest(target.read_bytes()) != record["sha256"]:
            raise ValueError("Supporting input byte identity mismatch")
        output[document["id"]] = target
    return output


def capture_supporting_documents(scene: dict, root: Path, declaration: dict, paths: dict[str, Path]) -> None:
    documents = declaration["supporting_documents"]
    if len(documents) > 16:
        raise ValueError("Supporting document scope exceeds the bounded source budget")
    if set(paths) != {document["id"] for document in documents}:
        raise ValueError("Explicit supporting input files are required for all declared documents")
    existing_sources = {source["id"] for source in scene["sources"]}
    for document in documents:
        if (not re.match(r"^https://[^/\s]+/", document["url"]) or not document["claims"]
                or len(document["claims"]) > 20 or any(len(claim) > 4000 for claim in document["claims"])):
            raise ValueError("Supporting document requires bounded claims and an explicit HTTPS origin")
        if document["id"] in existing_sources:
            raise ValueError("Supporting document source identity collides with another input")
        raw = paths[document["id"]].read_bytes()
        if not raw or len(raw) > 8 * 1024 * 1024 or digest(raw) != document["sha256"]:
            raise ValueError("Captured supporting input differs from its declared byte identity")
        relative = supporting_source_path(document)
        suffix = PurePosixPath(relative).suffix
        if suffix == ".png" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Supporting PNG must be an actual PNG source")
        content = raw.decode("utf-8") if suffix == ".md" else None
        target = local_path(root, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        source = {"id": document["id"], "title": document["title"], "path": "manufacturer/" + document["path"],
                  "format": "MD" if suffix == ".md" else "PNG", "bytes": len(raw), "digest": digest(raw),
                  "scope": "package", "url": relative, "supplemented": True,
                  "externalUrl": document["url"], "knowledgeScope": "manufacturer_general"}
        if content is not None:
            source["text"] = content
        scene["sources"].append(source)
        existing_sources.add(document["id"])
        scene["evidence"].append({"id": "evidence:microduck:supporting-document:" + document["id"],
            "sourceId": document["id"], "title": document["title"], "kind": "source-file",
            "excerpt": "\n".join(document["claims"]) + "\nManufacturer-general reference; Microduck usage, dimensions and assembly are not confirmed by this example."})


def locked_input_records(inputs: dict):
    for key, value in inputs.items():
        if key == "supporting_documents":
            if not isinstance(value, list):
                raise ValueError("Supporting input locks must be a list")
            yield from value
        else:
            yield value


def tool_digest() -> str:
    files = sorted((SKILL / "scripts").rglob("*.py")) + sorted((SKILL / "schemas").glob("*.json"))
    records = [{"path": path.relative_to(SKILL).as_posix(), "sha256": digest(path.read_bytes())} for path in files]
    assembly = REPO / "packages/assembly"
    records.extend({"path": "shared/" + path.relative_to(REPO).as_posix(), "sha256": digest(path.read_bytes())}
                   for path in sorted(assembly.rglob("*")) if path.is_file()
                   and path.suffix in {".py", ".mjs", ".js", ".ts", ".json"}
                   and "__pycache__" not in path.parts and "node_modules" not in path.parts)
    return digest(canonical(records))


def identifier(value: str, label: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", value):
        raise ValueError(f"{label} must contain 2..64 lowercase letters, digits or hyphens and start with a letter")
    return value


def prepare(input_path: Path, work: Path, device_id: str, name: str, xml: Path | None = None,
            ontology: Path | None = None, *, profile: str = PROFILE, assembly_knowledge: Path | None = None) -> dict:
    _, capabilities = profile_contract(profile)
    identifier(device_id, "device-id")
    if not name.strip() or len(name) > 200:
        raise ValueError("A device name in 1..200 characters is required")
    archive = input_path.resolve(strict=True)
    if not archive.is_file() or archive.suffix.lower() != ".zip" or archive.stat().st_size > 512 * 1024 * 1024:
        raise ValueError("The first v2 source-model adapter accepts a bounded Microduck ZIP")
    ontology = (ontology or REPO / "docs/architecture/hardware-ontology.md").resolve(strict=True)
    if ONTOLOGY.encode() not in ontology.read_bytes():
        raise ValueError("The ontology definition must explicitly identify hardware draft.4")
    if work.exists():
        raise ValueError("prepare requires a new work directory; existing work is never overwritten")
    if assembly_knowledge is not None and profile not in MOUNTING_PROFILES:
        raise ValueError("Explicit assembly knowledge requires a supported mounting knowledge profile")
    work.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{work.name}.prepare-", dir=work.parent))
    try:
        (staging / "inputs").mkdir()
        shutil.copyfile(archive, staging / "inputs/materials.zip")
        shutil.copyfile(ontology, staging / "inputs/hardware-ontology.md")
        scene = project(staging / "inputs/materials.zip", staging / "capture", staging / "inputs/hardware-ontology.md",
                        xml_path=xml, device_id=device_id, title=name)
        supporting_records = []
        supporting_paths = None
        if assembly_knowledge is not None:
            shutil.copyfile(assembly_knowledge.resolve(strict=True), staging / "inputs/assembly-knowledge.json")
            if profile in REVIEW_PROFILES:
                from .connection_review import validate_knowledge
                declaration = validate_knowledge(read_json(staging / "inputs/assembly-knowledge.json"))
                supporting_records = freeze_supporting_inputs(declaration, assembly_knowledge.resolve(strict=True).parent, staging)
                supporting_paths = supporting_input_paths(supporting_records, declaration, staging, published=False)
        assembly = capture_assembly_knowledge(scene, staging / "capture", staging / "inputs/assembly-knowledge.json" if assembly_knowledge is not None else None, profile, supporting_paths)
        enrich_scene(scene, staging / "capture", profile, assembly)
        shutil.copyfile(staging / "capture/sources/SRC-MD-MJCF.xml", staging / "inputs/model.xml")
        intake = {
            "schema": "psop.build.intake/2.0-draft.1", "profile": profile,
            "device": {"id": device_id, "name": name},
            "prepared_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tool": {"name": "psop-build", "version": VERSION, "sha256": tool_digest()},
            "inputs": {
                "archive": {"path": "inputs/materials.zip", "sha256": digest((staging / "inputs/materials.zip").read_bytes())},
                "model": {"path": "inputs/model.xml", "sha256": XML_SHA256, "url": XML_URL},
                "ontology": {"path": "inputs/hardware-ontology.md", "sha256": digest((staging / "inputs/hardware-ontology.md").read_bytes())},
            },
            "counts": scene["meta"]["counts"],
        }
        if assembly_knowledge is not None:
            intake["inputs"]["assembly_knowledge"] = {"path": "inputs/assembly-knowledge.json", "sha256": digest((staging / "inputs/assembly-knowledge.json").read_bytes())}
            if profile in REVIEW_PROFILES:
                intake["inputs"]["supporting_documents"] = supporting_records
        write_json(staging / "intake.json", intake)
        write_json(staging / "review.json", {
            "schema": "psop.build.review/2.0-draft.1", "device_id": device_id,
            "scope": "Source-model geometry and reference observations; mechanism qualification and mechanical/engineering confirmation are profile-scoped",
            "counts": scene["meta"]["counts"], "capabilities": capabilities,
        })
        os.replace(staging, work)
        return {"ok": True, "command": "prepare", "work": str(work.resolve()), "device": intake["device"],
                "profile": profile, "counts": intake["counts"], "review": str(work / "review.json")}
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def knowledge_for(scene: dict, device_id: str, version: str, profile: str = PROFILE) -> dict:
    configuration_id = f"configuration:{device_id}:source-qpos0"
    knowledge = {
        "schema": profile, "ontology_target": ONTOLOGY, "device_id": device_id,
        "parts": [{
            "id": part["id"], "type": "Part", "domain": "model", "revision": version,
            "name": part["name"], "source_refs": part["sourceIds"], "evidence_refs": part["evidenceIds"],
            "geometry_source_ref": part["sourceIds"][-1],
            "source_locator": {"source_ref": "SRC-MD-MJCF", "path": part["locator"]},
            "interfaces": [], "interface_status": "not_extracted",
        } for part in scene["parts"]],
        "configurations": [{
            "id": configuration_id, "type": "Configuration", "domain": "model", "revision": version,
            "name": "Source reference · qpos0", "part_refs": [part["id"] for part in scene["parts"]],
            "source_refs": ["SRC-MD-MJCF"], "unit": "m", "quaternion_order": "xyzw",
            "placements": [{"part_ref": part["id"], "position": part["position"], "quaternion": part["quaternion"]}
                           for part in scene["parts"]],
            "connection_status": "not_extracted", "interface_connections": [],
            "mechanical_status": "not_evaluated",
        }],
        "interfaces": [], "interface_connections": [],
    }
    if profile != LEGACY_PROFILE:
        analysis = scene["analysis"]
        for key in ("frames", "features", "interfaces", "connection_candidates", "reference_relations", "analysis"):
            knowledge[key] = analysis[key]
        if profile in SEMANTIC_PROFILES:
            for key in ("logical_holes", "feature_patterns", "reference_observations"):
                knowledge[key] = analysis[key]
        if profile in MOUNTING_PROFILES:
            for key in ("mounting_sites", "mounting_interfaces", "reference_mounts", "slot_features"):
                knowledge[key] = analysis[key]
        if profile in REVIEW_PROFILES:
            for key in ("circular_openings", "passage_hypotheses", "pair_screenings", "connection_reviews", "supplemental_components"):
                knowledge[key] = analysis[key]
        if profile in PIN_FIT_PROFILES:
            knowledge["pin_hole_fits"] = analysis["pin_hole_fits"]
        for part in knowledge["parts"]:
            if profile not in SEMANTIC_PROFILES:
                part["rigid_segments"] = [{
                    "id": part["id"] + "#source-mesh",
                    "geometry_source_ref": part["geometry_source_ref"],
                    "assumption": "Source mesh is treated as one rigid region for feature measurement; no internal motion claim",
                }]
            part["interfaces"] = [item["id"] for item in analysis["interfaces"] if item["owner_ref"] == part["id"]]
            part["interface_status"] = ("mechanism_unconfirmed" if profile in SEMANTIC_PROFILES else
                                        "candidates_extracted" if part["interfaces"] else "no_candidate_in_supported_scope")
            if profile in MOUNTING_PROFILES:
                part["mounting_interfaces"] = [item["id"] for item in analysis["mounting_interfaces"] if item["owner_ref"] == part["id"]]
                if part["mounting_interfaces"]:
                    part["interface_status"] = "mounting_knowledge_available"
        knowledge["configurations"][0]["connection_status"] = "mechanism_unconfirmed" if profile in SEMANTIC_PROFILES else "candidates_extracted"
        if profile in MOUNTING_PROFILES:
            knowledge["configurations"][0]["reference_mount_refs"] = [item["id"] for item in analysis["reference_mounts"]]
            if analysis["reference_mounts"]:
                knowledge["configurations"][0]["connection_status"] = "reference_mounts_published"
    return knowledge


def gaps_for(device_id: str, profile: str = PROFILE) -> dict:
    _, capabilities = profile_contract(profile)
    return {"schema": "psop.build.gaps/2.0-draft.1", "device_id": device_id, "items": [
        {"id": f"gap:{device_id}:{key}", "capability": key, "status": "open", "description": value["scope"]}
        for key, value in capabilities.items() if value["status"] != "complete"
    ]}


def finalize(work: Path, output: Path, version: str) -> dict:
    if not re.fullmatch(r"[0-9][A-Za-z0-9.+-]{0,95}", version):
        raise ValueError("A portable explicit package version is required")
    if output.exists():
        raise ValueError("finalize requires a new output directory; published packages are immutable")
    intake = read_json(work / "intake.json")
    if intake.get("schema") != "psop.build.intake/2.0-draft.1":
        raise ValueError("Only the v2 source-model intake is supported; legacy input is retired")
    profile = intake.get("profile")
    schema_names, capabilities = profile_contract(profile)
    if intake.get("tool", {}).get("sha256") != tool_digest():
        raise ValueError("The builder changed after prepare; prepare a new work directory")
    device = intake["device"]
    identifier(device["id"], "device-id")
    for record in locked_input_records(intake["inputs"]):
        path = local_path(work, record["path"])
        if digest(path.read_bytes()) != record["sha256"]:
            raise ValueError(f"Frozen input changed: {record['path']}")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.publish-", dir=output.parent))
    try:
        (staging / "inputs").mkdir()
        shutil.copyfile(work / "inputs/materials.zip", staging / "inputs/materials.zip")
        scene = project(staging / "inputs/materials.zip", staging, work / "inputs/hardware-ontology.md",
                        xml_path=work / "inputs/model.xml", device_id=device["id"], title=device["name"])
        assembly_input = intake["inputs"].get("assembly_knowledge")
        if assembly_input is not None and profile not in MOUNTING_PROFILES:
            raise ValueError("Historical profiles cannot consume assembly assertions")
        assembly_path = local_path(work, assembly_input["path"]) if assembly_input else None
        supporting_paths = None
        if profile in REVIEW_PROFILES and assembly_path is not None:
            supporting_paths = supporting_input_paths(intake["inputs"].get("supporting_documents", []), read_json(assembly_path), work, published=False)
        assembly = capture_assembly_knowledge(scene, staging, assembly_path, profile, supporting_paths)
        enrich_scene(scene, staging, profile, assembly)
        package_id = f"psop.{device['id']}"
        scene["meta"].update({
            "version": version, "snapshot": f"{package_id}@{version}", "generatedAt": intake["prepared_at"],
            "packageId": package_id, "packageVersion": version, "packageDigest": None,
            "dkpSchema": SCHEMA, "inputKind": "dkp", "capabilities": capabilities,
        })
        write_json(staging / ENTRYPOINTS["scene"], scene)
        write_json(staging / ENTRYPOINTS["knowledge"], knowledge_for(scene, device["id"], version, profile))
        write_json(staging / ENTRYPOINTS["sources"], {"schema": "psop.build.sources/2.0-draft.1", "items": scene["sources"]})
        write_json(staging / ENTRYPOINTS["evidence"], {"schema": "psop.build.evidence/2.0-draft.1", "items": scene["evidence"]})
        write_json(staging / ENTRYPOINTS["gaps"], gaps_for(device["id"], profile))
        for schema_name in schema_names:
            schema = SKILL / "schemas" / schema_name
            (staging / "schemas").mkdir(exist_ok=True)
            shutil.copyfile(schema, staging / "schemas" / schema.name)
        files = [{"path": path.relative_to(staging).as_posix(), "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size}
                 for path in sorted(staging.rglob("*")) if path.is_file()]
        manifest = {
            "schema": SCHEMA, "profile": profile, "package_id": package_id, "package_version": version,
            "device": device, "created_at": intake["prepared_at"],
            "ontology": {"id": "psop.hardware", "version": ONTOLOGY, "path": "sources/SRC-PSOP-ONTOLOGY.md",
                         "sha256": intake["inputs"]["ontology"]["sha256"]},
            "adapter": {"id": "microduck-mjcf/1.0", "commit": COMMIT, "xml_sha256": XML_SHA256},
            "inputs": {"archive": {"path": "inputs/materials.zip", "sha256": intake["inputs"]["archive"]["sha256"]}},
            "toolchain": {"name": "psop-build", "version": VERSION, "sha256": tool_digest()},
            "entrypoints": ENTRYPOINTS, "counts": scene["meta"]["counts"], "capabilities": capabilities,
            "files": files,
        }
        if assembly_input is not None:
            manifest["inputs"]["assembly_knowledge"] = {"path": "sources/SRC-MD-ASSEMBLY-KNOWLEDGE.json", "sha256": assembly_input["sha256"]}
            if profile in REVIEW_PROFILES:
                manifest["inputs"]["supporting_documents"] = [{"id": document["id"], "path": supporting_source_path(document), "sha256": document["sha256"]}
                                                           for document in assembly["supporting_documents"]]
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(staging / "manifest.json", manifest)
        result = validate(staging)
        os.replace(staging, output)
        return {**result, "command": "finalize", "output": str(output.resolve())}
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def validate_shape(value, schema, definitions=None, path="$") -> None:
    """Small strict validator for the bundled local JSON Schema subset.

    No network refs, inferred coercion or permissive unknown object fields.
    The shipped schemas intentionally use only these supported keywords.
    """
    definitions = definitions or schema.get("$defs", {})
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/$defs/") or ref[8:] not in definitions:
            raise ValueError(f"Unsupported schema reference: {ref}")
        return validate_shape(value, definitions[ref[8:]], definitions, path)
    if "oneOf" in schema:
        matches = 0
        for branch in schema["oneOf"]:
            try:
                validate_shape(value, branch, definitions, path)
                matches += 1
            except ValueError:
                pass
        if matches != 1:
            raise ValueError(f"{path}: expected exactly one supported shape, found {matches}")
    if "const" in schema and value != schema["const"]:
        raise ValueError(f"{path}: expected {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{path}: unsupported value {value!r}")
    kind = schema.get("type")
    valid = {"object": isinstance(value, dict), "array": isinstance(value, list),
             "string": isinstance(value, str), "number": type(value) in (int, float) and math.isfinite(value),
             "integer": type(value) is int, "null": value is None, "boolean": type(value) is bool}
    if kind and not (any(valid.get(t, False) for t in kind) if isinstance(kind, list) else valid.get(kind, False)):
        raise ValueError(f"{path}: expected {kind}")
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                raise ValueError(f"{path}: missing {key}")
        for key, item in value.items():
            if key in properties:
                validate_shape(item, properties[key], definitions, f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                raise ValueError(f"{path}: unexpected field {key}")
            elif isinstance(schema.get("additionalProperties"), dict):
                validate_shape(item, schema["additionalProperties"], definitions, f"{path}.{key}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", float("inf")):
            raise ValueError(f"{path}: invalid array length")
        if schema.get("uniqueItems") and len({canonical(item) for item in value}) != len(value):
            raise ValueError(f"{path}: duplicate array values")
        for index, item in enumerate(value):
            if "items" in schema:
                validate_shape(item, schema["items"], definitions, f"{path}[{index}]")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", float("inf")):
            raise ValueError(f"{path}: invalid string length")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            raise ValueError(f"{path}: string does not match contract")
    if type(value) in (int, float) and (value < schema.get("minimum", -float("inf")) or value > schema.get("maximum", float("inf"))):
        raise ValueError(f"{path}: numeric value outside range")
    if type(value) in (int, float) and (("exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"])
                                      or ("exclusiveMaximum" in schema and value >= schema["exclusiveMaximum"])):
        raise ValueError(f"{path}: numeric value outside exclusive range")


def validate_finite_plane(feature: dict, raw: bytes) -> None:
    """Check the finite patch against its exact, unscaled source-STL region."""
    geometry = feature["geometry"]
    normal, origin = geometry["normal"], geometry["origin"]
    tolerance = max(2e-8, feature["measurement"]["fit_max_m"] + 2e-8)
    def subtract(a, b):
        return [x - y for x, y in zip(a, b)]
    def cross(a, b):
        return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]
    def point_key(point):
        return tuple(round(value / 1e-8) for value in point)
    def edge_key(a, b):
        return tuple(sorted((point_key(a), point_key(b))))
    def plane_distance(point):
        return abs(sum((point[i] - origin[i]) * normal[i] for i in range(3)))
    area = 0.0
    edges, vertex_keys = {}, set()
    for index in geometry["triangle_indices"]:
        values = struct.unpack_from("<12fH", raw, 84 + index * 50)
        points = [values[offset:offset+3] for offset in (3, 6, 9)]
        if any(not math.isfinite(value) for point in points for value in point):
            raise ValueError("Plane patch includes a non-finite source triangle")
        if any(plane_distance(point) > tolerance for point in points):
            raise ValueError("Plane patch support triangles do not fit its declared plane")
        product = cross(subtract(points[1], points[0]), subtract(points[2], points[0]))
        triangle_area = math.sqrt(sum(value*value for value in product)) / 2
        if triangle_area <= 0 or sum(product[i]*normal[i] for i in range(3)) <= 0:
            raise ValueError("Plane patch includes a degenerate or oppositely oriented triangle")
        area += triangle_area
        vertex_keys.update(point_key(point) for point in points)
        for a, b in ((points[0], points[1]), (points[1], points[2]), (points[2], points[0])):
            edge = edge_key(a, b)
            edges[edge] = edges.get(edge, 0) + 1
    if abs(area - geometry["area_m2"]) > max(1e-12, area * 1e-7):
        raise ValueError("Plane patch area does not match its finite source triangles")
    expected_boundary = {edge for edge, count in edges.items() if count == 1}
    actual_boundary = set()
    for loop in geometry["boundary_loops"]:
        if len(loop) < 4 or point_key(loop[0]) != point_key(loop[-1]):
            raise ValueError("Plane patch boundary must be a finite explicitly closed loop")
        if any(point_key(point) not in vertex_keys or plane_distance(point) > tolerance for point in loop):
            raise ValueError("Plane patch boundary is not located on its source-triangle vertices")
        for a, b in zip(loop, loop[1:]):
            edge = edge_key(a, b)
            if edge[0] == edge[1] or edge in actual_boundary:
                raise ValueError("Plane patch boundary contains a zero or repeated edge")
            actual_boundary.add(edge)
    if not expected_boundary or actual_boundary != expected_boundary:
        raise ValueError("Plane patch boundary does not match the exact finite source region")


def validate_finite_conical_pin(feature: dict, raw: bytes) -> None:
    """Verify the published tapered wall against finite outward source triangles."""
    geometry = feature["geometry"]
    origin, axis, length = geometry["origin"], geometry["axis"], geometry["length_m"]
    tolerance = max(2e-8, feature["measurement"]["fit_max_m"] + 2e-8)
    start, end = geometry["radius_start_m"], geometry["radius_end_m"]
    extent = []
    for index in geometry["triangle_indices"]:
        values = struct.unpack_from("<12fH", raw, 84 + index * 50)
        points = [values[offset:offset+3] for offset in (3, 6, 9)]
        radial_vectors = []
        for point in points:
            if any(not math.isfinite(value) for value in point):
                raise ValueError("Tapered pin includes a non-finite source vertex")
            delta = [point[i]-origin[i] for i in range(3)]
            distance = sum(delta[i]*axis[i] for i in range(3))
            radial = [delta[i]-distance*axis[i] for i in range(3)]
            radius = math.sqrt(sum(v*v for v in radial))
            expected = start + (end-start)*distance/length
            if distance < -tolerance or distance > length+tolerance or abs(radius-expected) > tolerance:
                raise ValueError("Tapered pin wall does not fit its declared finite source geometry")
            extent.append(distance)
            radial_vectors.append(radial)
        a = [points[1][i]-points[0][i] for i in range(3)]
        b = [points[2][i]-points[0][i] for i in range(3)]
        normal = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
        radial = [sum(v[i] for v in radial_vectors)/3 for i in range(3)]
        if sum(normal[i]*radial[i] for i in range(3)) <= 0:
            raise ValueError("Integral pin must retain outward, nondegenerate source walls")
    if not extent or abs(min(extent)) > tolerance or abs(max(extent)-length) > tolerance:
        raise ValueError("Tapered pin witnesses do not span its declared finite extent")


def validate_analysis(knowledge: dict, scene: dict, root: Path | None = None) -> None:
    """Resolve the supported subset without upgrading candidates to connections."""
    def indexed(items, label):
        result = {item["id"]: item for item in items}
        if len(result) != len(items):
            raise ValueError(f"Duplicate {label} identity")
        return result

    parts = indexed(knowledge["parts"], "Part")
    frames = indexed(knowledge["frames"], "Frame")
    features = indexed(knowledge["features"], "Feature")
    interfaces = indexed(knowledge["interfaces"], "Interface")
    indexed(knowledge["connection_candidates"], "connection candidate")
    indexed(knowledge["reference_relations"], "source-reference relationship")
    sources = indexed(scene["sources"], "Source")
    evidence = indexed(scene["evidence"], "Evidence")
    bodies = indexed(scene["bodies"], "source body")
    joints = indexed(scene["joints"], "source joint")
    mesh_bytes = {}
    for collection in (frames.values(), features.values(), interfaces.values(),
                       knowledge["connection_candidates"], knowledge["reference_relations"]):
        for item in collection:
            if any(ref not in evidence for ref in item["evidence_refs"]):
                raise ValueError("Analysis contains an unresolved evidence reference")
            if any(ref not in sources for ref in item.get("source_refs", [])):
                raise ValueError("Analysis contains an unresolved source reference")
    for frame in frames.values():
        part = parts.get(frame["owner_ref"])
        if knowledge["schema"] in SEMANTIC_PROFILES:
            source = sources.get(frame["geometry_source_ref"])
            if (not part or not source or source["id"] != part["geometry_source_ref"]
                    or frame["geometry_digest"] != "sha256:" + source["digest"]):
                raise ValueError("Source measurement frame does not resolve to its owner's geometry")
        elif not part or frame["attached_to"] not in {segment["id"] for segment in part["rigid_segments"]}:
            raise ValueError("Feature frame is not attached to its owner's measurement region")
        if frame["pose"]["expressed_in"] != part["id"]:
            raise ValueError("Unsupported feature-frame pose reference")
        if abs(sum(n*n for n in frame["pose"]["quaternion"]) - 1) > 1e-9:
            raise ValueError("Feature frame does not contain a unit quaternion")
    for feature in features.values():
        part = parts.get(feature["owner_ref"])
        frame = frames.get(feature["frame_ref"])
        source = sources.get(feature["geometry_source_ref"])
        if not part or not frame or frame["owner_ref"] != part["id"] or not source:
            raise ValueError("Feature owner, frame or source is unresolved")
        if source["id"] != part["geometry_source_ref"] or feature["geometry_digest"] != "sha256:" + source["digest"]:
            raise ValueError("Feature geometry is not bound to its owner's source bytes")
        geometry = feature["geometry"]
        if geometry["type"] == "cylinder":
            if feature["kind"] not in {"bore_wall", "shaft_wall"}:
                raise ValueError("Feature kind does not describe its cylinder geometry")
            if abs(sum(n*n for n in geometry["axis"]) - 1) > 1e-9 or geometry["radius_m"] <= 0:
                raise ValueError("Feature cylinder has an invalid axis or radius")
            if geometry["axial_range_m"][0] >= geometry["axial_range_m"][1]:
                raise ValueError("Feature cylinder does not have a finite positive extent")
        elif geometry["type"] == "conical_frustum" and knowledge["schema"] in PATTERNS_PROFILES:
            if (feature["kind"] != "shaft_wall" or abs(sum(n*n for n in geometry["axis"]) - 1) > 1e-9
                    or min(geometry["radius_start_m"], geometry["radius_end_m"], geometry["length_m"]) <= 0):
                raise ValueError("Integral tapered pin requires a unit axis and positive finite radii and length")
        else:
            if feature["kind"] != "planar_patch" or geometry["type"] != "plane":
                raise ValueError("Unsupported feature geometry or kind")
            if abs(sum(n*n for n in geometry["normal"]) - 1) > 1e-9 or geometry["area_m2"] <= 0:
                raise ValueError("Feature plane has an invalid normal or finite area")
        if root is not None and knowledge["schema"] in {SURFACE_PROFILE, *SEMANTIC_PROFILES}:
            if source["id"] not in mesh_bytes:
                raw = local_path(root, source["url"]).read_bytes()
                count = struct.unpack_from("<I", raw, 80)[0] if len(raw) >= 84 else -1
                if count < 0 or len(raw) != 84 + count * 50:
                    raise ValueError("Feature geometry requires an exact binary STL triangle mapping")
                mesh_bytes[source["id"]] = raw, count
            raw, triangle_count = mesh_bytes[source["id"]]
            if any(index >= triangle_count for index in geometry["triangle_indices"]):
                raise ValueError("Feature triangle index is outside its source mesh")
            if geometry["type"] == "plane":
                validate_finite_plane(feature, raw)
            elif geometry["type"] == "conical_frustum":
                validate_finite_conical_pin(feature, raw)
    for interface in interfaces.values():
        frame = frames.get(interface["frame_ref"])
        if not frame or frame["owner_ref"] != interface["owner_ref"]:
            raise ValueError("Interface does not resolve to its owner's frame")
        for reference in interface["feature_refs"]:
            feature = features.get(reference)
            if not feature or feature["owner_ref"] != interface["owner_ref"]:
                raise ValueError("Interface contains another owner's or an unresolved feature")
            if (interface.get("kind") == "surface_fit") != (feature["geometry"]["type"] == "plane"):
                raise ValueError("Interface kind does not match its selected geometry")
    configuration_id = knowledge["configurations"][0]["id"]
    for candidate in knowledge["connection_candidates"]:
        if candidate["configuration_ref"] != configuration_id:
            raise ValueError("Connection candidate belongs to another configuration")
        owners = set()
        for endpoint in candidate["endpoint_refs"]:
            interface = interfaces.get(endpoint["interface_ref"])
            if not interface or interface["owner_ref"] != endpoint["part_ref"]:
                raise ValueError("Connection candidate contains an unresolved endpoint")
            if not set(endpoint["feature_refs"]) <= set(interface["feature_refs"]):
                raise ValueError("Connection candidate selects features outside its endpoint")
            owners.add(endpoint["part_ref"])
        if len(owners) < 2:
            raise ValueError("An external connection candidate requires different Parts")
        if candidate.get("kind") == "surface_fit":
            endpoints = candidate["endpoint_refs"]
            paired_features = set()
            for pair in candidate["surface_pairs"]:
                for index, reference in enumerate(pair["feature_refs"]):
                    feature = features.get(reference)
                    if (not feature or feature["geometry"]["type"] != "plane"
                            or feature["owner_ref"] != endpoints[index]["part_ref"]
                            or reference not in endpoints[index]["feature_refs"]):
                        raise ValueError("Surface pair does not bind opposite endpoint plane features")
                    paired_features.add(reference)
                if pair["overlap_area_m2"] <= 0:
                    raise ValueError("Surface pair requires a positive finite overlap area")
                if pair["normal_angle_rad"] < 0 or pair["normal_angle_rad"] > math.pi:
                    raise ValueError("Surface pair normal angle is outside [0, pi]")
            assessment = candidate.get("direction_assessment")
            if assessment:
                moving = assessment["moving_part_ref"]
                if moving not in owners:
                    raise ValueError("Direction assessment does not identify a candidate participant")
                for direction in assessment["directions"]:
                    if abs(sum(n*n for n in direction["vector"]) - 1) > 1e-9:
                        raise ValueError("Direction assessment requires unit world directions")
                    for reference in direction["blocking_feature_refs"]:
                        feature = features.get(reference)
                        if (not feature or feature["owner_ref"] != moving
                                or feature["geometry"]["type"] != "plane" or reference not in paired_features):
                            raise ValueError("Direction assessment contains an unrelated blocking feature")
                    if (direction["result"] == "locally_blocked") != bool(direction["blocking_feature_refs"]):
                        raise ValueError("Direction assessment blocking references do not match its local result")
                    if assessment["status"] == "unknown" and direction["result"] != "unknown":
                        raise ValueError("Unknown direction assessment cannot assert a local mechanical result")
            check_units = {"opposed_normals": "rad", "plane_gap": "m", "finite_surface_overlap": "m2"}
            if any(check["unit"] != check_units[check["kind"]] for check in candidate["checks"]):
                raise ValueError("Surface check does not declare its required physical unit")
            checks = {check["kind"]: check for check in candidate["checks"]}
            if len(checks) != len(candidate["checks"]) or set(checks) != set(check_units):
                raise ValueError("Surface candidate requires each supported geometric check exactly once")
            measured = {"opposed_normals": max(math.pi - pair["normal_angle_rad"] for pair in candidate["surface_pairs"]),
                        "plane_gap": max(pair["plane_gap_m"] for pair in candidate["surface_pairs"]),
                        "finite_surface_overlap": sum(pair["overlap_area_m2"] for pair in candidate["surface_pairs"])}
            for kind, check in checks.items():
                residual = measured[kind]
                if abs(check["residual"] - residual) > max(1e-12, abs(residual) * 1e-9):
                    raise ValueError("Surface check residual does not match its finite pair measurements")
                passed = residual >= check["threshold"] if kind == "finite_surface_overlap" else 0 <= residual <= check["threshold"]
                if not passed:
                    raise ValueError("Surface check pass claim contradicts its geometric predicate")
    for relation in knowledge["reference_relations"]:
        if relation["source_body_ref"] not in bodies or any(ref not in parts for ref in relation["part_refs"]):
            raise ValueError("Source-reference relationship contains an unresolved body or Part")
        if relation["kind"] == "source_joint" and relation.get("source_joint_ref") not in joints:
            raise ValueError("Source-reference joint relationship does not resolve")
        if relation["kind"] == "same_source_body" and "source_joint_ref" in relation:
            raise ValueError("Source-body membership cannot claim a joint")
    summary = knowledge["analysis"]
    if knowledge["schema"] in SEMANTIC_PROFILES:
        validate_reference_semantics(knowledge, scene, root)
        if knowledge["schema"] in MOUNTING_PROFILES:
            validate_mounting_knowledge(knowledge, scene, root)
        if knowledge["schema"] in REVIEW_PROFILES:
            validate_connection_reviews(knowledge, scene, root)
        return
    if (summary["features_count"] != len(features) or summary["interfaces_count"] != len(interfaces)
            or summary["connection_candidates_count"] != len(knowledge["connection_candidates"])):
        raise ValueError("Analysis summary differs from its records")
    coverage = summary["coverage"]
    owners_with_features = {item["owner_ref"] for item in features.values()}
    if (coverage["part_count"] != len(parts) or coverage["parts_with_features"] != len(owners_with_features)
            or coverage["parts_without_features"] != len(parts) - len(owners_with_features)):
        raise ValueError("Analysis coverage differs from its supported Part scope")
    if knowledge["schema"] == SURFACE_PROFILE:
        planes = [feature for feature in features.values() if feature["geometry"]["type"] == "plane"]
        surfaces = [item for item in interfaces.values() if item.get("kind") == "surface_fit"]
        candidates = [item for item in knowledge["connection_candidates"] if item.get("kind") == "surface_fit"]
        expected = {"planar_features_count": len(planes), "surface_interface_count": len(surfaces),
                    "surface_candidate_count": len(candidates),
                    "surface_pairs_count": sum(len(item["surface_pairs"]) for item in candidates),
                    "parts_with_planar_features": len({item["owner_ref"] for item in planes})}
        if any(coverage[key] != value for key, value in expected.items()):
            raise ValueError("Surface coverage differs from its supported geometry and candidate scope")
        if coverage["planar_regions_examined_count"] != len(planes) + coverage["unpaired_planar_regions_count"]:
            raise ValueError("Planar scan coverage does not account for published and unpaired regions")
        paired_ids = {reference for candidate in candidates for pair in candidate["surface_pairs"] for reference in pair["feature_refs"]}
        if paired_ids != {feature["id"] for feature in planes}:
            raise ValueError("Published finite planes must be the selected surface-pair witnesses")
        if len(coverage["part_gaps"]) != len(parts) or {item["part_ref"] for item in coverage["part_gaps"]} != set(parts):
            raise ValueError("Surface analysis must retain unresolved types for every Part")


def validate_reference_semantics(knowledge: dict, scene: dict, root: Path | None) -> None:
    """Validate geometric witnesses without manufacturing functional facts."""
    def indexed(items, label):
        result = {item["id"]: item for item in items}
        if len(result) != len(items):
            raise ValueError(f"Duplicate {label} identity")
        return result
    def unit(vector):
        return abs(sum(value*value for value in vector) - 1) <= 1e-9
    parts = indexed(knowledge["parts"], "Part")
    source_parts = indexed(scene["parts"], "source Part")
    frames = indexed(knowledge["frames"], "measurement Frame")
    features = indexed(knowledge["features"], "Feature")
    holes = indexed(knowledge["logical_holes"], "logical hole")
    patterns = indexed(knowledge["feature_patterns"], "feature pattern")
    observations = indexed(knowledge["reference_observations"], "reference observation")
    sources = indexed(scene["sources"], "Source")
    evidence = indexed(scene["evidence"], "Evidence")
    if knowledge["interfaces"] or knowledge["connection_candidates"] or knowledge["interface_connections"]:
        raise ValueError("This source profile has no qualified functional-interface or connection warrants")
    triangle_counts = {}
    def support(record, owner=None):
        if any(ref not in sources for ref in record["source_refs"]) or any(ref not in evidence for ref in record["evidence_refs"]):
            raise ValueError("Geometric record contains an unresolved source or evidence reference")
        if owner is not None:
            frame = frames.get(record["frame_ref"])
            if owner not in parts or not frame or frame["owner_ref"] != owner:
                raise ValueError("Geometric record does not resolve to its owner's measurement frame")
    def triangles(owner, indices):
        if root is None:
            return
        source_id = parts[owner]["geometry_source_ref"]
        if source_id not in triangle_counts:
            raw = local_path(root, sources[source_id]["url"]).read_bytes()
            count = struct.unpack_from("<I", raw, 80)[0] if len(raw) >= 84 else -1
            if count < 0 or len(raw) != 84 + 50*count:
                raise ValueError("Geometric witness requires an exact binary STL mapping")
            triangle_counts[source_id] = count
        if any(index < 0 or index >= triangle_counts[source_id] for index in indices):
            raise ValueError("Geometric witness triangle is outside its owner's source mesh")
    portals, wall_owners = {}, {}
    for hole in holes.values():
        owner = hole["owner_ref"]
        support(hole, owner)
        source_id = parts[owner]["geometry_source_ref"]
        if hole["geometry_source_ref"] != source_id or hole["geometry_digest"] != "sha256:" + sources[source_id]["digest"]:
            raise ValueError("Logical hole is not bound to its owner's exact source geometry")
        if not unit(hole["axis"]["direction"]) or hole["axis"]["axial_range_m"][0] >= hole["axis"]["axial_range_m"][1]:
            raise ValueError("Logical hole requires a unit axis and positive finite extent")
        for reference in hole["wall_feature_refs"]:
            feature = features.get(reference)
            if (not feature or feature["owner_ref"] != owner or feature["frame_ref"] != hole["frame_ref"]
                    or feature["kind"] != "bore_wall"):
                raise ValueError("Logical hole contains an unresolved or unrelated bore-wall Feature")
            if reference in wall_owners:
                raise ValueError("A measured bore wall cannot create duplicate logical-hole identities")
            wall_owners[reference] = hole["id"]
        if (hole["kind"] == "single_bore") != (len(hole["wall_feature_refs"]) == 1):
            raise ValueError("Logical-hole kind does not match its wall count")
        for portal in hole["portals"]:
            if portal["id"] in portals or not unit(portal["normal"]):
                raise ValueError("Logical-hole portal identity or directed normal is invalid")
            if portal["status"] in {"opening", "closed"} and not portal["support_triangle_indices"]:
                raise ValueError("A classified logical-hole portal requires source-triangle witnesses")
            if portal["status"] == "opening" and len(portal["boundary_vertices"]) < 3:
                raise ValueError("An opening portal requires a finite boundary")
            triangles(owner, portal["support_triangle_indices"])
            portals[portal["id"]] = (hole, portal)
        for link in hole["topology_links"]:
            if not set(link["wall_feature_refs"]) <= set(hole["wall_feature_refs"]):
                raise ValueError("Logical-hole topology link references another channel's walls")
            triangles(owner, link["triangle_indices"])
        if hole["kind"] == "stepped_bore" and not hole["topology_links"]:
            raise ValueError("Stepped logical holes require finite annular-shoulder witnesses")
    for pattern in patterns.values():
        owner = pattern["owner_ref"]
        support(pattern, owner)
        if not unit(pattern["geometry"]["normal"]):
            raise ValueError("Feature pattern requires a unit reference-plane normal")
        if not (len(pattern["logical_hole_refs"]) == len(pattern["portal_refs"]) == len(pattern["geometry"]["member_centers"])):
            raise ValueError("Feature pattern members, portals and centers must have matching cardinality")
        for hole_ref, portal_ref in zip(pattern["logical_hole_refs"], pattern["portal_refs"]):
            hole = holes.get(hole_ref)
            binding = portals.get(portal_ref)
            if (not hole or hole["owner_ref"] != owner or hole["frame_ref"] != pattern["frame_ref"]
                    or not binding or binding[0]["id"] != hole_ref or binding[1]["status"] != "opening"):
                raise ValueError("Feature pattern must reference its owner's finite opening portals")
        triangles(owner, pattern["witness"]["support_triangle_indices"])
    configuration = knowledge["configurations"][0]["id"]
    for observation in observations.values():
        support(observation)
        participants = observation["participants"]
        owners = [item["part_ref"] for item in participants]
        if observation["configuration_ref"] != configuration or len(set(owners)) != 2:
            raise ValueError("Reference observation requires two distinct Parts in the frozen source configuration")
        for participant in participants:
            owner = participant["part_ref"]
            if owner not in parts:
                raise ValueError("Reference observation contains an unresolved Part")
            for field, records in (("feature_refs", features), ("logical_hole_refs", holes), ("pattern_refs", patterns)):
                if any(reference not in records or records[reference]["owner_ref"] != owner for reference in participant[field]):
                    raise ValueError("Reference observation contains a cross-owner or unresolved geometric reference")
        if observation["kind"] == "finite_surface_overlap":
            selected = {reference for item in participants for reference in item["feature_refs"]}
            for pair in observation["surface_pairs"]:
                if pair["overlap_area_m2"] <= 0:
                    raise ValueError("Finite surface observation requires a positive overlap area")
                for index, reference in enumerate(pair["feature_refs"]):
                    feature = features.get(reference)
                    if (not feature or feature["owner_ref"] != owners[index] or feature["geometry"]["type"] != "plane"
                            or reference not in participants[index]["feature_refs"]):
                        raise ValueError("Finite surface observation does not bind opposite finite planar witnesses")
            test = observation["normal_halfspace_test"]
            moving = test["moving_part_ref"]
            if moving not in owners:
                raise ValueError("Normal-projection test has no observation participant")
            pose = source_parts[moving]
            near = {pair["feature_refs"][owners.index(moving)] for pair in observation["surface_pairs"]
                    if pair["plane_gap_m"] <= test["near_contact_tolerance_m"]}
            directions = set()
            for sample in test["samples"]:
                if not unit(sample["vector"]) or tuple(sample["vector"]) in directions:
                    raise ValueError("Normal-projection samples require distinct unit directions")
                directions.add(tuple(sample["vector"]))
                for projection in sample["projections"]:
                    reference = projection["feature_ref"]
                    feature = features.get(reference)
                    if (not feature or feature["owner_ref"] != moving or reference not in selected
                            or feature["geometry"]["type"] != "plane"):
                        raise ValueError("Normal-projection test contains an unrelated source plane")
                    if any(abs(scale) < 1e-12 for scale in pose["scale"]):
                        raise ValueError("Normal-projection test cannot use a degenerate source scale")
                    normal = rotate(pose["quaternion"], [value/scale for value, scale in zip(feature["geometry"]["normal"], pose["scale"])])
                    length = math.sqrt(sum(value*value for value in normal))
                    expected = sum(value*direction for value, direction in zip(normal, sample["vector"])) / length
                    if abs(projection["value"] - expected) > 1e-9 or projection["near_contact"] != (reference in near):
                        raise ValueError("Normal-projection measurement does not match its frozen source geometry")
        elif observation["kind"] == "hole_pattern_alignment":
            members = observation["member_observation_refs"]
            if len(members) != len(observation["member_correspondences"]):
                raise ValueError("Pattern observation requires one correspondence for every atomic observation")
            for reference, correspondence in zip(members, observation["member_correspondences"]):
                child = observations.get(reference)
                if not child or child["kind"] != "coaxial_bores" or [item["part_ref"] for item in child["participants"]] != owners:
                    raise ValueError("Pattern observation must retain compatible atomic bore observations")
                for index, (hole_ref, feature_ref) in enumerate(zip(correspondence["logical_hole_refs"], correspondence["feature_refs"])):
                    hole = holes.get(hole_ref)
                    if (not hole or hole["owner_ref"] != owners[index] or hole["wall_feature_refs"] != [feature_ref]
                            or feature_ref not in child["participants"][index]["feature_refs"]
                            or hole_ref not in participants[index]["logical_hole_refs"]):
                        raise ValueError("Pattern correspondence is not supported by its atomic single-bore witnesses")
            for index in range(2):
                refs = [item["logical_hole_refs"][index] for item in observation["member_correspondences"]]
                if len(set(refs)) != len(refs):
                    raise ValueError("Pattern observation cannot map a logical hole more than once")
            placements = observation["reference_placements"]
            if {item["part_ref"] for item in placements} != set(owners):
                raise ValueError("Pattern observation must retain both reference placements")
            for placement in placements:
                pose = source_parts[placement["part_ref"]]
                if any(placement[key] != pose[key] for key in ("position", "quaternion", "scale")):
                    raise ValueError("Pattern observation placements are not the shared source configuration")
    summary, coverage = knowledge["analysis"], knowledge["analysis"]["coverage"]
    raw = [item for item in observations.values() if item["kind"] != "hole_pattern_alignment"]
    parents = [item for item in observations.values() if item["kind"] == "hole_pattern_alignment"]
    surfaces = [item for item in raw if item["kind"] == "finite_surface_overlap"]
    planes = [item for item in features.values() if item["geometry"]["type"] == "plane"]
    counts = {"features_count": len(features), "interfaces_count": 0, "connection_candidates_count": 0,
              "logical_holes_count": len(holes), "feature_patterns_count": len(patterns),
              "raw_observations_count": len(raw), "reference_observations_count": len(observations), "pattern_alignment_count": len(parents)}
    if any(summary[key] != value for key, value in counts.items()):
        raise ValueError("Reference-analysis counts must distinguish geometry observations from qualified interfaces")
    with_features = {item["owner_ref"] for item in features.values()}
    counts = {"part_count": len(parts), "parts_with_features": len(with_features), "parts_without_features": len(parts)-len(with_features),
              "planar_features_count": len(planes), "parts_with_planar_features": len({item["owner_ref"] for item in planes}),
              "raw_cylinder_observations_count": len(raw)-len(surfaces), "raw_surface_observations_count": len(surfaces),
              "surface_pairs_count": sum(len(item["surface_pairs"]) for item in surfaces)}
    if any(coverage[key] != value for key, value in counts.items()):
        raise ValueError("Geometric coverage does not match its published witnesses")
    paired = {reference for item in surfaces for pair in item["surface_pairs"] for reference in pair["feature_refs"]}
    if paired != {item["id"] for item in planes} or coverage["planar_regions_examined_count"] != len(planes)+coverage["unpaired_planar_regions_count"]:
        raise ValueError("Finite planar scan coverage or observation witnesses are incomplete")
    if len(coverage["part_gaps"]) != len(parts) or {item["part_ref"] for item in coverage["part_gaps"]} != set(parts):
        raise ValueError("Unresolved functional types must remain explicit for every source Part")


def validate_mounting_knowledge(knowledge: dict, scene: dict, root: Path | None = None) -> None:
    """Resolve installation sites without upgrading source assertions to execution."""
    def indexed(items, label):
        values = {item["id"]: item for item in items}
        if len(values) != len(items):
            raise ValueError("Duplicate " + label + " identity")
        return values
    parts = indexed(scene["parts"], "mounting Part")
    features = indexed(knowledge["features"], "mounting Feature")
    holes = indexed(knowledge["logical_holes"], "mounting hole")
    portals = {portal["id"]: (hole, portal) for hole in holes.values() for portal in hole["portals"]}
    frames = indexed(knowledge["frames"], "mounting measurement Frame")
    sources = indexed(scene["sources"], "mounting Source")
    evidence = indexed(scene["evidence"], "mounting Evidence")
    sites = indexed(knowledge["mounting_sites"], "mounting site")
    interfaces = indexed(knowledge["mounting_interfaces"], "mounting Interface")
    mounts = indexed(knowledge["reference_mounts"], "reference mount")
    slots = indexed(knowledge["slot_features"], "slot opening")
    declaration = None
    source_id, evidence_id = "SRC-MD-ASSEMBLY-KNOWLEDGE", "evidence:microduck:assembly-knowledge"
    if source_id in sources:
        declaration = json.loads(sources[source_id]["text"])
    assertions = {item["id"] for key in ("interface_families", "reference_assemblies", "mounting_assertions") for item in (declaration or {}).get(key, [])}
    unknown_assertions = {item["id"] for item in (declaration or {}).get("mounting_assertions", [])
                          if item["selection"]["status"] == "unknown"}
    inferred_assertions = {item["id"] for item in (declaration or {}).get("mounting_assertions", [])
                           if item.get("assertion_basis") == "project_inference"}
    def references(item, owner=None):
        if any(ref not in sources for ref in item["source_refs"]) or any(ref not in evidence for ref in item["evidence_refs"]):
            raise ValueError("Installation knowledge contains an unresolved source or evidence reference")
        if owner is not None:
            frame = frames.get(item["frame_ref"])
            if owner not in parts or not frame or frame["owner_ref"] != owner:
                raise ValueError("Installation record does not resolve to its owner's measurement frame")
        assertion_refs = item.get("assertion_refs", [])
        if any(ref not in assertions for ref in assertion_refs):
            raise ValueError("Installation record references an unknown supplied assertion")
        if item.get("status") in {"user_asserted", "user_asserted_reference", "project_inferred"}:
            if not assertion_refs or source_id not in item["source_refs"] or evidence_id not in item["evidence_refs"]:
                raise ValueError("Functional installation assertion requires its explicit source and evidence")
            for ref in set(assertion_refs) & unknown_assertions:
                if "evidence:microduck:mounting-assertion:" + ref not in item["evidence_refs"]:
                    raise ValueError("New installation assertion must retain its own captured user-statement evidence")
            if knowledge["schema"] in REVIEW_PROFILES:
                inferred = bool(set(assertion_refs) & inferred_assertions)
                if (item["status"] == "project_inferred") != inferred:
                    raise ValueError("Project-inferred functional roles cannot be relabelled as user confirmation")
    for site in sites.values():
        owner = site["owner_ref"]
        references(site, owner)
        if site.get("site_kind") == "integral_pin" and knowledge["schema"] in PATTERNS_PROFILES:
            feature = features.get(site["feature_refs"][0])
            if (site["hole_ref"] is not None or site["portal_ref"] is not None or len(site["feature_refs"]) != 1
                    or not feature or feature["owner_ref"] != owner or feature["frame_ref"] != site["frame_ref"]
                    or feature["geometry"]["type"] != "conical_frustum" or feature["kind"] != "shaft_wall"):
                raise ValueError("Integral-pin site must bind one finite owner pin and cannot fabricate a hole or portal")
            geometry = feature["geometry"]
            tip = [geometry["origin"][i] + geometry["axis"][i]*geometry["length_m"] for i in range(3)]
            if (any(abs(a-b) > 1e-12 for a,b in zip(site["position"], tip))
                    or any(abs(a-b) > 1e-9 for a,b in zip(site["entry_direction"], geometry["axis"]))):
                raise ValueError("Integral-pin site must retain its measured tip and outward insertion direction")
            if (site["status"] == "geometry_candidate") != (site["role"] == "unqualified"):
                raise ValueError("Geometric pin candidates do not establish functional roles")
            continue
        hole = holes.get(site["hole_ref"])
        record = portals.get(site["portal_ref"])
        if (not hole or hole["owner_ref"] != owner or not record or record[0]["id"] != hole["id"]
                or record[1]["status"] != "opening" or site["frame_ref"] != hole["frame_ref"]):
            raise ValueError("Installation site must bind one owner's actual open portal and shared logical hole")
        if site["position"] != record[1]["position"] or any(abs(a+b) > 1e-9 for a,b in zip(site["entry_direction"], record[1]["normal"])):
            raise ValueError("Installation site entry location or direction contradicts its portal")
        if set(site["feature_refs"]) != set(hole["wall_feature_refs"]):
            raise ValueError("Installation site must retain the exact finite walls of its shared hole")
        if (site["status"] == "geometry_candidate") != (site["role"] == "unqualified"):
            raise ValueError("Geometric installation candidates do not establish functional roles")
    for interface in interfaces.values():
        owner = interface["owner_ref"]
        references(interface, owner)
        if set(interface["assertion_refs"]) & unknown_assertions:
            expected = {"status": "unknown", "same_side": None, "min_count": None,
                        "require_adjacent_pair": None, "allowed_adjacent_pairs": [], "adjacency_basis": "not_assessed"}
            if interface["selection_rule"] != expected or interface["mechanism"] != "unknown":
                raise ValueError("Unknown installation assertions cannot invent a minimum subset or connection mechanism")
        members = interface["member_site_refs"]
        if len(members) != len(set(members)) or any(ref not in sites or sites[ref]["owner_ref"] != owner for ref in members):
            raise ValueError("Mounting Interface members must resolve to distinct sites on its owner")
        if any(sites[ref]["status"] != interface["status"] or sites[ref]["role"] != interface["role"] for ref in members):
            raise ValueError("Mounting Interface members must carry the same source-attributed functional role")
        side_members = []
        side_ids = set()
        for side in interface["sides"]:
            if side["id"] in side_ids:
                raise ValueError("Duplicate Interface entry-side identity")
            side_ids.add(side["id"])
            side_members.extend(side["site_refs"])
            if any(ref not in members or sites[ref]["side_ref"] != side["id"] for ref in side["site_refs"]):
                raise ValueError("Mounting side must bind its actual member entry sites")
        if len(side_members) != len(set(side_members)) or set(side_members) != set(members):
            raise ValueError("Mounting Interface sides must partition its installation sites")
        for pair in interface["selection_rule"]["allowed_adjacent_pairs"]:
            if len(set(pair)) != 2 or any(ref not in members for ref in pair) or sites[pair[0]]["side_ref"] != sites[pair[1]]["side_ref"]:
                raise ValueError("Allowed adjacency must bind distinct same-side installation sites")
    configuration = knowledge["configurations"][0]
    for mount in mounts.values():
        references(mount)
        if mount["configuration_ref"] != configuration["id"]:
            raise ValueError("Reference mount is not bound to the frozen source Configuration")
        if len(mount["participants"]) != 2 or len({p["part_ref"] for p in mount["participants"]}) != 2:
            raise ValueError("Reference mount requires two distinct Part participants")
        expected_sites = []
        for participant in mount["participants"]:
            interface = interfaces.get(participant["interface_ref"])
            if not interface or interface["owner_ref"] != participant["part_ref"] or not set(participant["site_refs"]) <= set(interface["member_site_refs"]):
                raise ValueError("Reference mount does not resolve to its participant's mounting Interface")
            selected = participant["site_refs"]
            if interface["selection_rule"].get("status") == "unknown":
                raise ValueError("An unknown mounting selection cannot establish a qualified reference assembly")
            if len(selected) < interface["selection_rule"]["min_count"] or len({sites[ref]["side_ref"] for ref in selected}) != 1:
                raise ValueError("Reference mount violates its same-side minimum selection rule")
            if not any(set(pair) <= set(selected) for pair in interface["selection_rule"]["allowed_adjacent_pairs"]):
                raise ValueError("Reference mount lacks an allowed adjacent site pair")
            expected_sites.append(set(selected))
        actual_sites = [set(), set()]
        for pair in mount["site_pairs"]:
            for i, ref in enumerate(pair["site_refs"]):
                site = sites.get(ref)
                if (not site or ref not in expected_sites[i] or site["hole_ref"] != pair["hole_refs"][i]
                        or pair["feature_refs"][i] not in site["feature_refs"] or ref in actual_sites[i]):
                    raise ValueError("Reference pairing does not bind each actual selected site, hole and wall exactly once")
                actual_sites[i].add(ref)
            if pair["axis_distance_m"] < 0 or pair["axis_distance_m"] > 2e-5 or pair["axis_angle_rad"] < 0 or pair["axis_angle_rad"] > math.radians(.1):
                raise ValueError("Reference mount axes do not satisfy the declared measured alignment scope")
            points, normals = [], []
            for ref in pair["site_refs"]:
                site = sites[ref]
                part = parts[site["owner_ref"]]
                scale = part.get("scale", [1., 1., 1.])
                quaternion = part["quaternion"]
                magnitude = math.sqrt(sum(v*v for v in quaternion))
                quaternion = [v/magnitude for v in quaternion]
                points.append([a+b for a,b in zip(rotate(quaternion, [v*scale[i] for i,v in enumerate(site["position"])]), part["position"])])
                normal = rotate(quaternion, [-v/scale[i] for i,v in enumerate(site["entry_direction"])])
                magnitude = math.sqrt(sum(v*v for v in normal))
                normals.append([v/magnitude for v in normal])
            delta = [b-a for a,b in zip(*points)]
            cross = [delta[1]*normals[0][2]-delta[2]*normals[0][1], delta[2]*normals[0][0]-delta[0]*normals[0][2], delta[0]*normals[0][1]-delta[1]*normals[0][0]]
            measured = {"axis_distance_m": math.sqrt(sum(v*v for v in cross)),
                        "axis_angle_rad": math.acos(max(-1.,min(1.,-sum(a*b for a,b in zip(*normals))))),
                        "axial_gap_m": max(0.,sum(a*b for a,b in zip(delta,normals[0])))}
            if any(abs(pair[key]-value) > (1e-7 if key == "axis_angle_rad" else 1e-12) for key,value in measured.items()):
                raise ValueError("Reference site-pair measurement contradicts the common source Configuration")
        if actual_sites != expected_sites:
            raise ValueError("Reference mount pair mapping does not cover its selected sites")
        if len(mount["connector_roles"]) != len(mount["site_pairs"]) or {role["site_pair_index"] for role in mount["connector_roles"]} != set(range(len(mount["site_pairs"]))):
            raise ValueError("Reference mount must retain each unbound fastener role separately")
        placements = {p["part_ref"]: p for p in mount["reference_placements"]}
        if set(placements) != {p["part_ref"] for p in mount["participants"]}:
            raise ValueError("Reference mount does not retain both source placements")
        if any(any(placement[key] != parts[owner][key] for key in ("position", "quaternion", "scale")) for owner,placement in placements.items()):
            raise ValueError("Reference mount must use one shared frozen source Configuration")
    for slot in slots.values():
        owner = slot["owner_ref"]
        references(slot, owner)
        geometry = slot["geometry"]
        source = sources.get(slot["geometry_source_ref"])
        part_source = parts[owner]["sourceIds"][-1]
        if not source or source["id"] != part_source or slot["geometry_digest"] != "sha256:" + source["digest"]:
            raise ValueError("Slot opening is not bound to its exact owner's source geometry")
        if (geometry["length_m"] <= geometry["width_m"] or geometry["width_m"] <= 0
                or geometry["corner_radius_m"] <= 0 or geometry["corner_radius_m"] > geometry["width_m"]/2 + 2e-5):
            raise ValueError("Capsule opening must have a positive noncircular finite extent")
        if slot["kind"] != geometry["type"]:
            raise ValueError("Slot opening kind must match its finite measured geometry")
        if any(abs(sum(n*n for n in geometry[key])-1) > 1e-9 for key in ("normal", "major_axis")) or abs(sum(a*b for a,b in zip(geometry["normal"],geometry["major_axis"]))) > 1e-9:
            raise ValueError("Slot opening requires orthogonal unit normal and major direction")
        if root is not None:
            raw = local_path(root, source["url"]).read_bytes()
            triangle_count = struct.unpack_from("<I", raw, 80)[0]
            if any(index >= triangle_count for index in geometry["support_triangle_indices"]):
                raise ValueError("Slot witness triangle is outside its source mesh")
    expected_counts = {"mounting_sites_count": len(sites), "mounting_interfaces_count": len(interfaces), "reference_mounts_count": len(mounts), "slot_features_count": len(slots)}
    if any(knowledge["analysis"][key] != count for key,count in expected_counts.items()):
        raise ValueError("Mounting knowledge counts differ from published records")
    if set(configuration["reference_mount_refs"]) != set(mounts):
        raise ValueError("Configuration reference mounts differ from published mounting knowledge")


def validate_connection_reviews(knowledge: dict, scene: dict, root: Path | None = None) -> None:
    """Check source topology, all-pair coverage and inferred/schematic authority."""
    from itertools import combinations, product
    def indexed(items, label):
        result = {item["id"]: item for item in items}
        if len(result) != len(items):
            raise ValueError("Duplicate " + label + " identity")
        return result
    def unit(value):
        return abs(sum(v*v for v in value) - 1) <= 1e-9
    parts = indexed(scene["parts"], "review Part")
    facts = indexed(knowledge["parts"], "review knowledge Part")
    frames = indexed(knowledge["frames"], "review Frame")
    features = indexed(knowledge["features"], "review Feature")
    sites = indexed(knowledge["mounting_sites"], "review installation site")
    openings = indexed(knowledge["circular_openings"], "circular opening")
    passages = indexed(knowledge["passage_hypotheses"], "finite cavity")
    screenings = indexed(knowledge["pair_screenings"], "pair screening")
    reviews = indexed(knowledge["connection_reviews"], "connection review")
    components = indexed(knowledge["supplemental_components"], "supplemental component")
    sources = indexed(scene["sources"], "review Source")
    evidence = indexed(scene["evidence"], "review Evidence")
    observations = indexed(knowledge["reference_observations"], "review observation")
    mounts = indexed(knowledge["reference_mounts"], "review reference mount")
    configuration = knowledge["configurations"][0]["id"]
    mesh_data = {}
    def mesh(owner):
        source_id = facts[owner]["geometry_source_ref"]
        if source_id not in mesh_data:
            raw = local_path(root, sources[source_id]["url"]).read_bytes()
            count = struct.unpack_from("<I", raw, 80)[0]
            mesh_data[source_id] = [[tuple(struct.unpack_from("<12fH", raw, 84 + i*50)[j:j+3]) for j in (3, 6, 9)] for i in range(count)]
        return mesh_data[source_id]
    def support(item, owner=None):
        if any(ref not in sources for ref in item["source_refs"]) or any(ref not in evidence for ref in item["evidence_refs"]):
            raise ValueError("Connection review contains unresolved source or evidence")
        if owner is not None:
            frame = frames.get(item["frame_ref"])
            if owner not in parts or not frame or frame["owner_ref"] != owner:
                raise ValueError("Opening or cavity must resolve to its owner's measurement frame")
            source = sources[facts[owner]["geometry_source_ref"]]
            if item["source_geometry_digest"] != "sha256:" + source["digest"] or source["id"] not in item["source_refs"]:
                raise ValueError("Opening or cavity does not bind its exact source geometry")
    def point_key(point):
        return tuple(round(v / 1e-8) for v in point)
    def triangle_boundary(owner, indices):
        triangles = mesh(owner)
        if any(i >= len(triangles) for i in indices):
            raise ValueError("Opening or cavity triangle is outside its source mesh")
        edges = {}
        for i in indices:
            points = triangles[i]
            for a,b in zip(points, points[1:] + points[:1]):
                edge = tuple(sorted((point_key(a), point_key(b))))
                edges[edge] = edges.get(edge, 0) + 1
        return {edge for edge, count in edges.items() if count == 1}
    for opening in openings.values():
        owner = opening["owner_ref"]; support(opening, owner)
        geometry = opening["geometry"]
        normal, center, radius = geometry["normal"], geometry["center"], geometry["radius_m"]
        if not unit(normal) or radius <= 0 or opening["fit_max_m"] > 2e-5:
            raise ValueError("Circular opening requires a unit normal, positive radius and bounded source fit")
        boundary = geometry["boundary_vertices"]
        if point_key(boundary[0]) == point_key(boundary[-1]):
            boundary = boundary[:-1]
        if len({point_key(p) for p in boundary}) != len(boundary):
            raise ValueError("Circular opening boundary contains repeated interior points")
        radial_error = max(abs(math.sqrt(sum((p[i]-center[i])**2 for i in range(3))) - radius) for p in boundary)
        plane_error = max(abs(sum((p[i]-center[i])*normal[i] for i in range(3))) for p in boundary)
        if max(radial_error, plane_error) > opening["fit_max_m"] + 2e-8:
            raise ValueError("Circular opening measurements contradict its finite boundary")
        signed = sum(sum((a[(i+1)%3]*b[(i+2)%3]-a[(i+2)%3]*b[(i+1)%3])*normal[i] for i in range(3)) for a,b in zip(boundary, boundary[1:]+boundary[:1]))
        if signed >= 0:
            raise ValueError("Circular inner opening cannot be an exterior cap contour")
        if root is not None:
            triangle_boundary(owner, opening["support_triangle_indices"])
            triangles = mesh(owner)
            edges = {tuple(sorted((point_key(a), point_key(b)))) for i in opening["support_triangle_indices"]
                     for a,b in zip(triangles[i], triangles[i][1:] + triangles[i][:1])}
            ring_edges = {tuple(sorted((point_key(a),point_key(b)))) for a,b in zip(boundary,boundary[1:]+boundary[:1])}
            if not ring_edges <= edges:
                raise ValueError("Opening contour is not witnessed by its actual source edges")
            matching_plane = False
            for i in opening["support_triangle_indices"]:
                points = triangles[i]
                if max(abs(sum((p[j]-center[j])*normal[j] for j in range(3))) for p in points) > 2e-7:
                    continue
                a = [points[1][j]-points[0][j] for j in range(3)]
                b = [points[2][j]-points[0][j] for j in range(3)]
                n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
                length = math.sqrt(sum(v*v for v in n))
                if length > 0 and sum(n[j]*normal[j] for j in range(3))/length > .999999:
                    matching_plane = True; break
            if not matching_plane:
                raise ValueError("Opening contour normal is not witnessed by its source plane orientation")
    for passage in passages.values():
        owner = passage["owner_ref"]; support(passage, owner)
        if any(ref not in openings or openings[ref]["owner_ref"] != owner for ref in passage["opening_refs"]):
            raise ValueError("Cavity references another owner's or unresolved opening")
        geometry = passage["geometry"]
        if (not unit(geometry["axis"]) or geometry["axial_range_m"][0] >= geometry["axial_range_m"][1]
                or geometry["radius_range_m"][0] < 0 or geometry["radius_range_m"][0] > geometry["radius_range_m"][1]):
            raise ValueError("Cavity requires finite positive axial extent and ordered measured radii")
        if passage["status"] == "topology_witnessed" and (len(passage["opening_refs"]) < 2 or not passage["connectivity"]["boundary_closed"]):
            raise ValueError("A witnessed passage requires finite openings and closed source boundaries")
        if root is not None:
            edges = triangle_boundary(owner, passage["wall_triangle_indices"])
            triangles = mesh(owner)
            wall = [point for i in passage["wall_triangle_indices"] for point in triangles[i]]
            origin, axis = geometry["origin"], geometry["axis"]
            axial = [sum((p[j]-origin[j])*axis[j] for j in range(3)) for p in wall]
            radial = [math.sqrt(sum((p[j]-origin[j]-axis[j]*s)**2 for j in range(3))) for p,s in zip(wall,axial)]
            measured = {"axial_range_m": [min(axial),max(axial)], "radius_range_m": [min(radial),max(radial)]}
            if any(abs(a-b) > 3e-8 for key, values in measured.items() for a,b in zip(values,geometry[key])):
                raise ValueError("Cavity extent or radius contradicts its actual finite source wall")
            degrees = {}
            for edge in edges:
                for point in edge: degrees[point] = degrees.get(point,0)+1
            if passage["connectivity"]["boundary_closed"] and any(value != 2 for value in degrees.values()):
                raise ValueError("Cavity closed-boundary claim contradicts its finite source wall")
            if passage["status"] == "topology_witnessed":
                edge_triangles = {}
                for i in passage["wall_triangle_indices"]:
                    for a,b in zip(triangles[i],triangles[i][1:]+triangles[i][:1]):
                        edge_triangles.setdefault(tuple(sorted((point_key(a),point_key(b)))),[]).append(i)
                adjacency = {i:set() for i in passage["wall_triangle_indices"]}
                for selected in edge_triangles.values():
                    if len(selected) > 2:
                        raise ValueError("Witnessed cavity cannot contain a nonmanifold source wall")
                    if len(selected) == 2:
                        a,b=selected; adjacency[a].add(b); adjacency[b].add(a)
                stack=[passage["wall_triangle_indices"][0]]; connected=set(stack)
                while stack:
                    for neighbour in adjacency[stack.pop()]:
                        if neighbour not in connected: connected.add(neighbour); stack.append(neighbour)
                if len(connected) != len(adjacency):
                    raise ValueError("Witnessed cavity cannot join unrelated source wall components")
    declaration = next((json.loads(source["text"]) for source in scene["sources"] if source["id"] == "SRC-MD-ASSEMBLY-KNOWLEDGE"), None)
    threshold = declaration["connection_review"]["proximity_threshold_m"] if declaration else .002
    world_bounds = {}
    if root is not None:
        for identifier, part in parts.items():
            points = [point for triangle in mesh(identifier) for point in triangle]
            low = [min(p[i] for p in points) for i in range(3)]; high = [max(p[i] for p in points) for i in range(3)]
            q = part["quaternion"]; magnitude = math.sqrt(sum(v*v for v in q)); q = [v/magnitude for v in q]
            corners = [[v + part["position"][i] for i,v in enumerate(rotate(q,[point[i]*part["scale"][i] for i in range(3)]))] for point in product(*zip(low,high))]
            world_bounds[identifier] = ([min(p[i] for p in corners) for i in range(3)], [max(p[i] for p in corners) for i in range(3)])
    expected_pairs = {tuple(sorted(pair)) for pair in combinations(parts,2)}
    observation_pairs = {tuple(sorted(p["part_ref"] for p in item["participants"])) for item in observations.values()}
    reference_pairs = {tuple(sorted(p["part_ref"] for p in item["participants"])) for item in mounts.values()}
    actual_pairs = set()
    for screening in screenings.values():
        pair = tuple(sorted(screening["part_refs"]))
        if pair in actual_pairs or pair not in expected_pairs or screening["configuration_ref"] != configuration:
            raise ValueError("Pair screening does not uniquely cover source Part pairs")
        actual_pairs.add(pair)
        if screening["threshold_m"] != threshold:
            raise ValueError("Pair screening threshold differs from its declared bounded scope")
        if root is not None:
            a,b = [world_bounds[ref] for ref in pair]
            distance = math.sqrt(sum(max(a[0][i]-b[1][i],b[0][i]-a[1][i],0.)**2 for i in range(3)))
            if abs(distance-screening["distance_m"]) > 3e-8:
                raise ValueError("Pair separation contradicts the shared source configuration")
        required = screening["distance_m"] <= threshold or pair in observation_pairs or pair in reference_pairs
        if (screening["status"] == "review_required") != required or required != (screening["review_ref"] is not None):
            raise ValueError("Pair screening does not preserve its bounded review decision")
        if required:
            review = reviews.get(screening["review_ref"])
            if not review or review["screening_ref"] != screening["id"] or {p["part_ref"] for p in review["participants"]} != set(pair):
                raise ValueError("Pair screening and connection review are not mutually linked")
    if actual_pairs != expected_pairs:
        raise ValueError("All source Part pairs must be explicitly screened, including separated bounds")
    for review in reviews.values():
        support(review)
        screening = screenings.get(review["screening_ref"])
        if (not screening or screening["review_ref"] != review["id"] or review["configuration_ref"] != configuration
                or {p["part_ref"] for p in review["participants"]} != set(screening["part_refs"])):
            raise ValueError("Connection review is outside its source-pair screening")
        for participant in review["participants"]:
            owner = participant["part_ref"]
            for key, records in (("feature_refs", features),("opening_refs", openings),("site_refs",sites)):
                if any(ref not in records or records[ref]["owner_ref"] != owner for ref in participant[key]):
                    raise ValueError("Review participant contains another owner's or unresolved geometry")
        owners = set(screening["part_refs"])
        for ref in review["geometry_observation_refs"]:
            if ref not in observations or {p["part_ref"] for p in observations[ref]["participants"]} != owners:
                raise ValueError("Connection review references unrelated geometry observations")
        for ref in review["reference_mount_refs"]:
            if ref not in mounts or {p["part_ref"] for p in mounts[ref]["participants"]} != owners:
                raise ValueError("Connection review references an unrelated standard assembly")
        if (review["status"] == "reference_supported") != bool(review["reference_mount_refs"]):
            raise ValueError("Reference-supported review requires an actual supplied reference mount")
        for role in review["role_paths"]:
            if any(ref not in evidence for ref in role["evidence_refs"]):
                raise ValueError("Connection role contains unresolved evidence")
        for path in review["role_paths"] + review["alternatives"]:
            if any(ref not in components or components[ref]["review_ref"] != review["id"] for ref in path["component_refs"]):
                raise ValueError("Connection path references another review's schematic components")
    for component in components.values():
        support(component)
        if component["id"] in parts or component["review_ref"] not in reviews:
            raise ValueError("Schematic component cannot replace a source Part or an unresolved review")
        pose = component["pose"]
        if not unit(pose["quaternion"]) or any(value <= 0 for value in pose["scale"]):
            raise ValueError("Schematic component requires a finite unit pose")
        geometry = component["geometry"]
        if geometry["type"] != component["kind"]:
            raise ValueError("Schematic component kind contradicts its illustrative geometry")
        if geometry["type"] == "cap" and geometry["inner_radius_m"] >= geometry["outer_radius_m"]:
            raise ValueError("Illustrative cap requires a positive annular extent")
    for key, records in (("circular_openings", openings),("passage_hypotheses",passages),("pair_screenings",screenings),("connection_reviews",reviews),("supplemental_components",components)):
        if knowledge["analysis"][key+"_count"] != len(records):
            raise ValueError("Connection-review analysis count differs from its published records")
    if knowledge["schema"] in PIN_FIT_PROFILES:
        validate_pin_hole_fits(knowledge, scene)
    if knowledge["schema"] == PROFILE:
        from .connector_paths import validate as validate_connector_paths
        validate_connector_paths(knowledge, scene)


def validate_pin_hole_fits(knowledge: dict, scene: dict) -> None:
    """Enforce 1.7 location measurements and separate optional illustrations."""
    from . import connection_review
    def indexed(items, label):
        result = {item["id"]: item for item in items}
        if len(result) != len(items):
            raise ValueError("Duplicate " + label + " identity")
        return result
    parts = indexed(scene["parts"], "pin-fit Part")
    features = indexed(knowledge["features"], "pin-fit Feature")
    sites = indexed(knowledge["mounting_sites"], "pin-fit site")
    reviews = indexed(knowledge["connection_reviews"], "pin-fit review")
    components = indexed(knowledge["supplemental_components"], "pin-fit supplement")
    fits = indexed(knowledge["pin_hole_fits"], "pin/hole fit")
    configuration = knowledge["configurations"][0]["id"]
    sources = {source["id"] for source in scene["sources"]}
    evidence = {item["id"] for item in scene["evidence"]}
    for component in components.values():
        review = reviews.get(component["review_ref"])
        if review is None or component.get("usage") not in {"reference_connector", "unverified_alternative"}:
            raise ValueError("Supplemental component requires explicit supported usage")
        roles = {ref for role in review["role_paths"] for ref in role["component_refs"]}
        alternatives = {ref for item in review["alternatives"] for ref in item["component_refs"]}
        if component["usage"] == "unverified_alternative":
            if component["id"] in roles or component["id"] not in alternatives:
                raise ValueError("An unverified alternative cannot be bound to a connection role")
        elif (not review["reference_mount_refs"] or component["id"] not in roles
              or component["parameter_basis"] != "reference_role_with_illustrative_dimensions"):
            raise ValueError("Reference connector requires an actual supplied reference mounting role")
    fit_reviews = {fit["review_ref"] for fit in fits.values()}
    for review in reviews.values():
        if review["id"] not in fit_reviews and not review["reference_mount_refs"]:
            if any(role["role"] == "location" and role["status"] != "unresolved" for role in review["role_paths"]):
                raise ValueError("Unqualified geometry cannot supply an installation-location role")
    for fit in fits.values():
        review = reviews.get(fit["review_ref"])
        if not review or fit["configuration_ref"] != configuration or review["configuration_ref"] != configuration:
            raise ValueError("Pin/hole fit must bind its actual review and source Configuration")
        if {p["part_ref"] for p in fit["participants"]} != {p["part_ref"] for p in review["participants"]}:
            raise ValueError("Pin/hole fit cannot borrow another review's participants")
        if (fit["status"] != "source_pose_geometric_fit" or fit["inference_scope"] != "installation_location_only"
                or fit["grouping"] != {"kind": "reference_pair", "selection_status": "unknown"}):
            raise ValueError("Measured pin pairs cannot invent physical selection or retaining rules")
        if fit["assessments"] != {"location": "geometric_support", **{key: "unknown" for key in ("retention", "load_capacity", "mechanical", "engineering", "task", "completion")}}:
            raise ValueError("Pin/hole geometry cannot establish retention, loads or completion")
        if any(ref not in sources for ref in fit["source_refs"]) or any(ref not in evidence for ref in fit["evidence_refs"]):
            raise ValueError("Pin/hole fit has an unresolved source or evidence reference")
        if len(fit["participants"]) != 2 or [p["role"] for p in fit["participants"]] != ["pin_carrier", "housing_hole_carrier"]:
            raise ValueError("Pin/hole group requires ordered pin and housing participants")
        owners = [p["part_ref"] for p in fit["participants"]]
        if len(set(owners)) != 2 or any(owner not in parts for owner in owners):
            raise ValueError("Pin/hole group requires two actual source Parts")
        if len(fit["pairs"]) != 2 or len({p["pin_site_ref"] for p in fit["pairs"]}) != 2 or len({p["hole_site_ref"] for p in fit["pairs"]}) != 2:
            raise ValueError("Reference pin group requires a one-to-one two-member mapping")
        for pair in fit["pairs"]:
            pin, hole = sites.get(pair["pin_site_ref"]), sites.get(pair["hole_site_ref"])
            if (not pin or not hole or pin["owner_ref"] != owners[0] or hole["owner_ref"] != owners[1]
                    or pin.get("site_kind") != "integral_pin" or pin["role"] != "mounting_feature" or hole["role"] != "housing_mount"
                    or pair["pin_feature_ref"] not in pin["feature_refs"] or not set(pair["hole_feature_refs"]) <= set(hole["feature_refs"])):
                raise ValueError("Pin/hole pair must bind its actual finite opposing sites and Features")
            pin_feature = features.get(pair["pin_feature_ref"])
            if (not pin_feature or pin_feature["owner_ref"] != owners[0] or pin_feature["geometry"]["type"] != "conical_frustum"
                    or any(ref not in features or features[ref]["owner_ref"] != owners[1]
                           or features[ref]["kind"] != "bore_wall" or features[ref]["geometry"]["type"] != "cylinder"
                           for ref in pair["hole_feature_refs"])):
                raise ValueError("Pin/hole measurements cannot borrow another owner's or unrelated finite geometry")
            measured = connection_review.measure_pin_hole_pair(pin, hole, features, parts)
            if measured != pair:
                raise ValueError("Pin/hole finite measurements contradict the source geometry and common pose")
        expected_pin_features = {pair["pin_feature_ref"] for pair in fit["pairs"]}
        expected_hole_features = {ref for pair in fit["pairs"] for ref in pair["hole_feature_refs"]}
        if (set(fit["participants"][0]["feature_refs"]) != expected_pin_features
                or set(fit["participants"][1]["feature_refs"]) != expected_hole_features
                or set(fit["participants"][0]["site_refs"]) != {pair["pin_site_ref"] for pair in fit["pairs"]}
                or set(fit["participants"][1]["site_refs"]) != {pair["hole_site_ref"] for pair in fit["pairs"]}):
            raise ValueError("Pin/hole location participants cannot include outer openings or unrelated Features")
        if "pin_hole_source_fit" not in review["basis"] or "coaxial_axis_opening" in review["basis"]:
            raise ValueError("Outer coaxial openings cannot supply the pin/hole location warrant")
        for role in review["role_paths"]:
            if role["role"] == "location" and (role["status"] != "hypothesis" or role["component_refs"] or not set(role["evidence_refs"]) <= set(fit["evidence_refs"])):
                raise ValueError("Pin/hole location must remain a geometry-supported inference without a connector alternative")
    declaration = next((json.loads(source["text"]) for source in scene["sources"] if source["id"] == "SRC-MD-ASSEMBLY-KNOWLEDGE"), None)
    tolerance = declaration["connection_review"]["axis_alignment_tolerance_m"] if declaration else connection_review.patterns.FIT_M
    expected = connection_review.pin_hole_fit_records({"features": knowledge["features"], "mounting_sites": knowledge["mounting_sites"], "connection_reviews": knowledge["connection_reviews"]}, scene, tolerance)
    if knowledge["pin_hole_fits"] != expected or knowledge["analysis"]["pin_hole_fits_count"] != len(fits):
        raise ValueError("Pin/hole grouping, spacing or coverage differs from the actual reference pairs")


def validate(root: Path) -> dict:
    if root.is_symlink() or (hasattr(root, "is_junction") and root.is_junction()):
        raise ValueError("DKP must be a real directory")
    root = root.resolve(strict=True)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("DKP must be a real directory")
    manifest = read_json(root / "manifest.json")
    schema_names, capabilities = profile_contract(manifest.get("profile"))
    profile = manifest["profile"]
    validate_shape(manifest, read_json(SKILL / "schemas" / schema_names[0]))
    if manifest["entrypoints"] != ENTRYPOINTS or manifest["capabilities"] != capabilities:
        raise ValueError("Unknown entrypoints or unsupported capability declaration")
    if manifest["ontology"]["version"] != ONTOLOGY:
        raise ValueError("Unsupported profile or ontology; legacy core is not accepted")
    unsigned = {key: value for key, value in manifest.items() if key != "package_digest"}
    if digest(canonical(unsigned)) != manifest["package_digest"]:
        raise ValueError("Package manifest digest mismatch")
    records = manifest["files"]
    names = [record["path"] for record in records]
    if len(names) != len(set(names)) or len(names) > 1200:
        raise ValueError("Duplicate or excessive package files")
    if any(record["bytes"] > 512 * 1024 * 1024 for record in records) or sum(record["bytes"] for record in records) > 1100 * 1024 * 1024:
        raise ValueError("Source-model package exceeds its bounded byte budget")
    actual = set()
    for index, path in enumerate(root.rglob("*")):
        if index > 2400:
            raise ValueError("Source-model package contains excessive filesystem entries")
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise ValueError("Symlinks are not allowed in DKP")
        if path.is_file():
            actual.add(path.relative_to(root).as_posix())
    if actual != set(names) | {"manifest.json"}:
        raise ValueError("Unlisted or missing package file; data-only packages have no embedded App")
    for record in records:
        relative = record["path"]
        if PurePosixPath(relative).parts[0] not in {"inputs", "sources", "knowledge", "indexes", "schemas"}:
            raise ValueError(f"Unsupported package directory: {relative}")
        path = local_path(root, relative)
        if not path.is_file() or path.stat().st_size != record["bytes"] or digest(path.read_bytes()) != record["sha256"]:
            raise ValueError(f"File integrity mismatch: {relative}")
    required = set(ENTRYPOINTS.values()) | {"inputs/materials.zip", "sources/SRC-MD-MJCF.xml", "sources/SRC-PSOP-ONTOLOGY.md"}
    if not required <= set(names):
        raise ValueError("Missing a required source or data entrypoint")
    for key, relative in ENTRYPOINTS.items():
        local_path(root, relative)
    ontology_path = local_path(root, manifest["ontology"]["path"])
    if manifest["ontology"]["path"] != "sources/SRC-PSOP-ONTOLOGY.md" or digest(ontology_path.read_bytes()) != manifest["ontology"]["sha256"]:
        raise ValueError("Ontology definition digest mismatch")
    if ONTOLOGY.encode() not in ontology_path.read_bytes():
        raise ValueError("Ontology snapshot is not draft.4")
    archive = local_path(root, manifest["inputs"]["archive"]["path"])
    if manifest["inputs"]["archive"]["path"] != "inputs/materials.zip" or digest(archive.read_bytes()) != manifest["inputs"]["archive"]["sha256"]:
        raise ValueError("Archive input lock mismatch")
    assembly_input = manifest["inputs"].get("assembly_knowledge")
    assembly_path = None
    if assembly_input is not None:
        if profile not in MOUNTING_PROFILES or assembly_input["path"] != "sources/SRC-MD-ASSEMBLY-KNOWLEDGE.json":
            raise ValueError("Unsupported assembly knowledge input lock")
        assembly_path = local_path(root, assembly_input["path"])
        if digest(assembly_path.read_bytes()) != assembly_input["sha256"]:
            raise ValueError("Assembly knowledge input lock mismatch")
    supporting_paths = None
    if profile in REVIEW_PROFILES:
        if assembly_path is None and manifest["inputs"].get("supporting_documents"):
            raise ValueError("Supporting documents require an explicit assembly declaration")
        if assembly_path is not None:
            supporting_paths = supporting_input_paths(manifest["inputs"].get("supporting_documents", []), read_json(assembly_path), root, published=True)
    if manifest["adapter"] != {"id": "microduck-mjcf/1.0", "commit": COMMIT, "xml_sha256": XML_SHA256}:
        raise ValueError("Unknown source adapter lock")
    # The producer digest is provenance, not the identity of the installed
    # validator. Historical snapshots remain valid after compatible code fixes.
    # Compatibility is governed by the explicit package/profile/adapter IDs.
    scene = read_json(root / ENTRYPOINTS["scene"])
    knowledge = read_json(root / ENTRYPOINTS["knowledge"])
    validate_shape(knowledge, read_json(SKILL / "schemas" / schema_names[1]))
    if profile != LEGACY_PROFILE:
        validate_analysis(knowledge, scene, root)
    with tempfile.TemporaryDirectory(prefix="psop-v2-verify-") as temporary:
        replay = project(archive, Path(temporary), ontology_path, xml_path=root / "sources/SRC-MD-MJCF.xml",
                         device_id=manifest["device"]["id"], title=manifest["device"]["name"])
        assembly = capture_assembly_knowledge(replay, Path(temporary), assembly_path, profile, supporting_paths)
        enrich_scene(replay, Path(temporary), profile, assembly)
    replay["meta"].update({"version": manifest["package_version"], "snapshot": f"{manifest['package_id']}@{manifest['package_version']}",
        "generatedAt": manifest["created_at"], "packageId": manifest["package_id"], "packageVersion": manifest["package_version"],
        "packageDigest": None, "dkpSchema": SCHEMA, "inputKind": "dkp", "capabilities": capabilities})
    if scene != replay:
        raise ValueError("Scene index is not the deterministic source-reference projection")
    if knowledge != knowledge_for(replay, manifest["device"]["id"], manifest["package_version"], profile):
        raise ValueError("Knowledge does not match the supported model-domain source profile")
    if read_json(root / ENTRYPOINTS["sources"]) != {"schema": "psop.build.sources/2.0-draft.1", "items": replay["sources"]}:
        raise ValueError("Source registry mismatch")
    if read_json(root / ENTRYPOINTS["evidence"]) != {"schema": "psop.build.evidence/2.0-draft.1", "items": replay["evidence"]}:
        raise ValueError("Evidence registry mismatch")
    if read_json(root / ENTRYPOINTS["gaps"]) != gaps_for(manifest["device"]["id"], profile) or manifest["counts"] != replay["meta"]["counts"]:
        raise ValueError("Gap or count mismatch")
    for source in replay["sources"]:
        path = local_path(root, source["url"])
        if digest(path.read_bytes()) != source["digest"] or path.stat().st_size != source["bytes"]:
            raise ValueError(f"Source registry byte identity mismatch: {source['id']}")
    expected_files = set(ENTRYPOINTS.values()) | {"inputs/materials.zip"} | {source["url"] for source in replay["sources"]}
    for schema_name in schema_names:
        schema_path = SKILL / "schemas" / schema_name
        relative = f"schemas/{schema_path.name}"
        expected_files.add(relative)
        if local_path(root, relative).read_bytes() != schema_path.read_bytes():
            raise ValueError(f"Published schema differs from the locked source-model contract: {relative}")
    if set(names) != expected_files:
        raise ValueError("The source-model package contains an unsupported extra artifact")
    return {"ok": True, "valid": True, "schema": SCHEMA, "profile": profile,
            "package_id": manifest["package_id"], "package_version": manifest["package_version"],
            "package_digest": manifest["package_digest"], "device": manifest["device"],
            "counts": manifest["counts"], "capabilities": manifest["capabilities"]}
