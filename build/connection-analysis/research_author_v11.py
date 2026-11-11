"""Executed research authoring; not imported by the deterministic Build."""
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'skills/psop-build/scripts'))
sys.path.insert(0, str(ROOT / 'device-materials/interface-review'))
from psop_build_v2.connection_analysis import local_pairings
from review_connection_sources import run, locate
from independent_sections import triangles

parent, annotations, source_report = run()
base = ROOT / 'build/microduck/source-1.10/microduck-1.dkp'
scene = json.loads((base / 'indexes/scene.json').read_text(encoding='utf-8'))
analysis = scene['analysis']
parts = {p['id']: p for p in scene['parts']}
candidates = {c['id']: c for c in analysis['structure_candidates']}
sources = {s['id']: s for s in scene['sources']}
studies = []
expected = []
reviewed = set()
captured = []
sample_map = {s['part_ref']: s for s in parent['samples']}
for ref, sample in annotations.items():
    if ref in sample_map:
        sample_map[ref]['expected_features'].extend(sample['expected_features'])
    else:
        parent['samples'].append(sample)
        sample_map[ref] = sample


def source(ref):
    return sources[parts[ref]['sourceIds'][-1]]


def annotation(ref, candidate):
    src = source(ref)
    fs = triangles((base / src['url']).read_bytes())
    g = candidate['geometry']
    # This plane and nominal section are independently re-intersected against
    # the original STL, preserving the entire resulting contour witnesses.
    key = [parts[ref]['meshKey'], [round(x, 8) for x in g['center']], [round(x, 6) for x in g['axis']], round(g['radius_m'], 8)]
    identity = 'CR-SECTION-' + hashlib.sha256(json.dumps(key).encode()).hexdigest()[:12]
    feature, report = locate(fs, identity, list(g['center']), list(g['axis']), g['radius_m'])
    captured.append({'part_ref': ref, 'geometry_sha256': src['digest'], 'center_local_m': g['center'], 'axis_local': g['axis'],
        'radius_m': g['radius_m'], 'triangle_witnesses': feature['triangle_witnesses'], **report})
    sample = sample_map.get(ref)
    if sample is None:
        sample = {'part_ref': ref, 'mesh_key': parts[ref]['meshKey'], 'source_path': src['path'], 'geometry_sha256': src['digest'], 'regions': [], 'expected_features': []}
        sample_map[ref] = sample; parent['samples'].append(sample)
    if not any(f['id'] == identity for f in sample['expected_features']):
        sample['expected_features'].append(feature)
    return identity


def participant(ref, structures, annotations=None, label=None):
    cs = [candidates[r] for r in structures]
    return {'part_ref': ref, 'geometry_sha256': source(ref)['digest'], 'role': 'local_structure_carrier',
        'label': label or parts[ref]['name'] + ' · 源局部有限结构',
        'position_local_m': [sum(c['geometry']['center'][i] for c in cs)/len(cs) for i in range(3)],
        'structure_refs': structures, 'feature_refs': sorted({x for c in cs for x in c['related_feature_refs']}),
        'opening_refs': sorted({x for c in cs for x in c['related_opening_refs']}),
        **({'annotation_refs': annotations} if annotations else {})}


def actions(refs, observation, manufacturer=False):
    refs = sorted({r for p in refs for r in parts[p]['sourceIds']})
    result = [{'method': '实际读取双方原始 STL 并重新求三角-平面交线；在唯一来源 qpos0 下核对有限壁段、孔径与全部组距',
        'source_refs': refs + ['connection-source-sections-2026-11-07', 'hip-connection-studies-2026-11-07'], 'observation': observation},
        {'method': '重新读取模型版本说明、材料总说明、HAT C1 说明与两份板级 CSV，查找该组的机械 BOM/活动区依据',
         'source_refs': ['SRC-000008', 'SRC-000055', 'SRC-000054', 'SRC-000049', 'SRC-000053'],
         'observation': '这些原件没有该组紧固件、保持和活动区的逐孔依据；板级 BOM 不能补成机械 BOM。'}]
    if manufacturer:
        result.append({'method': '实际查看固定 ROBOTIS 前后框架/惰轮装配图及舵盘螺钉图，比较穿板接收机制与长度限制',
            'source_refs': ['SRC-MD-XL330-ASSEMBLY-DRAWING','SRC-MD-XL330-HORN-SCREW'],
            'observation': '原图支持穿板进入舵机接收结构的机制；前后框架、惰轮盖与舵盘不可混为同一活动区域，图上螺钉规格/数量不直接移植。'})
    return result


def four_roles(refs, support, location, retention, motion, limit):
    return [{'role': role, 'status': 'supported_hypothesis' if support and role == 'location' else 'geometric_support' if role == 'location' else 'unknown',
        'statement': statement, 'participant_refs': refs} for role, statement in zip(('location','retention','motion','limit'), (location, retention, motion, limit))]


# Actual finite counterpart survey over all 211 existing reviews. The explicit
# research scope is the small-hole groups listed here, not all broad AABB pairs.
group_studies = []
for review in analysis['connection_reviews']:
    refs = [p['part_ref'] for p in review['participants']]
    pairs = local_pairings(refs, candidates, parts)
    small = [p for p in pairs if p['kinds'] == ['bore_wall','bore_wall']
        and min(p['geometry_checks'][0]['value']) <= .00211
        and .002 <= max(p['geometry_checks'][0]['value']) <= .003
        and p['geometry_checks'][2]['value'] <= .00101]
    if len(small) < 2:
        continue
    if any({x['part_ref'] for x in h['participants']} == set(refs) for h in analysis['installation_hypotheses']):
        continue  # Preserve the original three studies and hypotheses exactly.
    selected, failures = [], []
    annotations_by_side = [[], []]
    for pair in small:
        members = [candidates[r] for r in pair['structure_refs']]
        if any(c['measurement'].get('coverage',0) < .95 for c in members):
            failures.append('有限孔壁角覆盖不足95%，不能作为完整螺钉孔通道：' + ','.join(pair['structure_refs']));continue
        try:
            ids = [annotation(ref,c) for ref,c in zip(refs,members)]
        except ValueError as error:
            failures.append(str(error));continue
        selected.append(pair)
        for i, identity in enumerate(ids): annotations_by_side[i].append(identity)
    if not selected:
        selected = small
    unique_sides = [list(dict.fromkeys(p['structure_refs'][i] for p in selected)) for i in (0,1)]
    raw_success = not failures and all(annotations_by_side)
    diameters = [p['geometry_checks'][0]['value'] for p in selected]
    receiving_side = 0 if sum(d[0] for d in diameters) < sum(d[1] for d in diameters) else 1
    clearance_side = 1-receiving_side
    four = len(selected) == 4 and all(len(u) == 4 for u in unique_sides)
    supported = raw_success and four and all(d[receiving_side] <= .0017 and d[clearance_side] >= .0021 for d in diameters)
    has_three_plus = any(len(u) > 4 for u in unique_sides)
    identity = 'review-' + review['id'].rsplit(':',1)[-1]
    both = ' ↔ '.join(parts[r]['name'] for r in refs)
    outcome = 'supported_hypothesis' if supported else 'insufficient'
    summaries = [p['statement'] for p in selected]
    local_labels = ['；'.join('(' + ', '.join(f'{v*1000:.3f}' for v in candidates[r]['geometry']['center']) + ') mm' for r in side) for side in unique_sides]
    findings = [f'双方具体源局部位置：{parts[refs[0]]["name"]} {local_labels[0]}；{parts[refs[1]]["name"]} {local_labels[1]}。',
        f'实际独立截面及共同构型比较了 {len(selected)} 组有限孔壁。' + ' '.join(summaries)]
    if supported:
        findings.append('四条轴线与孔组在一个固定构型中对应；Ø1.6 mm接收孔/较大通过孔与厂家穿板装配图共同支持螺钉夹持解释，不确认实物螺纹或紧固。')
    else:
        findings.append('已执行具体孔组调查，但不能仅凭互补直径与相邻把本组升级为安装假设。' + ('双方接近通过孔，缺螺纹、螺母或嵌件的承接依据。' if not has_three_plus else '一个部件有多个轴段/侧别，尚不能把所有几何成员当成单一实际选用孔组。'))
    if failures:
        findings.extend('实际源截面限制：' + f for f in failures)
    missing = [f'{parts[refs[clearance_side]]["name"]}这组孔的装入侧、完整头部承座及实际使用孔数尚未由装配图确认。',
        f'{parts[refs[receiving_side]]["name"]}对应孔的实际螺纹/螺母/嵌件身份、螺钉长度、材料与制造公差缺证。',
        '该局部接收区域归舵机壳体、输出舵盘还是其他活动件，以及实际保持、限位、连续路径与载荷未确认。']
    roles = four_roles(refs,supported,
        f'{len(selected)}组有限孔壁和所有对应轴/组距为连接件轴线与板件相位提供几何定位解释；未将源body当固定依据。',
        '条件性保持路径为螺钉头压板→接收螺纹/螺母；源模型无螺钉及螺纹，实际夹紧、抗拔与承载仍未知。',
        '必须分别确认舵机壳体/输出件的局部归属；同一个STL网格或同一个仿真body不证明整件刚性随动。',
        '孔壁、台阶或扩口不自动证明行程限位、止转或允许旋入深度，需核对实物承座与干涉。')
    study={'id':identity,'title':both + (' · 四孔螺钉夹持假设' if supported else ' · 孔组已调查待证'),
        'work_status':'investigated','outcome':outcome,
        'participants':[participant(ref,unique_sides[i],list(dict.fromkeys(annotations_by_side[i])), parts[ref]['name']+' · 本次有限孔组') for i,ref in enumerate(refs)],
        'actions':actions(refs,' '.join(findings),True),'findings':findings,'roles':roles,
        'mechanism_candidates':[{'kind':'screw_clamp','status':outcome,'summary':f'螺钉通过{parts[refs[clearance_side]]["name"]}的本组大孔，进入{parts[refs[receiving_side]]["name"]}接收结构形成夹持。' + ('有几何与一般机制依据，实际保持未知。' if supported else '缺实际承接/选孔/活动区证据，尚为待证机制。')}],
        'counterevidence':['STL为简化的参考外形，所见圆柱不包含制造螺纹、真实紧固件或预紧；几何阈值不是公差。'] + failures,
        'alternatives':['也可能通过分离舵盘、独立嵌件或穿透螺钉/螺母承接；这些部件在当前源模型未分体确认。'],
        'intermediate_components':[{'kind':'screw','requirement':'required','status':'unconfirmed','statement':'若采用所述夹持机制，必须有独立螺钉；实际数量、规格及保持状态没有BOM依据。'}],
        'missing_evidence':missing,'next_actions':[f'按列出的局部坐标复核{parts[ref]["name"]}内外侧承座/入口；取得同修订分体CAD或逐孔装配图以确认接收区域和真实紧固件。' for ref in refs],
        'stop_reason':'已执行原STL独立截面、完整共同位姿/孔组、版本与厂家机制图比较；固定原件没有实际螺纹、保持及活动区资料。'}
    if supported:
        study['hypothesis']={'mechanism':{'kind':'screw_clamp','summary':study['mechanism_candidates'][0]['summary']},
            'supporting_evidence':[{'claim':'双方原三角闭合内壁、互补孔径、一一轴线和全组距均在一个固定构型下复核。','source_refs':sorted({parts[r]['sourceIds'][-1] for r in refs})+['SRC-MD-MJCF','connection-source-sections-2026-11-07']},
                {'claim':'厂家前后框架/舵盘图支持螺钉穿板进入接收结构的有界机制；不用于确认Microduck实际规格或活动区。','source_refs':['SRC-MD-XL330-ASSEMBLY-DRAWING','SRC-MD-XL330-HORN-SCREW']}]}
        study['geometry_requirements']={'nominal_connector_diameter_m':.002,'axis_tolerance_m':.00015,'max_finite_gap_m':.00101,'clearance_participant':clearance_side}
    studies.append(study);reviewed.add(review['id']);group_studies.append(study)


def structure(ref, kind, center, radius):
    matches = [c for c in candidates.values() if c['owner_ref']==ref and c['kind']==kind and c['geometry']['type']=='cylinder'
        and math.dist(c['geometry']['center'],center)<.00001 and abs(c['geometry']['radius_m']-radius)<.000002]
    if not matches:raise ValueError((ref,kind,center,radius))
    return max(matches,key=lambda c:c['measurement'].get('coverage',0))['id']


# The six-entry hip regression includes four non-clamp outcomes, and is not
# inferred from the successful screw records above.
contexts=[]
for hip,bearing_a,bearing_b,bracket,yaw in [
    ('part:microduck:fa9ee2f71faafb88','part:microduck:47a950fbb3d0e416','part:microduck:bb34e925e25e29f6','part:microduck:cb253f38c818b9d8','part:microduck:55970da91992f38c'),
    ('part:microduck:c7eeeac0a640d191','part:microduck:3fbf0b5c8cea4488','part:microduck:d924e1596ffb042a','part:microduck:c703574f50f6a46a','part:microduck:48099e14105d3289')]:
    for other,mode in [(bearing_a,'journal-y'),(bearing_b,'journal-x'),(bracket,'indirect-bearing'),(yaw,'bounds-only')]:
        review=next(r for r in analysis['connection_reviews'] if {p['part_ref'] for p in r['participants']}=={hip,other})
        pairings=local_pairings([hip,other],candidates,parts)
        if mode.startswith('journal'):
            hip_center=[.0175,-.017525,0.] if mode=='journal-y' else [.039475,0.,0.]
            hs=structure(hip,'shaft_wall',hip_center,.008); os=structure(other,'bore_wall',[0.,0.,.002],.008)
            findings=['髋部完整外向轴颈Ø16 mm，轴承完整内壁Ø16 mm；口部Ø16.4 mm是倒角，不是配合壁直径。',
                '在唯一qpos0配置中双方同轴，有限壁段重叠约1.75 mm；相等的名义尺寸不证明过盈等级或已接合。']
            mechanisms=[{'kind':'bearing_journal','status':'geometric_support','summary':'髋轴颈位于轴承内圈的名义径向位置，肩面可解释单向轴向承接；轴承两环可能相对转动，实际环归属和抗拔未确认。'}]
            roles=four_roles([hip,other],False,'Ø16轴颈与完整Ø16内壁及有限重叠支持名义径向定位；不由入口倒角推断间隙等级。',
                '肩端最多支持一侧轴向承接；反向抗拔、压配或盖件无依据，实际保持未知。',
                '轴承两环间的转动是具体机制候选，髋、内圈、外圈和对端活动框架仍需分体CAD/装配图确定。',
                '端面可能限定单向轴向位置；没有完整轴向堆叠/止推/行程限位依据。')
            missing=['轴承具体型号/修订、真实内外圈尺寸及髋轴颈制造公差尚无依据。','内外圈分别跟随哪个部件，以及完整轴向保持件/载荷和润滑未确认。']
            counter=['源模型名义零间隙不能证明压配；轴承外壁Ø22和入口倒角不能代替完整Ø16内壁。']
            alt=['可能为松配定位、带独立套筒或仅参考外形留置，不能确认实机已安装或已保持。']
            extra=[{'kind':'axial_retainer','requirement':'possible','status':'unconfirmed','statement':'反向保持可能需要压盖、卡环或相邻夹持件；当前未定位真实件，不能自动创建示意保持实体。'}]
        elif mode=='indirect-bearing':
            hs=structure(hip,'shaft_wall',[.0175,-.017525,0.],.008);os=structure(other,'bore_wall',[.0175,-.014,0.],.0095)
            findings=['髋Ø16轴颈与横滚支承件Ø19孔同轴，但有限壁相隔约2.05 mm，径向差1.5 mm，没有直接插入/径向贴合。',
                '中间已有真实源轴承'+bearing_a+'：轴承内圈对髋轴颈、外圈端面靠支承件孔周面是三件支承链候选；Ø19孔不能径向压配Ø22外圈。']
            mechanisms=[{'kind':'indirect_bearing_support','status':'insufficient','summary':'保留髋轴颈—真实源轴承—支承件端面/孔周承接的间接支承候选，排除直接轴孔精确配合；完整保持未证。'}]
            roles=four_roles([hip,other],False,'直接Ø16/Ø19径向尺寸和有限范围不互补；定位如存在，应经中间轴承的两环传递。',
                '支承件孔周可能提供端面挡肩，但不证明夹持外圈、抗拔或另一侧保持。',
                '可能由轴承环间转动解耦髋和支承件，不能把同body或同轴解释为固定。',
                '孔周端面可能为单向挡肩；限位、实际接触和全堆叠尚缺依据。')
            roles[0]['status']='contradicted'
            missing=['轴承外圈端面与支承件孔周的真实接触和完整轴向保持件缺证。','髋/轴承两环/支承件的活动归属、公差及载荷需匹配修订CAD或装配图。']
            counter=['Ø19孔小于Ø22外圈，不能作为外圈径向压配座；Ø16轴颈和Ø19孔自身又没有径向贴合或有限插入。']
            alt=['可能以孔周端面挡住轴承外圈，也可能只是让位；不能从孔名确定保持。']
            extra=[{'kind':'source_bearing','requirement':'candidate_path','status':'source_present','statement':'具体第三件为'+bearing_a+'，只确认源模型中存在，不声明接触或已保持。'}]
        else:
            hs=structure(hip,'shaft_wall',[.0175,-.017525,0.],.008);os=structure(other,'shaft_wall',[.0175,-.002,.013475],.008)
            findings=['已比较双方全部有限圆柱结构：在唯一参考构型下，没有轴距≤0.15 mm且有限间隔≤5 mm的直接局部配对。',
                '旧审查只有包围盒相关，没有geometry_observation_refs、局部孔组或补全件；共享仿真body不是物理连接依据。']
            mechanisms=[{'kind':'indirect_mechanism_context','status':'insufficient','summary':'可能经舵机、轴承和横滚支承件构成间接机构；当前未建立此两件的直接固定、卡扣或轴孔机制。'}]
            roles=four_roles([hip,other],False,'未定位直接接触/互补结构；显示的双方轴颈仅标明实际调查区域，不声称它们相配。',
                '没有直接紧固/保持结构依据，不能套用厂家螺钉图补齐本对。',
                '仅能在更大舵机/轴承机构语境讨论相对运动，源body/相邻不能证明刚性固定。',
                '没有本对独立的止转、止推或行程限位依据。')
            missing=['同修订CAD中局部非圆面、槽或分体接触以及经过哪些实际中间件的机构链尚缺。','直接连接、紧固件或活动框架关系没有装配说明支持。']
            counter=['包围盒重叠及共body不提供有限接触、互补尺寸或保持路径。']
            alt=['两件可能仅在同一机构中经其他零件间接关联，也可能在不同运动构型接近；缺直接配对不代表永久不能安装。']
            extra=[]
        refs=[hip,other]
        study={'id':'review-'+review['id'].rsplit(':',1)[-1],'title':parts[hip]['name']+' ↔ '+parts[other]['name']+' · 已调查待证',
            'work_status':'investigated','outcome':'insufficient','participants':[participant(hip,[hs]),participant(other,[os])],
            'actions':actions(refs,' '.join(findings)), 'findings':findings,'mechanism_candidates':mechanisms,'roles':roles,
            'counterevidence':counter,'alternatives':alt,'intermediate_components':extra,'missing_evidence':missing,
            'next_actions':['按双方明确局部位置隔离/剖切，检查环、孔周端面、轴向挡肩及实际中间件；需匹配修订的分体CAD或逐件装配图。'],
            'stop_reason':'已完成原网格具体结构与共同参考构型比较，保留支持/反证；固定本地原件缺少分体活动区、真实保持及机械BOM。'}
        studies.append(study);reviewed.add(review['id'])
    contexts.append({'id':'relation-context:'+hip.rsplit(':',1)[-1]+':bearing-support','title':'髋轴颈—轴承—横滚支承件的三件支承语境',
        'part_refs':[hip,bearing_a,bracket], 'statement':'髋Ø16轴颈与轴承Ø16完整内壁同轴重叠；轴承Ø22外圈端面与支承件Ø19孔周面相对。孔周可形成端面挡肩的解释，不能把Ø19孔当Ø22外圈径向压配座；完整轴向保持与活动环归属仍未确认。',
        'missing_evidence':['真实环归属、双向轴向保持/压盖、公差、接触及载荷未确认。'],
        'source_refs':['SRC-000019','SRC-000034','SRC-000013','SRC-MD-MJCF']})


# Independently selected omission cases: six actual hip pairs plus a different
# previously undeclared part family. The denominator is not all producer rows.
hip='part:microduck:fa9ee2f71faafb88'
for review in analysis['connection_reviews']:
    refs=[p['part_ref'] for p in review['participants']]
    if hip in refs or set(refs)=={'part:microduck:07e507f1e9297aa3','part:microduck:7c130c8489b57c99'}:
        study=next(s for s in studies if {p['part_ref'] for p in s['participants']}==set(refs))
        expected.append({'id':'EXPECT-'+review['id'].rsplit(':',1)[-1], 'part_refs':refs,'outcome':study['outcome'],
            'mechanism':study['mechanism_candidates'][0]['kind'],
            'basis':'Independently re-intersected original source triangles at the listed finite local structures, one fixed source configuration, and separately inspected mechanism/counterevidence. Each reviewed outcome must survive deletion or generic-next-action replacement.'})

source_report['additional_pair_sections']=captured
source_report['additional_pair_sections_count']=len(captured)
source_report['actual_pair_investigations']=len(studies)
source_report['new_supported_review_hypotheses']=sum(s['outcome']=='supported_hypothesis' for s in studies)
source_path=ROOT/'device-materials/interface-review/references/connection-source-sections.json'
source_path.write_text(json.dumps(source_report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
parent['schema']='psop.interface-investigation/1.2'
parent['revision']='connection-review-analysis-2026-11-07.1'
parent['parent_investigation_sha256']=hashlib.sha256((ROOT/'device-materials/interface-review/microduck-relations.json').read_bytes()).hexdigest()
parent['connection_review_studies']=studies
parent['expected_review_findings']=expected
parent['relation_contexts']=contexts
for identity,path in [('connection-source-sections-2026-11-07','references/connection-source-sections.json'),('hip-connection-studies-2026-11-07','references/hip-connection-studies.md')]:
    parent['sources'].append({'id':identity,'url':'https://github.com/Scisaga/psop/blob/main/device-materials/interface-review/'+path,
        'revision':'fixed source cb70b792312d559a4da09064d92009079671815f; project research 2026-11-07',
        'capture_path':path,'sha256':hashlib.sha256((ROOT/'device-materials/interface-review'/path).read_bytes()).hexdigest(),
        'supports':['Executed source-section, finite common-configuration and mechanism evidence review; geometric support and actual retention remain distinct.'],
        'limitations':['This is captured project research, not manufacturer device-specific approval or a confirmed BOM.']})
dest=ROOT/'device-materials/interface-review/microduck-connection-analysis.json'
dest.write_text(json.dumps(parent,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'input':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'new_studies':len(studies),
    'new_hypotheses':source_report['new_supported_review_hypotheses'],'source_section_checks':len(captured),'independent_expected':len(expected)},ensure_ascii=False))
