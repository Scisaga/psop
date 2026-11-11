"""Native equipment diagrams for learning and platform assets (slides 13 and 14)."""
from svg_lib import *


def _at(x, y, content, scale=1):
    return f'<g transform="translate({x} {y}) scale({scale})">{content}</g>'


def _microduck(x=0, y=0, scale=1):
    """Compact conceptual device drawing; matches the shared teaching case."""
    g = ellipse(104, 116, 68, 7, '#DFE9F0')
    g += rect(76, 5, 56, 27, '#E8F4FA', '#7298AF', r=10)
    g += rect(82, 12, 43, 10, NAVY, r=4)
    g += circle(92, 17, 2.5, CYAN) + circle(115, 17, 2.5, CYAN)
    g += poly([(95, 29), (113, 29), (117, 35), (92, 35)], '#EFCB79', '#C8A258', 1.3)
    g += rect(83, 38, 43, 43, '#DBEAF4', '#7298AF', r=7)
    g += rect(93, 50, 23, 16, '#A7CBDD', SKY, r=3)
    g += path('M84 49L62 64L57 87M126 49L148 64L155 87', stroke='#9DBCD0', sw=12)
    for px, py in [(70, 56), (141, 58), (62, 69), (150, 69)]:
        g += circle(px, py, 7, '#F3F9FC', SKY if px < 105 else '#739DB4', 2)
    g += circle(70, 56, 12, 'none', AMBER, 1.8)
    g += path('M94 81L84 104M117 81L127 104', stroke='#8DACC0', sw=12)
    g += rect(66, 105, 31, 11, '#D7E7F1', '#7298AF', r=4)
    g += rect(114, 105, 31, 11, '#D7E7F1', '#7298AF', r=4)
    return _at(x, y, g, scale)


def _station(kind, x, y, scale=1):
    g = poly([(6, 117), (181, 117), (218, 135), (43, 135)], '#DFEAF1', '#B8D1DF', 1.4)
    if kind == 'design':
        g += rect(20, 9, 145, 95, 'white', '#92B9CF', r=6)
        g += rect(28, 17, 129, 75, '#EDF6FB', r=3)
        g += _microduck(26, 19, .62)
        g += line(123, 31, 148, 31, '#B2CBDA', 2)
        g += line(128, 42, 148, 42, '#B2CBDA', 2)
        g += line(130, 53, 148, 53, '#B2CBDA', 2)
        g += line(92, 104, 92, 116, '#7FA9BE', 5) + line(69, 118, 116, 118, '#7FA9BE', 5)
        g += poly([(137, 109), (188, 109), (201, 126), (150, 126)], 'white', '#A9C6D7', 1.3)
        for i in range(3):
            g += line(151 + i * 10, 114, 158 + i * 10, 122, '#CADCE7', 1)
    elif kind == 'maintenance':
        g += _microduck(7, 9, .87)
        g += rect(143, 46, 58, 52, 'white', '#8AB2C9', r=5)
        g += icon('tool', 156, 54, 31, SKY)
        g += circle(52, 58, 11, 'none', AMBER, 1.8)
        g += path('M63 58H130V72H143', stroke=SKY, sw=1.7)
        g += rect(17, 114, 183, 5, '#B4CCDB', r=2)
    else:
        g += _microduck(5, 15, .84)
        g += rect(153, 25, 51, 78, NAVY, r=5)
        g += rect(160, 34, 37, 47, '#EAF7F4', r=2)
        g += path('M96 69H127V91H153', stroke=TEAL, sw=2)
        g += icon('check', 166, 42, 26, TEAL)
        for i in range(3):
            g += line(164, 86 + i * 4, 191, 86 + i * 4, '#7BBCAF', 1.1)
    return _at(x, y, g, scale)


def _knowledge(x, y, scale=1):
    g = path('M111 66L42 29M111 66L199 29M42 44V106M199 44V106M111 86V116', stroke='#8FBACA', sw=1.8)
    g += rect(83, 50, 70, 34, '#E6F4FA', SKY, r=7, sw=1.5) + text(118, 73, '设备', 18, NAVY, 600, anchor='middle')
    for xx, yy, label, col in [(13, 13, '舵机', SKY), (170, 13, '关节', SKY), (13, 105, '连接', PURPLE), (170, 105, '复检', PURPLE)]:
        g += rect(xx, yy, 58, 31, 'white', '#B9D0DD' if col == SKY else '#C6C9E5', r=6)
        g += circle(xx + 9, yy + 15, 3, col) + text(xx + 34, yy + 22, label, 17, NAVY, 500, anchor='middle')
    g += rect(83, 105, 70, 31, '#F2F6FA', '#B9D0DD', r=6)
    g += text(118, 127, '依据', 17, NAVY, 500, anchor='middle')
    return _at(x, y, g, scale)


def _eg(x, y, scale=1):
    g = ''
    for a, b in [(53, 76), (88, 108), (149, 178), (190, 209)]:
        g += arrow(f'M{a} 58H{b}', '#A29BC6', 1.7)
    for xx, label, color, token in [(32, '身份', SKY, True), (129, '待复检', AMBER, False), (230, '核验', TEAL, False)]:
        g += circle(xx, 58, 20, 'white', color, 1.9)
        if token:
            g += circle(xx, 58, 5.5, color)
        g += text(xx, 99, label, 17, NAVY, 500, anchor='middle')
    for xx, label in [(77, '补证'), (179, '核验')]:
        g += rect(xx, 43, 11, 30, PURPLE, r=2)
        g += text(xx + 5.5, 26, label, 16, PURPLE, 500, anchor='middle')
    g += text(132, 133, '证据满足后推进', 17, MUTED, anchor='middle')
    return _at(x, y, g, scale)


def _documents(x, y, scale=1):
    g = rect(17, 4, 91, 78, '#E5EEF5', r=5) + rect(7, 13, 91, 78, 'white', '#AAC9DA', r=5)
    g += rect(15, 22, 51, 52, '#F1F7FB', '#D2E3ED', r=3)
    for a, b in [(26, 34), (49, 29), (53, 56), (30, 62)]:
        g += line(40, 48, a, b, SKY, 1.4) + circle(a, b, 3.5, 'white', SKY, 1.5)
    g += circle(40, 48, 5.5, '#DCEFF7', SKY, 1.5)
    for yy in [31, 45, 59]:
        g += line(75, yy, 89, yy, '#ACCADB', 1.7)
    g += circle(109, 72, 15, '#ECF7F2', TEAL, 1.5) + path('M102 72L107 77L117 65', stroke=TEAL, sw=2)
    return _at(x, y, g, scale)


def _models(x, y, scale=1):
    g = rect(3, 13, 30, 27, '#EAF3FA', '#B9D3E2', r=4)
    g += path('M8 27H11L14 19L18 34L22 23L25 29H29', stroke=SKY, sw=1.4)
    g += rect(3, 55, 30, 27, '#F0EFFA', '#CCC9E4', r=4)
    g += rect(10, 62, 14, 11, 'none', PURPLE, r=2, sw=1.4)
    g += path('M33 27H50V47H63M33 69H50V47', stroke='#A5B7CC', sw=1.5)
    g += rect(63, 25, 45, 45, '#EDF0FA', PURPLE, r=7)
    for xx in [74, 85, 96]:
        for yy in [36, 47, 58]:
            g += circle(xx, yy, 2.5, PURPLE)
    for yy in [33, 46, 59]:
        g += line(57, yy, 63, yy, PURPLE, 1.4) + line(108, yy, 114, yy, PURPLE, 1.4)
    g += arrow('M108 47H134', PURPLE, 1.6)
    g += path('M127 83H144V31', stroke='#B8C6D6', sw=1.4)
    g += path('M131 76L137 67L141 55L145 43', stroke=TEAL, sw=2)
    return _at(x, y, g, scale)


def _experience(x, y, scale=1):
    g = rect(5, 9, 111, 80, 'white', '#ABCAD9', r=6)
    g += rect(5, 9, 111, 15, '#E8F5F2', r=6)
    g += path('M19 61H99M19 37V75', stroke='#ADC6D4', sw=1.4)
    g += path('M21 66L39 57L58 61L76 44L96 39', stroke=SKY, sw=1.8)
    g += path('M21 71L39 64L58 65L76 56L96 49', stroke='#93C4B7', sw=1.4, stroke_dasharray='3 3')
    for xx, yy in [(21, 66), (39, 57), (58, 61), (76, 44), (96, 39)]:
        g += circle(xx, yy, 2.5, 'white', SKY, 1.2)
    g += circle(113, 72, 15, '#ECF7F2', TEAL, 1.6) + path('M106 72L111 77L121 66', stroke=TEAL, sw=2)
    return _at(x, y, g, scale)


def _package(x, y, color):
    g = rect(7, 0, 41, 47, '#E2EDF5', r=4) + rect(0, 7, 41, 47, 'white', '#B9D0DE', r=4)
    g += rect(7, 16, 11, 11, 'none', color, r=2, sw=1.5)
    for yy in [19, 32, 40]:
        g += line(23 if yy == 19 else 7, yy, 34, yy, '#AFC8D7', 1.5)
    return _at(x, y, g)


def _field(x, y):
    g = rect(0, 6, 64, 119, NAVY, r=9) + rect(6, 16, 52, 97, '#EAF5FA', r=4)
    g += line(24, 11, 39, 11, '#8DB1C8', 2)
    g += _microduck(9, 33, .24)
    g += rect(13, 35, 35, 38, 'none', SKY, r=3, sw=1.2)
    g += rect(12, 82, 40, 9, '#D3E9F3', r=2) + line(16, 98, 48, 98, '#8CB7CC', 1.5)
    g += path('M94 24H178V57H146L137 48L128 57H94ZM94 24L100 14M178 24L172 14', stroke=SKY, sw=2.2)
    g += rect(105, 31, 21, 17, '#E0F2FA', SKY, r=3) + rect(148, 31, 21, 17, '#E0F2FA', SKY, r=3)
    g += path('M98 105H109L113 89L118 111L124 93L129 108L134 96H145', stroke=SKY, sw=2)
    return _at(x, y, g)


def _engineer(x, y):
    g = ellipse(79, 109, 63, 8, '#E0EBF2')
    g += circle(68, 24, 17, '#DDEAF3', '#81ABC2', 1.8)
    g += path('M49 25C47 2 88 2 87 25M52 19H84', stroke=SKY, sw=2.3)
    g += path('M29 95V67C29 43 97 43 97 67V95', fill='#E7F1F8', stroke='#87AFC5', sw=1.8)
    g += path('M47 63L58 92M85 63L97 82L123 72', stroke='#749DB5', sw=6)
    g += poly([(96, 67), (137, 59), (145, 86), (105, 95)], 'white', '#94B8CB', 1.7)
    g += line(106, 73, 130, 68, '#B4CFDD', 1.6) + line(109, 82, 134, 77, TEAL, 1.6)
    return _at(x, y, g)


def experience_loop():
    title = '经验证的设备操作，持续更新知识与任务模型'
    subtitle = '知识图谱提供设备依据，EG 对齐状态、动作与结果，让操作与服务经验进入审核更新和领域学习。'
    sites = text(64, 244, '01', 20, SKY, 700) + text(106, 244, '跨设备服务', 26, NAVY, 700)
    for kind, yy, name, desc in [('design', 280, '任务准备', '对象与适用说明'), ('maintenance', 411, '部件更换', '身份与现场观察'), ('inspection', 542, '工具复检', '反馈与验证依据')]:
        sites += _station(kind, 68, yy, .55)
        sites += text(198, yy + 31, name, 21, NAVY, 600) + text(198, yy + 60, desc, 17, MUTED)
        sites += line(321, yy + 51, 346, yy + 51, '#AFC9D8', 1.6)
    sites += path('M346 331V593M346 461H369', stroke='#AFC9D8', sw=1.6)
    sites += arrow('M346 461H378', SKY, 1.8)
    sites += line(339, 258, 339, 663, LINE, 1)

    context = text(380, 244, '02', 20, PURPLE, 700) + text(422, 244, '设备上下文与过程记录', 26, NAVY, 700)
    context += text(496, 282, '知识图谱', 21, SKY, 600, anchor='middle') + _knowledge(380, 291)
    context += text(792, 282, 'EG 任务对齐', 21, PURPLE, 600, anchor='middle') + _eg(664, 288)
    context += rect(380, 439, 548, 34, '#E6F0F7', r=5)
    context += text(654, 462, '设备 · 任务版本 · 关节 · 复检要求', 18, NAVY, 500, anchor='middle')
    context += arrow('M654 473V490', '#92B0C3', 1.8)
    context += rect(380, 492, 548, 181, 'white', '#C2D9E6', r=9)
    context += text(401, 525, '带依据的过程记录', 23, NAVY, 600)
    context += text(908, 525, '示例节点：S03', 17, MUTED, anchor='end')
    for a, b in [(462, 583), (599, 719), (735, 857)]:
        context += arrow(f'M{a} 564H{b}', '#9DB7C8', 1.7)
    for xx, label, color in [(454, '复检缺失', AMBER), (591, '请求复检', PURPLE), (727, '证据复核', TEAL), (865, '核验后推进', SKY)]:
        context += circle(xx, 564, 7.5, '#F3F8FC', color, 1.8)
        context += text(xx, 599, label, 18, NAVY, 500, anchor='middle')
    context += text(454, 628, 'J01 身份已录', 16, AMBER, anchor='middle')
    context += text(591, 628, '记录实际动作', 16, MUTED, anchor='middle')
    context += text(727, 628, '关联适用依据', 16, MUTED, anchor='middle')
    context += text(865, 628, '保留核验结果', 16, MUTED, anchor='middle')
    context += line(402, 643, 906, 643, LINE, 1)
    context += text(654, 663, '状态、观察、动作、证据与结果保持关联', 17, MUTED, anchor='middle')

    learning = text(980, 244, '03', 20, TEAL, 700) + text(1022, 244, '审核更新与领域学习', 26, NAVY, 700)
    learning += path('M928 559H956V365H979', stroke='#91AFBF', sw=1.6, marker_end='url(#arrow)')
    learning += arrow('M956 559H979', '#91AFBF', 1.6) + circle(956, 559, 3.5, '#91AFBF')
    learning += text(985, 299, '知识与任务更新', 25, TEAL, 700)
    learning += _documents(985, 320, 1.03)
    learning += text(1132, 348, '对象关系 · 适用约束 · EG 分支', 19, NAVY)
    learning += text(1132, 381, '绑定设备版本与操作依据', 19, MUTED)
    learning += text(985, 435, '适用性审核', 20, TEAL, 600) + arrow('M1100 428H1136', TEAL, 1.7)
    learning += text(1154, 435, '知识与 EG 版本', 20, NAVY, 600)
    learning += line(980, 459, 1525, 459, LINE, 1)
    learning += text(985, 497, '领域模型学习', 25, PURPLE, 700)
    learning += _models(985, 514, .9)
    learning += text(1132, 534, 'MiniCPM-V：后续探索替换视觉模块', 19, NAVY)
    learning += text(1132, 567, '目标检测＋关系检测 → PSOP 领域适配', 19, MUTED)
    learning += text(985, 615, '独立评测', 20, PURPLE, 600) + arrow('M1095 608H1136', PURPLE, 1.7)
    learning += text(1154, 615, '领域模型与评测集', 20, NAVY, 600)
    learning += text(985, 650, '失败 / 拒绝 / 补证 → 经审核的难例', 17, MUTED)
    learning += text(985, 675, '来源不明、标注错误 → 隔离复核', 17, MUTED)

    release = rect(64, 712, 1472, 121, '#E5EFF6', r=10)
    release += text(88, 750, '04 发布与复用', 24, NAVY, 700)
    release += text(88, 783, '同版本测试 · 分发 · 回滚', 18, MUTED)
    for xx, label, desc, color in [(390, '知识与 EG 版本', '对象、约束与任务保持关联', TEAL), (755, '经评测领域模型', '领域能力进入下一轮任务', PURPLE), (1112, '评测集与回放约束', '回归与难例持续核验', SKY)]:
        release += _package(xx, 739, color) + text(xx + 62, 758, label, 21, NAVY, 600) + text(xx + 62, 789, desc, 17, MUTED)
    loop = arrow('M1516 712V205H56V312H74', TEAL, 1.7, dash='5 5')
    loop += text(874, 199, '新版本用于下一次设备任务', 17, TEAL, 500, anchor='middle')
    return page_svg(13, title, subtitle, [sites, context, learning, release, loop],
        source='目标学习与版本架构；Microduck 教学示例，知识与 EG 经适用性审核，模型独立评测', kicker='经验形成 / EQUIPMENT LEARNING')


def platform_architecture():
    title = '设备知识与任务资产，连接模型、工具和现场'
    subtitle = 'simulate 智能体生成语料，经 compile 对齐、训练评测与现场难例回流，形成数据飞轮。'
    models = rect(334, 211, 938, 91, '#EDF2FA', '#D0DBEB', r=9)
    models += text(354, 237, '基础模型与通用能力', 20, PURPLE, 600)
    models += text(1250, 237, '按任务选用云端 / 端侧能力', 17, MUTED, anchor='end')
    for xx, name, desc, ic in [(355, '语音', '术语转写', 'mic'), (586, '视觉', '对象与关系', 'eye'), (817, '任务推理', '候选动作', 'model'), (1050, '世界模型', '场景预测', 'globe')]:
        models += icon(ic, xx, 254, 29, PURPLE) + text(xx + 40, 267, name, 20, NAVY, 600) + text(xx + 40, 290, desc, 16, MUTED)
    models += arrow('M803 303V330', PURPLE, 1.8) + text(824, 324, '观察与候选', 17, PURPLE)

    tools = text(64, 364, '设备工具与依据', 24, NAVY, 700)
    tools += _station('design', 66, 391, .94)
    tools += text(64, 549, '部件 / 连接 / 说明', 22, SKY, 600) + text(64, 578, '设备身份、关系与适用版本', 17, MUTED)
    tools += _station('inspection', 66, 608, .94)
    tools += text(64, 766, '工具与复检记录', 22, TEAL, 600) + text(64, 795, '工具反馈、结果与验证要求', 17, MUTED)
    tools += arrow('M285 476H333', SKY, 1.7) + arrow('M285 690H333', TEAL, 1.7)

    core = rect(334, 340, 938, 391, 'white', '#A8C9DC', r=12, sw=1.7)
    core += text(355, 378, 'PSOP 设备任务与学习平台', 27, NAVY, 700)
    core += text(1250, 378, '设备能力持续积累', 18, SKY, 600, anchor='end')
    core += line(355, 396, 1250, 396, LINE, 1)
    core += line(803, 416, 803, 647, LINE, 1) + line(354, 526, 1251, 526, LINE, 1)
    core += _knowledge(356, 422, .52)
    core += text(491, 450, '设备知识图谱', 25, NAVY, 700)
    core += text(491, 481, '对象 · 关系 · 适用约束', 18, SKY, 600)
    core += text(491, 511, 'build：组织操作依据', 18, MUTED)
    core += _eg(819, 426, .46)
    core += text(947, 450, 'EG 任务技能', 25, NAVY, 700)
    core += text(947, 481, '状态 · 动作 · 验证条件', 18, PURPLE, 600)
    core += text(947, 511, 'compile：对齐任务与训练监督', 17, MUTED)
    core += _models(359, 553, .78)
    core += text(491, 575, '领域模型资产', 25, NAVY, 700)
    core += text(491, 607, '语音 · 视觉 · 关系 · 任务', 17, PURPLE, 600)
    core += text(491, 638, '领域微调 / 蒸馏与独立评测', 17, MUTED)
    core += _experience(820, 551, .9)
    core += text(947, 575, '验证与经验资产', 25, NAVY, 700)
    core += text(947, 607, '智能体轨迹 · 训练语料 · 难例', 17, TEAL, 600)
    core += text(947, 638, 'simulate：智能体生成训练语料', 17, MUTED)
    core += rect(355, 666, 896, 47, '#E6F0F7', r=6)
    core += text(376, 697, 'Runtime：任务运行与核验', 22, NAVY, 600)
    core += text(881, 696, '条件', 18, SKY, 600) + arrow('M926 689H952', SKY, 1.6)
    core += text(968, 696, '证据', 18, TEAL, 600) + arrow('M1013 689H1039', SKY, 1.6)
    core += text(1055, 696, '状态提交', 18, NAVY, 600)

    field = text(1304, 364, '现场终端与人员', 24, NAVY, 700)
    field += _field(1320, 396)
    field += text(1304, 549, '手机 / AR', 22, SKY, 600) + text(1304, 578, '对象定位与任务提示', 18, MUTED)
    field += _engineer(1323, 608)
    field += text(1304, 766, '操作员执行与复核', 22, TEAL, 600) + text(1304, 795, '现场观察与结果回流', 18, MUTED)
    field += arrow('M1251 675H1287V476H1315', SKY, 1.7)
    field += arrow('M1315 690H1274', TEAL, 1.7)

    applications = ''
    for cx, name, desc, color in [(492, '服务准备', '说明与操作条件', PURPLE), (803, '现场核验', '身份与复检核对', SKY), (1115, '设备维护', '处置路径与验证', TEAL)]:
        applications += arrow(f'M{cx} 732V761', '#9AB5C7', 1.6)
        applications += circle(cx - 67, 788, 5, color) + text(cx - 49, 795, name, 22, NAVY, 600)
        applications += text(cx, 824, desc, 17, MUTED, anchor='middle')
    return page_svg(14, title, subtitle, [models, tools, core, field, applications],
        source='目标平台架构；设备工具、模型和终端适配须经验证，设备控制与联锁由底层系统承担', kicker='平台资产 / EQUIPMENT ASSETS')
