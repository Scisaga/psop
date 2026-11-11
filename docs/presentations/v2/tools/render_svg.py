#!/usr/bin/env python3
"""Render SVG pages; check text bounds, overlaps, embedded assets and viewer."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--slides',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--browser',default=os.environ.get('PSOP_BROWSER'))
    args=ap.parse_args();slides=args.slides.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    m=json.loads((slides/'manifest.json').read_text(encoding='utf-8'));reports=[]
    page_count=len(m['pages'])
    assert page_count>0 and page_count==m.get('page_count',page_count)
    assert [p['page'] for p in m['pages']]==list(range(1,page_count+1))
    with sync_playwright() as pw:
        launch={'headless':True}
        if args.browser:
            if not Path(args.browser).is_file():raise RuntimeError('PSOP_BROWSER must point to a Chromium executable.')
            launch['executable_path']=args.browser
        b=pw.chromium.launch(**launch)
        page=b.new_page(viewport={'width':1600,'height':900},device_scale_factor=1)
        for p in m['pages']:
            f=slides/p['file'];tree=ET.parse(f).getroot();assert sha(f)==p['sha256']
            assert tree.get('viewBox')=='0 0 1600 900'
            ids=[e.get('id') for e in tree.iter() if e.get('id')];assert len(ids)==len(set(ids)),(f,'duplicate SVG ids')
            for e in tree.iter():
                if e.tag.endswith('image'):
                    href=e.get('href') or e.get('{http://www.w3.org/1999/xlink}href','')
                    assert href.startswith('data:'),(f,'external raster',href)
            page.goto(f.as_uri(),wait_until='load');page.evaluate('document.fonts.ready')
            data=page.evaluate('''() => { const boxes=[...document.querySelectorAll('text')].map((e,i)=>{const r=e.getBoundingClientRect();return {i,text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}}).filter(r=>r.w>0&&r.h>0);const outside=boxes.filter(r=>r.x < -1 || r.y < -1 || r.x+r.w>1601 || r.y+r.h>901);const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(dx>3&&dy>3&&dx*dy>Math.min(a.w*a.h,b.w*b.h)*.12)overlaps.push({a:a.text,b:b.text,area:Math.round(dx*dy),bounds:[a,b]})}return {text_count:boxes.length,outside,overlaps} }''')
            png=out/(Path(p['file']).stem+'.png');page.screenshot(path=str(png));assert Image.open(png).size==(1600,900)
            reports.append({'page':p['page'],'svg':p['file'],'preview':png.name,'svg_sha256':sha(f),'png_sha256':sha(png),**data})
            print(f"page {p['page']:02d}: outside={len(data['outside'])}, text_overlap_candidates={len(data['overlaps'])}",flush=True)
        # These URLs work both from file:// and via a local HTTP server.
        page.goto((slides/'index.html').as_uri(),wait_until='load')
        assert page.locator('article').count()==len(m['pages'])
        page.locator('#present').click();assert page.locator('#position').inner_text()==f"1 / {len(m['pages'])}"
        page.keyboard.press('ArrowRight');assert page.locator('#position').inner_text()==f"2 / {len(m['pages'])}"
        page.keyboard.press('Escape');assert not page.locator('#viewer').is_visible()
        media_pages=[p for p in m['pages'] if p.get('media')]
        if media_pages:
            page.locator('#card-play-demo').click()
            assert page.locator('#position').inner_text()==f"{media_pages[0]['page']} / {page_count}"
            assert page.locator('#play-demo').is_visible()
            page.keyboard.press('Escape')
        # Staging folders may not be adjacent to media; validate playback after publishing.
        viewer={'cards':page_count,'open_close':True,'keyboard_navigation':True,'media_pages':[p['page'] for p in media_pages]}
        b.close()
    thumb_w,thumb_h,gap=400,225,12
    rows=(page_count+3)//4
    canvas=Image.new('RGB',(4*thumb_w+5*gap,rows*thumb_h+(rows+1)*gap),(211,226,236))
    for i,r in enumerate(reports):
        im=Image.open(out/r['preview']).convert('RGB').resize((thumb_w,thumb_h),Image.Resampling.LANCZOS)
        canvas.paste(im,(gap+(i%4)*(thumb_w+gap),gap+(i//4)*(thumb_h+gap)))
    canvas.save(out/'contact-sheet.png')
    report={'date':'2026-10-15','renderer':'Chromium / Playwright','canvas':[1600,900],'source_sha256':m['source_sha256'],'pages':reports,'viewer':viewer,'out_of_canvas_text':sum(len(x['outside']) for x in reports),'text_overlap_candidates':sum(len(x['overlaps']) for x in reports),'powerpoint_native_review':'not_performed_svg_and_pdf_delivery'}
    (out/'render-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'rendered_pages':len(m['pages']),'out_of_canvas_text':report['out_of_canvas_text'],'text_overlap_candidates':report['text_overlap_candidates'],'contact_sheet':str(out/'contact-sheet.png')},ensure_ascii=False))

if __name__=='__main__':main()
