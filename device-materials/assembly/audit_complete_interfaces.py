"""Independently check every published interface member and rigid registration.

This reads frozen source members instead of trusting duplicated witness points.
It does not import the candidate generator or its registration implementation.
"""
from __future__ import annotations
import argparse
from collections import Counter
import gzip
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


def audit(root):
    def read(relative):
        p=root/relative;raw=p.read_bytes()
        return json.loads((gzip.decompress(raw) if p.suffix=='.gz' else raw).decode('utf-8'))
    manifest=read('manifest.json');index=read('indexes/compatibility.json');ci=read('indexes/capabilities.json')
    authored=read('sources/SRC-MD-ASSEMBLY-CATALOG.json');policy=authored['provenance']['compatibility_interface_policy']
    original={i['id']:i for i in authored['catalog']['interfaces']}
    features={};interfaces={}
    for entry in ci['parts'].values():
        detail=read(entry['path'])
        features.update({f['id']:f for f in detail['features']})
        interfaces.update({i['id']:i for i in detail['interfaces']})
    required={r['interface_ref']:r['member_count'] for r in policy['required_patterns']}
    modern=policy['schema']=='psop.interface-matching-policy/2'
    selections={r['interface_ref']:r['allowed_member_sets'] for r in policy.get('member_selections',[])}
    qualified={r['interface_ref'] for r in policy.get('interface_qualifications',[])}
    def dot(a,b):return sum(x*y for x,y in zip(a,b))
    def sub(a,b):return [x-y for x,y in zip(a,b)]
    def length(p):return math.sqrt(dot(p,p))
    def transform(r,p):return [dot(row,p) for row in r]
    def member_refs(member):
        return {ref for source in member['feature_refs'] for ref in (features[source].get('replacement_feature_refs') or [source])}
    def member_resources(member,kind):
        return {resource for ref in member_refs(member) if features[ref]['kind']==kind
                for resource in features[ref].get('capability',{}).get('resource_refs',[ref])}
    checked_matches=checked_registrations=rotor_matches=0;mechanisms=Counter();pairs=[];largest_error=0.
    for record in index['pairs']:
        detail=read(record['path']);cs=detail['candidates'];local=detail.get('local_geometry_clues',[])
        assert len(cs)==record['candidate_count']
        assert len(local)==record['local_geometry_count']
        assert sum(len(c['interface_matches']) for c in cs)==record['interface_match_count']
        for candidate in cs:
            mechanisms[candidate['template_ref']]+=1
            assert candidate['interface_matching_method']=='complete-functional-interface-matching/'+('2' if modern else '1')
            assert candidate['placement_evaluated'] is bool(policy.get('whole_part_interference'))
            for match in candidate['interface_matches']:
                checked_matches+=1
                sides=[interfaces[match['interface_a_ref']],interfaces[match['interface_b_ref']]]
                assert all(s['id'] in original or s['id'] in qualified for s in sides)
                assert [s['owner_ref'] for s in sides]==record['owner_refs']
                assert match['alignment_count']==len(match['alignment_options'])>0
                for option in match['alignment_options']:
                    checked_registrations+=1
                    member_pairs=option['member_pairs'];assert len(member_pairs)==match['member_count']
                    maps=[{m['id']:m for m in s['members']} for s in sides]
                    for side_index,side in enumerate(('a','b')):
                        selected=[p['member_'+side+'_ref'] for p in member_pairs]
                        assert len(set(selected))==len(selected)
                        interface=sides[side_index]
                        if interface['id'] in required:
                            assert len(selected)==required[interface['id']]==4
                            assert set(selected)==set(maps[side_index])
                        if modern and interface['id'] in selections:
                            assert set(selected) in [set(p) for p in selections[interface['id']]]
                        elif interface['selection']['kind']=='adjacent_pair':
                            assert set(selected) in [set(p) for p in interface['selection']['allowed_pairs']]
                        else:
                            ref=member_pairs[0]['feature_'+side+'_ref'];role=features[ref]['kind']
                            all_resources=set().union(*(member_resources(m,role) for m in interface['members']))
                            selected_resources=set().union(*(member_resources(maps[side_index][m],role) for m in selected))
                            assert selected_resources==all_resources,'all functional physical members must be represented'
                    if any(s['id'] in required for s in sides):rotor_matches+=1
                    reg=option['registration'];r=reg['rotation_b_to_a'];t=reg['translation_b_to_a']
                    if policy.get('whole_part_interference'):
                        assert option['interference']['status']=='clear' and reg['whole_part_collision_evaluated'] is True
                        assert option['seating']['display_gap_m']==0
                        for pair in member_pairs:
                            for side in ('a','b'):
                                g=features[pair['feature_'+side+'_ref']]['geometry'];axis=g['axis'];ends=g.get('axial_range_m',[0.,g.get('length_m',0.)])
                                positions=[[v+u*t for v,u in zip(g['origin'],axis)] for t in (*ends,sum(ends)/2)]
                                assert min(length(sub(pair['contact_'+side],p)) for p in positions)<1e-10
                    assert len(r)==3 and all(len(row)==3 for row in r)
                    assert all(math.isfinite(v) for row in r for v in row)
                    for i in range(3):
                        for j in range(3):assert abs(dot(r[i],r[j])-(1. if i==j else 0.))<1e-8
                    determinant=(r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]))
                    assert abs(determinant-1.)<1e-8
                    for pair in member_pairs:
                        a=maps[0][pair['member_a_ref']];b=maps[1][pair['member_b_ref']]
                        assert pair['position_a']==a['position'] and pair['position_b']==b['position']
                        assert pair['feature_a_ref'] in member_refs(a) and pair['feature_b_ref'] in member_refs(b)
                        if modern and candidate['template_ref'].split(':')[1] in {'cylindrical_insertion','conical_insertion','bearing_fit'}:
                            fs=[features[pair['feature_'+side+'_ref']] for side in ('a','b')]
                            def radii(f):
                                g=f['geometry']
                                return [g['radius_m']]*2 if g['type']=='cylinder' else sorted([g['radius_start_m'],g['radius_end_m']])
                            male,female=(fs if fs[0]['kind']=='shaft_wall' else fs[::-1])
                            gaps=[y-x for x,y in zip(radii(male),radii(female))]
                            rules=[rule for rule in policy.get('radial_fit_rules',[]) if rule['interface_ref'] in [s['id'] for s in sides] and candidate['template_ref'].split(':')[1] in rule['mechanisms']]
                            assert pair['radial_fit']['radial_clearance_m']==gaps
                            if rules:
                                for rule in rules:assert rule['radial_clearance_m'][0]-4e-5<=min(gaps)<=max(gaps)<=rule['radial_clearance_m'][1]+4e-5
                            else:assert max(map(abs,gaps))<=4e-5
                        delta=sub(sub(a['position'],transform(r,b['position'])),t);axis=a['direction']
                        error=length([v-dot(delta,axis)*n for v,n in zip(delta,axis)])
                        largest_error=max(largest_error,error)
                        assert error<=reg['comparison_margin_m']+1e-12
                        expected=-1. if reg['entry_relation']=='opposed' else 1.
                        assert abs(dot(a['direction'],transform(r,b['direction']))-expected)<2e-5
        pairs.append({'owner_refs':record['owner_refs'],'status':'complete_interface_candidate' if cs else 'no_clear_fixed_placement' if detail.get('placement_exclusions') else 'local_geometry_only' if local else 'no_local_candidate',
                      'candidate_count':len(cs),'interface_match_count':record['interface_match_count'],'local_geometry_count':len(local)})
    coverage=read('indexes/coverage.json')['candidate_coverage']
    assert len(pairs)==coverage['evaluated_unordered_instance_pairs']==2415
    assert sum(p['candidate_count']>0 for p in pairs)==coverage['compatible_owner_pair_count']
    assert checked_matches==coverage['interface_match_count']
    assert len(original)+len(qualified)==coverage['functional_interfaces_reviewed']
    return {'ok':True,'package_version':manifest['package_version'],'package_digest':manifest['package_digest'],
        'parts':manifest['counts']['parts'],'functional_interfaces':len(original),'required_rotor_patterns':len(required),'checked_pairs':len(pairs),
        'compatible_pairs':sum(p['candidate_count']>0 for p in pairs),'local_only_pairs':sum(p['status']=='local_geometry_only' for p in pairs),
        'no_clear_fixed_placement_pairs':sum(p['status']=='no_clear_fixed_placement' for p in pairs),
        'checked_interface_matches':checked_matches,'checked_registrations':checked_registrations,'checked_rotor_registrations':rotor_matches,
        'largest_axis_residual_m':largest_error,'candidate_counts_by_mechanism':dict(mechanisms),'scope':'Complete selected source-interface axes and exact finite seating replay; independent whole-solid CSG audit is separate; paths and retention unqualified' if policy.get('whole_part_interference') else 'Complete selected source-interface axes; whole-part collisions, installation paths and retention remain unqualified',
        'pair_dispositions':pairs}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dkp',type=Path,default=ROOT/'build/microduck/source-1.15/microduck-capabilities-9.dkp')
    parser.add_argument('--output',type=Path,default=ROOT/'build/interference-review/interface-audit.json')
    args=parser.parse_args();report=audit(args.dkp)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='pair_dispositions'},ensure_ascii=False))


if __name__=='__main__':main()
