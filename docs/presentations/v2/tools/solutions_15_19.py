"""Five native PSOP solution pages, redrawn from visual references 15–19.

This module does not change approved slides or shared helpers. Functions take no
arguments and return standalone 1600×900 SVGs. The referenced device image is the
locked official Microduck source assembly, not an invented robot.
"""
from v2_helpers import *


def _panel(x,y,w,h,fill='white',stroke=LINE):
    return rect(x,y,w,h,fill,stroke,r=12)


def _bullet(x,y,label,width=290,size=20,color=MUTED):
    return circle(x,y-6,3,SKY)+text(x+14,y,label,size,color,width=width,max_lines=2,leading=size*1.35)


def _step(x,y,w,h,number,title,body,kind='doc',color=SKY):
    out=_panel(x,y,w,h)
    out+=tag(x+16,y+16,f'{number:02d}',color,'#E8F4FA',18,48)
    out+=icon(kind,x+w-48,y+18,29,color)
    out+=text(x+16,y+79,title,25,NAVY,700,width=w-32,max_lines=2,leading=29)
    out+=text(x+16,y+124,body,19,MUTED,width=w-32,max_lines=3,leading=27)
    return out


def _foot(source_page,detail=''):
    return f'解决方案设计/待验证目标 · 据视觉稿第{source_page}页重绘'+(' · '+detail if detail else '')


def service_continuity():
    title='让设备服务共享同一套上下文'
    subtitle='客户自助、服务升级与现场协同，都延续同一设备的对象、操作过程和验证依据。'
    lane=tag(64,208,'客户自助',SKY,'#E5F3FA',18,125)
    lane+=text(222,232,'设备 MD-01 · 任务与观察持续关联',21,NAVY,600)
    # The device and entrance remain compact; the native branch is the primary graphic.
    first=_step(64,254,250,192,1,'设备交付与扫码','绑定设备身份\n进入同一服务入口','phone')
    first+=photo('model-assembled.png',250,314,58,103,r=0,fit='xMidYMid meet')
    first+=_step(348,254,272,192,2,'AI 诊断与指导','依据设备知识给出步骤\n保留观察、动作与反馈','model')
    first+=arrow('M315 350H342',SKY,2.4)
    branch=_panel(666,254,332,192,'#EEF6FB','#B7D8E9')
    branch+=text(686,288,'完成条件是否满足？',25,NAVY,700)
    branch+=rect(686,309,292,47,'#E6F4F1','#B9DDD2',r=7)+icon('check',699,320,25,TEAL)
    branch+=text(736,339,'可解决，且核验通过',21,TEAL,600)
    branch+=rect(686,373,292,47,'#FFF4E3','#E6CF9F',r=7)+icon('people',699,384,25,AMBER)
    branch+=text(736,404,'需补证或人工接手',21,AMBER,600)
    branch+=arrow('M621 350H659',SKY,2.4)
    terminal=_panel(1044,254,492,192,'#E7F2F9','#BED7E5')
    terminal+=icon('check',1064,275,35,TEAL)+text(1113,302,'经验证后完成服务',28,NAVY,700)
    terminal+=text(1064,350,'结果证据齐备，客户确认完成。',22,MUTED)
    terminal+=text(1064,390,'缺少复检记录时，任务保持待核验。',20,AMBER)
    terminal+=arrow('M979 333H1038',TEAL,2.2)
    handoff=tag(64,473,'人工接手与现场协同',PURPLE,'#EDEFFA',18,250)
    handoff+=text(349,496,'把已做过的操作和现场证据一起交给工程师',21,NAVY,600)
    handoff+=arrow('M832 420V461H48V616H58',AMBER,2.3)
    cards=''
    for x,number,name,copy,kind in [
        (64,3,'生成服务工单','设备 / 任务 / 已执行过程\n现场证据 / AI 候选判断','doc'),
        (440,4,'匹配服务人员','对照设备类型、位置\n技能、负载与服务范围','people'),
        (816,5,'现场协同处理','手机 / AR 延续上下文\n观察 → 判断 → 指导','ar'),
        (1192,6,'复检与结果确认','核对固定、身份和工具反馈\n证据齐备后提交完成','check')]:
        cards+=_step(x,529,344,177,number,name,copy,kind,PURPLE if number<5 else SKY)
    for x in (409,785,1161):cards+=arrow(f'M{x} 616H{x+24}',SKY,2.4)
    feedback=rect(64,730,1472,49,'#E7F3F7','#BDD6E3',r=9)
    feedback+=icon('network',82,741,27,TEAL)+text(124,762,'核验后的服务记录',23,TEAL,600)
    feedback+=arrow('M365 753H420',TEAL,2)
    feedback+=text(444,762,'适用性审核',21,NAVY,600)+arrow('M583 753H638',TEAL,2)
    feedback+=text(663,762,'知识 / EG 更新与模型独立评测',21,NAVY,600)
    feedback+=text(1516,762,'返回下一次设备任务',20,MUTED,anchor='end')
    return page_svg(9,title,subtitle,[lane,first,branch,terminal,handoff,cards,feedback,
        takeaway('客户、AI 与工程师共享同一设备上下文；完成仍由对应证据核验。')],
        source=_foot(15),kicker='解决方案 / SERVICE CONTINUITY')


def service_capacity():
    title='让服务能力随设备一起扩展'
    subtitle='目标是复用经验证的知识和任务，承接标准服务，让工程师聚焦复杂问题。'
    comparison=''
    for x,label,color,fill,chain in [
        (64,'传统服务扩展',MUTED,'#EDF2F6',[('设备增多','服务需求同步增加'),('需求增多','更多重复现场支持'),('人员增多','工程师与专家投入'),('成本增加','差旅、培训与等待')]),
        (832,'目标服务扩展',SKY,'#EAF6FB',[('设备增多','绑定设备服务实例'),('资产复用','知识、EG与模型版本'),('标准任务','按条件指导与核验'),('复杂问题','人员接手并复用上下文')])]:
        comparison+=_panel(x,216,704,245,fill)
        comparison+=text(x+20,256,label,28,NAVY,700)
        if x==832:comparison+=tag(x+534,232,'待验证目标',SKY,'white',17,150)
        for i,(name,body) in enumerate(chain):
            xx=x+20+i*170
            comparison+=rect(xx,278,154,159,'white','#CDDEE8',r=9)
            comparison+=text(xx+15,317,name,23,color,700)
            comparison+=text(xx+15,359,body,19,MUTED,width=124,max_lines=3,leading=27)
            if i<3:comparison+=arrow(f'M{xx+155} 353H{xx+168}',color,1.8)
    middle=icon('network',773,316,39,SKY)
    values=text(64,509,'五个价值领域，在同一基线下验收',28,NAVY,700)
    labels=[('客服重复工作','咨询、基础排障与\n标准操作指导','phone','重复咨询次数'),('专家支持投入','把适用经验组织为\n可执行任务资产','doc','专家支持工时'),('现场处理能力','把知识、步骤与\n验证要求带到现场','tool','任务完成率'),('出勤与返工','完整信息再到场\n保留必要复检成本','check','重复上门率'),('服务地域覆盖','验证接口、版本与\n人员接手能力','globe','可服务设备范围')]
    for i,(name,body,kind,metric) in enumerate(labels):
        x=64+i*298
        values+=_panel(x,532,280,231)
        values+=icon(kind,x+18,552,39,SKY)
        values+=text(x+18,623,name,25,NAVY,700,width=244,max_lines=1)
        values+=line(x+18,642,x+262,642,LINE,1)
        values+=text(x+18,675,body,19,MUTED,width=244,max_lines=3,leading=27)
        values+=text(x+18,746,metric,16,AMBER,600)
    return page_svg(10,title,subtitle,[comparison,middle,values,
        takeaway('服务规模价值，要扣除新增指导、验证、平台建设与持续运行成本。')],
        source=_foot(16),kicker='解决方案 / SERVICE CAPACITY')


def single_device_poc():
    title='从一款 Microduck 开始验证'
    subtitle='明确设备版本和服务边界，选择 3–5 项任务，在同一试验窗口内做联合验收。'
    columns=''
    for i,(name,kind) in enumerate([('选定设备与边界','cube'),('整理适用资料','doc'),('选择 3–5 项任务','check'),('构建试点能力','model'),('联合测试与验收','people')]):
        x=64+i*299
        columns+=_panel(x,215,276,293)
        columns+=tag(x+15,230,f'{i+1:02d}',SKY,'#E9F4FA',18,46)+icon(kind,x+229,233,28,SKY)
        columns+=text(x+15,303,name,24,NAVY,700,width=246,max_lines=1)
        if i==0:
            columns+=photo('model-assembled.png',x+15,329,92,146,r=0,fit='xMidYMid meet')
            columns+=text(x+119,356,'Microduck',22,NAVY,700)
            columns+=text(x+119,390,'设备 MD-01\n版本 / 接口\n服务边界',18,MUTED,width=135,max_lines=3,leading=28)
        elif i==1:
            for j,lab in enumerate(['说明 / BOM / 图纸','操作 / 故障 / 记录','资料与实机版本核对']):columns+=_bullet(x+18,357+j*45,lab,225,19)
        elif i==2:
            for j,lab in enumerate(['安装与复检','软件身份核对','通信排查 / 更换指导']):columns+=_bullet(x+18,357+j*39,lab,225,19)
            columns+=text(x+18,484,'候选任务，联合限定范围',16,AMBER)
        elif i==3:
            for j,(lab,col) in enumerate([('PSkill · 知识与任务',SKY),('EG · 条件与推进',PURPLE),('设备模型 · 结构与来源',SKY),('手机 / AR · Runtime',TEAL)]):
                columns+=rect(x+15,331+j*39,246,31,'#F0F6FA',r=5)+text(x+27,353+j*39,lab,18,col,600)
        else:
            for j,lab in enumerate(['客户自助 / 人员接手','正常 / 异常 / 人工升级','结果核验与记录留存']):columns+=_bullet(x+18,357+j*45,lab,225,19)
        if i<4:columns+=arrow(f'M{x+278} 376H{x+296}',SKY,1.8)
    metrics=text(64,548,'六项验收指标',28,NAVY,700)+text(1536,548,'同一设备范围 · 同一试验窗口 · 同一验收口径',18,MUTED,anchor='end')
    definitions=[('客户自助解决率','自助核验解决数 ÷ 入选客户任务数'),('任务完成率','条件齐备的完成数 ÷ 试验任务数'),('下一步判断正确率','正确下一步判定数 ÷ 全部判定机会'),('一次解决率','无重复处理结案数 ÷ 结案任务数；\n预先约定追踪区间'),('平均处理时间','核验完成任务总耗时 ÷ 完成任务数；\n从发起至核验完成，未完成任务单列'),('人工介入比例','人工介入任务数 ÷ 试验任务数')]
    for i,(name,definition) in enumerate(definitions):
        x=64+(i%3)*497;y=566+(i//3)*107
        metrics+=_panel(x,y,478,97,'white')+text(x+17,y+31,name,23,NAVY,700)
        metrics+=text(x+17,y+63,definition,18,MUTED,width=444,max_lines=2,leading=24)
    return page_svg(11,title,subtitle,[columns,metrics,
        takeaway('先证明一组设备服务任务可以核验完成，再讨论更大范围的部署。')],
        source=_foot(17,'六项指标为验收框架，尚无试点数值'),kicker='解决方案 / SINGLE DEVICE POC')


def scalable_delivery():
    title='从单设备验证走向持续复制'
    subtitle='先验证一款设备，再扩展同系列、新设备交付和存量服务；每次复制都核对适用范围。'
    # Expanding device rings distinguish deployment scope from the service handoff lane.
    network=ellipse(391,452,274,215,'#EAF5FB','#B8D6E6',1.7)
    network+=ellipse(391,452,194,176,'#EFF7FC','#A9CCDF',1.6)
    network+=ellipse(391,452,118,159,'white','#9FC5DC',1.8)
    network+=photo('model-assembled.png',280,281,224,299,r=0,fit='xMidYMid meet')
    network+=tag(282,594,'Microduck 单设备试点',SKY,'white',18,219)
    network+=text(64,237,'目标复制范围',26,NAVY,700)
    nodes=[(197,338,'同系列设备',SKY),(615,385,'新设备交付',TEAL),(145,570,'存量设备',PURPLE),(603,601,'服务入口',TEAL)]
    for x,y,name,col in nodes:
        network+=circle(x,y,26,'white',col,1.7)+icon('cube' if name!='服务入口' else 'phone',x-15,y-15,30,col)
        network+=text(x,y+53,name,20,col,600,anchor='middle')
    network+=line(225,350,292,395,'#B1CCD9',1.8,dash='5 5')+line(505,405,588,389,'#B1CCD9',1.8,dash='5 5')
    network+=line(171,553,284,499,'#B1CCD9',1.8,dash='5 5')+line(505,529,577,587,'#B1CCD9',1.8,dash='5 5')
    network+=text(64,698,'复用：定义、部件、EG 与模型版本',21,NAVY,600)
    network+=text(64,733,'接入：身份、接口、完成条件与回归',20,MUTED)
    gates=''
    entries=[('单设备验证','限定任务与完成条件，验证客户与工程师服务闭环。','能否完成任务？',SKY),
        ('同系列设备复制','复用设备定义、部件、EG 与模型；核对型号和接口差异。','能否低成本复用？',SKY),
        ('随新设备交付','绑定设备身份与版本，交付入口、服务边界和适用任务。','能否纳入交付？',TEAL),
        ('存量设备接入','逐步绑定已售设备，验证兼容、部署回归与版本回滚。','能否兼容接入？',PURPLE)]
    for i,(name,body,gate,col) in enumerate(entries):
        x=784;y=219+i*128
        gates+=_panel(x,y,752,113,'white')
        gates+=text(x+18,y+44,f'{i+1:02d}',32,col,700)+text(x+87,y+44,name,27,NAVY,700)
        gates+=tag(x+550,y+17,gate,col,'#EDF5FA',17,184)
        gates+=text(x+87,y+82,body,20,MUTED,width=642,max_lines=1)
        if i<3:gates+=arrow(f'M{815} {y+114}V{y+125}',col,1.8)
    loop=rect(64,755,1472,24,'#E1EFF6',r=6)
    loop+=text(800,773,'真实记录 → 适用性审核 → 知识 / EG 更新与模型评测 → 发布回归 → 下一设备试点',18,TEAL,600,anchor='middle')
    return page_svg(12,title,subtitle,[network,gates,loop,
        takeaway('复制的是经验证的知识与任务，型号和接口差异仍需逐项确认。')],
        source=_foot(18),kicker='解决方案 / SCALABLE DELIVERY')


def device_ai_engineer():
    title='让每台设备拥有自己的 AI 工程师'
    subtitle='以同一设备上下文连接知识、现场观察、任务核验和人员协作；从一款设备开始验证。'
    hero=ellipse(800,594,200,29,'#DDECF5')+ellipse(800,442,200,230,'#E5F3FA')
    hero+=photo('model-assembled.png',588,216,340,453,r=0,fit='xMidYMid meet')
    hero+=tag(621,218,'Microduck / MD-01',SKY,'white',18,348)
    hero+=rect(533,636,534,34,NAVY,r=7)+text(800,661,'设备身份 · 任务上下文 · 验证依据',20,'white',600,anchor='middle')
    cards=''
    entries=[(64,236,'01','理解设备','知识、结构与适用版本','cube',SKY),
        (64,366,'02','感知现场','对象、位置与工具反馈','eye',SKY),
        (64,496,'03','判断状态','依据任务条件核验状态','chart',SKY),
        (1150,236,'04','指导客户','以任务步骤提供现场指导','doc',TEAL),
        (1150,366,'05','协同工程师','跨角色共享执行记录','people',TEAL),
        (1150,496,'06','持续学习','审核后更新知识与模型','network',TEAL)]
    for x,y,num,name,body,kind,col in entries:
        cards+=_panel(x,y,386,108,'white')+icon(kind,x+18,y+27,38,col)
        cards+=text(x+73,y+43,name,27,NAVY,700)+text(x+366,y+42,num,24,'#B8D5E6',700,anchor='end')
        cards+=text(x+73,y+78,body,20,MUTED,width=291,max_lines=1)
        if x==64:cards+=arrow(f'M450 {y+54}H511',col,1.8)
        else:cards+=arrow(f'M1090 {y+54}H1144',col,1.8)
    horizons=_panel(64,688,716,90,'#E5F3F9','#BED8E7')
    horizons+=text(84,717,'当前方案',19,SKY,700)+text(204,718,'人与 AI 一起完成设备服务',24,NAVY,700)
    horizons+=text(84,752,'客户自助 · 工程师接手 · 现场核验',20,MUTED)
    horizons+=_panel(804,688,732,90,'#EDEFF9','#CFD4EB')
    horizons+=text(824,717,'未来扩展目标',19,PURPLE,700)+text(999,718,'更多终端与机器人',24,NAVY,700)
    horizons+=text(824,752,'同一套任务能力延展；接口、控制与真实结果另行验证',19,MUTED)
    return page_svg(13,title,subtitle,[hero,cards,horizons,
        takeaway('从一款设备开始，验证能否持续交付设备服务能力。')],
        source=_foot(19,'来源模型视图；六项能力为方案设计'),kicker='解决方案 / DEVICE AI ENGINEER')


PAGES=[service_continuity,service_capacity,single_device_poc,scalable_delivery,device_ai_engineer]
