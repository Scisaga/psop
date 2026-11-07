#!/usr/bin/env python3
"""PSOP v2 data-only build CLI. Old core and package-embedded Apps are retired."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

from psop_build_v2.package import prepare, finalize, validate, VERSION, SCHEMA, PROFILE, PROFILE_SCHEMAS


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = Parser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True, parser_class=Parser)
    commands.add_parser("doctor")
    intake = commands.add_parser("prepare")
    intake.add_argument("--input", required=True, type=Path)
    intake.add_argument("--work", required=True, type=Path)
    intake.add_argument("--device-id", required=True)
    intake.add_argument("--device-name", default="Microduck")
    intake.add_argument("--xml", type=Path, help="Optional local copy of the pinned supplemental MJCF")
    intake.add_argument("--ontology", type=Path, help="Optional local draft.4 ontology snapshot")
    intake.add_argument("--profile", choices=tuple(PROFILE_SCHEMAS), default=PROFILE,
                        help="Explicit source-model contract; historical contracts retain their original semantics")
    intake.add_argument("--assembly-knowledge", type=Path, help="Explicit installation declarations, inferred-role scope and connection-review policy; referenced manufacturer originals are captured and locked")
    intake.add_argument("--investigation", type=Path, help="Frozen source-SHA-bound independent source-region review and expected-feature annotations (1.9 geometry review; 1.10 completed relationship research)")
    publish = commands.add_parser("finalize")
    publish.add_argument("--work", required=True, type=Path)
    publish.add_argument("--output", required=True, type=Path)
    publish.add_argument("--version", required=True)
    verify = commands.add_parser("validate")
    verify.add_argument("--dkp", required=True, type=Path)
    # --json is accepted only as an explicit output preference; all commands
    # already return JSON. It does not restore any legacy input contract.
    verify.add_argument("--json", action="store_true")
    try:
        args = parser.parse_args(argv)
        if args.command == "doctor":
            result = {"ok": True, "tool": "psop-build", "version": VERSION, "schema": SCHEMA,
                      "profile": PROFILE, "python": sys.version.split()[0], "commands": ["prepare", "finalize", "validate"],
                      "scope": "Measured openings and installation knowledge, source-pair connection reviews and separately attributed illustrative connectors; actual engagement, engineering acceptance, paths and training unavailable"}
        elif args.command == "prepare":
            result = prepare(args.input, args.work, args.device_id, args.device_name, args.xml, args.ontology,
                             profile=args.profile, assembly_knowledge=args.assembly_knowledge, investigation=args.investigation)
        elif args.command == "finalize":
            result = finalize(args.work, args.output, args.version)
        else:
            result = validate(args.dkp)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as error:
        # One machine-readable failure envelope at the process boundary also
        # covers malformed ZIP/XML/CSV inputs. No source content is executed.
        print(json.dumps({"ok": False, "valid": False, "error": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
