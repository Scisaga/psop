"""Read-only query dispatch/reference verification on an already validated DKP.

Two preceding successful unmodified _dkp_query calls performed complete validate.
This verifier reuses that proof only while the canonical manifest and every
registered file's contained path, byte count and SHA are unchanged. Production
query code is not modified; this is not five independent full CLI validations.
"""
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

sys.stdout.reconfigure(encoding="utf8")
repo = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo / "skills/psop-build/scripts"))
from psop_build_v2 import package as build

folder = repo / "build/interface-selection/queries"
root = repo / "build/microduck/source-1.10/microduck-1.dkp"
digest = "1c8eeda600249ce33b99ec622417a744d5cdaf43a512f1495a4780ae0030cb00"
manifest_raw = (root / "manifest.json").read_bytes()
manifest_sha = build.digest(manifest_raw)
manifest = json.loads(manifest_raw)
assert manifest["package_digest"] == digest
assert build.digest(build.canonical({k: v for k, v in manifest.items() if k != "package_digest"})) == digest

previous = [folder / "right-shell-neck-four.query.json", folder / "right-left-shell-closure.query.json"]
for output in previous:
    result = json.loads(output.read_text(encoding="utf8"))
    assert result["ok"] is True and result["package"]["package_digest"] == digest
    assert result["package"]["profile"] == "psop.hardware.source-model/1.10"
    assert result["execution_performed"] is False

checks = []


def immutable_validation(path):
    selected = Path(path).resolve(strict=True)
    assert selected == root.resolve(strict=True)
    raw = (root / "manifest.json").read_bytes()
    assert build.digest(raw) == manifest_sha
    value = json.loads(raw)
    assert value["package_digest"] == digest
    assert build.digest(build.canonical({k: v for k, v in value.items() if k != "package_digest"})) == digest
    entries = {entry["path"] for entry in value["files"]}
    actual = {item.relative_to(root).as_posix() for item in root.rglob("*") if item.is_file()} - {"manifest.json"}
    assert actual == entries
    for entry in value["files"]:
        file = build.local_path(root, entry["path"])
        content = file.read_bytes()
        assert len(content) == entry["bytes"]
        assert build.digest(content) == entry["sha256"]
    checks.append({"manifest_sha256": manifest_sha, "package_digest": digest, "files_checked": len(entries),
        "path_set_checked": True, "contained_paths_checked": True, "bytes_checked": True, "sha256_checked": True})
    return {"ok": True, "valid": True, "schema": value["schema"], "profile": value["profile"],
        "package_id": value["package_id"], "package_version": value["package_version"], "package_digest": digest,
        "device": value["device"], "counts": value["counts"], "capabilities": value["capabilities"]}


spec = importlib.util.spec_from_file_location("psop_simulate", repo / "skills/psop-simulate/scripts/psop_simulate.py")
simulate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(simulate)
query_sha = build.digest((repo / "skills/psop-simulate/scripts/psop_simulate.py").read_bytes())
right = "part:microduck:9d70b219a5533bf1"
cases = [
    ("right-shell-neck-four", right, "part:microduck:4cef8bb24d37fe6e", "installation-hypothesis:right-shell-neck-four"),
    ("right-left-shell-closure", right, "part:microduck:e27cbdd6c07a264e", "installation-hypothesis:right-left-shell-closure"),
    ("bearing-roll-housing-pair", "part:microduck:cb253f38c818b9d8", "part:microduck:cd6d48fccc95df41", "installation-hypothesis:bearing-roll-housing-pair"),
    ("right-shell-z-unsupported-counterpart", right, "part:microduck:78cf36c41e4fde06", None),
    ("unrelated-shell-speaker", right, "part:microduck:22f2cd114e324ec5", None),
]
original_validate = build.validate
build.validate = immutable_validation
summary = []
try:
    for label, a, b, expected in cases:
        raw = folder / (label + ".query.json")
        if label in {"right-shell-neck-four", "right-left-shell-closure"}:
            immutable_validation(root)
            result = json.loads(raw.read_text(encoding="utf8"))
            basis = "preceding_complete_validate_and_unmodified_query"
        else:
            result = simulate._dkp_query(root, a, b)
            raw.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
            basis = "immutable_bytes_validation_cache_and_unmodified_query"
        hypotheses = result["installation_hypotheses"]
        assert result["execution_performed"] is False and result["functional_interfaces"] == []
        assert result["assessment"] == {"mechanical": "unknown", "engineering": "unknown", "task": "unknown", "completion": "unknown"}
        if expected:
            assert result["status"] == "installation_hypotheses"
            assert [h["id"] for h in hypotheses] == [expected]
            source_ids = {s["id"] for s in result["geometry_context"]["sources"]}
            evidence_ids = {e["id"] for e in result["geometry_context"]["evidence"]}
            structure_ids = {c["id"] for c in result["structure_candidates"]}
            for hypothesis in hypotheses:
                assert set(hypothesis["source_refs"]) <= source_ids
                assert set(hypothesis["evidence_refs"]) <= evidence_ids
                assert all(set(p["structure_refs"]) <= structure_ids for p in hypothesis["participants"])
                assert next(r for r in hypothesis["roles"] if r["role"] == "retention")["status"] == "unknown"
        else:
            assert hypotheses == []
        z_record = next((r for r in result["investigation_records"] if r["id"] == "investigation:right-shell-z-boss"), None)
        if label == "right-shell-z-unsupported-counterpart":
            assert z_record and z_record["evidence_status"] == "insufficient" and z_record["hypothesis_refs"] == []
        summary.append({"case": label, "part_a": a, "part_b": b, "status": result["status"], "reason": result["reason"],
            "hypothesis_refs": [h["id"] for h in hypotheses],
            "hypothesis_provenance": [{"id": h["id"], "source_refs": h["source_refs"], "evidence_refs": h["evidence_refs"]} for h in hypotheses],
            "source_count": len(result["geometry_context"]["sources"]), "evidence_count": len(result["geometry_context"]["evidence"]),
            "execution_performed": result["execution_performed"], "assessment": result["assessment"],
            "functional_interfaces": result["functional_interfaces"], "z_boss_evidence_status": z_record["evidence_status"] if z_record else None,
            "raw_output_path": raw.relative_to(repo).as_posix(), "validation_basis": basis, "file_check": checks[-1]})
        print(json.dumps({"case": label, "status": result["status"], "hypotheses": [h["id"] for h in hypotheses], "execution_performed": False}), flush=True)
finally:
    build.validate = original_validate
assert build.digest((repo / "skills/psop-simulate/scripts/psop_simulate.py").read_bytes()) == query_sha
report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "package_digest": digest, "query_script_sha256": query_sha,
    "validation_scope": "The first two successful unmodified queries performed complete package.validate. The remaining three reuse that proof after checking the unchanged manifest, exact contained path set and every registered file's bytes/SHA. This is not five independent full CLI validations.",
    "execution_scope": "All five exercise read-only static query dispatch and references; no assembly, retaining, engineering or training execution.", "cases": summary,
    "assertions": "All five cases passed expected hypothesis/refusal, source/evidence/structure reference and execution-boundary assertions."}
(folder / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
