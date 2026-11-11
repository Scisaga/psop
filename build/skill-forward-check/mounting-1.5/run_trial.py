"""Independent documented-CLI trial; never imports the implementation."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[3]
ROOT = Path(__file__).resolve().parent
PACKAGE = REPO / "build/v2/microduck/packages/microduck-20261105211617-7c368d14.dkp"
CLI = REPO / "skills/psop-simulate/scripts/psop_simulate.py"
EXPECTED_DIGEST = "9c406da2e5f0349d240f1dde6606f3486cbff981bd935de6ab13fa9cc51434c8"
THIGH = "part:microduck:e40b9945707505e1"
LEG = "part:microduck:7f4fefc3c6de90f1"
UPPER_SERVO = "part:microduck:7038a050dbc33fb0"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(name, value):
    with (ROOT / name).open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def snapshot():
    return [{"path": path.relative_to(PACKAGE).as_posix(), "bytes": path.stat().st_size,
             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in sorted(PACKAGE.rglob("*")) if path.is_file()]


def execute(name, arguments):
    command = [sys.executable, "-B", str(CLI), *arguments]
    commands.append({"name": name, "cwd": str(REPO), "argv": command})
    start = time.monotonic()
    with (ROOT / (name + ".stdout.log")).open("x", encoding="utf-8", newline="\n") as stdout:
        with (ROOT / (name + ".stderr.log")).open("x", encoding="utf-8", newline="\n") as stderr:
            process = subprocess.run(command, cwd=REPO, stdout=stdout, stderr=stderr,
                                     text=True, encoding="utf-8")
    commands[-1].update(exit_code=process.returncode, elapsed_seconds=round(time.monotonic()-start, 3))
    print(json.dumps({"finished": name, **{k: commands[-1][k] for k in ("exit_code", "elapsed_seconds")}}), flush=True)
    if process.returncode:
        raise RuntimeError(name + " rejected; inspect captured stdout/stderr")


commands = []
before = snapshot()
write("input-files.before.json", before)
manifest = read(PACKAGE / "manifest.json")
assert manifest["profile"] == "psop.hardware.source-model/1.5"
assert manifest["package_digest"] == EXPECTED_DIGEST
try:
    execute("doctor", ["doctor"])
    execute("query-help", ["query", "--help"])
    execute("right-thigh-upper-servo", ["query", "--dkp", str(PACKAGE), "--part-a", THIGH,
            "--part-b", UPPER_SERVO, "--output", str(ROOT / "right-thigh-upper-servo.query.json")])
    execute("leg-upper-servo", ["query", "--dkp", str(PACKAGE), "--part-a", LEG,
            "--part-b", UPPER_SERVO, "--output", str(ROOT / "leg-upper-servo.query.json")])
    thigh = read(ROOT / "right-thigh-upper-servo.query.json")
    leg = read(ROOT / "leg-upper-servo.query.json")
    for result in (thigh, leg):
        assert result["ok"] and result["basis"] == "published_mounting_knowledge"
        assert result["package"]["package_digest"] == EXPECTED_DIGEST
        assert result["execution_performed"] is False
        assert result["scope"]["enumeration_performed"] is False
        assert set(result["assessment"].values()) == {"unknown"}
        assert not result["reference_mounts"]
    pins = [site for site in thigh["mounting_sites"] if site["owner_ref"] == THIGH
            and site["status"] == "user_asserted" and site.get("site_kind") == "integral_pin"]
    thigh_interfaces = [item for item in thigh["functional_interfaces"] if item["owner_ref"] == THIGH]
    assert len(pins) == 4 and len(thigh_interfaces) == 2
    assert all(site["hole_ref"] is None and site["portal_ref"] is None for site in pins)
    assert all(item["mechanism"] == "unknown" and item["selection_rule"]["status"] == "unknown"
               and item["selection_rule"]["min_count"] is None for item in thigh_interfaces)
    pin_features = {feature["id"]: feature for feature in thigh["geometry_context"]["features"]}
    assert all(pin_features[site["feature_refs"][0]]["geometry"]["type"] == "conical_frustum" for site in pins)
    leg_interfaces = [item for item in leg["functional_interfaces"] if item["owner_ref"] == LEG]
    upper = [item for item in leg_interfaces if item["selection_rule"].get("status") == "unknown"]
    lower = [item for item in leg_interfaces if item["selection_rule"].get("min_count") == 2]
    assert len(upper) == len(lower) == 1
    assert len(upper[0]["member_site_refs"]) == 4 and len(lower[0]["member_site_refs"]) == 2
    assert "reference_hole_axes_unaligned" in upper[0]["unresolved_requirements"]
    knowledge = read(PACKAGE / manifest["entrypoints"]["knowledge"])
    interface_map = {item["id"]: item for item in knowledge["mounting_interfaces"]}
    references = knowledge["reference_mounts"]
    assert len(references) == 2 and all(len(item["site_pairs"]) == 2 for item in references)
    assert all(interface_map[p["interface_ref"]]["selection_rule"].get("status") != "unknown"
               for item in references for p in item["participants"])
    review = {"ok": True, "basis": "documented_simulate_cli_on_real_published_dkp",
              "documentation": ["skills/psop-simulate/SKILL.md", "skills/psop-simulate/references/contracts-and-api.md",
                                "skills/psop-simulate/references/implementation-status.md", "docs/architecture/assembly-interfaces.md"],
              "package": {"path": str(PACKAGE), "profile": manifest["profile"], "digest": EXPECTED_DIGEST},
              "right_thigh": {"part_ref": THIGH, "qualified_integral_pin_count": len(pins),
                   "interface_count": len(thigh_interfaces), "unknown_selection_rules": True,
                   "unknown_mechanisms": True, "fabricated_holes": False,
                   "qpos0_axis_alignment_is_geometry_only": all("reference_pin_axes_aligned" in item["unresolved_requirements"] for item in thigh_interfaces),
                   "sites": [{key: site[key] for key in ("id", "label", "position", "entry_direction", "hole_ref", "portal_ref", "feature_refs")} for site in pins]},
              "leg": {"part_ref": LEG, "upper_site_count": 4, "upper_selection_rule": upper[0]["selection_rule"],
                   "upper_source_axes_unaligned": True, "lower_site_count": 2,
                   "lower_selection_rule": lower[0]["selection_rule"]},
              "requested_upper_pairs": {"returned_reference_mounts": 0, "new_alignment_or_installation_invented": False},
              "published_reference_scope": [{"id": item["id"], "part_refs": [p["part_ref"] for p in item["participants"]],
                   "site_pair_count": len(item["site_pairs"]), "assessment": item["assessment"]} for item in references],
              "execution_performed": False, "enumeration_performed": False,
              "remaining_gaps": ["Unknown mechanisms and subset constraints are not replaced with a minimum-two rule.",
                   "Upper leg qpos0 phase mismatch has no aligned reference mount; other common configurations remain unresolved.",
                   "Pin alignment does not establish retention, contact, engineering acceptance or completed installation.",
                   "No physical action, continuous path, deformation or exhaustive alternative assembly search is available."]}
finally:
    after = snapshot()
    write("input-files.after.json", after)
    write("commands.json", commands)
    unchanged = before == after
    write("input-integrity.json", {"unchanged": unchanged, "file_count_before": len(before), "file_count_after": len(after),
          "before_ledger_sha256": hashlib.sha256((ROOT / "input-files.before.json").read_bytes()).hexdigest(),
          "after_ledger_sha256": hashlib.sha256((ROOT / "input-files.after.json").read_bytes()).hexdigest()})
    assert unchanged, "Immutable DKP contents changed during the trial"
review["input_package_unchanged"] = True
write("review.json", review)
print(json.dumps({"ok": True, "review": str(ROOT / "review.json"), "input_files_unchanged": len(after),
                  "thigh_pins": len(pins), "leg_upper_sites": 4, "references": len(references)}), flush=True)
