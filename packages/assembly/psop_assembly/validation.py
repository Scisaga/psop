"""Small strict evaluator for the self-contained assembly machine schemas.

Only the keyword vocabulary used by the bundled schemas is implemented. An
unknown validation keyword is rejected rather than silently weakening a rule.
There is no remote $ref lookup, network access, or dependency on Build runtime.
"""
import json
import math
import re
from pathlib import Path


def schema(name):
    return json.loads((Path(__file__).resolve().parents[1] / "schema" / (name + ".schema.json")).read_text(encoding="utf-8"))


def validate(value, rule, root=None, path="$"):
    root = rule if root is None else root
    if "$ref" in rule:
        reference = rule["$ref"]
        if not reference.startswith("#/"):
            raise ValueError("Only local assembly schema references are supported")
        target = root
        for part in reference[2:].split("/"):
            target = target[part.replace("~1", "/").replace("~0", "~")]
        validate(value, target, root, path)
        return
    supported = {"$schema", "$id", "$defs", "title", "description", "type", "properties", "required", "additionalProperties", "items",
                 "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
                 "const", "enum", "oneOf", "pattern"}
    if set(rule) - supported:
        raise ValueError("Unsupported assembly schema keyword: " + ", ".join(sorted(set(rule) - supported)))
    if "oneOf" in rule:
        successes = 0
        for option in rule["oneOf"]:
            try:
                validate(value, option, root, path)
                successes += 1
            except ValueError:
                pass
        if successes != 1:
            raise ValueError(path + " does not satisfy exactly one schema branch")
    types = rule.get("type", [])
    types = [types] if isinstance(types, str) else types
    checks = {"object": lambda: isinstance(value, dict), "array": lambda: isinstance(value, list), "string": lambda: isinstance(value, str),
              "number": lambda: isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value),
              "integer": lambda: isinstance(value, int) and not isinstance(value, bool), "boolean": lambda: isinstance(value, bool), "null": lambda: value is None}
    if types and not any(kind in checks and checks[kind]() for kind in types):
        raise ValueError(path + " has an invalid type")
    if "const" in rule and value != rule["const"] or "enum" in rule and value not in rule["enum"]:
        raise ValueError(path + " has an undeclared value")
    if isinstance(value, dict):
        missing = set(rule.get("required", [])) - set(value)
        if missing:
            raise ValueError(path + " is missing " + ", ".join(sorted(missing)))
        properties = rule.get("properties", {})
        unknown = set(value) - set(properties)
        if unknown and rule.get("additionalProperties") is False:
            raise ValueError(path + " has unsupported fields: " + ", ".join(sorted(unknown)))
        for key, item in value.items():
            if key in properties:
                validate(item, properties[key], root, path + "." + key)
    if isinstance(value, list):
        if len(value) < rule.get("minItems", 0) or len(value) > rule.get("maxItems", math.inf):
            raise ValueError(path + " has an invalid array size")
        if rule.get("uniqueItems"):
            encoded = [json.dumps(item, sort_keys=True, allow_nan=False) for item in value]
            if len(set(encoded)) != len(encoded):
                raise ValueError(path + " contains duplicate items")
        if "items" in rule:
            for i, item in enumerate(value):
                validate(item, rule["items"], root, path + "[" + str(i) + "]")
    if isinstance(value, str) and not rule.get("minLength", 0) <= len(value) <= rule.get("maxLength", math.inf):
        raise ValueError(path + " has an invalid string length")
    if isinstance(value, str) and "pattern" in rule and re.search(rule["pattern"], value) is None:
        raise ValueError(path + " does not satisfy its declared string pattern")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value):
            raise ValueError(path + " is not finite")
        if value < rule.get("minimum", -math.inf) or value > rule.get("maximum", math.inf):
            raise ValueError(path + " violates a numeric bound")
        if "exclusiveMinimum" in rule and value <= rule["exclusiveMinimum"] or "exclusiveMaximum" in rule and value >= rule["exclusiveMaximum"]:
            raise ValueError(path + " violates an exclusive numeric bound")


def validate_named(value, name):
    validate(value, schema(name))

