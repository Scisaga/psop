"""Check or export Microduck's reviewed assembly input against current sources.

The explicit catalog is the maintained research result. This tool does not
reconstruct old investigations, discover interfaces or follow historical
provenance paths. A future revision can be supplied with --input and checked
against a newer retained source package with --dkp.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "device-materials/microduck-assembly-interfaces.json"
DEFAULT_DKP = ROOT / "build/microduck/source-1.15/microduck-capabilities-9.dkp"
sys.path.insert(0, str(ROOT / "skills/psop-build/scripts"))

from psop_build_v2.assembly_catalog import validate_input
from psop_build_v2.package import read_json


def maintain(input_path=DEFAULT_INPUT, dkp=DEFAULT_DKP, output=None):
    """Validate reviewed facts; optionally copy their exact bytes to a new file."""
    input_path, dkp = Path(input_path).resolve(strict=True), Path(dkp).resolve(strict=True)
    target = Path(output).resolve() if output is not None else None
    if target is not None and target.exists():
        raise FileExistsError("Export target already exists; reviewed inputs are never overwritten")
    raw = input_path.read_bytes()
    if not raw or len(raw) > 16 * 1024 * 1024:
        raise ValueError("Reviewed catalog must be a bounded nonempty JSON input")
    value = read_json(input_path)
    manifest = read_json(dkp / "manifest.json")
    if manifest.get("device", {}).get("id") != value.get("device_id"):
        raise ValueError("Reviewed catalog and source package belong to different devices")
    # Historical paths in provenance remain citations, not runtime inputs.
    scene = read_json(dkp / "indexes/scene.json")
    validate_input(value, scene, dkp)
    if target is not None:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(raw)
    catalog = value["catalog"]
    owners = {item["owner_ref"] for item in catalog["interfaces"]}
    return {
        "ok": True, "schema": value["schema"], "input": str(input_path),
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "source_package": str(dkp), "source_package_digest": manifest["package_digest"],
        "counts": {key: len(catalog[key]) for key in ("features", "interfaces", "connections")},
        "parts_with_interfaces": len(owners),
        "parts_without_interfaces": [part["id"] for part in scene["parts"] if part["id"] not in owners],
        **({"output": str(target)} if target is not None else {}),
    }


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Reviewed catalog to check; no discovery is performed")
    parser.add_argument("--dkp", type=Path, default=DEFAULT_DKP, help="Current retained package containing original source geometry")
    parser.add_argument("--output", type=Path, help="Optional new file receiving the input's exact bytes; never overwrite")
    args = parser.parse_args(argv)
    try:
        result = maintain(args.input, args.dkp, args.output)
    except (ValueError, OSError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
