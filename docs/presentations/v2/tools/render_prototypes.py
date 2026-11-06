#!/usr/bin/env python3
"""Capture the HTML design prototypes with real browser font/layout rendering."""
from pathlib import Path
import json,os,argparse,hashlib
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def launch_browser(playwright, override=None):
    """Use Playwright's current platform browser, or an explicit local executable."""
    candidates=[override, os.environ.get('PSOP_BROWSER'), playwright.chromium.executable_path]
    browser=next((x for x in candidates if x and Path(x).is_file()),None)
    if not browser:
        raise RuntimeError('Chromium is missing. Run: python -m playwright install chromium')
    return playwright.chromium.launch(executable_path=browser,headless=True,args=[
        '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--browser');ap.add_argument('--only',nargs='+',choices=['build','compile','simulate','mobile']);args=ap.parse_args()
    out=ROOT/'assets/generated/microduck';out.mkdir(parents=True,exist_ok=True)
    names=args.only or ['build','compile','simulate','mobile']
    previous=out/'prototype-render-checks.json'
    report=[entry for entry in json.loads(previous.read_text(encoding='utf-8')) if entry['prototype'] not in names] if args.only and previous.exists() else []
    with sync_playwright() as p:
        b=launch_browser(p,args.browser)
        for name in names:
            w,h=(430,800) if name=='mobile' else (1680,720)
            page=b.new_page(viewport={'width':w,'height':h},device_scale_factor=2)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto((ROOT/'prototypes'/f'{name}.html').as_uri(),wait_until='load');page.evaluate('document.fonts.ready')
            if name in ('build','simulate'):
                page.wait_for_function('window.psop3DReady === true',timeout=15000)
                page.evaluate('window.psopSandbox.render()')
            assert page.evaluate('Array.from(document.images).every(e=>e.complete&&e.naturalWidth>0)'),name
            if name=='mobile' and page.locator('[data-assembly-state="in-progress"]').count():
                assert '安装进行中' in page.locator('.ar-task').inner_text()
                assert 'installation-process.png' in page.locator('.ar-background').get_attribute('src')
                assert page.locator('.mobile').get_attribute('data-verification-state')=='missing'
                assert '安装完成后提交检查记录' in page.locator('.measurement-card').inner_text()
            checks=page.evaluate('''()=>{const W=innerWidth,H=innerHeight;let nodes=[],panelOutside=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!n.textContent.trim())continue;const r=document.createRange();r.selectNode(n);const panel=n.parentElement.closest(".tree,.center,.inspector,.feed-panel,.mobile,.sim-console,.simulation-view,.sim-timeline");const pb=panel?.getBoundingClientRect();for(const b of r.getClientRects()){if(pb&&b.width>0&&b.height>0&&(b.x<pb.x-.5||b.y<pb.y-.5||b.right>pb.right+.5||b.bottom>pb.bottom+.5))panelOutside.push({text:n.textContent,panel:panel.className,box:[b.x,b.y,b.width,b.height]});if(b.width>0&&b.height>0&&(b.x<-.5||b.y<-.5||b.right>W+.5||b.bottom>H+.5))nodes.push({text:n.textContent,box:[b.x,b.y,b.width,b.height]});}}return {outside:nodes,outside_panels:panelOutside,cpn:document.querySelector('#cpn')?(()=>{let r=document.querySelector('#cpn').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})():null}}''')
            file=out/f'ui-{name}.png';page.screenshot(path=str(file))
            report.append({'prototype':name,'width':w,'height':h,'scale':2,'image':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'errors':errors,**checks})
            print(name,'outside:',len(checks['outside']),'panel_overflow:',len(checks['outside_panels']),'errors:',len(errors),flush=True)
            assert not errors,(name,errors)
            page.close()
        b.close()
    report.sort(key=lambda entry:['build','compile','simulate','mobile'].index(entry['prototype']))
    (out/'prototype-render-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
