#!/usr/bin/env python3
"""Capture the actual source mesh installation display at every stage and a readable cover crop."""
from pathlib import Path
import argparse,hashlib,json
from playwright.sync_api import sync_playwright
from render_prototypes import launch_browser
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--browser');args=parser.parse_args()
    out=ROOT/'assets/generated/microduck';out.mkdir(parents=True,exist_ok=True)
    report={'workflow':'Microduck installation display; source matrices retained, illustrative stage offsets','stages':[],'errors':[]}
    with sync_playwright() as p:
        browser=launch_browser(p,args.browser)
        page=browser.new_page(viewport={'width':1680,'height':720},device_scale_factor=1)
        page.on('pageerror',lambda error:report['errors'].append(str(error)))
        page.goto((ROOT/'prototypes/simulate.html').as_uri());page.wait_for_function('window.psop3DReady === true')
        for stage in range(1,6):
            page.evaluate('(stage)=>window.psopSandbox.setStage(stage)',stage)
            metadata=page.evaluate('''()=>{const s=window.psopSandbox,m=s.getModel(),T=window.THREE;
                const originals=m.selectable.map(o=>[o.userData.sourceInstance,o.userData.sourceAssembledTransform,o.userData.sourceDisplayMatrix]);
                const displays=m.selectable.map(o=>[o.userData.sourceInstance,o.matrixWorld.elements]);
                const chain=m.selectable.filter(o=>o.userData.installationGroup),bounds=new T.Box3();chain.forEach(o=>bounds.union(new T.Box3().setFromObject(o)));
                return{stage:s.state.stage,name:s.steps[s.state.stage].name,sourceMatrices:originals,displayMatrices:displays,
                    movingSourceInstances:chain.length,chainBounds:[bounds.min.toArray(),bounds.max.toArray()],targetAnchor:m.targetAnchor,
                    guard:s.state.guard,success:s.state.success,recheckPresent:s.state.recheck.present};}''')
            for key in ('sourceMatrices','displayMatrices'):
                metadata[key+'Sha256']=hashlib.sha256(json.dumps(metadata.pop(key),sort_keys=True,separators=(',',':')).encode()).hexdigest()
            file=out/f'sim-step-{stage:02}.png';page.screenshot(path=str(file))
            metadata['image']=file.name;metadata['imageSha256']=hashlib.sha256(file.read_bytes()).hexdigest()
            metadata['canvasSha256']=hashlib.sha256(page.locator('.stage3d>canvas').screenshot()).hexdigest()
            report['stages'].append(metadata);print(file.name,'stage',stage,flush=True)
        assert len({s['sourceMatricesSha256'] for s in report['stages']})==1
        assert len({s['displayMatricesSha256'] for s in report['stages']})==4
        assert len({s['canvasSha256'] for s in report['stages']})==5
        assert all(s['movingSourceInstances']==17 and not s['guard'] and not s['success'] and not s['recheckPresent'] for s in report['stages'])
        page.evaluate('window.psopSandbox.action("reset")')
        page.evaluate('''()=>{const host=document.querySelector('.stage3d');Object.assign(host.style,{position:'fixed',left:'0',top:'0',width:'1000px',height:'500px',zIndex:'999'});
            host.querySelectorAll('.scene-layers,.sim-viewport-title,.sim-viewport-bottom,.sim-view-corner,.sim-view-label').forEach(e=>e.style.display='none');
            host.querySelectorAll('.model-marker b').forEach(e=>e.textContent=e.textContent.replace(' J01','').replace(' / 步骤 2',''));
            const label=document.createElement('div');label.textContent='步骤 2 · 对齐髋部支架';Object.assign(label.style,{position:'absolute',left:'25px',top:'20px',font:'600 20px Microsoft YaHei,sans-serif',color:'#c4e9f1'});host.append(label);window.psopSandbox.render();}''')
        crop=out/'cover-simulate.png';page.locator('.stage3d').screenshot(path=str(crop))
        report['cover']={'image':crop.name,'size':[1000,500],'stage':2,'sha256':hashlib.sha256(crop.read_bytes()).hexdigest()}
        assert not report['errors'],report['errors'];browser.close()
    report['result']='passed'
    (out/'installation-step-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
