#!/usr/bin/env python3
"""Verify real source geometry installation movement, source preservation, controls and missing recheck."""
from pathlib import Path
import argparse,hashlib,json
from playwright.sync_api import sync_playwright
from render_prototypes import launch_browser
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--browser');ap.add_argument('--output',type=Path,default=ROOT/'assets/generated/microduck/sandbox-checks.json');args=ap.parse_args()
    result={'prototype':'PSOP Microduck installation display using official source geometry','checks':{},'errors':[]}
    with sync_playwright() as p:
        browser=launch_browser(p,args.browser);page=browser.new_page(viewport={'width':1680,'height':720})
        page.on('pageerror',lambda error:result['errors'].append(str(error)))
        page.goto((ROOT/'prototypes/simulate.html').as_uri());page.wait_for_function('window.psop3DReady === true')
        def geometry_hash():
            page.evaluate('window.psopSandbox.render()')
            return hashlib.sha256(page.locator('.stage3d>canvas').screenshot()).hexdigest()
        def pose():
            return page.evaluate('''()=>window.psopSandbox.getModel().selectable.map(o=>({id:o.userData.sourceInstance,body:o.userData.sourceBody,moving:o.userData.installationGroup,
                source:o.userData.sourceAssembledTransform,base:o.userData.sourceDisplayMatrix,display:o.matrixWorld.elements}))''')
        def signature(items):return hashlib.sha256(json.dumps(items,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        def source_signature(items):return signature([[o['id'],o['source'],o['base']] for o in items])
        def matrices_match(a,b):return all(abs(x-y)<1e-7 for x,y in zip(a,b))
        def no_false_success():
            assert page.evaluate('!window.psopSandbox.state.guard && !window.psopSandbox.state.success && !window.psopSandbox.state.recheck.present && !window.psopSandbox.state.identity.reviewed')
        def arrow_matches_socket():
            points=page.evaluate('''()=>{const s=window.psopSandbox,m=s.getModel(),h=document.querySelector('.stage3d'),p=new THREE.Vector3(...m.targetAnchor).project(s.camera);
                return{expected:[(p.x*.5+.5)*h.clientWidth,(-p.y*.5+.5)*h.clientHeight],actual:JSON.parse(document.querySelector('.installation-direction-guide').dataset.target)}}''')
            assert all(abs(x-y)<.001 for x,y in zip(points['expected'],points['actual']))
        assert page.locator('[data-stage]').first.inner_text()=='2'
        assert '步骤 2' in page.locator('#event-line').inner_text()
        assert '髋部舵机安装与复检' in page.locator('.projectbar').inner_text()
        original=pose();source_hash=source_signature(original);initial_geometry=geometry_hash()
        assert len(original)==70 and sum(o['moving'] for o in original)==17
        assert page.evaluate('window.psopMicroduckModel.source.mesh_count')==38
        expected_sources=page.evaluate('Object.fromEntries(window.psopMicroduckSource.items.map(i=>[i.instance_id,i.assembled_transform]))')
        assert all(o['source']==expected_sources[o['id']] for o in original)
        result['checks']['source_38_mesh_70_instances_and_17_item_left_hip_chain']=True
        arrow_matches_socket();no_false_success()
        result['checks']['insertion_arrow_terminates_at_real_source_socket']=True
        snapshots=[]
        for stage in range(1,6):
            page.locator('[data-stage-select="'+str(stage)+'"]').click()
            current=pose();assert source_signature(current)==source_hash
            assert all(matrices_match(o['base'],o['display']) for o in current if not o['moving'])
            assert page.locator('.installation-step.current').get_attribute('data-stage-select')==str(stage)
            assert page.locator('#operation-title').inner_text()==page.evaluate('window.psopSandbox.steps['+str(stage)+'].name')
            assert page.locator('[data-preview="current"]').get_attribute('data-stage')==str(stage)
            no_false_success()
            snapshots.append({'stage':stage,'geometryHash':geometry_hash(),'displaySignature':signature([[o['id'],o['display']] for o in current])})
            if stage<4:arrow_matches_socket();assert any(not matrices_match(o['base'],o['display']) for o in current if o['moving'])
            else:assert all(matrices_match(o['base'],o['display']) for o in current)
        assert len({s['displaySignature'] for s in snapshots})==4
        assert len({s['geometryHash'] for s in snapshots})==5
        result['checks']['steps_move_source_subassembly_and_preserve_53_fixed_instances']=True
        result['checks']['source_matrices_unchanged_and_final_display_restores_assembly']=True
        result['checks']['five_rendered_steps_distinct_and_current_step_preview_coherent']=True
        assert '不能确认完成' in page.locator('#recheck-status').inner_text()
        result['checks']['final_step_requires_missing_identity_and_recheck_records']=True
        page.locator('[data-act="reset"]').click();assert pose()==original
        page.locator('[data-act="step"]').click();assert page.locator('[data-stage]').first.inner_text()=='3'
        assert signature(pose())!=signature(original)
        page.locator('[data-act="replay"]').click();assert page.locator('[data-stage]').first.inner_text()=='2'
        assert pose()==original
        result['checks']['next_and_previous_change_real_display_geometry']=True
        page.locator('[data-act="fork"]').click();assert page.evaluate('window.psopSandbox.state.branch')=='alignment_retry'
        assert signature(pose())!=signature(original);assert source_signature(pose())==source_hash
        page.locator('[data-act="step"]').click();assert page.locator('[data-stage]').first.inner_text()=='3'
        page.locator('[data-act="step"]').click();assert page.locator('[data-stage]').first.inner_text()=='3'
        page.locator('[data-act="baseline"]').click();page.locator('[data-act="step"]').click();assert page.locator('[data-stage]').first.inner_text()=='4'
        no_false_success()
        result['checks']['alignment_branch_changes_pose_and_blocks_unresolved_advance']=True
        page.locator('[data-act="reset"]').click();page.locator('[data-act="explode"]').click();assert geometry_hash()!=initial_geometry
        assert source_signature(pose())==source_hash
        page.locator('[data-act="reset"]').click();page.locator('[data-act="highlight"]').click();assert geometry_hash()!=initial_geometry
        result['checks']['component_expansion_and_installation_surface_highlight_work']=True
        page.locator('[data-act="reset"]').click();page.locator('[data-act="play"]').click();page.wait_for_function('window.psopSandbox.state.stage >= 3')
        page.locator('[data-act="play"]').click();assert not page.evaluate('window.psopSandbox.state.playing')
        paused=pose();page.wait_for_timeout(1500);assert pose()==paused
        result['checks']['play_advances_installation_and_pause_stops_transforms']=True
        page.locator('[data-act="reset"]').click();page.locator('[data-act="orbit"]').click();assert geometry_hash()!=initial_geometry;arrow_matches_socket()
        page.locator('[data-select="HEAD-01"]').click();assert page.locator('#selected-feature').inner_text()=='HEAD-01'
        result['checks']['orbit_and_object_selection_preserve_projected_socket_binding']=True
        assert page.evaluate('window.psopSandbox.events.every(e=>e.device==="MD-01" && e.task==="MD-SERVO-CHECK-01" && e.step==="S03" && e.joint==="J01" && !e.guard)')
        result['checks']['event_log_keeps_task_binding_without_false_completion']=True
        page.goto((ROOT/'prototypes/build.html').as_uri());page.wait_for_function('window.psop3DReady === true')
        page.locator('.feature-node[data-select="J01"]').click();assert page.locator('[data-feature-value="2"]').inner_text()=='20'
        assert 'duck-control/src/model.rs' in page.locator('#feature-evidence a').get_attribute('href')
        result['checks']['build_sourced_joint_identity_remains_available']=True
        browser.close()
    assert not result['errors'],result['errors'];result['result']='passed'
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
