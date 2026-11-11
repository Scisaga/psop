"""Selection S is a binding parameter, never a record of engaged members."""
from itertools import combinations


def _pool(interface):
    values = [member["role_ref"] for member in interface["members"]]
    if not values or len(values) != len(set(values)):
        raise ValueError("Interface members require unique atomic role_ref values")
    return values


def selection_status(interface, mode, selected):
    """Return pass/fail/unknown against the explicitly supplied selection rule."""
    pool = _pool(interface)
    selection = mode["selection"]
    chosen = set(selected)
    if len(chosen) != len(selected) or not chosen or not chosen.issubset(pool):
        return "fail"
    referenced = list(selection.get("required_members", []))
    for key in ("allowed_sets", "anchors_any", "paired_dependencies"):
        referenced.extend(v for group in selection.get(key, []) for v in group)
    if not set(referenced).issubset(pool):
        raise ValueError("Selection rule references an unknown atomic role")
    cardinality = selection.get("cardinality", {})
    if not cardinality.get("min", 1) <= len(chosen) <= cardinality.get("max", len(pool)):
        return "fail"
    if not set(selection.get("required_members", [])).issubset(chosen):
        return "fail"
    anchors = selection.get("anchors_any", [])
    if anchors and not any(set(group).issubset(chosen) for group in anchors):
        return "fail"
    if any(chosen.intersection(group) and not set(group).issubset(chosen) for group in selection.get("paired_dependencies", [])):
        return "fail"
    completeness = selection["completeness"]
    if completeness not in {"complete", "open_unknown"}:
        raise ValueError("Selection completeness must be complete or open_unknown")
    if "allowed_sets" in selection:
        if chosen in [set(group) for group in selection["allowed_sets"]]:
            return "pass"
        return "fail" if completeness == "complete" else "unknown"
    return "pass" if completeness == "complete" else "unknown"


def selection_sets(interface, mode):
    """Enumerate finite known/unknown subsets without guessing an open list."""
    if isinstance(mode, str):
        mode = next(item for item in interface["modes"] if item["id"] == mode)
    pool = _pool(interface)
    if len(pool) > 12:
        raise ValueError("Selection enumeration supports at most 12 atomic members")
    result = {"admissible_sets": [], "unknown_sets": [], "forbidden_count": 0}
    for size in range(1, len(pool) + 1):
        for chosen in combinations(pool, size):
            status = selection_status(interface, mode, chosen)
            if status == "pass":
                result["admissible_sets"].append(list(chosen))
            elif status == "unknown":
                result["unknown_sets"].append(list(chosen))
            else:
                result["forbidden_count"] += 1
    return result

