"""Transparent homepage EG overview, abstracted from the teaching task.

Installation actions are merged into one cover action. Evidence review retains
the existing identity/recheck AND join, while full detail belongs in compile.
The only displayed token is pending alignment; no real success is asserted.
Use at 900 x 250 or larger to preserve 22–24 px node labels.
"""
from copy import deepcopy
from pathlib import Path
import argparse
import hashlib
import json
import xml.etree.ElementTree as ET

from svg_lib import FONT, NS, text

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
SOURCE = ROOT / 'prototypes' / 'eg-cpn.svg'
VIEWBOX = (0, 0, 900, 250)
BLUE, TEAL, AMBER = '#A7D8EE', '#79DBCB', '#F1BE70'
LABEL = '#D2EAF5'


def _n(ident, kind, x, y, label, *, source=None, tone='normal',
       token=False, current=False, size=22, label_offset=44):
    return dict(id=ident, kind=kind, x=x, y=y, label=label,
                source_node=source, tone=tone, token=token,
                current=current, font_size=size, label_offset=label_offset)


NODES = [
    _n('p_task', 'place', 40, 55, '任务', source='p_task', size=24),
    _n('p_device', 'place', 40, 175, '设备', source='p_cell', size=24),
    _n('t_bind', 'transition', 135, 115, '绑定', source='t_load', size=24),
    _n('p_align', 'place', 235, 115, '待对齐', token=True, current=True, size=24),
    _n('t_install_macro', 'transition', 345, 115, '对齐安装',
       tone='current', current=True, size=24),
    _n('p_identity_pending', 'place', 455, 55, '身份记录', source='p_config'),
    _n('p_recheck_pending', 'place', 455, 175, '复检记录', source='p_cal'),
    _n('t_identity', 'transition', 555, 55, '身份核验', source='t_config', tone='verify'),
    _n('t_recheck', 'transition', 555, 175, '复检核验', source='t_cal', tone='verify'),
    _n('p_identity_ok', 'place', 650, 55, '身份通过', source='p_configok', tone='verify'),
    _n('p_recheck_ok', 'place', 650, 175, '复检通过', source='p_calok', tone='verify'),
    _n('t_join', 'transition', 750, 115, '条件汇合', source='t_join', tone='verify', size=24,
       label_offset=88),
    _n('p_next', 'place', 855, 115, '下一步', source='p_ready', tone='verify', size=24),
]


def _e(a, b, d, tone='normal', guard=None):
    return dict(source=a, target=b, path=d, tone=tone, guard=guard)


# The specified two-input / two-review / one-output topology has 13 arcs.
# Every arrow below connects a place and a transition; none is decorative.
EDGES = [
    _e('p_task', 't_bind', 'M60 55C94 55 101 109 123 112'),
    _e('p_device', 't_bind', 'M60 175C94 175 101 121 123 118'),
    _e('t_bind', 'p_align', 'M145 115H213'),
    _e('p_align', 't_install_macro', 'M257 115H333'),
    _e('t_install_macro', 'p_identity_pending', 'M355 115C399 115 406 55 432 55'),
    _e('t_install_macro', 'p_recheck_pending', 'M355 115C399 115 406 175 432 175'),
    _e('p_identity_pending', 't_identity', 'M476 55H543', 'verify'),
    _e('t_identity', 'p_identity_ok', 'M565 55H627', 'verify'),
    _e('p_recheck_pending', 't_recheck', 'M476 175H543', 'verify',
       'recheck_record_complete'),
    _e('t_recheck', 'p_recheck_ok', 'M565 175H627', 'verify'),
    _e('p_identity_ok', 't_join', 'M671 55C707 55 715 109 738 112', 'verify'),
    _e('p_recheck_ok', 't_join', 'M671 175C707 175 715 121 738 118', 'verify'),
    _e('t_join', 'p_next', 'M760 115H832', 'verify',
       'identity_reviewed AND recheck_reviewed AND same_device_joint_task'),
]

TRANSITION_GUARDS = {
    't_bind': 'task and device identifiers match the teaching target MD-01 / J01',
    't_install_macro': 'homepage macro: align, install, fix/connect and collect the corresponding existing records; the displayed stage 2 preview has not completed these actions',
    't_identity': 'software identity evidence reviewed and target binding confirmed',
    't_recheck': 'recheck evidence complete and reviewed; missing evidence disables this action',
    't_join': 'both identity and recheck review tokens are required, with the same device/joint/task binding',
}


def structure_checks():
    """Check the reduced topology and current marking without claiming equivalence."""
    by_id = {n['id']: n for n in NODES}
    assert len(by_id) == len(NODES) == 13
    assert all(by_id[e['source']]['kind'] != by_id[e['target']]['kind'] for e in EDGES)
    transitions = [n['id'] for n in NODES if n['kind'] == 'transition']
    assert all(any(e['target'] == t for e in EDGES) and any(e['source'] == t for e in EDGES)
               for t in transitions)
    tokens = [n['id'] for n in NODES if n['token']]
    assert tokens == ['p_align']
    assert [n['id'] for n in NODES if n['current'] and n['kind'] == 'transition'] == ['t_install_macro']
    assert not any(n['token'] for n in NODES if n['id'] != 'p_align')
    assert {e['source'] for e in EDGES if e['target'] == 't_join'} == {'p_identity_ok', 'p_recheck_ok'}
    assert {e['target'] for e in EDGES if e['source'] == 't_install_macro'} == {
        'p_identity_pending', 'p_recheck_pending'}
    assert {e['source'] for e in EDGES if e['target'] == 'p_next'} == {'t_join'}
    assert next(e for e in EDGES if e['source'] == 'p_recheck_pending')['guard'] == 'recheck_record_complete'
    assert all(n['font_size'] >= 22 for n in NODES)
    assert all(e['tone'] in {'normal', 'verify'} for e in EDGES)
    adjacency = {ident: [] for ident in by_id}
    for e in EDGES:
        adjacency[e['source']].append(e['target'])
    visited, active = set(), set()
    def visit(ident):
        assert ident not in active, 'Cover overview should have no return loop'
        if ident in visited:
            return
        active.add(ident)
        for target in adjacency[ident]:
            visit(target)
        active.remove(ident)
        visited.add(ident)
    for ident in by_id:
        visit(ident)
    source_root = ET.parse(SOURCE).getroot()
    mapped = {n['id']: n['source_node'] for n in NODES if n['source_node']}
    for ident, source_id in mapped.items():
        original = source_root.find(f'{{{NS}}}g[@id="{source_id}"]')
        assert original is not None and original.get('data-cpn-kind') == by_id[ident]['kind']
    source_edges = {(e.get('data-cpn-source'), e.get('data-cpn-target'))
                    for e in source_root.iter() if e.get('data-cpn-source')}
    evidence_nodes = {'p_identity_pending', 'p_recheck_pending', 't_identity',
                      't_recheck', 'p_identity_ok', 'p_recheck_ok', 't_join', 'p_next'}
    preserved = [e for e in EDGES if e['source'] in evidence_nodes and e['target'] in evidence_nodes]
    assert len(preserved) == 7
    assert all((mapped[e['source']], mapped[e['target']]) in source_edges for e in preserved)
    return dict(node_count=len(NODES), place_count=sum(n['kind'] == 'place' for n in NODES),
                transition_count=len(transitions), edge_count=len(EDGES),
                homepage_abstraction=True, bipartite_edges=True,
                all_transitions_have_input_and_output=True, no_return_loops=True,
                current_token=tokens[0], current_transition='t_install_macro',
                current_stage=2, success_marking_empty=True,
                join_requires_both_reviews=True,
                next_step_has_only_and_join_input=True,
                missing_recheck_disables_review=True,
                preserved_source_evidence_edges=7, minimum_node_label_size=22)


def cover_task_eg_metadata():
    """JSON-safe cover abstraction, source provenance and structural checks."""
    return dict(viewbox=list(VIEWBOX), nodes=deepcopy(NODES), edges=deepcopy(EDGES),
                transition_guards=deepcopy(TRANSITION_GUARDS), checks=structure_checks(),
                teaching_source={
                    'kind': 'homepage abstraction',
                    'evidence_subnet': 'docs/presentations/v2/prototypes/eg-cpn.svg',
                    'evidence_subnet_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                    'preserved_logic': 'parallel identity/recheck record reviews followed by a two-input AND join; 7 source evidence arcs retain their endpoint mapping',
                    'installation_macro': 'teaching design: preparation/alignment/installation/fixation/record collection are merged into one homepage action',
                    'abstraction_boundary': 'the cover is a reduced overview, not the full original EG or an assertion of network equivalence',
                    'details_in_compile': 'see compile for the detailed identity/recheck task network and simulate for individual installation stages',
                    'omitted_detail': 'repositioning, missing-record feedback loops and intermediate installation places are omitted from the homepage',
                    'snapshot': 'stage 2 alignment preview; the only token is pending alignment and every success/output place is empty',
                    'physical_boundary': 'display geometry and the task diagram do not prove real fixation, connection or recheck success',
                    'identity_boundary': 'walk geometry and alpha software identity require separate target/version review; no alpha ID assertion is displayed',
                    'operational_order': 'perform software identification before physical recheck; parallel review of existing records does not change operation order',
                    'release_boundary': 'homepage teaching task overview, not a published/validated runtime task',
                })


def cover_task_eg(x, y, w, h):
    """Return a transparent native overview SVG without panels or property fields."""
    structure_checks()
    defs = '<defs>'
    for tone, color in [('normal', BLUE), ('verify', TEAL)]:
        defs += (f'<marker id="cover-eg-arrow-{tone}" viewBox="0 0 10 10" '
                 'refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">'
                 f'<path d="M1 1L9 5L1 9" fill="none" stroke="{color}" stroke-width="1.5"/></marker>')
    body = defs + '</defs>'
    for e in EDGES:
        color = {'normal': BLUE, 'verify': TEAL}[e['tone']]
        body += (f'<path data-eg-source="{e["source"]}" data-eg-target="{e["target"]}" '
                 f'data-eg-tone="{e["tone"]}" d="{e["path"]}" fill="none" '
                 f'stroke="{color}" stroke-width="1.9" stroke-linecap="round" '
                 f'stroke-linejoin="round" marker-end="url(#cover-eg-arrow-{e["tone"]})"/>')
    for n in NODES:
        color = TEAL if n['tone'] == 'verify' else BLUE
        if n['current']:
            color = AMBER
        a, b = n['x'], n['y']
        body += (f'<g id="cover-eg-{n["id"]}" data-eg-node="{n["id"]}" '
                 f'data-eg-kind="{n["kind"]}" data-eg-token="{str(n["token"]).lower()}" '
                 f'data-eg-current="{str(n["current"]).lower()}"')
        if n['source_node']:
            body += f' data-source-eg-node="{n["source_node"]}"'
        body += '>'
        if n['kind'] == 'place':
            body += f'<circle cx="{a}" cy="{b}" r="{20 if n["current"] else 19}" fill="#0F2A3D" stroke="{color}" stroke-width="{2.4 if n["current"] else 1.9}"/>'
            if n['token']:
                body += f'<circle cx="{a}" cy="{b}" r="6" fill="{AMBER}" data-eg-marking="current"/>'
        else:
            body += f'<rect x="{a-7}" y="{b-20}" width="14" height="40" rx="1.2" fill="{color}" opacity="{1 if n["current"] else .84}"/>'
        body += text(a, b+n['label_offset'], n['label'], n['font_size'],
                     color if n['current'] or n['tone'] == 'verify' else LABEL,
                     700 if n['current'] or n['id'] == 't_join' else 500, anchor='middle')
        body += '</g>'
    return (f'<g id="cover-task-eg" data-viewbox="{x} {y} {w} {h}" '
            'data-task-kind="homepage-abstraction" data-current-stage="2">'
            f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 900 250" '
            f'style="font-family:{FONT}" role="img" aria-label="安装教学任务概览：阶段 2 待对齐，身份与复检核验汇合后才可推进">'
            '<desc>首页抽象概览：安装动作为教学合并步骤，身份与复检分支保留双证条件汇合。'
            '详细逻辑见 compile，当前唯一 token 在待对齐，不声称真实安装或复检通过。</desc>'
            + body + '</svg></g>')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=REPO / '.psop' / 'v2-cover-redraw')
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    fragment = cover_task_eg(0, 0, 900, 250)
    svg = (f'<svg xmlns="{NS}" width="900" height="250" viewBox="0 0 900 250" '
           'style="background:#0B2438"><title>PSOP 首页任务 EG 概览</title>' + fragment + '</svg>')
    svg_file = args.output / 'eg.svg'
    svg_file.write_text(svg, encoding='utf-8')
    report = cover_task_eg_metadata()
    report['svg_file'] = svg_file.name
    report['svg_sha256'] = hashlib.sha256(svg_file.read_bytes()).hexdigest()
    if args.render:
        from playwright.sync_api import sync_playwright
        from render_prototypes import launch_browser
        with sync_playwright() as p:
            browser = launch_browser(p)
            page = browser.new_page(viewport={'width': 900, 'height': 250}, device_scale_factor=2)
            page.goto(svg_file.resolve().as_uri(), wait_until='load')
            page.evaluate('document.fonts.ready')
            checks = page.evaluate('''()=>{
              const labels=[...document.querySelectorAll('text')].map(e=>{
                const b=e.getBoundingClientRect();return {label:e.textContent,box:[b.x,b.y,b.width,b.height],size:parseFloat(getComputedStyle(e).fontSize)};});
              const outside=labels.filter(e=>e.box[0]<-.5||e.box[1]<-.5||e.box[0]+e.box[2]>900.5||e.box[1]+e.box[3]>250.5);
              const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
                const a=labels[i].box,b=labels[j].box,dx=Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]),dy=Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]);
                if(dx>1&&dy>1)overlaps.push([labels[i].label,labels[j].label]);}
              const edge_label_collisions=[];
              for(const e of document.querySelectorAll('path[data-eg-source]')){
                const total=e.getTotalLength(),matrix=e.getScreenCTM();
                for(const t of labels){const b=t.box;let hit=false;
                  for(let s=0;s<=total;s+=2){const point=e.getPointAtLength(s),q=new DOMPoint(point.x,point.y).matrixTransform(matrix);
                    if(q.x>b[0]+1&&q.x<b[0]+b[2]-1&&q.y>b[1]+1&&q.y<b[1]+b[3]-1){hit=true;break;}}
                  if(hit)edge_label_collisions.push({source:e.dataset.egSource,target:e.dataset.egTarget,label:t.label});}
              }
              return {text_count:labels.length,minimum_label_size:Math.min(...labels.map(e=>e.size)),outside,overlaps,edge_label_collisions,labels};
            }''')
            page.screenshot(path=str(args.output / 'eg.png'))
            report['render_checks'] = checks
            assert checks['text_count'] == 13 and checks['minimum_label_size'] >= 22
            assert not checks['outside'] and not checks['overlaps'] and not checks['edge_label_collisions']
            browser.close()
    (args.output / 'eg-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'output':str(args.output), **report['checks'],
                      'outside':len(report.get('render_checks', {}).get('outside', [])),
                      'overlaps':len(report.get('render_checks', {}).get('overlaps', [])),
                      'edge_label_collisions':len(report.get('render_checks', {}).get('edge_label_collisions', []))},ensure_ascii=False))


if __name__ == '__main__':
    main()
