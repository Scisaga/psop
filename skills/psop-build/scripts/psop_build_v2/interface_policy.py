"""Attributed functional qualifications and selection/fit rules for policy/2.

Rules belong to an interface, never to a counterpart or source world pose.
They supplement geometric evidence; they do not establish a connection.
"""
from __future__ import annotations

from copy import deepcopy
import math

SCHEMA = "psop.interface-matching-policy/2"
METHOD = "complete-functional-interface-matching/2"
SCHEMA_V3 = "psop.interface-matching-policy/3"
METHOD_V3 = "complete-functional-interface-matching/3"
def modern(policy):return policy.get('schema') in {SCHEMA,SCHEMA_V3}
def method(policy):return METHOD_V3 if policy.get('schema')==SCHEMA_V3 else METHOD
RADIAL = {"cylindrical_insertion", "conical_insertion", "bearing_fit"}
MECHANISMS = RADIAL | {"through_fastener", "screw_reception"}


def validate_evidence(policy, evidence_refs):
    if not modern(policy):
        return
    refs = {policy["evidence_ref"]}
    for key in ("member_selections", "radial_fit_rules"):
        refs.update(r["evidence_ref"] for r in policy.get(key, []))
    refs.update(ref for r in policy.get("interface_qualifications", []) for ref in r["evidence_refs"])
    if policy.get('schema')==SCHEMA_V3:refs.add(policy['whole_part_interference']['evidence_ref'])
    if not refs <= set(evidence_refs):
        raise ValueError("Functional interface policy cites absent evidence: " + ", ".join(sorted(refs-set(evidence_refs))))


def validate_extensions(policy, interfaces, features):
    if policy.get("reference_review_schema") not in {None, "psop.interface-analysis-review/2"}:
        raise ValueError("Unsupported reference review schema")
    index = {i["id"]: i for i in interfaces}
    required = {r["interface_ref"] for r in policy.get("required_patterns", [])}
    for collection in ("member_selections", "radial_fit_rules", "interface_qualifications"):
        rules = policy.get(collection, [])
        if not isinstance(rules, list) or len({r.get("interface_ref") for r in rules}) != len(rules):
            raise ValueError("Duplicate or invalid interface rules: " + collection)
        for rule in rules:
            interface = index.get(rule.get("interface_ref"))
            if not interface or not rule.get("statement"):
                raise ValueError("Interface rule needs an existing interface and attributed statement")
            members = {m["id"] for m in interface["members"]}
            if collection == "interface_qualifications":
                if interface.get("capability_basis") != "geometry_hypothesis":
                    raise ValueError("Qualification must refer to a geometric hypothesis")
                refs = rule.get("member_refs", [])
                if not refs or len(refs) != len(set(refs)) or set(refs) != members:
                    raise ValueError("Qualification must review every hypothesis member")
                if rule.get("basis") not in {"engineering_inference", "source_document"} or not rule.get("purpose") or not rule.get("evidence_refs"):
                    raise ValueError("Qualification needs a functional purpose, basis and evidence")
                for member in interface["members"]:
                    if not member.get("feature_refs") or any(ref not in features or features[ref].get("owner_ref") != interface["owner_ref"]
                            or not features[ref].get("geometry", {}).get("triangle_indices") for ref in member["feature_refs"]):
                        raise ValueError("Qualified members require owned finite source witnesses")
            elif not rule.get("evidence_ref"):
                raise ValueError("Interface rule needs attributed evidence")
            if collection == "member_selections":
                selections = rule.get("allowed_member_sets", [])
                keys = set()
                if not selections:
                    raise ValueError("Explicit member selection needs allowed member sets")
                for selected in selections:
                    key = tuple(sorted(selected))
                    if len(selected) < 2 or len(set(selected)) != len(selected) or not set(selected) <= members or key in keys:
                        raise ValueError("Allowed member sets must be unique, owned, complete combinations")
                    if interface["id"] in required and set(selected) != members:
                        raise ValueError("Allowed subsets cannot reduce a required complete pattern")
                    if interface["selection"]["kind"] == "adjacent_pair" and set(selected) not in [set(p) for p in interface["selection"]["allowed_pairs"]]:
                        raise ValueError("Allowed subsets cannot bypass declared adjacent pairs")
                    keys.add(key)
            else:
                mechanisms = rule.get("mechanisms", [])
                allowed = RADIAL if collection == "radial_fit_rules" else MECHANISMS
                if not mechanisms or len(set(mechanisms)) != len(mechanisms) or not set(mechanisms) <= allowed:
                    raise ValueError("Unsupported or missing qualified mechanisms")
                if collection == "radial_fit_rules":
                    limits = rule.get("radial_clearance_m", [])
                    deformation=policy.get('schema')==SCHEMA_V3 and rule.get('fit_kind') in {'interference_fit','preload_fit','flexible_fit'}
                    if (rule.get("fit_kind") not in {"clearance_fit", "partial_radial_support"} and not deformation) or len(limits) != 2 or any(
                            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in limits) or limits[0]>limits[1] or (not deformation and limits[0]<0):
                        raise ValueError("Functional fit requires an attributed finite interval; negative clearance needs a declared deformation mechanism")


def functional_interfaces(catalog, policy):
    """Qualified copies leave the captured geometry hypotheses unchanged."""
    qualifications = {r["interface_ref"]: r for r in policy.get("interface_qualifications", [])}
    result = []
    for interface in catalog["interfaces"]:
        qualification = qualifications.get(interface["id"])
        if interface.get("capability_basis") == "geometry_hypothesis" and not qualification:
            continue
        if qualification:
            interface = deepcopy(interface)
            interface["functional_qualification"] = qualification
            interface["evidence_refs"] = sorted(set(interface.get("evidence_refs", []) + qualification["evidence_refs"]))
        result.append(interface)
    return result


def selections(interface, slots, policy):
    rule = next((r for r in policy.get("member_selections", []) if r["interface_ref"] == interface["id"]), None)
    if rule is None:
        return None
    by_id = {m["id"]: m for m in slots}
    return [[by_id[ref] for ref in selected] for selected in rule["allowed_member_sets"] if all(ref in by_id for ref in selected)]


def radial_fit(a, b, features, kind, interfaces, policy, margin):
    def radii(ref):
        g = features[ref]["geometry"]
        return [g["radius_m"]] * 2 if g["type"] == "cylinder" else sorted([g["radius_start_m"], g["radius_end_m"]])
    ra, rb = radii(a), radii(b)
    gaps = [y-x for x, y in zip(ra, rb)] if features[a]["kind"] == "shaft_wall" else [x-y for x, y in zip(ra, rb)]
    rules = [r for r in policy.get("radial_fit_rules", []) if r["interface_ref"] in interfaces and kind in r["mechanisms"]]
    if not rules:
        return {"kind": "nominal_profile_match", "radial_clearance_m": gaps, "comparison_margin_m": margin} if max(map(abs, gaps)) <= margin else None
    # Both interfaces' conditions apply; an attributed broad rule cannot erase
    # a more restrictive rule attached to the other interface.
    if any(min(gaps) < r["radial_clearance_m"][0]-margin or max(gaps) > r["radial_clearance_m"][1]+margin for r in rules):
        return None
    conditions = ["manufacturing_fit_and_retention_unverified"]
    if any(r["fit_kind"] == "partial_radial_support" for r in rules):
        conditions += ["partial_support_contact_and_encirclement_unverified"]
    return {"kind": "attributed_functional_clearance", "radial_clearance_m": gaps,
            "rule_interface_refs": [r["interface_ref"] for r in rules], "fit_kinds": sorted({r["fit_kind"] for r in rules}),
            "permitted_clearances_m": [r["radial_clearance_m"] for r in rules], "comparison_margin_m": margin,
            "evidence_refs": sorted({r["evidence_ref"] for r in rules}), "unresolved_conditions": conditions}
