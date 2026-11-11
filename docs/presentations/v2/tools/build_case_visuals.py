#!/usr/bin/env python3
"""Build task illustrations from the official Microduck source assembly renders."""
from pathlib import Path
from html import escape
import base64
import hashlib
import json
import argparse
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/generated/microduck'
NAVY, SKY, TEAL, PURPLE, AMBER = '#123B5D', '#3AAFE6', '#138F84', '#6E78D8', '#B77A17'
FONT = 'Microsoft YaHei,Noto Sans CJK SC,Arial,sans-serif'
LAYOUT_PREVIEW = False

def rect(x,y,w,h,fill='white',stroke='none',r=10):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'

def text(x,y,s,size=24,color=NAVY,anchor='start',weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{escape(s)}</text>'

def line(x,y,xx,yy,color=SKY,width=3):
    return f'<path d="M{x} {y}L{xx} {yy}" fill="none" stroke="{color}" stroke-width="{width}"/>'

def circle(x,y,r,fill,stroke='none'):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="3"/>'

def svg(body,title,w=1400,h=820):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(title)}" style="font-family:{FONT}"><title>{escape(title)}</title><defs><marker id="flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" stroke-width="1.6"/></marker></defs>'+rect(0,0,w,h,'#F3F8FC',r=0)+body+'</svg>'

def model_image(name,x,y,w,h,fit='xMidYMid meet'):
    p=OUT/name
    if not p.exists():
        if not LAYOUT_PREVIEW:raise FileNotFoundError(f'Build the official assembly render first: {p}')
        return rect(x,y,w,h,'#E7F0F6','#BCCFDD',r=6)+text(x+w/2,y+h/2,'源装配图 · 等待渲染',25,'#7892A5','middle')+text(x+w/2,y+h/2+37,name,18,'#7892A5','middle')
    data=base64.b64encode(p.read_bytes()).decode('ascii')
    return f'<image href="data:image/png;base64,{data}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="{fit}"/>'

def model_crop(name,x,y,w,h):
    report=OUT/'model-render-report.json'
    if not report.exists() or not (OUT/name).exists():return model_image(name,x,y,w,h)
    data=json.loads(report.read_text(encoding='utf-8'))[Path(name).stem]
    sw,sh=data['imageSize'];left,top,right,bottom=data['alphaBounds']
    margin=12;left-=margin;top-=margin;right+=margin;bottom+=margin
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{left} {top} {right-left} {bottom-top}" preserveAspectRatio="xMidYMid meet">'+model_image(name,0,0,sw,sh)+'</svg>'

def source_region(name,x,y,w,h,cropped=False):
    """Project the reported source-body bounds into the same image viewport."""
    report=json.loads((OUT/'model-render-report.json').read_text(encoding='utf-8'))[Path(name).stem]
    region=report.get('jointRegionBounds')
    if not region:return ''
    sw,sh=report['imageSize'];left=top=0
    if cropped:
        left,top,right,bottom=report['alphaBounds'];left-=12;top-=12;sw=right+12-left;sh=bottom+12-top
    scale=min(w/sw,h/sh);dx=x+(w-sw*scale)/2;dy=y+(h-sh*scale)/2
    rx=dx+(region[0]-left)*scale;ry=dy+(region[1]-top)*scale
    rw=(region[2]-region[0])*scale;rh=(region[3]-region[1])*scale
    return f'<rect x="{rx:.3f}" y="{ry:.3f}" width="{rw:.3f}" height="{rh:.3f}" rx="3" fill="none" stroke="{AMBER}" stroke-width="2.5"/>'

def flow(d,color=SKY,width=2):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" marker-end="url(#flow)"/>'

def caption(kicker,title,subtitle):
    return text(40,39,'PSOP / '+kicker,17,SKY,weight=700)+text(40,85,title,36,weight=700)+text(40,121,subtitle,20,'#526F84')

def overview():
    g=caption('SOURCE ASSEMBLY','Microduck：从真实装配结构进入设备任务','官方 STL 与参考装配变换 · MD-01 为教学设备标识')
    g+=model_crop('model-assembled.png',352,144,696,542)
    g+=rect(40,712,1320,69,NAVY)+text(67,756,'MD-SERVO-CHECK-01 / Rev.A · 身份记录与复检证据分别核验',27,'white',weight=600)
    return svg(g,'Microduck 源装配与任务身份')

def knowledge():
    g=caption('STRUCTURE + PROVENANCE','先看部件如何连接，再找操作所依赖的资料','源装配爆炸观察 · walk 几何配置与 alpha 软件身份分别绑定')
    g+=rect(40,151,834,556,'#EAF2F7','#CDDFEA',r=12)
    g+=text(62,188,'结构与装配关系',24,weight=700)+text(850,186,'70 个装配实例',17,'#526F84','end')
    g+=model_crop('model-exploded.png',216,201,429,475)
    g+=model_crop('model-servo-module.png',671,252,156,147)
    g+=text(749,427,'XL330 源部件',18,NAVY,'middle',600)+text(749,452,'CMP-000094',15,'#526F84','middle')
    g+=flow('M588 365H663',SKY,1.8)
    for y,title,detail,d in [
        (289,'头壳与感知','CMP-000089 / 000073','M183 305H238V258H280'),
        (429,'颈部舵机链','CMP-000076 / 000094','M183 445H266V372H355'),
        (574,'髋部与腿','CMP-000068 / 000091','M183 590H238V536H278'),
    ]:
        g+=text(62,y,title,20,weight=600)+text(62,y+27,detail,14,'#526F84')
        g+=line(62,y+41,183,y+41,'#B6CDDB',1.5)+flow(d,'#86ACBF',1.5)
    g+=line(62,684,851,684,'#BDD2E0',1.5)
    g+=text(62,699,'外壳 / 颈部 / 躯干 / 髋部 / 腿与脚掌',17,'#526F84')
    g+=text(929,181,'从源资料到任务的可追溯关系',24,weight=700)
    nodes=[
        (206,'01','源资料','官方 STL + robot_walk.xml','SRC-000048 · 参考装配',SKY),
        (326,'02','模型与实例','MCD-000001 · 装配变换','几何实例 → 部件实体',SKY),
        (446,'03','目标部件','XL330 舵机 / 髋部 / 轴承','CMP-000094 / 000068 / 000083',AMBER),
        (566,'04','适用版本与任务','build.dkp v1.2.1 · 教学 Rev.A','MD-SERVO-CHECK-01',PURPLE),
    ]
    for y,num,title,body,detail,col in nodes:
        g+=circle(946,y+25,16,col)+text(946,y+31,num,15,'white','middle',700)
        g+=text(979,y+27,title,24,col,weight=700)+text(979,y+58,body,19)+text(979,y+86,detail,17,'#526F84')
        if y<566:g+=flow(f'M946 {y+47}V{y+112}',col,1.8)
    g+=flow('M875 437H913',SKY,2.3)
    g+=rect(40,729,1320,58,NAVY)+text(64,767,'结构说明“在哪里、怎样连接”，知识链接说明“依据什么、适用于哪一版”。',26,'white',weight=600)
    return svg(g,'Microduck 源装配爆炸图与知识来源关系')

def joint():
    g=caption('LOCAL JOINT + EVIDENCE','把镜头收近，核对同一个关节的身份与反馈','源装配局部 · J01 为教学任务标签，源选区与软件身份分别核对')
    g+=rect(40,151,835,531,'#EAF2F7','#CDDFEA',r=12)
    g+=model_image('model-joint-detail.png',194,166,660,485)
    g+=source_region('model-joint-detail.png',194,166,660,485)
    g+=rect(56,169,146,187,'white','#CEDFE9',r=8)+model_crop('model-assembled.png',66,176,126,149)
    g+=source_region('model-assembled.png',66,176,126,149,cropped=True)
    g+=text(129,342,'整机位置参考',15,'#526F84','middle')
    g+=rect(61,613,370,46,NAVY,r=7)+text(83,643,'walk 来源 / 髋部与连接结构',21,'white',weight=600)
    g+=text(928,184,'S03 · 任务证据链',26,weight=700)
    g+=line(955,230,955,554,'#B4CDD9',3)
    for y,num,title,body,detail,col in [
        (230,'1','目标身份','软件识别结果已记录','保留关联对象、工具返回与版本',TEAL),
        (365,'2','工具与日志','复检记录缺失','请求检查，并关联实际反馈',AMBER),
        (500,'3','Runtime 核验','待验证 · 保持 S03','记录齐备后再核验完成条件',PURPLE),
    ]:
        g+=circle(955,y,18,'#F3F8FC',col)+text(955,y+7,num,20,col,'middle',700)
        g+=text(990,y+7,title,25,col,weight=700)+text(990,y+44,body,23,weight=600)+text(990,y+76,detail,18,'#526F84')
    for x,title,detail in [(52,'舵机外形','CMP-000094 · SRC-000045'),(374,'髋部件','CMP-000068 · SRC-000019'),(696,'轴承外形','CMP-000083 · SRC-000034')]:
        g+=text(x,714,title,20,weight=700)+text(x,741,detail,16,'#526F84')
    g+=rect(40,763,1320,42,NAVY,r=8)+text(700,792,'复检记录缺失 → 保持当前节点，补充工具反馈后再核验',24,'white','middle',600)
    return svg(g,'Microduck 髋部结构特写与识别复检证据链')

def checks():
    g=text(49,71,'S03 / 操作到了哪里，还缺什么依据？',31)
    for i,(title,desc,status,col) in enumerate([('对象已绑定','MD-01 / J01 / Rev.A','设备与目标关节一致',SKY),('识别已有','软件返回关联目标','保留工具返回与来源',TEAL),('复检缺失','查询没有取得记录','请求复检，保持状态',AMBER)]):
        x=49+i*449;g+=rect(x,140,403,422,'white','#CADDE8')+circle(x+59,204,26,col)+text(x+59,213,str(i+1),26,'white','middle')
        g+=text(x+26,282,title,32,col)+text(x+26,344,desc,24)+text(x+26,410,status,23)
        g+=rect(x+26,467,351,61,'#EAF3F8')+text(x+43,507,'S03 / '+['BOUND','IDENTIFIED','PENDING'][i],23,col)
    g+=rect(49,623,1302,155,NAVY)+text(77,676,'满足身份、版本和复检条件，才能推进任务',31,'white')+text(77,726,'教学状态来自合成记录；实机完成以对应工具与验收记录证明。',23,'#C2DDEB')
    return svg(g,'对象绑定、识别与复检记录检查')

def trace():
    g=text(49,72,'一次设备操作，形成可审核的学习样本',32)
    for i,(lab,body,col) in enumerate([('State','S03 / 待验证',SKY),('Observation','识别已有，复检缺失',AMBER),('Action','请求复检，保持状态',PURPLE),('Result','关联实际检查反馈',TEAL)]):
        x=38+i*343;g+=rect(x,132,295,217,'white','#CADDE8')+text(x+23,181,lab,27,col)+text(x+23,239,body,22)+text(x+23,301,'MD-01 / J01 / Rev.A',18)
    g+=rect(38,398,1324,126,NAVY)+text(66,451,'EG 约束与验证反馈 → 对齐决策当时的信息',32,'white')+text(66,493,'设备身份 / 观察 / 工具返回 / 下一动作 / 完成条件',24,'#C2DDEB')
    for i,(lab,col) in enumerate([('来源与审核',SKY),('微调 / 蒸馏',PURPLE),('独立真实评测',TEAL),('版本发布与回滚',SKY)]):
        x=38+i*343;g+=rect(x,588,295,92,'white','#CADDE8')+text(x+147,644,lab,25,col,'middle')
    g+=text(700,759,'知识更新、模型训练和现场任务推进分别核验',26,TEAL,'middle')
    return svg(g,'设备操作轨迹对齐与学习循环')

def main():
    global LAYOUT_PREVIEW
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-layout',action='store_true',help='Allow labelled placeholders while source renders are being prepared.')
    args=parser.parse_args();LAYOUT_PREVIEW=args.preview_layout
    OUT.mkdir(parents=True,exist_ok=True)
    items=[('microduck-overview',overview),('device-knowledge',knowledge),('microduck-joint',joint),('task-checks',checks),('learning-trace',trace)]
    for name,fn in items:(OUT/(name+'.svg')).write_text(fn(),encoding='utf-8')
    assets=[]
    for p in sorted(OUT.glob('*')):
        if p.suffix in ('.svg','.png','.webp') and p.name!='microduck-studio.png':
            kind='generated_installation_illustration' if p.name=='installation-process.png' else 'official_product_photo' if p.name.startswith('official-') else 'source_assembly_render' if p.name.startswith('model-') or p.name in {'cover-build-exploded.png','cover-installation.png'} else 'prototype_browser_capture' if p.name.startswith(('ui-','sim-step-')) or p.name=='cover-simulate.png' else 'native_svg_task_diagram' if p.suffix=='.svg' else 'legacy_concept_image'
            photo_sources={'official-closeup.webp':'https://pollen-robotics.com/assets/microduck/gallery/closeup.webp','official-squad.webp':'https://pollen-robotics.com/assets/microduck/squad.webp'}
            source=photo_sources.get(p.name,'imagegen installation-process illustration using official-closeup.webp and source-derived model renders as references' if kind=='generated_installation_illustration' else 'build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/apps/build/data/scene-manifest.json' if kind=='source_assembly_render' else 'PSOP task illustration or prototype')
            rights='Generated process illustration; references retain their source attribution' if kind=='generated_installation_illustration' else 'Creative Commons BY-SA-NC; upstream source does not name a version' if kind=='source_assembly_render' else 'Pollen Robotics official photo; license not asserted by this manifest' if kind=='official_product_photo' else 'Native PSOP diagram or prototype; embedded geometry retains upstream attribution'
            assets.append({'file':p.name,'source':source,'rights':rights,'kind':kind,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    manifest={'schema_version':'psop.microduck-visuals/3','date':'2026-10-15','case':'MD-01 / MD-SERVO-CHECK-01 Rev.A / S03 / J01','status':'layout_preview' if LAYOUT_PREVIEW else 'source_assembly_and_teaching_task','geometry_source':'build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/apps/build/data/scene-manifest.json; official STL and SRC-000048 reference transforms, 70 assembly instances','official_photo_sources':{'official-closeup.webp':'https://pollen-robotics.com/assets/microduck/gallery/closeup.webp','official-squad.webp':'https://pollen-robotics.com/assets/microduck/squad.webp'},'task_source':'build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/kb/tasks/task-definitions.jsonl; TSK-000006 and TSK-000008, proposed/document','assets':assets}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    cards=''.join(f'<article><img src="{a["file"]}" alt="{a["file"]}"><p>{a["file"]}</p></article>' for a in assets)
    (OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>PSOP · Microduck 案例素材</title><style>body{font:18px/1.7 Microsoft YaHei,sans-serif;background:#f3f8fc;color:#123b5d;margin:40px}main{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}img{width:100%;border-radius:12px}article{background:white;padding:16px}</style><h1>PSOP · Microduck 案例素材</h1><p>结构图来自官方 STL 与源装配变换；识别、复检与学习状态为教学任务示例。</p><p><a href="../../index.html">素材总览</a></p><main>'+cards+'</main>',encoding='utf-8')
    panels=[
        ('build','build · 官方源装配与部件知识','ui-build.png','部件几何与装配关系来自官方 STL 和来源矩阵。'),
        ('simulate','simulate · 同一设备的操作与回放','ui-simulate.png','保留长颈、外露块状舵机、头壳与橙色脚掌。'),
        ('knowledge','结构拆解 · 从部件追溯到资料和版本','device-knowledge.svg','拆分躯干与装配结构，并连接源资料、模型实例、部件与任务。'),
        ('joint','局部复检 · 从目标关节进入证据链','microduck-joint.svg','主图为髋部舵机与连接结构特写；整机仅用于小型位置参考。'),
        ('installation','安装过程 · 现场入口与操作提示','../../../slides/19-mobile-workbench.svg','双手对齐髋部连接件，安装进行中；固定后核对身份并补充复检。过程图片为 AI 生成示意。'),
    ]
    review='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSOP · Microduck 修订视觉</title><style>body{margin:0;background:#e8f1f7;color:#123b5d;font:18px/1.65 Microsoft YaHei,sans-serif}header,main{max-width:1464px;margin:auto;padding:28px}header h1{margin:0;font-size:32px}nav{display:flex;gap:22px;flex-wrap:wrap;margin-top:18px}a{color:#0875a3}section{margin:0 0 36px;background:white;border:1px solid #cbdde8;border-radius:14px;padding:22px}h2{margin:0;font-size:25px}p{margin:10px 0 18px;color:#526f84}img{width:100%;height:auto;display:block;border:1px solid #d5e4ec;border-radius:8px}</style></head><body><header><h1>PSOP · Microduck 修订视觉</h1><p>几何来自官方 STL 与来源装配；识别和复检状态为教学任务原型。</p><nav>'+''.join(f'<a href="#{id_}">{title.split(" · ")[0]}</a>' for id_,title,_,_ in panels)+'</nav></header><main>'
    for id_,title,file,desc in panels:
        version=hashlib.sha256((OUT/file).read_bytes()).hexdigest()[:12] if (OUT/file).exists() else 'pending'
        review+=f'<section id="{id_}"><h2>{escape(title)}</h2><p>{escape(desc)} <a href="{file}?v={version}" target="_blank">打开原图</a></p><img src="{file}?v={version}" alt="{escape(title)}"></section>'
    (OUT/'visual-review.html').write_text(review+'</main></body></html>',encoding='utf-8')
    print('Microduck case visuals written:',len(items))

if __name__=='__main__':main()
