"""Accept a registered release through its actual API and preserved source bytes."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "skills/psop-build/scripts"))
from psop_build_v2.connection_analysis import analysis_coverage, independent_acceptance


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch(route):
    with build_opener(ProxyHandler({})).open("http://127.0.0.1:8780" + route, timeout=330) as response:
        return json.load(response)


def verify():
    registry = read(ROOT / "workspaces/registry.json")
    workspace = next(w for w in registry["workspaces"] if w["id"] == "microduck")
    snapshot = next(s for s in workspace["snapshots"] if s["id"] == workspace["selectedSnapshotId"])
    package = (ROOT / "workspaces" / snapshot["path"]).resolve()
    baseline = read(ROOT / "build/stability-review/baseline-view.json")
    original_snapshot = next(s for s in workspace["snapshots"] if s["id"] == "dkp-1c8eeda600249ce33b99")
    original_package = (ROOT / "workspaces" / original_snapshot["path"]).resolve()
    original_manifest = read(original_package / "manifest.json")
    original_scene = read(original_package / original_manifest["entrypoints"]["scene"])
    base = "/api/workspaces/microduck/snapshots/" + snapshot["id"]
    data, manifest, knowledge = (fetch(base + "/" + kind) for kind in ("view", "manifest", "knowledge"))
    assert data["meta"]["validation"] == {"valid": True, "profile": "psop.hardware.source-model/1.11"}
    assert manifest["package_digest"] == snapshot["packageDigest"] == data["meta"]["packageDigest"]
    assert snapshot["id"] == "dkp-" + manifest["package_digest"][:20]
    for field in ("connection_review_findings", "installation_hypotheses", "connection_relation_contexts", "connection_analysis_coverage"):
        assert knowledge[field] == data["analysis"][field], "API view and knowledge disagree: " + field
    parts = {p["id"]: p for p in data["parts"]}
    assert len(parts) == 70
    for original in baseline["parts"]:
        current = parts[original["id"]]
        assert {k: v for k, v in current.items() if k != "geometryUrl"} == {k: v for k, v in original.items() if k != "geometryUrl"}
        assert current["geometryUrl"].split("/assets/")[1] == original["geometryUrl"].split("/assets/")[1]
    sources = {s["id"]: s for s in data["sources"]}
    preserved = []
    for original in baseline["sources"]:
        if original["id"] == "SRC-INTERFACE-INVESTIGATION":
            continue  # A new, separately versioned investigation is the new input.
        current = sources[original["id"]]
        assert current["digest"] == original["digest"], "Original source SHA changed: " + original["id"]
        relative = current["url"].split("/assets/")[1]
        from urllib.parse import unquote
        assert hashlib.sha256((package / unquote(relative)).read_bytes()).hexdigest() == original["digest"]
        preserved.append(original["id"])
    for field in ("features", "logical_holes", "circular_openings", "passage_hypotheses", "mounting_interfaces", "reference_mounts", "pin_hole_fits"):
        assert data["analysis"][field] == original_scene["analysis"][field], "Source geometry or installation definition changed: " + field
    hypotheses = {h["id"]: h for h in data["analysis"]["installation_hypotheses"]}
    for original in original_scene["analysis"]["installation_hypotheses"]:
        assert hypotheses[original["id"]] == original, "An original hypothesis changed"
    findings = data["analysis"]["connection_review_findings"]
    assert sorted(f["review_ref"] for f in findings) == sorted(r["id"] for r in data["analysis"]["connection_reviews"])
    coverage = data["analysis"]["connection_analysis_coverage"]
    assert sorted(p["part_ref"] for p in coverage["parts"]) == sorted(parts)
    investigation = read(ROOT / "device-materials/interface-review/microduck-connection-analysis.json")
    accepted = independent_acceptance(data["analysis"], investigation)
    assert accepted["missing"] == []
    required = next(item for item in accepted["matches"] if item["hypothesis_refs"])
    deleted_id = required["hypothesis_refs"][0]
    mutated = {**data["analysis"], "installation_hypotheses": [h for h in hypotheses.values() if h["id"] != deleted_id]}
    mutated["connection_analysis_coverage"] = analysis_coverage(mutated, data, investigation)
    deleted = independent_acceptance(mutated, investigation)
    assert required["id"] in deleted["missing"], "Deleting a required published relationship was not detected"
    altered_findings = [{**f, "work_status": "not_investigated", "actions": [], "findings": [], "mechanism_candidates": [], "roles": [], "hypothesis_refs": [], "next_actions": ["Inspect later"]} if f["id"] == required["finding_ref"] else f for f in findings]
    generic = {**data["analysis"], "connection_review_findings": altered_findings}
    generic["connection_analysis_coverage"] = analysis_coverage(generic, data, investigation)
    degraded = independent_acceptance(generic, investigation)
    assert required["id"] in degraded["missing"], "Generic next actions replaced a required explanation without detection"
    for old_snapshot in workspace["snapshots"][:-1]:
        old_package = (ROOT / "workspaces" / old_snapshot["path"]).resolve()
        assert read(old_package / "manifest.json")["package_digest"] == old_snapshot["packageDigest"]
    report = {"valid": True, "meta": data["meta"], "snapshot": snapshot["id"], "package": str(package),
        "preserved": {"parts_and_source_placements": 70, "original_sources_with_exact_sha": len(preserved), "original_hypotheses": 3, "geometry_and_installation_collections_equal": True, "historical_snapshots": len(workspace["snapshots"]) - 1},
        "coverage": {k: v for k, v in coverage.items() if k not in {"parts", "unreviewed_geometric_pairs"}},
        "independent_mutations": {"deleted_hypothesis": deleted_id, "deletion_missing": deleted["missing"], "generic_actions_missing": degraded["missing"], "coverage_recomputed": True},
        "six_hip_results": [f for f in findings if any(p["part_ref"] == "part:microduck:fa9ee2f71faafb88" for p in f["participants"])]}
    query_path = ROOT / "build/stability-review/knowledge-query.json"
    if query_path.is_file():
        query = read(query_path)
        assert query["ok"] and not query["execution_performed"]
        assert query["package"]["package_digest"] == snapshot["packageDigest"]
        report["knowledge_query"] = {"package": query["package"], "status": query["status"], "execution_performed": False,
            "finding_refs": [f["id"] for f in query["connection_review_findings"]], "hypothesis_refs": [h["id"] for h in query["installation_hypotheses"]]}
    out = ROOT / "build/stability-review/release-acceptance.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in {"six_hip_results", "meta"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    verify()
