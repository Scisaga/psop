"""Native SVG diagrams for equipment perception, routing and state commitment."""
from v2_helpers import *


def _chip(x, y, size=42, color=SKY, fill='#E7F4FC'):
    body = rect(9, 9, 30, 30, fill, color, r=7, sw=1.8)
    for p in (16, 24, 32):
        body += line(p, 3, p, 9, color, 1.8) + line(p, 39, p, 45, color, 1.8)
        body += line(3, p, 9, p, color, 1.8) + line(39, p, 45, p, color, 1.8)
    body += rect(17, 17, 14, 14, 'none', color, r=3, sw=1.4)
    body += path('M20 24h8M24 20v8', stroke=color, sw=1.4)
    return f'<g transform="translate({x} {y}) scale({size/48})">{body}</g>'


def _cloud(x, y, size=52):
    body = ellipse(30, 51, 23, 4, '#D8E9EF')
    body += path('M13 36C1 36 1 18 13 18C14 4 35 2 41 17C55 14 61 34 47 36Z',
                 fill='#F6FBFD', stroke=SKY, sw=1.8)
    body += rect(17, 28, 24, 19, NAVY, r=3)
    for yy in (33, 41):
        body += circle(22, yy, 1.5, CYAN) + line(27, yy, 36, yy, '#B4D4E5', 1.4)
    return f'<g transform="translate({x} {y}) scale({size/60})">{body}</g>'


def _engineer(x, y, size=52):
    body = ellipse(30, 54, 24, 4, '#E1E1F1')
    body += path('M8 51V45Q8 32 30 32Q51 32 51 45V51Z', fill='#E0E5F8', stroke=PURPLE, sw=1.6)
    body += path('M22 33l8 7 8-7M30 40v11', stroke=PURPLE, sw=1.4)
    body += circle(30, 22, 10, '#F9FAFE', PURPLE, 1.5)
    body += path('M17 20Q17 7 30 7Q43 7 43 20Z', fill='#CACDF2', stroke=PURPLE, sw=1.5)
    body += path('M15 20h30M30 7v10', stroke=PURPLE, sw=1.6)
    body += rect(37, 34, 18, 18, 'white', PURPLE, r=3, sw=1.5)
    body += path('M41 43l3 3 7-8', stroke=TEAL, sw=1.8)
    return f'<g transform="translate({x} {y}) scale({size/60})">{body}</g>'


def _panel(x, w, number, title, subtitle, color):
    body = rect(x, 205, w, 495, 'white', LINE, r=13)
    body += rect(x + 1, 206, w - 2, 5, color, r=2)
    body += text(x + 24, 245, number, 20, color, 700)
    body += text(x + 64, 245, title, 26, NAVY, 700)
    body += text(x + 24, 276, subtitle, 17, MUTED)
    return body


def _perception():
    body = _panel(64, 416, '01', '端侧理解现场', '语音、画面和当前任务共享上下文', SKY)
    # Preserve the camera picture and its existing registered region together.
    camera = rect(92, 297, 194, 261, '#DCE8EF', r=18)
    camera += rect(89, 294, 194, 261, '#112F45', '#31556D', r=18, sw=1.2)
    camera += rect(94, 299, 184, 251, '#F7FBFE', r=13)
    camera += rect(164, 296, 44, 2, '#7798AD', r=1)
    camera += text(186, 322, 'S03 舵机复检', 18, NAVY, 700, anchor='middle')
    camera += photo('model-joint-detail.png', 96, 332, 180, 155, r=4, fit='xMidYMid slice')
    camera += path('M106 353v-12h12M254 341h12v12M106 467v12h12M254 479h12v-12', stroke=CYAN, sw=2)
    camera += rect(150, 381, 72, 59, 'none', CYAN, r=4, sw=1.5)
    camera += circle(186, 410, 11, 'none', '#F3CF7B', 1.8)
    camera += rect(105, 457, 78, 22, '#123B5DEB', r=4) + text(144, 473, 'J01 关节', 13, 'white', 600, anchor='middle')
    camera += icon('mic', 106, 497, 20, SKY) + text(132, 514, '核对更换后记录', 15, NAVY, 600)
    camera += text(186, 540, '身份已录，复检待补', 15, AMBER, 600, anchor='middle')
    body += '<g transform="translate(92 308) scale(.92) translate(-89 -294)">'+camera+'</g>'

    body += icon('mic', 294, 311, 30, SKY)
    for i, h in enumerate((10, 19, 30, 17, 36, 23, 12, 27, 17, 8)):
        xx = 334 + i * 11
        body += line(xx, 326 - h / 2, xx, 326 + h / 2, SKY if i < 5 else '#85CBEA', 2.7)
    body += text(372, 365, '操作员语音', 20, NAVY, 600, anchor='middle')
    body += rect(294, 400, 154, 137, '#EDF5FA', '#C8DFEC', r=9)
    body += poly([(426, 400), (448, 422), (426, 422)], '#DAE9F2', '#C8DFEC', 1)
    body += icon('doc', 305, 413, 27, SKY) + text(337, 438, '当前任务', 20, NAVY, 700)
    body += text(307, 476, 'MD-SERVO-CHECK-01', 12, NAVY, 600)
    body += text(307, 513, 'Rev.A / S03', 19, SKY, 600)
    # Three separate inputs, with evenly spaced endpoints on the Runner.
    body += arrow('M181 552V590', SKY, 1.8)
    body += arrow('M371 537V566H302V590', SKY, 1.8)
    body += arrow('M442 326H468V576H418V590', SKY, 1.6)
    body += rect(92, 594, 366, 78, NAVY, r=10)
    body += _chip(106, 608, 44, CYAN, '#204A65')
    body += text(162, 625, 'Runner · MiniCPM-V', 23, 'white', 700)
    body += text(162, 653, '领域 ASR · YOLO · RelateAnything', 16, '#C1E1F0', 500)
    return body


def _routing():
    body = _panel(522, 364, '02', '按条件协同', '匹配置信度、任务范围与风险', PURPLE)
    body += rect(550, 302, 308, 46, '#F0F1FB', '#DCDDF0', r=8)
    body += text(704, 332, '置信度 · 范围 · 风险', 21, PURPLE, 700, anchor='middle')
    body += path('M704 348V360H550V624', stroke='#B3CAD8', sw=1.6)
    body += line(866, 412, 866, 624, '#A9C6D4', 1.6)
    routes = [
        (370, '本地推理', '节点内 · 常规样例', SKY, '#ECF7FD', 'edge'),
        (476, '云端增强', '低置信度 · 未知对象', TEAL, '#EDF8F5', 'cloud'),
        (582, '人工复核', '高风险 · 任务越界', PURPLE, '#F0F1FC', 'human'),
    ]
    for y, title, subtitle, color, fill, kind in routes:
        cy = y + 42
        body += arrow(f'M550 {cy}H572', color, 1.8)
        body += rect(574, y, 264, 84, fill, r=9)
        if kind == 'edge': body += _chip(587, y + 18, 44, SKY, '#DDEFF9')
        elif kind == 'cloud': body += _cloud(584, y + 15, 49)
        else: body += _engineer(584, y + 14, 49)
        body += text(643, y + 33, title, 23, NAVY, 700)
        body += text(643, y + 65, subtitle, 17, color, 500)
        body += arrow(f'M838 {cy}H866', color, 1.6)
    return body


def _runtime():
    body = _panel(928, 608, '03', 'Runtime 核验与提交', '模型输出形成观察，正式状态由运行时提交', TEAL)
    body += rect(956, 302, 552, 101, '#F0F8F6', '#C7E1DB', r=9)
    body += icon('doc', 972, 316, 26, TEAL)
    body += text(1010, 339, 'Observation / 待核验', 23, NAVY, 700)
    body += tag(1401, 314, '复检待补', AMBER, '#FAEBC9', 16, 92)
    body += text(974, 369, '对象 MD-01 / 关节 J01 / 检查点 S03', 20, NAVY, 600)
    body += text(974, 394, '关联依据：身份记录 · 工具反馈 · 相机帧', 17, MUTED)
    body += arrow('M1232 403V422', TEAL, 1.8)

    checks = [(956, 'Guard', '开始条件', SKY, 'network'),
              (1146, 'Evidence', '证据满足', TEAL, 'doc'),
              (1336, 'Transition', '转移合法', PURPLE, 'check')]
    for x, title, label, color, ic in checks:
        body += rect(x, 428, 172, 78, '#F8FBFD', '#D5E4EC', r=8)
        body += icon(ic, x + 13, 440, 23, color)
        body += text(x + 45, 460, title, 20, color, 700)
        body += text(x + 86, 492, label, 20, NAVY, 600, anchor='middle')
    body += path('M1042 506V518H1422V506', stroke='#B6D4CB', sw=1.8)
    body += arrow('M1232 518V528', '#8FBEAF', 1.8)
    body += text(1232, 557, '条件齐备', 18, TEAL, 600, anchor='middle')

    # More vertical air separates the condition, states, captions and exception.
    body += circle(1008, 592, 20, 'white', SKY, 2)
    body += rect(990, 582, 36, 21, SKY, r=4)
    body += text(1008, 598, 'S03', 14, 'white', 700, anchor='middle')
    body += arrow('M1028 592H1215', TEAL, 2, dash='5 4')
    body += rect(1225, 578, 14, 28, TEAL, r=2)
    body += arrow('M1239 592H1436', TEAL, 2, dash='5 4')
    body += circle(1460, 592, 20, 'white', TEAL, 2)
    body += text(1008, 642, '当前检查点', 19, NAVY, 600, anchor='middle')
    body += text(1232, 642, '提交状态', 19, TEAL, 700, anchor='middle')
    body += text(1460, 642, '下一节点', 19, NAVY, 600, anchor='middle')
    body += rect(956, 660, 552, 28, '#FBF2DE', r=5)
    body += text(1232, 680, '复检记录缺失 → 保持 S03，补充工具反馈', 17, AMBER, 600, anchor='middle')
    return body


def _delivery():
    body = rect(64, 716, 1472, 64, '#E9F1F8', '#D7E5F0', r=10)
    steps = [(84, 'EG 监督', '状态对齐轨迹', PURPLE, 'network'),
             (424, '任务微调 / 蒸馏', 'EG 任务能力 → MiniCPM-V', PURPLE, 'model'),
             (764, '评测 + 版本发布', '端侧模型包 / 技能包', TEAL, 'cube'),
             (1104, 'Runner 按版本加载', '绑定任务与模型版本', NAVY, 'phone')]
    for x, title, subtitle, color, ic in steps:
        body += icon(ic, x, 730, 32, color)
        body += text(x + 44, 743, title, 20, color, 700)
        body += text(x + 44, 769, subtitle, 17, MUTED)
    for x1, x2 in ((386, 407), (726, 747), (1066, 1087)):
        body += arrow(f'M{x1} 746H{x2}', SKY, 1.8)
    body += text(1516, 753, '迭代见第 13 页', 15, MUTED, anchor='end')
    return body


def edge_runtime(page=9):
    # The Runner feeds the selector; all three routes share the output bus.
    connectors = arrow('M458 633H494Q502 633 502 625V333Q502 325 510 325H548', SKY, 2)
    connectors += arrow('M866 466H898Q906 466 906 458V353Q906 345 914 345H954', TEAL, 2)
    return page_svg(
        page,
        '端侧先理解现场，Runtime 始终掌握状态',
        '语音、视觉与任务模型形成观察；按条件调用云端或人工，由 Runtime 核验并提交。',
        [_perception(), _routing(), _runtime(), connectors, _delivery(),
         takeaway('端侧与云端形成观察；任务条件、操作证据与合法转移共同决定状态推进。')],
        source='端侧协同为目标架构；Microduck 图为教学示意，复检结论需关联工具反馈；训练效果待评测',
        kicker='端侧执行 / EDGE-FIRST',
    )
