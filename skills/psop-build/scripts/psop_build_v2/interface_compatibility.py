"""Qualify complete functional interfaces, keeping primitive clues separate.

One rigid, proper source-local registration must satisfy every selected member.
This proves an interface's finite pattern, not whole-part collision freedom,
an assembly path, thread specification or retention. Reference counterparts and
world placements never filter this search.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
import json
import math

from . import interface_policy as policy_v2

POLICY_SCHEMA = "psop.interface-matching-policy/1"
METHOD = "complete-functional-interface-matching/1"
MARGIN_M = 4e-5
ANGLE_RAD = math.radians(.3)


def _canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _key(value):
    return hashlib.sha256(_canonical(value).encode()).hexdigest()[:24]


def _sub(a,b): return [x-y for x,y in zip(a,b)]
def _dot(a,b): return sum(x*y for x,y in zip(a,b))
def _cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def _norm(a): return math.sqrt(_dot(a,a))
def _unit(a):
    length=_norm(a)
    return [x/length for x in a] if length>1e-12 else None
def _mul(matrix,point): return [_dot(row,point) for row in matrix]
def _mean(points): return [sum(p[k] for p in points)/len(points) for k in range(3)]
def _transverse(delta,axis): return [v-_dot(delta,axis)*n for v,n in zip(delta,axis)]


def validate_policy(policy,interfaces):
    if policy.get("schema") not in {POLICY_SCHEMA,policy_v2.SCHEMA,policy_v2.SCHEMA_V3} or policy.get("default_hole_selection")!="all_members" or policy.get("ordinary_contact_is_compatible") is not False:
        raise ValueError("Unsupported complete-interface matching policy")
    if not policy.get("statement") or not policy.get("evidence_ref"):
        raise ValueError("Interface policy needs its attributed statement and evidence")
    index={i["id"]:i for i in interfaces}
    if len(policy.get("required_patterns",[]))!=len({r.get("interface_ref") for r in policy.get("required_patterns",[])}):
        raise ValueError("Duplicate required complete interface")
    for rule in policy.get("required_patterns",[]):
        item=index.get(rule.get("interface_ref"))
        if not item or rule.get("selection")!="all_members" or rule.get("member_count")!=len(item["members"]):
            raise ValueError("Required complete pattern does not match its source interface")
    return policy


def _slots(interface,features,role):
    """Members are physical holes, not individual counterbore wall segments."""
    slots=[]
    for member in sorted(interface["members"],key=lambda m:m["id"]):
        refs=[]
        for ref in member["feature_refs"]:
            original=features[ref]
            refs.extend(original.get("replacement_feature_refs") or [ref])
        eligible=[features[r] for r in sorted(set(refs)) if r in features and features[r].get("candidate_eligible",True)
                  and features[r]["geometry"]["type"] in {"cylinder","conical_frustum"}
                  and (features[r].get("kind")=="bore_wall" if role=="female" else features[r].get("kind")=="shaft_wall")]
        if not eligible:continue
        resources={r for f in eligible for r in f.get("capability",{}).get("resource_refs",[])}
        # A ring's two entries and remeasured aliases cannot become extra holes.
        existing=next((s for s in slots if resources and resources.intersection(s["resources"])),None)
        if existing:
            existing["feature_refs"]=sorted(set(existing["feature_refs"]+[f["id"] for f in eligible]))
            continue
        slots.append({"id":member["id"],"position":member["position"],"direction":member["direction"],
                      "feature_refs":[f["id"] for f in eligible],"resources":resources})
    return slots


def _selections(interface,slots):
    if interface["selection"]["kind"]=="adjacent_pair":
        by_id={m["id"]:m for m in slots}
        return [[by_id[r] for r in pair] for pair in interface["selection"]["allowed_pairs"] if all(r in by_id for r in pair)]
    return [slots] if slots else []


def _rotation(source_axis,target_axis,source_edge=None,target_edge=None):
    """A proper rotation; mirror-image patterns cannot pass through reflection."""
    def basis(normal,edge):
        if edge is None or _norm(_transverse(edge,normal))<1e-10:
            edge=min(([1.,0.,0.],[0.,1.,0.],[0.,0.,1.]),key=lambda e:abs(_dot(e,normal)))
        u=_unit(_transverse(edge,normal));return [u,_cross(normal,u),normal]
    source,target=basis(source_axis,source_edge),basis(target_axis,target_edge)
    return [[sum(target[k][i]*source[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _registration(left,right,opposed=True):
    na,nb=_unit(left[0]["direction"]),_unit(right[0]["direction"])
    if na is None or nb is None:return None
    if any(_dot(na,_unit(m["direction"]) or [0,0,0])<math.cos(ANGLE_RAD) for m in left):return None
    if any(_dot(nb,_unit(m["direction"]) or [0,0,0])<math.cos(ANGLE_RAD) for m in right):return None
    target=[-x if opposed else x for x in na]
    edge_index=next((i for i in range(1,len(left)) if _norm(_transverse(_sub(left[i]["position"],left[0]["position"]),na))>MARGIN_M),None)
    r=_rotation(nb,target,_sub(right[edge_index]["position"],right[0]["position"]) if edge_index is not None else None,
                _sub(left[edge_index]["position"],left[0]["position"]) if edge_index is not None else None)
    center_a,center_b=_mean([m["position"] for m in left]),_mean([m["position"] for m in right])
    translation=_sub(center_a,_mul(r,center_b))
    residuals=[]
    for a,b in zip(left,right):
        delta=_sub(_sub(a["position"],_mul(r,b["position"])),translation)
        residuals.append(_norm(_transverse(delta,na)))
        if _dot(_mul(r,b["direction"]),[-x if opposed else x for x in a["direction"]])<math.cos(ANGLE_RAD):return None
    if max(residuals)>MARGIN_M:return None
    return {"rotation_b_to_a":r,"translation_b_to_a":translation,"anchor_a":center_a,"axis_a":[-x for x in na],
            "maximum_axis_residual_m":max(residuals),"comparison_margin_m":MARGIN_M,
            "scope":"selected_member_axes_only","whole_part_collision_evaluated":False}


def _mappings(left,right,edges,features,kind,*,policy=None,interface_refs=()):
    if len(left)!=len(right) or not left:return []
    # An isolated source bore is not a qualified bolt mounting interface.
    if kind in {"through_fastener","screw_reception"} and len(left)<2:return []
    axis=_unit(left[0]["direction"])
    if axis is None:return []
    chosen=[];results=[];modern=policy is not None and policy_v2.modern(policy)
    def edge_for(a,b):
        possible=[(fa,fb) for fa in a["feature_refs"] for fb in b["feature_refs"] if (fa,fb) in edges]
        if kind in {"cylindrical_insertion","bearing_fit","conical_insertion"}:
            # Mere containment with an arbitrary large gap is an exploration
            # clue. A direct fit needs matching nominal finite radial profiles.
            def direct(pair):
                def radii(ref):
                    g=features[ref]["geometry"]
                    return [g["radius_m"]]*2 if g["type"]=="cylinder" else [g["radius_start_m"],g["radius_end_m"]]
                a,b=map(radii,pair)
                return max(abs(x-y) for x,y in zip(sorted(a),sorted(b)))<=MARGIN_M
            possible=[p for p in possible if (policy_v2.radial_fit(*p,features,kind,interface_refs,policy,MARGIN_M) is not None if modern else direct(p))]
        return sorted(possible) if modern else min(possible) if possible else None
    options={(i,j):edge_for(a,b) for i,a in enumerate(left) for j,b in enumerate(right)}
    def extend(depth):
        if depth==len(left):
            mapped=[right[j] for j in chosen]
            for opposed in (True,False):
                registration=_registration(left,mapped,opposed)
                if not registration:continue
                registration["entry_relation"]="opposed" if opposed else "parallel"
                pair_options=[]
                for i,(a,b) in enumerate(zip(left,mapped)):
                    branches=options[(i,chosen[i])] if modern else [options[(i,chosen[i])]]
                    alternatives=[]
                    for fa,fb in branches:
                        pair={"member_a_ref":a["id"],"member_b_ref":b["id"],"feature_a_ref":fa,
                              "feature_b_ref":fb,"position_a":a["position"],"position_b":b["position"]}
                        if modern and kind in policy_v2.RADIAL:
                            pair["radial_fit"]=policy_v2.radial_fit(fa,fb,features,kind,interface_refs,policy,MARGIN_M)
                        alternatives.append(pair)
                    pair_options.append(alternatives)
                item={"member_pairs":[p[0] for p in pair_options],"registration":registration}
                # Finite wall choices stay factored until seating, rather than
                # silently choosing one step or eagerly expanding their product.
                if modern and any(len(p)>1 for p in pair_options):item["member_pair_options"]=pair_options
                results.append(item)
            return
        for j,b in enumerate(right):
            if j in chosen or not options[(depth,j)]:continue
            if any(abs(_norm(_transverse(_sub(left[depth]["position"],left[k]["position"]),axis))-
                       _norm(_transverse(_sub(b["position"],right[prior]["position"]),_unit(right[0]["direction"]) or [0,0,1])))>MARGIN_M for k,prior in enumerate(chosen)):continue
            chosen.append(j);extend(depth+1);chosen.pop()
    extend(0)
    return results


def qualify_interfaces(result,catalog,policy):
    modern=policy_v2.modern(policy)
    if modern:policy_v2.validate_extensions(policy,catalog["interfaces"],{f["id"]:f for f in catalog["features"]})
    functional=policy_v2.functional_interfaces(catalog,policy) if modern else [i for i in catalog["interfaces"] if i.get("capability_basis")!="geometry_hypothesis"]
    validate_policy(policy,functional)
    features={f["id"]:f for f in catalog["features"]}
    owners=defaultdict(list)
    for i in functional:owners[i["owner_ref"]].append(i)
    all_slots={(i["id"],role):_slots(i,features,role) for i in functional for role in ("female","male")}
    required={r["interface_ref"]:r["member_count"] for r in policy.get("required_patterns",[])}
    candidates=[];raw=result["candidates"]
    for original in raw:
        kind=original["template_ref"].split(":")[1]
        if kind not in {"through_fastener","screw_reception","cylindrical_insertion","bearing_fit","conical_insertion"}:continue
        edges={(p["feature_a_ref"],p["feature_b_ref"]) for p in original["mapping_family"].get("pairs",[])}
        matches=[]
        for ia in owners[original["endpoints"][0]["owner_ref"]]:
            for ib in owners[original["endpoints"][1]["owner_ref"]]:
                if modern and any(kind not in i["functional_qualification"]["mechanisms"] for i in (ia,ib) if "functional_qualification" in i):continue
                roles=[("female","female")] if kind in {"through_fastener","screw_reception"} else [("male","female"),("female","male")]
                for ra,rb in roles:
                    sa,sb=all_slots[(ia["id"],ra)],all_slots[(ib["id"],rb)]
                    if ia["id"] in required and len(sa)!=required[ia["id"]] or ib["id"] in required and len(sb)!=required[ib["id"]]:continue
                    select_a=policy_v2.selections(ia,sa,policy) if modern else None
                    select_b=policy_v2.selections(ib,sb,policy) if modern else None
                    for left in select_a if select_a is not None else _selections(ia,sa):
                        for right in select_b if select_b is not None else _selections(ib,sb):
                            alignments=_mappings(left,right,edges,features,kind,policy=policy if modern else None,interface_refs=(ia["id"],ib["id"]))
                            if not alignments:continue
                            item={"interface_a_ref":ia["id"],"interface_b_ref":ib["id"],
                                  "selection_a":"declared_member_set" if select_a is not None else ia["selection"]["kind"] if ia["selection"]["kind"]!="unspecified" else "all_members",
                                  "selection_b":"declared_member_set" if select_b is not None else ib["selection"]["kind"] if ib["selection"]["kind"]!="unspecified" else "all_members",
                                  "member_count":len(left),"source_member_count_a":len(sa),"source_member_count_b":len(sb),
                                  "member_pairs":alignments[0]["member_pairs"],"registration":alignments[0]["registration"],
                                  "alignment_options":alignments,"alignment_count":len(alignments),"assessment":"complete_selected_interface_pattern",
                                  "evidence_refs":sorted(set(ia.get("evidence_refs",[])+ib.get("evidence_refs",[])+[policy["evidence_ref"]]))}
                            if modern:
                                item["evidence_refs"]=sorted(set(item["evidence_refs"]+[r["evidence_ref"] for r in policy.get("member_selections",[]) if r["interface_ref"] in (ia["id"],ib["id"])]))
                            item["id"]="interface-match:"+_key(item);matches.append(item)
        if not matches:continue
        candidate=deepcopy(original)
        accepted={(p["feature_a_ref"],p["feature_b_ref"]) for m in matches for option in m["alignment_options"]
                  for group in option.get("member_pair_options",[[p] for p in option["member_pairs"]]) for p in group}
        candidate["mapping_family"]["pairs"]=[p for p in candidate["mapping_family"]["pairs"] if (p["feature_a_ref"],p["feature_b_ref"]) in accepted]
        candidate["mapping_family"].pop("pattern_families",None)
        for side,endpoint in zip(("a","b"),candidate["endpoints"]):
            endpoint["feature_refs"]=sorted({p[0 if side=="a" else 1] for p in accepted})
        candidate.update(interface_matches=matches,interface_matching_method=policy_v2.method(policy) if modern else METHOD,local_geometry_ref=original["id"])
        if modern:
            conditions={condition for m in matches for o in m["alignment_options"] for group in o.get("member_pair_options",[[p] for p in o["member_pairs"]])
                        for p in group for condition in p.get("radial_fit",{}).get("unresolved_conditions",[])}
            candidate["unresolved_conditions"]=sorted(set(candidate.get("unresolved_conditions",[]))|conditions)
        candidate["geometric_witness"].update(kind="complete_selected_interface_pattern",interface_match_count=len(matches))
        candidate["id"]="compatibility:"+_key(candidate);candidates.append(candidate)
    candidates.sort(key=lambda c:c["id"])
    result["local_geometry_clues"]=raw;result["candidates"]=candidates
    by_pair=defaultdict(list)
    for c in candidates:by_pair[tuple(e["owner_ref"] for e in c["endpoints"])].append(c)
    totals={t["id"]:defaultdict(int) for t in result["templates"]}
    for row in result["coverage"]["pair_dispositions"]:
        cs=by_pair[tuple(row["owner_refs"])]
        for disposition in row["templates"]:
            accepted=[c["id"] for c in cs if c["template_ref"]==disposition["template_ref"]]
            if disposition["status"]=="candidates":disposition["status"]="candidates" if accepted else "local_geometry_only"
            disposition["candidate_refs"]=accepted;totals[disposition["template_ref"]][disposition["status"]]+=1
    for index_key,by in result["index"].items():
        for k in by:by[k]=[]
    for c in candidates:
        owners_c=[e["owner_ref"] for e in c["endpoints"]]
        for owner in owners_c:result["index"]["by_owner"][owner].append(c["id"])
        result["index"]["by_template"][c["template_ref"]].append(c["id"])
        result["index"]["by_pair"][_canonical(owners_c)].append(c["id"])
    result["coverage"].update(interface_matching_method=policy_v2.method(policy) if modern else METHOD,interface_matching_complete=True,functional_interfaces_reviewed=len(functional),
        interface_policy_digest="sha256:"+hashlib.sha256(_canonical(policy).encode()).hexdigest(),
        local_geometry_candidate_count=len(raw),interface_candidate_count=len(candidates),compatible_owner_pair_count=sum(bool(v) for v in by_pair.values()),
        interface_match_count=sum(len(c["interface_matches"]) for c in candidates),template_dispositions={k:dict(v) for k,v in totals.items()},
        interface_review_dispositions=[{"interface_ref":i["id"],"owner_ref":i["owner_ref"],"hole_member_count":len(all_slots[(i["id"],"female")]),
            "shaft_member_count":len(all_slots[(i["id"],"male")]),"hole_selection":"declared_adjacent_pairs" if i["selection"]["kind"]=="adjacent_pair" else "all_hole_members",
            "contact_only_is_interface_compatibility":False} for i in sorted(functional,key=lambda i:i["id"])])
    result["input_digest"]="sha256:"+hashlib.sha256(_canonical([result["input_digest"],policy,[c["id"] for c in candidates]]).encode()).hexdigest()
    return result
