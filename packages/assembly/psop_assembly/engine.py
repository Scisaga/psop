"""Bounded declarative selection, mapping and static registration queries.

This engine evaluates supplied functional warrants; it does not discover them
from bare geometry or verify the external truth of a source citation. It never
creates connector Parts, performs assembly, or certifies physical engagement.
"""
from copy import deepcopy
import hashlib
from itertools import permutations
from itertools import combinations
import json
import math

from .rigid import fit_mapping, unit
from .selection import selection_sets, selection_status
from .validation import schema, validate, validate_named

DEFINITION_SCHEMA = "psop.assembly.definition/1.0-draft.1"
QUERY_SCHEMA = "psop.assembly.query/1.0-draft.1"
LIMITATIONS = [
    "This is a bounded selection and common proper rigid hole-group registration query, not a physics, contact, path or elastic solver.",
    "Functional warrants are supplied explicitly; citation content, engineering suitability and actual engagement are not established by registration.",
    "Selected S is a proposed role binding, not the set of already engaged holes; no connector or interface capacity=1 is invented.",
    "A missing proposal only concerns the declared finite modes and search bounds; it does not prove that no assembly method exists.",
]


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _warrant_ok(warrant, basis):
    if not isinstance(warrant, dict) or not warrant.get("refs") or not warrant.get("statement"):
        return False
    kind = warrant.get("kind")
    return kind == "source_function" or kind == "synthetic" and basis.get("kind") == "synthetic"


def _index(values, label):
    result = {value["id"]: value for value in values}
    if len(result) != len(values):
        raise ValueError("Duplicate " + label + " identity")
    return result


def _definition(definition):
    validate_named(definition, "definition")
    if definition.get("schema") != DEFINITION_SCHEMA:
        raise ValueError("Unsupported assembly definition schema")
    basis = definition["basis"]
    if basis.get("kind") not in {"synthetic", "source"} or not basis.get("refs"):
        raise ValueError("Definition needs an explicit synthetic or source basis")
    holes = _index(definition["logical_holes"], "logical-hole")
    interfaces = _index(definition["interfaces"], "Interface")
    for hole in holes.values():
        if len(hole["center_m"]) != 3 or not all(math.isfinite(x) for x in hole["center_m"]):
            raise ValueError("Non-finite hole center")
        unit(hole["axis"])
        if not math.isfinite(hole["radius_m"]) or hole["radius_m"] <= 0:
            raise ValueError("Logical-hole radius must be positive")
        interval = hole["axial_range_m"]
        if len(interval) != 2 or not all(math.isfinite(x) for x in interval) or interval[0] >= interval[1]:
            raise ValueError("Logical-hole requires a positive finite axial segment")
    for interface in interfaces.values():
        roles = [member["role_ref"] for member in interface["members"]]
        if not roles or len(roles) != len(set(roles)):
            raise ValueError("Interface atomic roles must be nonempty and unique")
        for member in interface["members"]:
            hole = holes[member["hole_ref"]]
            if hole["owner_ref"] != interface["owner_ref"] or hole["frame_ref"] != interface["frame_ref"]:
                raise ValueError("All selected holes must belong to one owner and common rigid frame")
        _index(interface["modes"], "mode")
    participants = _index(definition.get("participants", []), "participant")
    context = definition.get("context", {})
    existing = context.get("existing_uses", [])
    _index(existing, "existing-use")
    _index(context.get("sharing_rules", []), "sharing-rule")
    uses = list(existing)
    for binding in context.get("connector_bindings", []):
        if binding["participant_ref"] not in participants:
            raise ValueError("Connector binding references an undeclared participant")
        uses.extend(binding.get("uses", []))
    for use in uses:
        if use["hole_ref"] not in holes:
            raise ValueError("Occupied segment references an unknown logical hole")
        if "participant_ref" in use and use["participant_ref"] not in participants:
            raise ValueError("Existing use references an undeclared participant")
        low, high = use["axial_interval_m"]
        hole_low, hole_high = holes[use["hole_ref"]]["axial_range_m"]
        if low >= high or low < hole_low - 1e-12 or high > hole_high + 1e-12:
            raise ValueError("Occupied interval is outside the declared finite logical-hole segment")
    for rule in context.get("sharing_rules", []):
        if "hole_ref" in rule and rule["hole_ref"] not in holes or "participant_ref" in rule and rule["participant_ref"] not in participants:
            raise ValueError("Sharing rule references an undeclared hole or participant")
    query = definition["query"]
    left, right = interfaces[query["interface_a"]], interfaces[query["interface_b"]]
    if left["owner_ref"] != query["part_a"] or right["owner_ref"] != query["part_b"]:
        raise ValueError("Query Part does not own its Interface")
    modes = [next(m for m in interface["modes"] if m["id"] == query["mode_" + side]) for interface, side in ((left, "a"), (right, "b"))]
    for key in ("position_tolerance_m", "angle_tolerance_rad"):
        if not math.isfinite(query[key]) or query[key] <= 0:
            raise ValueError("Query tolerances must be finite and positive")
    return holes, left, right, modes[0], modes[1]


def _assessment(status, reasons):
    return {"status": status, "reasons": reasons}


def _context_assessment(context, key):
    assessment = context.get("assessments", {}).get(key, {})
    status = assessment.get("status", "unknown")
    if status not in {"pass", "fail", "unknown"}:
        raise ValueError("Unknown assessment status")
    if status != "unknown" and not assessment.get("basis_refs"):
        return _assessment("unknown", [key + " assessment lacks an explicit evidence basis"])
    return _assessment(status, ["Supplied " + key + " assessment: " + ", ".join(assessment.get("basis_refs", []))] if status != "unknown" else [key + " is not evaluated"])


def _occupancy(definition, proposed):
    context = definition.get("context", {})
    uses = list(context.get("existing_uses", []))
    uses.extend(use for binding in proposed for use in binding.get("uses", []))
    rules = context.get("sharing_rules", [])
    status, reasons = "pass", ["No conflicting use is inferred from Interface identity alone"]
    for i, left in enumerate(uses):
        if left["axial_interval_m"][0] >= left["axial_interval_m"][1]:
            raise ValueError("Occupied axial intervals must have positive length")
        for right in uses[i + 1:]:
            if left["hole_ref"] != right["hole_ref"]:
                continue
            overlap = min(left["axial_interval_m"][1], right["axial_interval_m"][1]) - max(left["axial_interval_m"][0], right["axial_interval_m"][0])
            if overlap <= 0:
                continue
            allowed, excluded = False, False
            for rule in rules:
                if not _warrant_ok(rule.get("warrant"), definition["basis"]):
                    continue
                if rule["kind"] == "common_participant_multilayer":
                    allowed |= bool(rule.get("sharing_group")) and left.get("sharing_group") == right.get("sharing_group") == rule["sharing_group"] and left["participant_ref"] == right["participant_ref"] == rule.get("participant_ref")
                elif rule["kind"] == "exclusive_intervals" and rule.get("hole_ref") == left["hole_ref"]:
                    excluded |= left["participant_ref"] != right["participant_ref"]
            if excluded and not allowed:
                return _assessment("fail", ["An explicit exclusive-interval rule rejects overlapping distinct participants in " + left["hole_ref"]])
            if not allowed:
                status = "unknown"
                reasons.append("Overlapping use lacks a sharing or exclusion warrant: " + left["hole_ref"])
            else:
                reasons.append("Explicit common-participant multilayer sharing applies: " + left["hole_ref"])
    return _assessment(status, reasons)


def _pose_key(fit):
    transform = fit.get("transform")
    if transform is None:
        return fit["status"]
    values = [v for row in transform["rotation"] for v in row] + transform["translation_m"]
    return tuple(round(v, 12) for v in values)


def _fit_options(definition, holes_a, holes_b):
    query = definition["query"]
    options, keys = [], set()
    for sign in ((1., -1.) if query["axis_relation"] == "unoriented" else (1.,)):
        fit = fit_mapping(holes_a, holes_b, query["axis_relation"], query["position_tolerance_m"], query["angle_tolerance_rad"], sign)
        key = _pose_key(fit)
        if key not in keys:
            keys.add(key)
            options.append(fit)
    return options


def _evaluate(definition, proposal, resolved=None, fit_override=None):
    holes, left, right, mode_a, mode_b = resolved or _definition(definition)
    result = deepcopy(proposal)
    result.setdefault("interface_a_ref", left["id"])
    result.setdefault("interface_b_ref", right["id"])
    result.setdefault("mode_a_ref", mode_a["id"])
    result.setdefault("mode_b_ref", mode_b["id"])
    if (result["interface_a_ref"], result["interface_b_ref"], result["mode_a_ref"], result["mode_b_ref"]) != (left["id"], right["id"], mode_a["id"], mode_b["id"]):
        raise ValueError("Proposal references a different declared query mode")
    roles_a = {m["role_ref"]: m["hole_ref"] for m in left["members"]}
    roles_b = {m["role_ref"]: m["hole_ref"] for m in right["members"]}
    selected_a, selected_b = result["selected_roles_a"], result["selected_roles_b"]
    statuses = [selection_status(left, mode_a, selected_a), selection_status(right, mode_b, selected_b)]
    mapping = result["member_mapping"]
    if len(mapping) != len(selected_a) or len(mapping) != len(selected_b) or {m["role_a"] for m in mapping} != set(selected_a) or {m["role_b"] for m in mapping} != set(selected_b):
        raise ValueError("Member mapping must be one bijection of both selected subsets")
    for member in mapping:
        if member.get("hole_a_ref", roles_a[member["role_a"]]) != roles_a[member["role_a"]] or member.get("hole_b_ref", roles_b[member["role_b"]]) != roles_b[member["role_b"]]:
            raise ValueError("Explicit hole reference does not match the selected atomic role")
    mapping = [{"role_a": m["role_a"], "role_b": m["role_b"], "hole_a_ref": roles_a[m["role_a"]], "hole_b_ref": roles_b[m["role_b"]]} for m in mapping]
    result["member_mapping"] = mapping
    options = _fit_options(definition, [holes[m["hole_a_ref"]] for m in mapping], [holes[m["hole_b_ref"]] for m in mapping])
    valid = [fit for fit in options if fit["status"] != "fail"]
    fit = fit_override or (valid[0] if valid else options[0])
    requested_transform = proposal.get("pose", {}).get("transform")
    if requested_transform and fit_override is None:
        matching = [candidate for candidate in valid if candidate.get("transform") and
                    max(abs(a - b) for row_a, row_b in zip(candidate["transform"]["rotation"], requested_transform["rotation"]) for a, b in zip(row_a, row_b)) <= definition["query"]["angle_tolerance_rad"] and
                    max(abs(a - b) for a, b in zip(candidate["transform"]["translation_m"], requested_transform["translation_m"])) <= definition["query"]["position_tolerance_m"]]
        if not matching:
            raise ValueError("Proposed transform does not satisfy a recomputed proper rigid branch")
        fit = matching[0]
    elif fit_override is None and len(valid) > 1:
        fit = {"status": "underdetermined", "transform": None, "reason": "Unoriented axes admit multiple discrete proper rigid branches; query enumerates them"}
    geometry_status = "pass" if fit["status"] == "determined" else "fail" if fit["status"] == "fail" else "unknown"
    result["pose"] = {"status": "determined" if fit["status"] == "determined" else "incompatible" if fit["status"] == "fail" else "underdetermined", "transform": fit.get("transform"),
                      **({"reason": fit["reason"]} if "reason" in fit else {})}
    geometry = {"status": geometry_status, "scope": "rigid_group_registration", "max_position_residual_m": fit.get("max_position_residual_m"),
                "max_axis_residual_rad": fit.get("max_axis_residual_rad")}
    selection_results = [{"side": side, "dimension": mode["selection"].get("dimension", "engineering"),
                          "dimension_defaulted": "dimension" not in mode["selection"], "status": status}
                         for side, mode, status in (("a", mode_a, statuses[0]), ("b", mode_b, statuses[1]))]
    result["selection_results"] = selection_results
    eligibility_status = "fail" if "fail" in statuses else "unknown" if "unknown" in statuses else "pass"
    eligibility = _assessment(eligibility_status, ["Declared subset eligibility only; it is not a proof that other physical assemblies are impossible"] +
                             [r["side"] + ": " + r["dimension"] + (" (safe default)" if r["dimension_defaulted"] else " (explicit)") + " / " + r["status"] for r in selection_results])
    requirements = []
    if eligibility_status != "pass":
        requirements.append("Selected subset is " + eligibility_status + " under declared mode rules; geometric evaluation continues")
    warranted = all(_warrant_ok(item.get("warrant"), definition["basis"]) for item in (left, right, mode_a, mode_b))
    if not warranted:
        requirements.append("Interface/mode functional warrant is missing or incompatible with the declared basis")
    if left["owner_role"] not in right["complementary_roles"] or right["owner_role"] not in left["complementary_roles"] or left["mechanism"] != right["mechanism"]:
        requirements.append("Complementary mechanism roles are not established")
    context = definition.get("context", {})
    participants = _index(definition.get("participants", []), "participant")
    required_roles = set(mode_a["requirements"]["connector_role_refs"] + mode_b["requirements"]["connector_role_refs"])
    bindings = []
    for pair in mapping:
        member_pair = [pair["role_a"], pair["role_b"]]
        for role in sorted(required_roles):
            matching = [b for b in context.get("connector_bindings", []) if b["role_ref"] == role and b["member_pair"] == member_pair and b["participant_ref"] in participants]
            if not matching:
                requirements.append("Unbound third-party role " + role + " for " + "/".join(member_pair))
            else:
                for binding in matching:
                    item = deepcopy(binding)
                    for use in item.get("uses", []):
                        use["participant_ref"] = binding["participant_ref"]
                    bindings.append(item)
    occupancy = _occupancy(definition, bindings)
    mechanical = _assessment("fail" if geometry_status == "fail" or occupancy["status"] == "fail" else "unknown",
                             requirements + (["Selection includes an open-world unknown combination"] if "unknown" in statuses else []) +
                             ["Static registration does not evaluate engagement, retaining contact, loads or an internal mechanism state"])
    engineering, task = _context_assessment(context, "engineering"), _context_assessment(context, "task")
    for dimension, assessment in (("engineering", engineering), ("task", task)):
        relevant = [rule for rule in selection_results if rule["dimension"] == dimension]
        if any(rule["status"] == "fail" for rule in relevant):
            assessment["status"] = "fail"
            assessment["reasons"].append("A declared " + dimension + " subset rule is not met; this is not a physical incompatibility conclusion")
        elif any(rule["status"] == "unknown" for rule in relevant) and assessment["status"] != "fail":
            assessment["status"] = "unknown"
            assessment["reasons"].append("The declared " + dimension + " subset list is open")
    if any(m["requirements"]["path_required"] for m in (mode_a, mode_b)) and _context_assessment(context, "path")["status"] != "pass":
        requirements.append("Assembly/removal path remains unverified")
    if any(m["requirements"]["elastic_required"] for m in (mode_a, mode_b)) and _context_assessment(context, "elastic")["status"] != "pass":
        requirements.append("Elastic engagement remains unverified")
    engaged = []
    for pair in mapping:
        key = [pair["role_a"], pair["role_b"]]
        if any(e["member_pair"] == key and e["status"] == "engaged" and e.get("basis_refs") for e in context.get("engagement", [])):
            engaged.append(key)
    if len(engaged) != len(mapping):
        requirements.append("Selected members are not all evidenced as engaged")
    completion = _assessment("fail" if mechanical["status"] == "fail" else "unknown", requirements + ["This bounded engine cannot certify physical completion"])
    result["assessments"] = {"geometry": geometry, "mode_eligibility": eligibility, "mechanical": mechanical, "engineering": engineering, "task": task, "completion": completion, "occupancy": occupancy}
    result["unresolved_requirements"] = list(dict.fromkeys(requirements + ["Mechanical engagement and retention remain outside this engine's evaluated scope"]))
    result["engaged_member_pairs"] = engaged
    result["synthetic"] = definition["basis"]["kind"] == "synthetic"
    result["definition_digest"] = "sha256:" + hashlib.sha256(_canonical(definition)).hexdigest()
    result["id"] = "proposal:" + hashlib.sha256(_canonical({"definition_digest": result["definition_digest"], "interfaces": [left["id"], right["id"]],
                                                          "modes": [mode_a["id"], mode_b["id"]], "mapping": mapping, "pose": result["pose"]})).hexdigest()[:20]
    return result


def _checked(call, *args):
    try:
        return call(*args)
    except (KeyError, IndexError, StopIteration, AttributeError) as error:
        raise ValueError("Malformed bounded assembly definition/proposal: " + str(error)) from error


def evaluate(definition, proposal):
    """Evaluate an explicit subset/mapping, including open-list unknown choices."""
    contract = schema("query")
    validate(proposal, contract["$defs"]["proposal_input"], contract)
    result = _checked(_evaluate, definition, proposal)
    validate(result, contract["$defs"]["proposal"], contract)
    return result


def _query_sets(interface, mode, selected):
    if mode["selection"].get("dimension", "engineering") == "mechanical":
        return selected["admissible_sets"]
    roles = [member["role_ref"] for member in interface["members"]]
    return [list(subset) for size in range(1, len(roles) + 1) for subset in combinations(roles, size)]


def _query_definition(definition):
    """Enumerate bounded warranted subsets/mappings and preserve symmetries."""
    resolved = _definition(definition)
    holes, left, right, mode_a, mode_b = resolved
    query = definition["query"]
    limits = {"max_members": 8, "max_mappings": 50000, "max_proposals": 256, **query.get("limits", {})}
    if not all(isinstance(v, int) and v > 0 for v in limits.values()) or limits["max_members"] > 12:
        raise ValueError("Search bounds must be positive integers; max_members cannot exceed 12")
    result = {"schema": QUERY_SCHEMA, "definition_id": definition["id"], "definition_digest": "sha256:" + hashlib.sha256(_canonical(definition)).hexdigest(),
              "basis": deepcopy(definition["basis"]), "status": "unknown",
              "scope": {"kind": "bounded_rigid_hole_group", "synthetic": definition["basis"]["kind"] == "synthetic", "axis_relation": query["axis_relation"]},
              "search": {"complete": False, "selection_complete": False, "stop_reason": "max_members", "mappings_examined": 0},
              "selections": {"a": {"admissible_sets": [], "unknown_sets": [], "forbidden_count": 0}, "b": {"admissible_sets": [], "unknown_sets": [], "forbidden_count": 0}},
              "proposals": [], "limitations": list(LIMITATIONS)}
    if max(len(left["members"]), len(right["members"])) > limits["max_members"]:
        return result
    result["selections"] = {"a": selection_sets(left, mode_a), "b": selection_sets(right, mode_b)}
    selection_complete = all(not s["unknown_sets"] for s in result["selections"].values())
    result["search"]["selection_complete"] = selection_complete
    if not all(_warrant_ok(item.get("warrant"), definition["basis"]) for item in (left, right, mode_a, mode_b)):
        result["search"]["stop_reason"] = "missing_functional_warrant"
        return result
    if left["mechanism"] != right["mechanism"] or left["owner_role"] not in right["complementary_roles"] or right["owner_role"] not in left["complementary_roles"]:
        result["search"].update({"complete": True, "stop_reason": "incompatible_declared_roles"})
        result["status"] = "no_solution_in_declared_scope" if selection_complete else "unknown"
        return result
    stop = None
    roles_a = {member["role_ref"]: member["hole_ref"] for member in left["members"]}
    roles_b = {member["role_ref"]: member["hole_ref"] for member in right["members"]}
    for selected_a in _query_sets(left, mode_a, result["selections"]["a"]):
        for selected_b in _query_sets(right, mode_b, result["selections"]["b"]):
            if len(selected_a) != len(selected_b):
                continue
            for permutation in permutations(selected_b):
                if result["search"]["mappings_examined"] >= limits["max_mappings"]:
                    stop = "max_mappings"
                    break
                result["search"]["mappings_examined"] += 1
                fits = _fit_options(definition, [holes[roles_a[role]] for role in selected_a], [holes[roles_b[role]] for role in permutation])
                for fit in fits:
                    if fit["status"] == "fail":
                        continue
                    proposal = _evaluate(definition, {"selected_roles_a": list(selected_a), "selected_roles_b": list(selected_b),
                                                     "member_mapping": [{"role_a": a, "role_b": b} for a, b in zip(selected_a, permutation)]}, resolved, fit)
                    result["proposals"].append(proposal)
                    if len(result["proposals"]) >= limits["max_proposals"]:
                        stop = "max_proposals"
                        break
                if stop:
                    break
            if stop:
                break
        if stop:
            break
    result["search"].update({"complete": stop is None, "stop_reason": stop or "exhausted"})
    result["status"] = "unknown" if stop else "proposals" if result["proposals"] else "no_solution_in_declared_scope" if selection_complete else "unknown"
    return result


def query_definition(definition):
    """Public strict-data API; malformed references fail as ValueError."""
    result = _checked(_query_definition, definition)
    validate_named(result, "query")
    return result
