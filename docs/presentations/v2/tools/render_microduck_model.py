#!/usr/bin/env python3
"""Capture clean official STL reference views with alpha transparency and projected source-region metadata."""
from pathlib import Path
import argparse,hashlib,json
from PIL import Image
from playwright.sync_api import sync_playwright
from render_prototypes import launch_browser
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--browser');parser.add_argument('--only',nargs='+',choices=['model-assembled','model-exploded','model-joint-detail','model-servo-module','cover-build-exploded','cover-installation']);args=parser.parse_args()
    out=ROOT/'assets/generated/microduck';out.mkdir(parents=True,exist_ok=True)
    specs=[('model-assembled',900,1200,{}),('model-exploded',1000,1100,{'exploded':True}),
        ('model-joint-detail',1100,850,{'detail':True}),('model-servo-module',700,800,{'component':'xl330'}),
        ('cover-build-exploded',1000,1150,{'coverExploded':True}),
        ('cover-installation',1200,1100,{'installationStage':2})]
    if args.only:specs=[spec for spec in specs if spec[0] in args.only]
    report_file=out/'model-render-report.json'
    report=json.loads(report_file.read_text(encoding='utf-8')) if args.only and report_file.exists() else {}
    with sync_playwright() as p:
        browser=launch_browser(p,args.browser)
        for name,width,height,options in specs:
            page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto((ROOT/'prototypes/model-preview.html').as_uri())
            page.wait_for_function('window.psopModelRenderReady === true',timeout=30000)
            metadata=page.evaluate('(options)=>window.psopRenderModel(options)',options)
            file=out/f'{name}.png';page.screenshot(path=str(file),omit_background=True)
            with Image.open(file) as image:metadata['alphaBounds']=list(image.getchannel('A').getbbox())
            assert not errors,errors
            assert metadata['sourceMatricesPreserved'],name
            if name=='cover-installation':
                assert metadata['instanceCount']==70 and metadata['movingInstanceCount']==17
                assert metadata['fixedInstanceCount']==53
                assert metadata['sourceTargetAnchor']!=metadata['movingJointAnchor']
            metadata.update({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'errors':errors,'background':'transparent'})
            report[name]=metadata;page.close()
            print(name,metadata['alphaBounds'],flush=True)
        browser.close()
    (out/'model-render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
