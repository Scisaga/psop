#!/usr/bin/env python3
"""Generate the two self-contained PSOP SVG diagrams; use --check to validate."""
from __future__ import annotations

import argparse
import html
from pathlib import Path
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/assets/diagrams'
FONT = '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
C = dict(ink='#173746', text='#202B33', muted='#536875', blue='#0079CC',
         panel='#F0F5FC', gray='#F3F4F4', line='#35434A', white='#FFFFFF')
ICONS = {
    'document': '<path d="M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6"/>',
    'graph': '<rect x="2" y="9" width="5" height="6" rx="1"/><rect x="17" y="2" width="5" height="6" rx="1"/><rect x="17" y="16" width="5" height="6" rx="1"/><path d="M7 12h5V5h5 M12 12v7h5"/>',
    'chip': '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3"/>',
    'cube': '<path d="M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10 M7.5 4.5l9 5v5"/>',
    'package': '<path d="M3 7l9-4 9 4v13H3z M3 7h18 M10 7v5h4V7"/>',
    'phone': '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4 M10 19h4"/>',
    'eye': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'check': '<path d="M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M7 12l3 3 7-7"/>',
    'refresh': '<path d="M20 8A8 8 0 0 0 5 6L2 9 M2 3v6h6 M4 16a8 8 0 0 0 15 2l3-3 M16 15h6v6"/>',
    'device': '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8 M12 17v4 M7 8h10 M7 12h5"/>',
}


def esc(value):
    return html.escape(str(value), quote=True)


def width(text, size):
    return sum(1 if unicodedata.east_asian_width(ch) in 'WF' else
               .32 if ch == ' ' else .62 for ch in text) * size


def overlap(a, b):
    x, y, w, h = a
    xx, yy, ww, hh = b
    return min(x+w, xx+ww)-max(x, xx) > 1 and min(y+h, yy+hh)-max(y, yy) > 1


class Figure:
    def __init__(self, filename, height, title, subtitle, desc):
        self.filename, self.w, self.h = filename, 1440, height
        self.title, self.desc = title, desc
        self.bg, self.edges, self.nodes, self.labels = [], [], [], []
        self.groups, self.boxes, self.text_boxes, self.label_boxes, self.routes = {}, {}, [], [], []
        self.rect(0, 0, self.w, self.h, C['white'], radius=0, layer=self.bg)
        self.text(32, 48, title, 29, weight=700, layer=self.bg)
        self.text(32, 81, subtitle, 17, C['muted'], layer=self.bg)
        self.text(1408, 47, 'PSOP', 20, C['blue'], 700, 'end', self.bg)

    def rect(self, x, y, w, h, fill, stroke=None, radius=8, layer=None):
        line = f' stroke="{stroke}" stroke-width="1.7"' if stroke else ''
        (self.nodes if layer is None else layer).append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"{line}/>')

    def text(self, x, y, value, size=18, color=None, weight=400, anchor='start', layer=None):
        w = width(value, size)
        left = x - (w if anchor == 'end' else w/2 if anchor == 'middle' else 0)
        self.text_boxes.append((left, y-size, w, size*1.25, value))
        (self.nodes if layer is None else layer).append(
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color or C["text"]}" text-anchor="{anchor}">{esc(value)}</text>')

    def group(self, ident, x, y, w, h, title, gray=False):
        if ident in self.groups or width(title, 22) > w-28:
            raise ValueError(f'{self.filename}: invalid group {ident}')
        self.groups[ident] = (x, y, w, h)
        self.bg.append(f'<g id="{ident}" data-group="{ident}">')
        self.rect(x, y, w, h, C['gray'] if gray else C['panel'],
                  C['ink'] if gray else '#2674AF', 10, self.bg)
        self.text(x+w/2, y+34, title, 22, C['ink'] if gray else C['blue'],
                  700, 'middle', self.bg)
        self.bg.append('</g>')

    def card(self, ident, group, x, y, w, h, title, body=(), icon='document'):
        if ident in self.boxes:
            raise ValueError(f'duplicate card {ident}')
        gx, gy, gw, gh = self.groups[group]
        if not (gx+10 <= x and gy+48 <= y and x+w <= gx+gw-10 and y+h <= gy+gh-10):
            raise ValueError(f'{ident}: outside group content area')
        if width(title, 21) > w-60:
            raise ValueError(f'{ident}: title too wide')
        if any(width(line, 17) > w-30 for line in body) or 44+len(body)*25 > h:
            raise ValueError(f'{ident}: body does not fit')
        self.boxes[ident] = (x, y, w, h)
        self.nodes.append(f'<g id="{ident}" data-node="{ident}">')
        self.rect(x, y, w, h, C['white'], C['ink'], 6)
        self.nodes.append(f'<use href="#icon-{icon}" x="{x+14}" y="{y+15}" width="25" height="25" color="{C["blue"]}"/>')
        self.text(x+48, y+35, title, 21, weight=500)
        for i, line in enumerate(body):
            self.text(x+15, y+62+i*25, line, 17, C['muted'])
        self.nodes.append('</g>')

    def edge(self, pts, label=None, at=None, dashed=False):
        dash = ' stroke-dasharray="6 5"' if dashed else ''
        self.routes.append(pts)
        box = None
        if label:
            x, y = at
            size = 15
            w = width(label, size)+12
            box = (x-w/2, y-13, w, 26)
            self.label_boxes.append((*box, label))
            self.text(x, y+5, label, size, C['muted'], anchor='middle', layer=self.labels)
        # Leave a real gap in the connector instead of painting a label backdrop.
        for a, b in zip(pts, pts[1:]):
            spans = [(0, 1)]
            axis = 0 if a[1] == b[1] else 1
            delta = b[axis] - a[axis]
            if box and delta:
                fixed = 1-axis
                if box[fixed] <= a[fixed] <= box[fixed]+box[fixed+2]:
                    lo, hi = sorted(((box[axis]-a[axis])/delta,
                                     (box[axis]+box[axis+2]-a[axis])/delta))
                    lo, hi = max(0, lo), min(1, hi)
                    if lo < hi:
                        spans = [(0, lo), (hi, 1)]
            for lo, hi in spans:
                if lo >= hi:
                    continue
                start = tuple(a[i]+(b[i]-a[i])*lo for i in (0, 1))
                end = tuple(a[i]+(b[i]-a[i])*hi for i in (0, 1))
                marker = ' marker-end="url(#arrow)"' if b == pts[-1] and hi == 1 else ''
                self.edges.append(
                    f'<path d="M {start[0]} {start[1]} L {end[0]} {end[1]}" '
                    f'fill="none" stroke="{C["line"]}" stroke-width="1.6"{dash}{marker}/>')

    def note(self, y, title, body):
        self.rect(32, y, 1376, 56, C['gray'], C['ink'], 8, self.bg)
        self.text(52, y+35, title, 21, C['blue'], 700, layer=self.bg)
        self.text(288, y+35, body, 18, C['text'], layer=self.bg)

    def render(self):
        for x, y, w, h, text in self.text_boxes:
            if x < 0 or y < 0 or x+w > self.w or y+h > self.h:
                raise ValueError(f'{self.filename}: text outside canvas: {text}')
        for collection in (self.groups, self.boxes):
            items = list(collection.items())
            for i, (a, box) in enumerate(items):
                for b, other in items[i+1:]:
                    if overlap(box, other):
                        raise ValueError(f'{self.filename}: overlapping {a}, {b}')
        for x, y, w, h, text in self.label_boxes:
            for name, box in self.boxes.items():
                if overlap((x, y, w, h), box):
                    raise ValueError(f'{self.filename}: label overlaps {name}: {text}')
        for pts in self.routes:
            for a, b in zip(pts, pts[1:]):
                if a[0] != b[0] and a[1] != b[1]:
                    raise ValueError(f'{self.filename}: non-orthogonal edge')
                if any(not (0 <= p[0] <= self.w and 0 <= p[1] <= self.h) for p in (a, b)):
                    raise ValueError(f'{self.filename}: edge outside canvas')
                for name, (x, y, w, h) in self.boxes.items():
                    if a[0] == b[0]:
                        hit = x+1 < a[0] < x+w-1 and min(max(a[1],b[1]),y+h-1) > max(min(a[1],b[1]),y+1)
                    else:
                        hit = y+1 < a[1] < y+h-1 and min(max(a[0],b[0]),x+w-1) > max(min(a[0],b[0]),x+1)
                    if hit:
                        raise ValueError(f'{self.filename}: edge crosses {name}')
        symbols = ''.join(f'<symbol id="icon-{name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                          f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{paths}</symbol>'
                          for name, paths in ICONS.items())
        marker = f'<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="{C["line"]}"/></marker>'
        svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="figure-title figure-desc">\n'
               f'<title id="figure-title">{esc(self.title)}</title>\n<desc id="figure-desc">{esc(self.desc)}</desc>\n'
               f'<defs>{marker}{symbols}</defs>\n<g font-family="{esc(FONT)}">\n'
               + '\n'.join(self.bg+self.edges+self.nodes+self.labels) + '\n</g>\n</svg>\n')
        ET.fromstring(svg)
        return svg


def logical_architecture():
    f = Figure('logical-architecture.svg', 850, 'PSOP 三个正式生产环节逻辑架构',
               '以 DKP 为 build / compile 交接核心；simulate 生成独立沙盒；终端照片＋提问获得无 EG 帮助',
               '原始材料经 psop@build 形成 build-profile DKP，再由 psop@compile 形成同一 package_id 的 compile-profile DKP。'
               'EG 只表达设备任务 SOP；训练语料独立管理，在数据侧引用 SOP。'
               'compile 内部使用 Codex 生成候选场景程序，并由 headless 确定性 kernel 与验证器产生真值、轨迹和训练监督，'
               '训练和评测 Qwen-ASR、YOLO、RelateAnything、MiniCPM-V 4.6。'
               '模型导出到终端，以照片和提问提供无 EG 的现场帮助，物理动作由操作者完成，不直接控制真实硬件。'
               'psop@simulate 只读消费冻结的 compile 快照，生成 DKP 之外的 Web 3D 沙盒，面向用户与可选 Codex Agent，'
               '并把 compile 发布的设备模型推理作为沙盒内建逻辑能力。'
               'headless 和沙盒中的 EG 验证不构成终端模型的运行依赖。'
               '运行反馈只能作为后续独立 revision 的候选输入，不能原地改写冻结 DKP。')
    f.group('inputs',32,110,224,570,'固定输入',True)
    f.card('materials','inputs',48,172,192,118,'原始材料',
           ['说明书 · BOM · CAD','电路 · 图片 · 视频'],'document')
    f.card('scope','inputs',48,315,192,118,'范围与授权',
           ['设备 / 任务范围','来源用途 · 隐私边界'],'check')
    f.card('locks','inputs',48,458,192,118,'版本与输入锁',
           ['本体 · Schema','工具 · 配置 · 快照'],'package')

    f.group('build',300,110,300,570,'psop@build')
    f.card('knowledge','build',316,172,268,92,'本体知识库',
           ['稳定 ID · 实体 · 关系'],'graph')
    f.card('geometry','build',316,284,268,105,'几何绑定与源预览',
           ['单位 · 变换 · 网格安全','装配 / 连接 / 证据绑定'],'cube')
    f.card('build_app','build',316,409,268,92,'build 知识 App',
           ['语义爆炸图 · 图谱查询'],'eye')
    f.card('build_dkp','build',316,521,268,120,'build DKP 快照',
           ['build profile · 冻结内容','manifest · digest'],'package')

    f.group('compile',644,110,468,570,'psop@compile')
    f.card('eg','compile',660,172,204,92,'任务 SOP 图',
           ['SOP 步骤与验收'],'graph')
    f.card('scene','compile',884,172,212,92,'场景程序候选',
           ['Codex / 场景编译器'],'document')
    f.card('kernel','compile',660,284,204,112,'确定性内核',
           ['状态查询 · 动作回执','约束 + BHV + 验证器'],'chip')
    f.card('trajectory','compile',884,284,212,112,'轨迹与监督',
           ['状态转移 · 最小反事实','十四视图 · 可观测门'],'cube')
    f.card('training','compile',660,416,204,92,'四模型训练',
           ['独立与组合评测'],'chip')
    f.card('compile_app','compile',884,416,212,92,'编译工作台',
           ['EG · 推理 · 人工纠正'],'eye')
    f.card('compile_dkp','compile',660,528,436,113,'compile DKP 快照',
           ['EG留作审阅 · 模型导出到终端','EG · kernel · 数据 · 模型 · 评测 · 可选推理服务'],'package')

    f.group('simulate',1156,110,252,570,'psop@simulate')
    f.card('readonly','simulate',1172,172,220,82,'只读加载',
           ['冻结 compile 快照'],'check')
    f.card('sandbox','simulate',1172,274,220,112,'Web 3D 沙盒',
           ['零件 / 备件 / 工具','用户 / Agent · 调试'],'cube')
    f.card('viewport','simulate',1172,406,220,92,'设备模型推理',
           ['RGB · INF-* API'],'eye')
    f.card('simulate_output','simulate',1172,518,220,123,'独立沙盒输出',
           ['<simulate-output>/','不是 DKP profile'],'device')

    f.edge([(256,220),(300,220)])
    f.edge([(600,581),(644,581)])
    f.edge([(1112,581),(1156,581)])
    f.edge([(990,264),(990,274),(762,274),(762,284)])
    f.edge([(864,340),(884,340)])
    f.edge([(762,396),(762,416)])
    f.edge([(990,396),(990,416)])
    f.edge([(762,508),(762,528)])
    f.edge([(990,508),(990,528)])
    f.edge([(1282,641),(1282,704),(900,704),(900,680)],
           '候选 bundle → 后续独立 revision',(1091,704),True)
    f.note(735,'贯穿约束','快照只读 · 真值与模型输入隔离 · 授权 / 隐私 · 摘要锁定 · 原子发布 · 可追溯回滚')
    f.text(32,830,'DKP 只有 core / build / compile profile；simulate 不写回 DKP。',16,C['muted'])
    f.text(1408,830,'阶段通过不等于实物安全获准',16,C['muted'],anchor='end')
    return f


def capability_cycle():
    f = Figure('capability-lifecycle.svg', 850, 'PSOP 能力构建与使用流程',
               '三个正式生产环节、两次 DKP 快照、一个包外沙盒；终端照片＋提问获得无 EG 帮助',
               '原始材料经 psop@build 形成 build-profile DKP。psop@compile 只读 build 快照，构建具体 EG、'
               'headless 可执行世界、训练数据、模型和工作台，形成 compile-profile DKP。EG 只描述任务 SOP，训练语料在数据侧独立引用，'
               'Qwen-ASR、YOLO、RelateAnything、MiniCPM-V 4.6 接受独立和组合评测，再导出到终端以照片和提问提供帮助；'
               '终端不加载 EG，物理操作由操作者完成，不新增生产阶段。psop@simulate 只读 compile 快照，'
               '生成独立 Web 3D 沙盒。沙盒候选反馈经授权和审核后只能进入后续独立 revision，不能修改当前快照。')
    panels = [
        ('build',32,'01  psop@build'),
        ('compile',516,'02  psop@compile'),
        ('simulate',1000,'03  psop@simulate'),
    ]
    for ident,x,title in panels:
        f.group(ident,x,130,408,470,title)
    cards = [
        ('build_input','build',48,184,'输入：原始设备材料',['说明书 · BOM · CAD · 图片 / 视频'],'document'),
        ('build_process','build',48,282,'构建设备本体知识库',['稳定 ID · 关系 · 证据 · 几何 · 源预览'],'graph'),
        ('build_frontend','build',48,395,'apps/build/ 知识 App',['语义爆炸图 · 图谱浏览与查询'],'eye'),
        ('build_output','build',48,508,'验证并冻结 build DKP',['profile · manifest · digest'],'package'),
        ('compile_input','compile',532,184,'输入：只读 build 快照',['固定 package / build digest'],'check'),
        ('compile_process','compile',532,282,'任务 SOP 与确定性执行',['十四视图 · 反事实 · 四模型训练'],'chip'),
        ('compile_frontend','compile',532,395,'apps/compile/ 工作台',['SOP／语料分区 · 模型 · 评测'],'eye'),
        ('compile_output','compile',532,508,'验证并冻结 compile DKP',['SOP独立于语料 · 模型导出到终端'],'package'),
        ('simulate_input','simulate',1016,184,'输入：只读 compile 快照',['复用 kernel 语义 · 场景资产 · API'],'check'),
        ('simulate_process','simulate',1016,282,'构建交互式 Web 3D 沙盒',['用户 / Agent · 内建设备模型推理'],'cube'),
        ('simulate_output','simulate',1016,395,'独立 <simulate-output>/',['不是 DKP profile · 不回写输入'],'device'),
        ('simulate_feedback','simulate',1016,508,'候选反馈 bundle',['授权 · 隐私 · 审核 · 后续 revision'],'refresh'),
    ]
    for ident,group,x,y,title,body,icon in cards:
        f.card(ident,group,x,y,376,78,title,body,icon)
    for x in (236,720,1204):
        for start,end in ((262,282),(360,395),(473,508)):
            f.edge([(x,start),(x,end)])
    f.edge([(440,547),(478,547),(478,223),(516,223)],'只读',(478,385))
    f.edge([(924,547),(962,547),(962,223),(1000,223)],'只读',(962,385))
    f.edge([(1204,586),(1204,650),(236,650),(236,600)],
           '经授权审核后进入后续 build / compile revision',(720,650),True)
    f.note(710,'不可变边界','同一 package_id 的新快照逐阶段增强 · simulate 不创建 DKP profile · 反馈不原地修改当前发布链')
    f.text(32,805,'Codex 提出候选并以 typed action 操作；kernel、约束、BHV 与 EG 验证器证明真值。',16,C['muted'])
    f.text(1408,805,'隐藏真值不可旁路视觉输入',16,C['muted'],anchor='end')
    return f


BUILDERS = [capability_cycle, logical_architecture]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate layouts and compare generated content without writing files.')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    changed = []
    for builder in BUILDERS:
        fig = builder()
        content = fig.render()
        path = OUTPUT / fig.filename
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8') != content:
                changed.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(content, encoding='utf-8')
        print(f'{"CHECK" if args.check else "WRITE"} {path.relative_to(ROOT)} ({fig.w} × {fig.h})')
    if changed:
        print('Out-of-date generated diagrams:\n' + '\n'.join(changed), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
