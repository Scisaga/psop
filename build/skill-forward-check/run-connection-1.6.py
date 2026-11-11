"""Independent documented-CLI trial; no producer or consumer implementation imports."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PACKAGE = REPO / "build/v2/microduck/packages/microduck-20261105225147-55d95fd0.dkp"
OUTPUT = REPO / "build/skill-forward-check/connection-1.6"
CLI = REPO / "skills/psop-simulate/scripts/psop_simulate.py"
EXPECTED_DIGEST = "5efbfb99c188c4d367c5cdccced13c0ab8e609d4d36e4626dfa0a8e900cdb9ae"


def write(name, value):
    (OUTPUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def ledger():
    return [{"path": p.relative_to(PACKAGE).as_posix(), "bytes": p.stat().st_size,
             "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(PACKAGE.rglob("*")) if p.is_file()]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def ledger_digest(items):
    return hashlib.sha256(json.dumps(items, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


OUTPUT.mkdir(parents=True, exist_ok=False)
before = ledger()
write("inputs-before.json", before)
commands = []


def run(name, arguments, output=None):
    args = [sys.executable, "-B", str(CLI), *arguments]
    if output:
        args += ["--output", str(OUTPUT / output)]
    started = time.monotonic()
    result = subprocess.run(args, cwd=REPO, capture_output=True, text=True, encoding="utf-8")
    record = {"name": name, "argv": args, "exit_code": result.returncode,
              "elapsed_seconds": round(time.monotonic() - started, 3),
              "stdout_bytes": len(result.stdout.encode("utf-8")),
              "stdout_sha256": hashlib.sha256(result.stdout.encode("utf-8")).hexdigest(),
              "stderr": result.stderr}
    commands.append(record)
    write("commands.json", commands)
    if result.returncode:
        (OUTPUT / (name + ".failure.txt")).write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
        raise RuntimeError(name + " failed")
    if output:
        parsed = read(OUTPUT / output)
        assert parsed == json.loads(result.stdout)
        print(json.dumps({"completed": name, "seconds": record["elapsed_seconds"], "status": parsed["status"]}), flush=True)
        return parsed
    (OUTPUT / (name + ".txt")).write_text(result.stdout, encoding="utf-8", newline="\n")
    return result.stdout


run("doctor", ["doctor"])
run("query-help", ["query", "--help"])
thigh = run("right-thigh-servo", ["query", "--dkp", str(PACKAGE), "--part-a", "part:microduck:e40b9945707505e1",
            "--part-b", "part:microduck:08c5ade0f3fd37db"], "right-thigh-servo-query.json")
leg = run("standard-leg-servo", ["query", "--dkp", str(PACKAGE), "--part-a", "part:microduck:7f4fefc3c6de90f1",
          "--part-b", "part:microduck:0820b4025f26a004"], "standard-leg-servo-query.json")

manifest = read(PACKAGE / "manifest.json")
knowledge = read(PACKAGE / "knowledge/entities.json")
scene = read(PACKAGE / "indexes/scene.json")
assert manifest["profile"] == "psop.hardware.source-model/1.6"
assert manifest["package_digest"] == EXPECTED_DIGEST
assert len(before) == 71
assert len(knowledge["parts"]) == 70
assert len(knowledge["pair_screenings"]) == 2415
assert len({tuple(sorted(p["part_refs"])) for p in knowledge["pair_screenings"]}) == 2415
assert len(knowledge["supplemental_components"]) == 12
assert len(knowledge["reference_mounts"]) == 2
assert knowledge["interface_connections"] == []
assert len(scene["sources"]) == 62 and len(scene["evidence"]) == 217
part_ids = {p["id"] for p in knowledge["parts"]}
for result in (thigh, leg):
    assert result["basis"] == "published_connection_reviews"
    assert result["package"]["package_digest"] == EXPECTED_DIGEST
    assert result["functional_interfaces"] == []
    assert result["installation_definitions"]
    assert result["execution_performed"] is False
    assert result["scope"]["enumeration_performed"] is False
    assert result["scope"]["source_pair_screenings"] == 2415
    assert len(result["pair_screenings"]) == 1 and len(result["connection_reviews"]) == 1
    assert all(v == "unknown" for v in result["assessment"].values())
    assert {p["role"] for p in result["connection_reviews"][0]["role_paths"]} == {"location", "retention", "motion"}
    assert all(v == "unknown" for v in result["connection_reviews"][0]["assessments"].values())
    for component in result["supplemental_components"]:
        assert component["id"] not in part_ids
        assert component["status"] == "illustrative_unconfirmed"
        assert component["domain"] == "synthetic" and component["bom_status"] == "not_confirmed"
        assert component["unconfirmed_fields"]
    source_ids = {s["id"] for s in result["geometry_context"]["sources"]}
    evidence_ids = {e["id"] for e in result["geometry_context"]["evidence"]}
    for collection in ("connection_reviews", "supplemental_components", "circular_openings", "passage_hypotheses", "installation_definitions"):
        for entity in result[collection]:
            assert set(entity["source_refs"]) <= source_ids
            assert set(entity["evidence_refs"]) <= evidence_ids

thigh_pins = [s for s in thigh["mounting_sites"] if s["owner_ref"] == "part:microduck:e40b9945707505e1" and s.get("site_kind") == "integral_pin"]
assert len(thigh_pins) == 4 and all(s["status"] == "project_inferred" for s in thigh_pins)
assert all(s["hole_ref"] is None and s["portal_ref"] is None for s in thigh_pins)
assert any(m["assertion_status"] == "project_inferred" for m in thigh["modes"])
all_thigh_ids = {p["id"] for p in scene["parts"] if p["meshKey"] in ("upper_leg_right", "upper_leg_left")}
all_thigh_pins = [s for s in knowledge["mounting_sites"] if s["owner_ref"] in all_thigh_ids and s.get("site_kind") == "integral_pin"]
assert len(all_thigh_pins) == 8 and all(s["status"] == "project_inferred" for s in all_thigh_pins)
outer_openings = [o for o in thigh["circular_openings"] if o["owner_ref"] == "part:microduck:e40b9945707505e1" and abs(o["geometry"]["radius_m"] * 2 - .0055) < 1e-6]
assert len(outer_openings) == 2
assert "coaxial_axis_opening" in thigh["connection_reviews"][0]["basis"]
assert thigh["connection_reviews"][0]["status"] == "unresolved"
assert {c["kind"] for c in thigh["supplemental_components"]} == {"screw", "cap"}
assert len(thigh["supplemental_components"]) == 2
manufacturer_sources = [s for s in thigh["geometry_context"]["sources"] if s.get("knowledgeScope") == "manufacturer_general"]
assert len(manufacturer_sources) == 3
assert all(s["externalUrl"].startswith("https://") for s in manufacturer_sources)
assert leg["status"] == "reference_matches"
assert len(leg["reference_mounts"]) == 1 and len(leg["reference_mounts"][0]["site_pairs"]) == 2
assert leg["connection_reviews"][0]["status"] == "reference_supported"
assert len(leg["supplemental_components"]) == 2
assert all(c["kind"] == "screw" and c["parameter_basis"] == "reference_role_with_illustrative_dimensions" for c in leg["supplemental_components"])

after = ledger()
write("inputs-after.json", after)
integrity = {"unchanged": before == after, "file_count_before": len(before), "file_count_after": len(after),
             "before_ledger_sha256": ledger_digest(before), "after_ledger_sha256": ledger_digest(after)}
write("input-integrity.json", integrity)
assert integrity["unchanged"]
review = {"ok": True, "basis": "documented_simulate_cli_on_real_validated_16_dkp", "package": {"path": str(PACKAGE), "profile": manifest["profile"], "digest": EXPECTED_DIGEST},
          "documentation": ["skills/psop-simulate/SKILL.md", "skills/psop-simulate/references/contracts-and-api.md", "skills/psop-simulate/references/implementation-status.md", "docs/architecture/assembly-interfaces.md"],
          "source_counts": manifest["counts"], "screened_source_pairs": len(knowledge["pair_screenings"]),
          "right_thigh": {"outer_openings_diameter_mm": [o["geometry"]["radius_m"] * 2000 for o in outer_openings], "qualified_complete_functional_interfaces": len(thigh["functional_interfaces"]),
              "project_inferred_pins": len(thigh_pins), "all_left_right_project_inferred_pins": len(all_thigh_pins), "review_status": thigh["connection_reviews"][0]["status"],
              "schematic_kinds": [c["kind"] for c in thigh["supplemental_components"]], "manufacturer_general_sources": len(manufacturer_sources)},
          "standard_leg": {"reference_mounts": len(leg["reference_mounts"]), "paired_sites": len(leg["reference_mounts"][0]["site_pairs"]), "review_status": leg["connection_reviews"][0]["status"], "illustrative_screws": len(leg["supplemental_components"])},
          "scope": {"execution_performed": False, "enumeration_performed": False, "physical_assessments": "all_unknown", "schematics_are_source_parts": False, "schematics_are_confirmed_bom": False},
          "input_integrity": integrity}
write("review.json", review)
print(json.dumps({"ok": True, "review": str(OUTPUT / 'review.json'), "input_integrity": integrity}), flush=True)
