"""Seat finite interfaces and qualify contact separately from rigid overlap.

Published transforms are authoritative for the viewer. No reference assembly
pose, cosmetic separation gap, device name or counterpart whitelist is used.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
from itertools import product

from .interface_compatibility import _canonical, _key, MARGIN_M
from .mesh_interference import MeshInterference, METHOD, EPSILON_M, add, sub, mul, dot, scale, unit, mean

POLICY_SCHEMA = "psop.fixed-interface-placement-policy/1"
POLICY_SCHEMA_V2 = "psop.fixed-interface-placement-policy/2"
POLICY_SCHEMA_V3 = "psop.fixed-interface-placement-policy/3"
SEATING_METHOD = "finite-interface-boundary-planes/1"


def _interval(feature,r,axis):
    g=feature['geometry'];direction=unit(g['axis']);limits=g.get('axial_range_m',[0.,g.get('length_m',0.)])
    points=[mul(r,add(g['origin'],scale(direction,t))) for t in limits]
    points.sort(key=lambda p:dot(p,axis))
    return points


def placements(option,features,kind):
    """Both finite entry sides; the entire pattern shares one axial shift."""
    if 'member_pair_options' in option:
        for pairs in product(*option['member_pair_options']):
            branch={k:v for k,v in option.items() if k!='member_pair_options'}
            branch['member_pairs']=list(pairs)
            yield from placements(branch,features,kind)
        return
    original=option['registration'];r=original['rotation_b_to_a'];axis=unit(original['axis_a']);identity=((1,0,0),(0,1,0),(0,0,1))
    intervals=[(_interval(features[p['feature_a_ref']],identity,axis),_interval(features[p['feature_b_ref']],r,axis)) for p in option['member_pairs']]
    fastener=kind in {'through_fastener','screw_reception'}
    choices=[(a,b) for a in range(2) for b in range(2)]
    if not fastener:choices=[(0,0),(1,1),(None,None)]
    seen=set()
    for ea,eb in choices:
        points=[(a[ea] if ea is not None else mean(a),b[eb] if eb is not None else mean(b)) for a,b in intervals]
        offsets=[dot(sub(a,b),axis) for a,b in points];offset=sum(offsets)/len(offsets)
        if max(abs(v-offset) for v in offsets)>MARGIN_M:continue
        # Preserve the transverse registration, changing only the free axial
        # degree of freedom. Endpoints have no made-up display gap.
        t0=original['translation_b_to_a'];t=add(t0,scale(axis,offset-dot(t0,axis)))
        if not fastener and any(min(dot(a[1],axis),dot(add(b[1],t),axis))-max(dot(a[0],axis),dot(add(b[0],t),axis))<=EPSILON_M for a,b in intervals):continue
        key=tuple(round(v,12) for v in t)
        if key in seen:continue
        seen.add(key)
        result=deepcopy(option)
        result['registration'].update(translation_b_to_a=list(t),scope='complete_interface_fixed_source_pose',whole_part_collision_evaluated=True)
        for pair,(pa,pb) in zip(result['member_pairs'],points):
            pair['contact_a']=list(pa);pair['contact_b']=list(mul(tuple(zip(*r)),pb))
        result['seating']={'method':SEATING_METHOD,'end_a':('low','high')[ea] if ea is not None else 'mid',
            'end_b':('low','high')[eb] if eb is not None else 'mid','axis_a':list(axis),
            'separation_axis_a':list(scale(axis,-1 if ea==0 else 1)),
            'maximum_boundary_residual_m':max(abs(v-offset) for v in offsets),'display_gap_m':0.}
        yield result


def qualify_placements(result,catalog,policy,parts,root,*,progress=None):
    request=policy['whole_part_interference']
    separate=policy.get('schema')=='psop.interface-matching-policy/3'
    contact_qualified=separate and request.get('schema')==POLICY_SCHEMA_V3
    if request.get('schema') not in ({POLICY_SCHEMA_V2,POLICY_SCHEMA_V3} if separate else {POLICY_SCHEMA}) or request.get('method')!=METHOD or request.get('seating_method')!=SEATING_METHOD or request.get('clear_fixed_pose_required') is not (False if separate else True) or request.get('numerical_contact_allowance_m')!=EPSILON_M or not request.get('statement') or not request.get('evidence_ref'):
        raise ValueError('Unsupported whole-source interference policy')
    if separate and request.get('assembly_policy',{}).get('schema')!='psop.assembly-policy/1':raise ValueError('Missing versioned virtual assembly policy')
    if contact_qualified and request.get('interface_contact_method')!='finite-interface-contact-regions/1':raise ValueError('Missing finite interface contact qualification')
    if root is None:raise ValueError('Whole-source screening requires captured geometry bytes')
    context=MeshInterference(parts,root);features={f['id']:f for f in catalog['features']}
    accepted=[];exclusions=[];totals=Counter();reviewed=0;unseated=0;assessment_cache={}
    for candidate in result['candidates']:
        owners=[e['owner_ref'] for e in candidate['endpoints']];kind=candidate['template_ref'].split(':')[1];matches=[]
        for match in candidate['interface_matches']:
            clear=[];failed=[];unique=set()
            for source in match['alignment_options']:
                for option in placements(source,features,kind):
                    r,t=option['registration']['rotation_b_to_a'],option['registration']['translation_b_to_a']
                    # Do not count a symmetry/entry alias as another placement.
                    key=tuple(round(v,12) for row in r for v in row)+tuple(round(v,12) for v in t)
                    if key in unique:continue
                    unique.add(key)
                    collision=context.evaluate(*owners,r,t);option['interference']=collision
                    if separate:
                        from .solid_boolean import assess
                        if contact_qualified and collision['status']=='interference':
                            contact={'features':[[features[ref]['geometry'] for ref in sorted({p['feature_'+side+'_ref'] for p in option['member_pairs']})] for side in ('a','b')],
                                'comparison_margin_m':MARGIN_M,'stop_after_obstruction_m':request['assembly_policy']['unrelated_obstacle_depth_m']}
                            collision=context.evaluate(*owners,r,t,interface_contact=contact);option['interference']=collision
                        assessment_key=(_canonical(collision),kind)
                        if assessment_key not in assessment_cache:assessment_cache[assessment_key]=assess(collision,request['assembly_policy'],kind)
                        option['assembly_assessment']=assessment_cache[assessment_key]
                        option['mechanics']={'status':'not_evaluated','scope':'strain_stress_retention_and_load'}
                    totals[collision['status']]+=1
                    allowed=option['assembly_assessment']['decision']!='block' if separate else collision['status']=='clear'
                    (clear if allowed else failed).append(option)
            reviewed+=1
            if failed or not clear:
                exclusions.append({'template_ref':candidate['template_ref'],'owner_refs':owners,'interface_a_ref':match['interface_a_ref'],
                    'interface_b_ref':match['interface_b_ref'],'geometric_match_ref':match['id'],'member_count':match['member_count'],
                    'status':'some_placements_excluded' if clear else 'no_clear_published_placement' if failed else 'no_finite_boundary_seat','alignment_options':failed})
            if not unique:unseated+=1
            if not clear:continue
            item=deepcopy(match);item.update(alignment_options=clear,alignment_count=len(clear),member_pairs=clear[0]['member_pairs'],registration=clear[0]['registration'],
                assessment='complete_interface_with_separate_assembly_assessment' if separate else 'complete_interface_with_clear_fixed_source_pose',excluded_alignment_count=len(failed))
            item['evidence_refs']=sorted(set(item['evidence_refs']+[request['evidence_ref']]))
            item['id']='interface-match:'+_key(item);matches.append(item)
        if matches:
            item=deepcopy(candidate);item.update(interface_matches=matches,assessment_scope='complete_interface_fixed_pose',placement_evaluated=True,whole_part_collision_evaluated=True)
            edges={(p['feature_a_ref'],p['feature_b_ref']) for m in matches for o in m['alignment_options'] for p in o['member_pairs']}
            item['mapping_family']['pairs']=[p for p in item['mapping_family']['pairs'] if (p['feature_a_ref'],p['feature_b_ref']) in edges]
            for side,e in enumerate(item['endpoints']):e['feature_refs']=sorted({p[side] for p in edges})
            item['geometric_witness'].update(kind='complete_interface_assessed_fixed_source_pose' if separate else 'complete_interface_clear_fixed_source_pose',interface_match_count=len(matches))
            item['unresolved_conditions']=[c for c in item['unresolved_conditions'] if c!='placement_collision_and_retention_not_evaluated']+['assembly_path_and_retention_not_evaluated']
            fit_conditions={condition for m in matches for o in m['alignment_options'] for p in o['member_pairs']
                            for condition in p.get('radial_fit',{}).get('unresolved_conditions',[])}
            if fit_conditions:item['unresolved_conditions']=sorted(set(item['unresolved_conditions'])|fit_conditions)
            item['id']='compatibility:'+_key(item);accepted.append(item)
        if progress and reviewed%100<8:progress({'phase':'whole_part_interference','reviewed_interface_matches':reviewed,'pose_dispositions':dict(totals),'unique_source_poses':len(context.results)})
    accepted.sort(key=lambda c:c['id']);result['candidates']=accepted;result['placement_exclusions']=exclusions
    by_pair=defaultdict(list)
    for c in accepted:by_pair[tuple(e['owner_ref'] for e in c['endpoints'])].append(c)
    statuses={t['id']:Counter() for t in result['templates']}
    for row in result['coverage']['pair_dispositions']:
        for disposition in row['templates']:
            ids=[c['id'] for c in by_pair[tuple(row['owner_refs'])] if c['template_ref']==disposition['template_ref']]
            if disposition['status']=='candidates' and not ids:disposition['status']='no_clear_fixed_placement'
            disposition['candidate_refs']=ids;statuses[disposition['template_ref']][disposition['status']]+=1
    for by in result['index'].values():
        for key in by:by[key]=[]
    for c in accepted:
        owners=[e['owner_ref'] for e in c['endpoints']]
        for owner in owners:result['index']['by_owner'][owner].append(c['id'])
        result['index']['by_template'][c['template_ref']].append(c['id']);result['index']['by_pair'][_canonical(owners)].append(c['id'])
    result['coverage'].update(placement_evaluated=True,whole_part_collision_evaluated=True,whole_part_interference_method=METHOD,
        fixed_pose_dispositions=dict(totals),unique_source_pose_count=len(context.results),interface_candidate_count=len(accepted),
        unseated_interface_match_count=unseated,
        interface_match_count=sum(len(c['interface_matches']) for c in accepted),compatible_owner_pair_count=sum(bool(cs) for cs in by_pair.values()),
        template_dispositions={k:dict(v) for k,v in statuses.items()},
        placement_scope='Enumerated finite interface boundary seats in unchanged source solids; no insertion path, retention, moving subframe or load proof')
    result['input_digest']='sha256:'+hashlib.sha256(_canonical([result['input_digest'],request,[c['id'] for c in accepted]]).encode()).hexdigest()
    if separate:
        result['assembly_policy']=request['assembly_policy']
        result['coverage']['assembly_assessment_schema']='psop.assembly-assessment/1'
        result['coverage']['geometry_is_operation_gate']=False
        if contact_qualified:result['coverage']['interface_contact_method']='finite-interface-contact-regions/1'
    return result
