#!/usr/bin/env python3
"""Build the PSOP SVG deck, inserting nine native solution pages after page four.

Requires Pillow for real font metrics. All figures use local assets only.
Microduck imagery uses source-derived assembly renders and native diagrams;
the installation photo is a generated illustration and UI frames stay HTML/CSS.
The EG and experimental figures retain editable SVG geometry.
"""
from pathlib import Path
from html import escape
import argparse
import base64
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from svg_lib import ROOT, ASSETS, NS, FONT
from pages_01_08 import PAGES as FIRST
from pages_09_16 import PAGES as LAST

LEGACY_SLUGS=['cover','ai-trends','device-problems','three-workspaces',
              'runtime-evidence','build-workbench','compile-eg',
              'simulate-workbench','edge-runtime','mobile-workbench',
              'ar-demo','feasibility','experience-loop',
              'platform-architecture','economic-value','social-value']
SOLUTION_SLUGS=['system-integration','solution-positioning','customer-self-service',
                'engineer-collaboration','service-continuity','service-capacity',
                'pilot-validation','rollout-replication','device-ai-engineer']
SLUGS=LEGACY_SLUGS[:4]+SOLUTION_SLUGS+LEGACY_SLUGS[4:]
NAMES=[f'{i:02d}-{slug}' for i,slug in enumerate(SLUGS,1)]
VISUAL_SOURCES=ROOT.parents[1]/'ppt/视觉稿'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def metadata_sha(value):
    encoded=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()

def cover_eg_manifest():
    from cover_task_eg import cover_task_eg_metadata
    metadata=cover_task_eg_metadata()
    assert metadata.get('nodes') and metadata.get('edges'),'Complete cover EG metadata is required'
    assert metadata.get('teaching_source'),'Cover EG must explain source evidence and teaching design'
    return {
        'path':'../tools/cover_task_eg.py','sha256':sha(ROOT/'tools/cover_task_eg.py'),
        'function':'cover_task_eg','metadata_function':'cover_task_eg_metadata',
        'metadata':metadata,'metadata_sha256':metadata_sha(metadata),
        'nodes_sha256':metadata_sha(metadata['nodes']),
        'edges_sha256':metadata_sha(metadata['edges']),
        'teaching_source_sha256':metadata_sha(metadata['teaching_source']),
    }

def build_spec():
    # Keep imports deferred so isolated previews can use the established pages
    # while the new solution modules are being authored.
    from solutions_11_14 import PAGES as SOLUTIONS_A
    from solutions_15_19 import PAGES as SOLUTIONS_B
    assert len(SOLUTIONS_A)==4 and len(SOLUTIONS_B)==5, 'Expected all nine solution pages'
    legacy=FIRST+LAST
    assert len(legacy)==16
    items=[{'fn':fn,'legacy_page':i} for i,fn in enumerate(legacy[:4],1)]
    items += [{'fn':fn,'solution_source_page':i} for i,fn in enumerate(SOLUTIONS_A+SOLUTIONS_B,11)]
    items += [{'fn':fn,'legacy_page':i} for i,fn in enumerate(legacy[4:],5)]
    assert len(items)==len(NAMES)==25
    for i,(item,name) in enumerate(zip(items,NAMES),1):item.update({'page':i,'name':name})
    return items

def normalize_numbering(tree,page,total,legacy_map=None):
    """Adjust output numbering without changing established page functions."""
    if legacy_map:
        def ref(match):
            number=int(match.group(1))
            return f'第 {legacy_map.get(number,number)} 页'
        for element in tree.iter():
            if element.text:element.text=re.sub(r'第\s*(\d+)\s*页',ref,element.text)
            if element.tail:element.tail=re.sub(r'第\s*(\d+)\s*页',ref,element.tail)
    footers=[]
    for element in tree.iter('{'+NS+'}text'):
        if element.get('x')=='1536' and element.get('y')=='879' and element.get('text-anchor')=='end':
            label=''.join(element.itertext()).strip()
            if re.fullmatch(r'\d+\s*/\s*\d+',label):footers.append(element)
    assert len(footers)==1, (page,'Expected one page-number footer')
    footer=footers[0]
    for child in list(footer):footer.remove(child)
    footer.text=f'{page:02d} / {total}'
    return tree

def page_file(out,pages,slug):
    found=[p['file'] for p in pages if p['file'].endswith('-'+slug+'.svg')]
    if not found:found=[p.name for p in out.glob('??-'+slug+'.svg')]
    assert len(found)==1,(slug,'Expected one matching page')
    return out/found[0]

def make_visual_review(out,pages):
    """Show the full cover composition, its native task EG overview and installation preview."""
    cover_path=page_file(out,pages,'cover')
    simulate_path=page_file(out,pages,'simulate-workbench')
    cover=ET.parse(cover_path).getroot()
    defs=cover.find('{'+NS+'}defs')
    group=cover.find('.//{'+NS+'}g[@id="cover-task-eg"]')
    if group is None:raise ValueError('Missing complete native task EG: cover-task-eg')
    bounds=group.get('data-viewbox','').split()
    assert len(bounds)==4,'cover-task-eg must declare its complete data-viewbox'
    x,y,w,h=map(float,bounds)
    assert w>0 and h>0,'Invalid cover-task-eg viewBox'
    eg=ET.Element('{'+NS+'}svg',{'width':str(w*2),'height':str(h*2),'viewBox':f'{x} {y} {w} {h}','style':'font-family:'+FONT,'role':'img'})
    ET.SubElement(eg,'{'+NS+'}title').text='Microduck 安装与复检 EG'
    ET.SubElement(eg,'{'+NS+'}desc').text='教学任务概览，保留原生状态、转移、有向边与当前 token；安装过程合并呈现，身份与复检核验分别说明。'
    if defs is not None:eg.append(ET.fromstring(ET.tostring(defs,encoding='unicode')))
    ET.SubElement(eg,'{'+NS+'}rect',{'x':str(x),'y':str(y),'width':str(w),'height':str(h),'fill':'#0B2438'})
    eg.append(ET.fromstring(ET.tostring(group,encoding='unicode')))
    eg_data='data:image/svg+xml;base64,'+base64.b64encode(ET.tostring(eg,encoding='utf-8')).decode('ascii')
    cover_data='data:image/svg+xml;base64,'+base64.b64encode(cover_path.read_bytes()).decode('ascii')
    sim_data='data:image/svg+xml;base64,'+base64.b64encode(simulate_path.read_bytes()).decode('ascii')
    html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSOP · 设备任务主视觉</title><style>body{margin:0;background:#e8f1f7;color:#123b5d;font:18px/1.65 Microsoft YaHei,sans-serif}header,main{max-width:1464px;margin:auto;padding:28px}header h1{margin:0;font-size:32px}nav{display:flex;gap:22px;flex-wrap:wrap;margin-top:18px}a{color:#0875a3}section{margin:0 0 28px;background:white;border:1px solid #cbdde8;border-radius:14px;padding:20px}h2{margin:0 0 16px;font-size:25px}p{margin:12px 0;color:#526f84}img{width:100%;height:auto;display:block;border-radius:8px}details{margin:24px 0;background:white;padding:18px;border-radius:12px}summary{cursor:pointer;font-size:23px;font-weight:600}details img{margin-top:20px}@media(max-width:850px){header,main{padding:18px}}</style></head><body><header><h1>PSOP · 设备任务主视觉</h1><p>以同一设备安装任务连接结构知识、EG、安装预演与现场使用。下方保留封面完整构图和任务条件概览，便于核对细节。</p><nav><a href="#home">封面完整主视觉</a><a href="#task-eg">任务 EG 概览</a><a href="#simulation">安装预演</a><a href="../../../slides/index.html">完整演示</a></nav></header><main><section id="home"><h2>封面 · 理解设备状态，指导操作与验证</h2><img src="'+cover_data+'" alt="PSOP 完整设备任务主视觉"></section><section id="task-eg"><h2>compile · Microduck 安装与复检 EG</h2><img src="'+eg_data+'" alt="Microduck 安装与复检条件概览"><p><a href="'+eg_data+'" download="psop-microduck-task-eg-overview.svg">下载原生 EG 概览</a></p></section><section id="simulation"><h2>simulate · 准备、对齐、安装、固定与复检</h2><img src="'+sim_data+'" alt="Microduck 安装预演工作台"></section><p>结构来自官方来源装配；EG、位移与步骤为教学原型。现场安装过程图片为生成示意，固定和复检结果需真实工具反馈。</p><details><summary>查看结构与复检说明图</summary><img src="device-knowledge.svg" alt="源装配拆解与知识来源"><img src="microduck-joint.svg" alt="目标部件局部与证据链"></details></main></body></html>'
    (ASSETS/'generated/microduck/visual-review.html').write_text(html,encoding='utf-8')

def make_index(out, pages):
    media_page=next((p['page'] for p in pages if p.get('media')),None)
    cards=[]
    for p in pages:
        cards.append(f'<article><button class="open-slide" data-page="{p["page"]}"><img loading="lazy" src="{p["file"]}" alt="{escape(p["title"],quote=True)}"></button><div class="caption"><h2>{p["page"]:02d} · {escape(p["title"])}</h2><p><button class="link" data-page="{p["page"]}">放大查看</button> · <a href="{p["file"]}" download>下载 SVG</a>'+(' · <button class="link" id="card-play-demo">播放 AR Demo</button>' if p.get('media') else '')+'</p></div></article>')
    data=json.dumps(pages,ensure_ascii=False).replace('</','<\\/')
    html='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSOP · __PAGE_COUNT__ 页 SVG 演示</title>
<style>
:root{color-scheme:light;--navy:#123b5d;--sky:#3aafe6;--line:#cadfea}*{box-sizing:border-box}body{margin:0;background:#eaf3fa;color:#102a43;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}header,main{max-width:1480px;margin:auto;padding:30px}header{padding-top:40px}h1{font-size:36px;line-height:1.25;margin:0 0 14px;color:var(--navy)}header p{margin:8px 0}nav{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}a,.link{color:#075d89;text-underline-offset:3px}button{font:inherit;cursor:pointer}nav a,nav button{border:1px solid var(--line);background:white;border-radius:8px;padding:8px 16px;text-decoration:none}nav button{background:var(--navy);color:white}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,570px),1fr));gap:30px}article{background:white;border:1px solid var(--line);border-radius:10px;overflow:hidden}.open-slide{display:block;width:100%;padding:0;border:0;background:white}.open-slide img{display:block;width:100%;aspect-ratio:16/9}.caption{padding:16px 20px}h2{font-size:18px;line-height:1.5;margin:0 0 8px}.caption p{margin:0;font-size:15px}.link{border:0;padding:0;background:transparent;text-decoration:underline}button:focus-visible,a:focus-visible{outline:3px solid var(--sky);outline-offset:4px}footer{padding:24px 0;color:#537287}.viewer{position:fixed;inset:0;background:#071b2b;z-index:10;display:none;flex-direction:column;align-items:center;justify-content:center;padding:14px}.viewer.is-open{display:flex}.stage{width:min(calc(100vw - 28px),calc((100vh - 95px)*16/9));aspect-ratio:16/9;position:relative}.stage>img{display:block;width:100%;height:100%}.stage>video{display:none;position:absolute;left:4%;top:28.444444%;width:60.625%;height:60.625%;background:#123b5d}.controls{display:flex;gap:14px;align-items:center;color:#d2e5f0;flex-wrap:wrap;justify-content:center;margin:14px 0 0}.controls button{padding:5px 13px;border:1px solid #4e728e;border-radius:6px;color:white;background:#183c56}.controls span{font-size:15px}.visually-hidden{position:absolute;left:-9999px}
</style></head><body><header><h1>PSOP · 设备任务与服务</h1><p>__PAGE_COUNT__ 页独立 SVG · 1600 × 900 · 用 Microduck 安装指导、身份核对与复检串联设备知识、任务执行和经验学习；机械臂装配作为已有实证。图片已内嵌，正文和技术图保留矢量。</p><p>点击任意页面进入放映，使用 ← / → 切页，Esc 返回。第 __MEDIA_PAGE__ 页可在版面内播放 AR Demo（约20秒）。</p><nav><button id="present">开始放映</button><a href="psop-svg-slides.zip" download>下载全部 SVG</a><a href="../psop-v2.pdf">PDF 阅读版</a><a href="../script.md">逐页文字稿</a><a href="../prototypes/index.html">高保真界面</a><a href="../README.md">材料说明</a><a href="../industry-sources.md">模型资料与日期依据</a><a href="manifest.json">页面清单</a></nav></header><main><div class="grid">'''+''.join(cards)+'''</div><footer>字体：Microsoft YaHei（微软雅黑），提供 Noto Sans CJK SC 等回退。机械臂实验与视频为已有实证；Microduck 工作台、EG 和复检分支为教学原型，经济页为待填可比任务基线的生命周期成本模型。</footer></main>
<div class="viewer" id="viewer" role="dialog" aria-modal="true" aria-label="SVG 页面放映"><div class="stage"><img id="slide" alt=""><video id="demo" controls preload="none" src="../assets/media/ar-demo-25s.mp4"></video></div><div class="controls"><button id="prev">上一页</button><span id="position"></span><button id="next">下一页</button><button id="play-demo" hidden>播放 AR Demo</button><button id="full">全屏</button><button id="close">返回总览</button></div></div>
<script>const pages='''+data+''';let current=0,lastFocus=null;const viewer=document.getElementById('viewer'),slide=document.getElementById('slide'),demo=document.getElementById('demo'),playButton=document.getElementById('play-demo');function show(index){current=(index+pages.length)%pages.length;demo.pause();demo.style.display='none';demo.currentTime=0;slide.src=pages[current].file;slide.alt=pages[current].title;document.getElementById('position').textContent=(current+1)+' / '+pages.length;playButton.hidden=!pages[current].media}function openSlide(index){lastFocus=document.activeElement;show(index);viewer.classList.add('is-open');document.body.style.overflow='hidden';document.getElementById('close').focus()}function close(){demo.pause();viewer.classList.remove('is-open');document.body.style.overflow='';if(document.fullscreenElement)document.exitFullscreen();lastFocus?.focus()}function play(){demo.style.display='block';demo.play().catch(()=>{})}document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>openSlide(Number(el.dataset.page)-1)));document.getElementById('present').onclick=()=>openSlide(0);document.getElementById('prev').onclick=()=>show(current-1);document.getElementById('next').onclick=()=>show(current+1);document.getElementById('close').onclick=close;document.getElementById('full').onclick=()=>viewer.requestFullscreen?.();playButton.onclick=play;document.getElementById('card-play-demo')?.addEventListener('click',()=>{const index=pages.findIndex(p=>p.media);if(index>=0){openSlide(index);play()}});document.addEventListener('keydown',e=>{if(!viewer.classList.contains('is-open'))return;if(e.key==='ArrowRight'){e.preventDefault();show(current+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1)}if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...viewer.querySelectorAll('button')].filter(x=>!x.hidden);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus()}}});demo.addEventListener('ended',()=>demo.style.display='none');</script></body></html>\n'''
    for item in pages:
        html=html.replace(f'src="{item["file"]}"',f'src="{item["file"]}?v={item["sha256"][:12]}"')
    html=html.replace('slide.src=pages[current].file;',"slide.src=pages[current].file+'?v='+pages[current].sha256.slice(0,12);")
    html=html.replace('__PAGE_COUNT__',str(len(pages))).replace('__MEDIA_PAGE__',str(media_page or ''))
    html=html.replace('src="../assets/media/ar-demo-25s.mp4"',f'src="../assets/media/ar-demo-25s.mp4?v={sha(ASSETS/"media/ar-demo-25s.mp4")[:12]}"')
    (out/'index.html').write_text(html, encoding='utf-8')

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'slides')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    previous=json.loads((out/'manifest.json').read_text(encoding='utf-8')) if (out/'manifest.json').exists() else {'pages':[]}
    source=ROOT/'script.md';titles=re.findall(r'^## 第 \d+ 页｜(.+)$',source.read_text(encoding='utf-8'),re.M)
    spec=build_spec();page_count=len(spec)
    assert page_count==len(NAMES)==len(titles)==25
    legacy_map={item['legacy_page']:item['page'] for item in spec if 'legacy_page' in item}
    pages=[]
    native_sources={};solution_references={}
    for item,original_title in zip(spec,titles):
        i,fn,name=item['page'],item['fn'],item['name']
        tree=ET.fromstring(fn())
        assert tree.get('viewBox')=='0 0 1600 900'
        normalize_numbering(tree,i,page_count,legacy_map if 'legacy_page' in item else None)
        content=ET.tostring(tree,encoding='unicode')
        title=next(e.text for e in tree if e.tag.endswith('title'))
        file=out/(name+'.svg');file.write_text(content+'\n', encoding='utf-8')
        p={'page':i,'file':file.name,'title':title,'source_title':original_title,'sha256':sha(file),'bytes':file.stat().st_size,'width':1600,'height':900,'groups':[e.get('id') for e in tree if e.tag.endswith('g')]}
        module=fn.__module__.split('.')[-1]
        native_sources[file.name]={'source':'../tools/'+module+'.py','module':module,'function':fn.__name__,'source_sha256':sha(ROOT/'tools'/f'{module}.py')}
        if 'legacy_page' in item:p['legacy_page']=item['legacy_page']
        if item.get('legacy_page')==11:p['media']={'path':'../assets/media/ar-demo-25s.mp4','duration_seconds':20.367,'poster':'../assets/generated/ar-demo-poster.png','rect':[64,256,970,545.625]}
        if 'solution_source_page' in item:
            number=item['solution_source_page'];reference=VISUAL_SOURCES/f'第{number}页.png'
            p['solution_source_page']=number
            solution_references[file.name]={'page':i,'file':file.name,'source_page':number,'source':'../../../ppt/视觉稿/'+reference.name,'source_sha256':sha(reference),'module':module,'function':fn.__name__,'module_sha256':sha(ROOT/'tools'/f'{module}.py')}
        pages.append(p)
    manifest={
        'schema_version':'psop.svg-deck/2','revision':2,'date':'2026-10-15',
        'deliverable':'standalone_svg_pages','source':'../script.md',
        'source_sha256':sha(source),'industry_sources':'../industry-sources.md',
        'industry_sources_sha256':sha(ROOT/'industry-sources.md'),
        'canvas':[1600,900],'fonts':['Microsoft YaHei','Noto Sans CJK SC','Arial'],
        'page_count':page_count,'pages':pages,'legacy_page_map':legacy_map,
        'solution_visual_references':solution_references,
        'experiment_sources':{n:sha(ASSETS/'experiment'/n) for n in ['control.svg','runtime.svg','delta-table.svg']},
        'created_assets':{str(p.relative_to(ASSETS/'generated')):sha(p) for p in sorted([
            ASSETS/'generated/ar-demo-poster.png',
            *(ASSETS/'generated/microduck').glob('*.png'),
            *(ASSETS/'generated/microduck').glob('*.svg')])},
        'official_product_assets':{str(p.relative_to(ASSETS)):sha(p) for p in sorted((ASSETS/'reference-products-2026').glob('*.png'))},
        'prototype_sources':'../prototypes/index.html',
        'case_asset_manifest':{'path':'../assets/generated/microduck/manifest.json','sha256':sha(ASSETS/'generated/microduck/manifest.json')},
        'source_assembly':{'path':'../assets/generated/microduck/model-source-report.json','sha256':sha(ASSETS/'generated/microduck/model-source-report.json'),'configuration':'walk-model-reference / qpos0','mesh_count':38,'assembly_instances':70,'software_identity':'alpha software identity is recorded separately from the source geometry'},
        'cover_native_eg':cover_eg_manifest(),
    }
    new_files={p['file'] for p in pages}
    for old in previous.get('pages',[]):
        name=old.get('file','')
        if name.endswith('.svg') and Path(name).name==name and name not in new_files:(out/name).unlink(missing_ok=True)
    assert {p.name for p in out.glob('*.svg')}==new_files, 'SVG output must contain exactly the manifest pages'
    manifest['content_notes']=[
        '以 Microduck 舵机识别与复检串联部件知识、操作条件、工具反馈与验证学习',
        '首页同时展示 build 来源爆炸模型、compile 原生 EG、simulate 安装预演，以及 AR / mobile 现场使用',
        '全套25页；第5–13页为据视觉稿文件11–19重绘的解决方案；原第5–16页顺延至14–25页',
        '第15/16/17页依次展示build、compile、simulate；第18页展示端侧感知、条件协同与Runtime核验',
        '第14页保留机械臂组装240次完整配对实验，第20页保留机械臂原视频；不作为Microduck实测结论',
        'SVG与PDF第20页为静态视频帧；HTML总览支持播放原视频',
        'Microduck安装预演默认处于对齐支架阶段，身份待核对；识别与复检证据子任务默认身份记录已到达、复检待补；第19页呈现安装进行中',
        '设备几何采用官方38个STL与70个源装配实例；walk几何配置与alpha软件身份分别记录适用范围',
        '第19页为安装过程AI生成示意；固定、软件身份与复检结果需关联真实工具反馈',
        'simulate 分为准备部件、对齐支架、安装舵机与连接件、固定与连接、复检待完成五个阶段；安装位移为教学预演',
        'Microduck 工作台、EG、三维回放与训练示例为教学原型，训练与设备控制效果须独立验证',
        '知识与 EG 经适用性审核后更新，领域模型通过独立评测与版本发布复用',
    ]
    manifest['native_page_sources']=native_sources
    manifest['edge_runtime_page_sources']={p['file']:{'source':'../tools/edge_runtime_page.py','function':'edge_runtime','source_sha256':sha(ROOT/'tools/edge_runtime_page.py')} for p in pages if p.get('legacy_page')==9}
    manifest['learning_page_sources']={name:{'source':'../tools/learning_platform_pages.py','function':fn,'source_sha256':sha(ROOT/'tools/learning_platform_pages.py')} for name,fn in [('22-experience-loop.svg','experience_loop'),('23-platform-architecture.svg','platform_architecture')]}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
    make_index(out,pages)
    make_visual_review(out,pages)
    print(json.dumps({'pages':len(pages),'output':str(out),'svg_bytes':sum(p['bytes'] for p in pages),'source_sha256':manifest['source_sha256']},ensure_ascii=False))

if __name__=='__main__':main()
