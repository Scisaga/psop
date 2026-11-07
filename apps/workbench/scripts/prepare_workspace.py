"""Initialize a device workspace through the real v2 build CLI, never a UI extractor."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

APP = Path(__file__).resolve().parents[1]
REPO = APP.parents[1]
REGISTRY = REPO / "workspaces" / "registry.json"
BUILDER = REPO / "skills" / "psop-build" / "scripts" / "psop_build.py"


def command(arguments: list[str]) -> dict:
    result = subprocess.run(arguments, cwd=REPO, text=True, encoding="utf-8", capture_output=True,
                            env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if result.returncode:
        raise RuntimeError((result.stdout + "\n" + result.stderr).strip())
    return json.loads(result.stdout)


def prepare(*, fresh: bool = False) -> dict:
    if REGISTRY.is_file() and not fresh:
        catalog = command(["node", str(APP / "scripts/workspaces.mjs"), "list"])
        if catalog["workspaces"]:
            return {"reused": True, "workspaces": len(catalog["workspaces"])}
    token = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:8]
    root = REPO / "build" / "v2" / "microduck"
    work = root / ("work-" + token)
    output = root / "packages" / ("microduck-" + token + ".dkp")
    cache = REPO / "build" / "v2" / "cache" / "microduck-reference.xml"
    arguments = [sys.executable, "-B", str(BUILDER), "prepare", "--input",
                 str(REPO / "device-materials/microduck-official-materials.zip"),
                 "--work", str(work), "--device-id", "microduck", "--device-name", "Microduck",
                 "--assembly-knowledge", str(REPO / "device-materials/microduck-assembly-knowledge.json"),
                 "--investigation", str(REPO / "device-materials/interface-review/microduck-relations.json")]
    if cache.is_file():
        arguments.extend(["--xml", str(cache)])
    command(arguments)
    command([sys.executable, "-B", str(BUILDER), "finalize", "--work", str(work), "--output", str(output),
             "--version", "2.0.0-interface-relations." + token.replace("-", ".")])
    validation = command([sys.executable, "-B", str(BUILDER), "validate", "--dkp", str(output)])
    if validation.get("valid") is not True:
        raise RuntimeError("The newly published v2 DKP failed validation.")
    registration = command(["node", str(APP / "scripts/workspaces.mjs"), "register", "--dkp", str(output),
                            "--workspace", "microduck"])
    return {"reused": False, "dkp": str(output), **registration}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fresh", action="store_true", help="Publish and register a new immutable source-model revision.")
    arguments = parser.parse_args()
    try:
        print(json.dumps(prepare(fresh=arguments.fresh), ensure_ascii=False, indent=2))
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
