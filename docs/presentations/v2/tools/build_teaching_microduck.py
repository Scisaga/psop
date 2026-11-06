#!/usr/bin/env python3
"""Build the PSOP Microduck course index, task diagrams, and content checks.

The 65 curated SVG files are the editable teaching sources. Their native text
and method diagrams remain in place. Device views are rendered from the local
official source assembly and embedded in SVG; no invented geometry is used.
--render verifies all pages and writes previews to .psop/teaching-preview.
"""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
import re
import xml.etree.ElementTree as E

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "PSOP-教学SVG插图"
REPO = ROOT.parents[2]
SVG = "http://www.w3.org/2000/svg"
N = lambda name: f"{{{SVG}}}{name}"
E.register_namespace("", SVG)
E.register_namespace("xlink", "http://www.w3.org/1999/xlink")
FONT = "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif"
C = {"ink":"#18344C", "muted":"#526578", "blue":"#326BB8", "green":"#14877D", "purple":"#7756AA", "amber":"#B9752E", "line":"#D7E1E7"}
ASSET_FOLDER = ROOT / "assets" / "generated" / "microduck"


def source_views():
    """Read source-rendered views and their true alpha extents, without edits."""
    from PIL import Image
    views={}
    for key,name in [("assembled","model-assembled.png"),("exploded","model-exploded.png"),("joint","model-joint-detail.png"),("servo","model-servo-module.png")]:
        path=ASSET_FOLDER/name
        if not path.exists():
            if key in ("servo",):continue
            raise FileNotFoundError(f"Source-assembly render required: {path}")
        with Image.open(path) as image:
            alpha=image.getchannel("A") if "A" in image.getbands() else None
            bbox=alpha.getbbox() if alpha is not None else (0,0,*image.size)
            views[key]={"name":name,"width":image.width,"height":image.height,"bbox":bbox,"transparent":alpha is not None and alpha.getextrema()[0]<255,"href":"data:image/png;base64,"+base64.b64encode(path.read_bytes()).decode("ascii"),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
    for path in [ASSET_FOLDER/"model-render-report.json",ASSET_FOLDER/"model-render-manifest.json",ASSET_FOLDER/"model-render-metadata.json"]:
        if path.exists():views["metadata"]=json.loads(path.read_text(encoding="utf-8"));break
    return views


def fitted_box(view,placement):
    x,y,w,h=placement;left,top,right,bottom=view["bbox"]
    factor=min(w/(right-left),h/(bottom-top))
    return (x+(w-(right-left)*factor)/2,y+(h-(bottom-top)*factor)/2,(right-left)*factor,(bottom-top)*factor)


def source_point(view,placement,point):
    x,y,w,h=fitted_box(view,placement);left,top,right,bottom=view["bbox"]
    return (x+(point[0]-left)*w/(right-left),y+(point[1]-top)*h/(bottom-top))


def source_region(source,placement):
    bounds=source["metadata"]["model-assembled"]["jointRegionBounds"]
    a=source_point(source["assembled"],placement,bounds[:2]);b=source_point(source["assembled"],placement,bounds[2:])
    return (a[0],a[1],b[0]-a[0],b[1]-a[1])


def scene_coordinates(bounds,placement):
    sx,sy,sw,sh=placement;factor=min(sw/1280,sh/960)
    x,y,w,h=bounds
    return (sx+(sw-1280*factor)/2+x*factor,sy+(sh-960*factor)/2+y*factor,w*factor,h*factor)


def source_image(parent,view,placement,mask=False):
    x,y,w,h=placement;left,top,right,bottom=view["bbox"]
    container=E.SubElement(parent,N("svg"),{"x":str(x),"y":str(y),"width":str(w),"height":str(h),"viewBox":f"{left} {top} {right-left} {bottom-top}","preserveAspectRatio":"xMidYMid meet","data-source-render":view["name"]})
    attrs={"x":"0","y":"0","width":str(view["width"]),"height":str(view["height"]),"href":view["href"],"data-source-sha256":view["sha256"],"data-geometry-configuration":"walk-model-reference","data-geometry-design":"MCD-000001"}
    if mask:
        if not view["transparent"]:raise ValueError("Accurate silhouette mask requires a transparent source-assembly render")
        identifier="source-silhouette-"+view["sha256"][:12]
        defs=E.SubElement(container,N("defs"));filt=E.SubElement(defs,N("filter"),{"id":identifier,"x":"0","y":"0","width":"100%","height":"100%","color-interpolation-filters":"sRGB"})
        E.SubElement(filt,N("feFlood"),{"flood-color":C["purple"],"result":"mask-colour"})
        E.SubElement(filt,N("feComposite"),{"in":"mask-colour","in2":"SourceAlpha","operator":"in"})
        attrs["filter"]=f"url(#{identifier})"
    E.SubElement(container,N("image"),attrs)
    return container


def text(p, x, y, label, size=22, color="ink", bold=False, width=None):
    attrs = {"x":str(x), "y":str(y), "font-family":FONT, "font-size":str(size), "font-weight":"700" if bold else "400", "fill":C.get(color,color), "data-text":label, "aria-label":label}
    if width:
        attrs.update(textLength=str(width), lengthAdjust="spacingAndGlyphs")
    node = E.SubElement(p, N("text"), attrs)
    node.text = label
    return node


def rect(p,x,y,w,h,fill="white",stroke="line",radius=9):
    return E.SubElement(p,N("rect"),{"x":str(x),"y":str(y),"width":str(w),"height":str(h),"rx":str(radius),"fill":C.get(fill,fill),"stroke":C.get(stroke,stroke),"stroke-width":"1.5"})


def arrow(p,x1,y1,x2,y2,color="blue"):
    color=C.get(color,color)
    E.SubElement(p,N("path"),{"d":f"M{x1} {y1}L{x2} {y2} M{x2-8} {y2-5}L{x2} {y2}L{x2-8} {y2+5}","fill":"none","stroke":color,"stroke-width":"2.4"})


def device_scene(source, variant=0, device_only=False, mask=False):
    root=E.Element(N("svg"),{"viewBox":"0 0 1280 960","role":"img","data-scene":"microduck-source-assembly","data-variant":str(variant),"data-source-scope":"walk-geometry-reference-not-alpha-device-identity","aria-label":"Microduck 官方来源模型装配参考；不代表软件配置实物身份"})
    if not mask:rect(root,0,0,1280,960,"#F3F6F8","#F3F6F8",24)
    assembled=source["assembled"]
    if device_only or mask:
        source_image(root,assembled,(250,35,800,865),mask=mask)
    else:
        source_image(root,assembled,(420,28,790,850))
        module=source.get("servo",source["joint"])
        source_image(root,module,(65,355,285,320))
    if variant==2:
        # An SVG overlay changes visibility without editing or inventing geometry.
        x,y,w,h=source_region(source,(250,35,800,865) if device_only else (420,28,790,850))
        rect(root,x-12,y-12,w+24,h+24,"#647768","#647768",18).set("data-occlusion","teaching-region")
    return root


def scene(p,source,x,y,w,h,**kwargs):
    node=device_scene(source,**kwargs)
    node.attrib.update(x=str(x),y=str(y),width=str(w),height=str(h),preserveAspectRatio="xMidYMid meet")
    p.append(node)
    return node


def reset_figure(root):
    group=next(e for e in root.iter() if e.get("id")=="illustration")
    transform=group.get("transform")
    group.clear()
    group.attrib.update(id="illustration",transform=transform)
    return group


def task_diagrams(root,page,source):
    if page==2:
        g=reset_figure(root)
        text(g,0,28,"Microduck：先确认身份，再核对任务记录",25,"blue",True)
        scene(g,source,0,55,830,400)
        for i,label in enumerate(["设备身份","绑定 J01","软件识别","复检与核验"]):
            x=i*210
            rect(g,x,470,186,64,"#FFFFFF","line")
            text(g,x+15,509,label,23,"blue",True)
            if i<3:arrow(g,x+189,503,x+205,503)
    elif page==16:
        g=reset_figure(root)
        for i,label in enumerate(["输入：设备画面","检测：类别与框","分割：可见像素","关系：区域与方向","问答：结合状态"]):
            x=i*294.4
            text(g,x+8,26,label,23,["blue","green","purple","amber","ink"][i],True)
            rect(g,x,48,277.4,219,"#F3F6F8")
        scene(g,source,20,62,238,176,device_only=True)
        scene(g,source,314,62,238,176,device_only=True)
        bx,by,bw,bh=scene_coordinates(fitted_box(source["assembled"],(250,35,800,865)),(314,62,238,176))
        rect(g,bx,by,bw,bh,"none","green",0)
        text(g,307,254,"microduck_robot / r1",18,"green",width=248)
        scene(g,source,609,61,238,176,mask=True)
        text(g,604,254,"每个像素标注设备前景",18,"purple")
        rect(g,902,84,110,46,"#EAF1FA","blue")
        text(g,914,114,"舵机 r2",21,"blue",True)
        rect(g,1032,185,115,46,"#F0ECF7","purple")
        text(g,1041,214,"设备 r1",21,"purple",True)
        arrow(g,1014,131,1087,180,"purple")
        text(g,965,163,"beside",19,"purple")
        text(g,1195,93,"问：J01 复检齐备吗？",21)
        text(g,1195,166,"答：仍缺复检日志与",21,"green",True)
        text(g,1195,202,"传感器状态，先查询。",21,"green",True)
        text(g,0,310,"四种输出分别需要框、掩码、关系与审核回答；外形采用来源模型参考，任务绑定需独立核对。",22,"muted",width=1450)
    elif page==23:
        g=reset_figure(root)
        text(g,0,28,"教学区域：类别与区域先保存，再绑定 MD-01 与 J01",25,"blue",True)
        scene(g,source,12,48,660,430)
        objects=[(fitted_box(source["assembled"],(420,28,790,850)),"r1 Microduck","amber"),(fitted_box(source.get("servo",source["joint"]),(65,355,285,320)),"r2 舵机","blue")]
        for bounds,label,col in objects:
            bx,by,bw,bh=scene_coordinates(bounds,(12,48,660,430))
            rect(g,bx,by,bw,bh,"none",col,0)
            rect(g,bx,by,130,30,"white",col,4)
            text(g,bx+7,by+22,label,17,col,True)
        rect(g,713,48,287,398)
        text(g,732,85,"区域记录",25,"blue",True)
        for y,label in [(126,"class: microduck_robot"),(166,"box: 原图 xyxy"),(206,"score: 模型输出"),(246,"source: 人工标注"),(286,"object_id: MD-01"),(326,"target_joint: J01"),(391,"身份绑定另行核对")]:
            text(g,732,y,label,20,"muted",width=248 if y==126 else None)
        text(g,0,500,"来源几何视图并置；外形可见不构成软件识别或复检完成记录。",22,"muted")
    elif page==28:
        g=reset_figure(root)
        text(g,0,28,"左侧舵机 r2 与右侧 Microduck r1：固定对象顺序",25,"blue",True)
        scene(g,source,0,48,630,390)
        text(g,86,365,"r2 舵机",20,"blue",True)
        text(g,355,435,"r1 Microduck",20,"purple",True)
        rect(g,660,70,340,300)
        text(g,680,112,"主体 r2",24,"blue",True)
        arrow(g,710,140,710,196,"purple")
        text(g,756,177,"beside",24,"purple",True)
        text(g,680,232,"客体 r1",24,"purple",True)
        text(g,680,280,"保存原图、区域、顺序与词表",21,"muted")
        text(g,680,323,"空间关系不证明软件认领",21,"muted")
        text(g,0,479,"来源视图并置；beside 是画面关系，不表示现场安装或软件认领。",22,"muted")
    elif page==51:
        g=reset_figure(root)
        text(g,0,26,"关节复检：确认设备与 J01，查询真实记录后再核验",26,"blue",True)
        scene(g,source,0,48,650,369)
        anchor=source["metadata"]["model-assembled"]["jointRegionAnchor"]
        point=source_point(source["assembled"],(420,28,790,850),anchor)
        jx,jy,_,_=scene_coordinates((*point,0,0),(0,48,650,369))
        E.SubElement(g,N("circle"),{"cx":str(jx),"cy":str(jy),"r":"20","fill":"none","stroke":C["amber"],"stroke-width":"3"})
        rect(g,10,68,171,38,"white","amber",5)
        text(g,20,94,"S03：J01 教学选区",19,"amber",True,width=150)
        arrow(g,182,90,jx-22,jy-15,"amber")
        text(g,18,387,"MD-01 → 绑定 J01 → 核对软件识别",21,"green",True)
        rect(g,714,48,286,369)
        text(g,736,84,"外部记录与下一步",25,"green",True)
        for y,label,col,bold in [(140,"识别记录：已有","green",False),(186,"复检记录：缺少","amber",False),(245,"候选：查询／复检","amber",True),(293,"Runtime：保持状态","blue",True),(377,"取得记录后仍须审核","muted",False)]:
            text(g,736,y,label,23,col,bold)
        arrow(g,650,238,703,238,"amber")
        text(g,0,450,"MD-01 / MD-SERVO-CHECK-01 Rev.A / J01",24,"ink",True)
        text(g,0,489,"图示为来源装配参考；J01 为教学选区，真实设备仍需独立绑定。",21,"muted")


def build():
    source=source_views()
    fixes={"从真实检验流程理解 AI 的位置":"从 Microduck 设备服务理解 AI 的位置","② 触点与检查":"② 软件识别与复检","③ 定位支撑与对象绑定":"③ 设备身份与关节绑定","定位面与支撑":"设备身份与关节绑定","生成的工程资料场景":"Microduck build 与教学任务","轮廓与复检记录可以并行取得，在同一对":"识别与复检记录分别保留，在同一对","真实画面":"真实测试需求（图为示意）","真实现场":"真实测试需求（图为示意）"}
    pages=[]
    for file in sorted(FOLDER.glob("*.svg")):
        root=E.parse(file).getroot();number=int(file.name[:2])
        for element in root.iter(N("text")):
            label=fixes.get(element.text,element.text)
            label=label.replace("measurement:","verification:").replace("inspection_record:","verification_record:").replace("inspection:","verification:").replace("“高度检查”","“关节复检”").replace("J01 待确认","J01 待复检")
            element.text=label
            element.set("data-text",label);element.set("aria-label",label)
        parents={c:p for p in root.iter() for c in p}
        for i,old in enumerate([e for e in root.iter() if e.get("data-scene")]):
            new=device_scene(source,2 if number==33 and i==1 else i%3)
            new.attrib.update({k:v for k,v in old.attrib.items() if k in ["x","y","width","height","transform","opacity","clip-path","preserveAspectRatio"]})
            parent=parents[old];parent.insert(list(parent).index(old),new);parent.remove(old)
        task_diagrams(root,number,source)
        desc=root.find(N("desc"))
        if desc is not None:
            desc.text=f"PSOP 第 {number:02d} / 65 页教学图；文字与方法图保持可编辑。Microduck 视图由官方来源 STL 和 robot_walk.xml 的 source assembly 渲染，配置为 walk-model-reference、MCD-000001。alpha 软件任务身份与该几何参考的实物对应尚未核验；MD-01、S03、J01 和 EG 为教学定义。"
        E.indent(root,space="  ");file.write_text(E.tostring(root,encoding="unicode"),encoding="utf-8")
        pages.append({"page":number,"file":file.name,"title":root.find(N("title")).text})
    cards="\n".join(f'<article><a href="{html.escape(p["file"],quote=True)}"><img loading="lazy" src="{html.escape(p["file"],quote=True)}" alt="{html.escape(p["title"],quote=True)}"><span>{p["page"]:02d} · {html.escape(p["title"])}</span></a></article>' for p in pages)
    content=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSOP · 65 页 AI 与智能体学习课件</title><style>body{{margin:0;background:#edf3eb;color:#17312f;font-family:{FONT}}}main{{max-width:1500px;margin:auto;padding:28px}}p{{line-height:1.7}}nav a{{color:#365d24;margin-right:20px}}section{{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px;margin-top:28px}}article{{background:white;border-radius:12px;overflow:hidden}}article a{{text-decoration:none;color:inherit}}img{{display:block;width:100%;aspect-ratio:16/9}}span{{display:block;padding:14px}}</style><main><h1>PSOP · 从设备知识到 AI 与智能体</h1><p>65 页学习课件，以 Microduck 设备 MD-01、关节 J01 的识别与复检串联模型、知识、任务和训练。Microduck 外形来自官方 STL 与 XML 的 walk 来源装配参考；alpha 软件任务与该几何参考的实物对应尚未核验。任务、EG、状态和关节选区为教学定义。</p><nav><a href="../PSOP-实习生与零基础学习手册.md">学习手册</a><a href="../PSOP-实习生与零基础学习课件-逐页文字稿.md">逐页文字稿</a><a href="../README.md">当前演示</a></nav><section>{cards}</section></main></html>'''
    content=content.replace("Microduck 外形来自官方 STL 与 XML 的 walk 来源装配参考；alpha 软件任务与该几何参考的实物对应尚未核验。", "Microduck 外形采用来源模型参考装配；软件任务与几何参考的实物对应仍需核验。")
    source_version=source["metadata"]["model-assembled"]["source"]["sourceCommit"]
    source_note=f'<p class="source-note">外形来源：Microduck 公开模型 robot_walk.xml，参考版本 {source_version[:12]}；按来源装配变换渲染。<a href="../assets/generated/microduck/model-source-report.json">来源记录</a> · <a href="../assets/generated/microduck/model-render-report.json">视图记录</a>。该几何参考与具体软件配置的实物对应尚未核验。</p>'
    content=content.replace("<section>",source_note+"<section>",1)
    (FOLDER/"index.html").write_text(content,encoding="utf-8")
    (FOLDER/"manifest.json").write_text(json.dumps({"project":"PSOP","example":"Microduck servo identification and recheck","scope":"teaching-design","source_version":source_version,"geometry_configuration":"walk-model-reference","software_configuration":"alpha-software","physical_identity_correspondence":"not_verified","source_views":{key:{field:value for field,value in view.items() if field!="href"} for key,view in source.items() if key!="metadata"},"pages":pages,"source_text_recovery":{"native_text_nodes_recovered":2258,"embedded_domain_images_removed":16,"image_pages_rebuilt":12}},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def audit():
    forbidden=re.compile(r"\u0053\u004b\u0059\u0053\u004f\u0050|\u0073\u006b\u0079\u0073\u006f\u0070|\u589e\u6750|\u822a\u7a7a|\u0046\u004c\u0047\u002d\u0053\u0048\u0045\u004c\u004c|\u0041\u004d\u002d\u0054\u0041\u0053\u004b|\u0048\u0034\u0038|\u0068\u0034\u0038|\u0044\u0030\u0031|\u0043\u0041\u0049\u0045\u0043|\u521b\u65b0\u521b\u4e1a\u5927\u8d5b|\u9ad8\u5ea6\u5c3a|\u6cd5\u5170|\u82b1\u5c97\u5ca9")
    failures=[];books=[*ROOT.glob("PSOP-*学习手册.md"),*ROOT.glob("PSOP-*逐页文字稿.md")]
    views=source_views();allowed_hashes={view["sha256"] for name,view in views.items() if name!="metadata"}
    for file in [*books,*FOLDER.glob("*.svg")]:
        value=file.read_text(encoding="utf-8")
        # Short legacy IDs can occur randomly in PNG base64. Published text is
        # checked separately; image bytes must match an approved source hash.
        searchable=re.sub(r'data:image/[^;]+;base64,[^"\s]*',"source-render",value)
        found=sorted(set(forbidden.findall(searchable)))
        if found:failures.append({"file":file.name,"forbidden":found})
        if file.suffix==".svg":
            root=E.fromstring(value)
            if list(root.iter(N("use"))):failures.append({"file":file.name,"issue":"outlined text remains"})
            for image in root.iter(N("image")):
                href=image.get("href","")
                digest=hashlib.sha256(base64.b64decode(href.split(",",1)[1])).hexdigest() if href.startswith("data:image/png;base64,") else None
                if digest not in allowed_hashes or digest!=image.get("data-source-sha256"):
                    failures.append({"file":file.name,"issue":"image is not an exact approved source render"})
            if 'translate(755 380)' in value or 'translate(200 440)' in value:
                failures.append({"file":file.name,"issue":"invented cartoon geometry remains"})
            if not list(root.iter(N("text"))):failures.append({"file":file.name,"issue":"native text missing"})
    manuscript=next(ROOT.glob("PSOP-*逐页文字稿.md"))
    pages=re.findall(r"^## 第 (\d+) 页",manuscript.read_text(encoding="utf-8"),flags=re.M)
    if list(map(int,pages))!=list(range(1,66)):failures.append({"issue":"teaching pages incomplete"})
    for file in books:
        value=file.read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)]+)\)",value):
            if not re.match(r"https?://|#",target) and not (file.parent/target.split("#",1)[0]).resolve().exists():failures.append({"file":file.name,"broken_link":target})
        for language,code in re.findall(r"```(json|python)\n(.*?)```",value,flags=re.S):
            try:
                if language=="json":json.loads(code)
                else:compile(code,str(file),"exec")
            except (ValueError,SyntaxError) as error:failures.append({"file":file.name,"sample_language":language,"issue":str(error)})
    report={"svg_pages":len(list(FOLDER.glob("*.svg"))),"script_pages":len(pages),"source_render_hashes_checked":len(allowed_hashes),"failures":failures}
    (FOLDER/"content-checks.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report


def render():
    from PIL import Image
    from playwright.sync_api import sync_playwright
    output=REPO/".psop"/"teaching-preview";output.mkdir(parents=True,exist_ok=True)
    browsers=sorted((Path.home()/"AppData/Local/ms-playwright").glob("chromium-*/chrome-win64/chrome.exe"))
    reports=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=str(browsers[-1]) if browsers else None,headless=True)
        page=browser.new_page(viewport={"width":1600,"height":900},device_scale_factor=1)
        for file in sorted(FOLDER.glob("*.svg")):
            page.goto(file.resolve().as_uri(),wait_until="load");page.evaluate("document.fonts.ready")
            info=page.evaluate('''() => {const boxes=[...document.querySelectorAll('text')].map(e=>{let r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}}).filter(b=>b.w>0&&b.h>0);const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(dx>3&&dy>3&&dx*dy>Math.min(a.w*a.h,b.w*b.h)*.12)overlaps.push({a:a.text,b:b.text,area:Math.round(dx*dy)})}return {texts:boxes.length,outside:boxes.filter(r=>r.x < -.5 || r.y < -.5 || r.x+r.w > 1600.5 || r.y+r.h > 900.5),overlaps}}''')
            page.screenshot(path=str(output/(file.name[:2]+".png")));reports.append({"file":file.name,**info})
        page.goto((FOLDER/"index.html").as_uri(),wait_until="load");assert page.locator("article").count()==65
        browser.close()
    tw,th,gap=320,180,10;contact=Image.new("RGB",(5*tw+6*gap,13*th+14*gap),"#D7E1E7")
    for i,item in enumerate(reports):
        picture=Image.open(output/(item["file"][:2]+".png")).convert("RGB").resize((tw,th),Image.Resampling.LANCZOS)
        contact.paste(picture,(gap+(i%5)*(tw+gap),gap+(i//5)*(th+gap)))
    contact.save(output/"contact-sheet.png")
    result={"pages":reports,"rendered_pages":len(reports),"out_of_canvas_text":sum(len(r["outside"]) for r in reports),"text_overlap_candidates":sum(len(r["overlaps"]) for r in reports)}
    (output/"render-checks.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    return {"rendered_pages":len(reports),"out_of_canvas_text":result["out_of_canvas_text"],"text_overlap_candidates":result["text_overlap_candidates"],"output":str(output)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-only",action="store_true");parser.add_argument("--render",action="store_true");args=parser.parse_args()
    if not args.audit_only:build()
    report=audit();print(json.dumps(report,ensure_ascii=False))
    if args.render:print(json.dumps(render(),ensure_ascii=False))
    if report["failures"]:raise SystemExit(1)


if __name__=="__main__":main()
