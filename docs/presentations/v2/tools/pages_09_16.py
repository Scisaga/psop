from v2_helpers import *
from learning_platform_pages import experience_loop, platform_architecture
from edge_runtime_page import edge_runtime


def slide09():
    return edge_runtime(9)


def slide10():
    scene=rect(64,213,1016,619,'#0D293C',LINE,r=13)
    scene+=photo('installation-process.png',65,214,1014,537,r=12,fit='xMidYMid slice')
    scene+=rect(84,233,521,38,'#143A55EB',r=6)+text(102,259,'MD-01 / S03 · 髋部舵机安装进行中',19,'white',600)
    scene+=circle(600,517,22,'none',CYAN,2)+path('M622 517H865V391',stroke=CYAN,sw=2)
    scene+=rect(805,341,248,57,'#143A55EB',r=7)+text(824,366,'对齐髋部连接支架',20,'white',600)+text(824,389,'安装进行中，固定后复检',16,'#AADDED')
    scene+=rect(84,669,976,59,'#143A55EF',r=8)+text(106,706,'定位安装目标 · 对齐连接支架 · 固定后核对身份与复检',24,'white',600)
    scene+=rect(65,752,1014,79,'white',r=0)
    scene+=icon('eye',87,778,28,SKY)+text(132,801,'现场观察',23,NAVY,600)
    scene+=arrow('M280 793H334',SKY,2)+icon('network',371,777,30,TEAL)+text(417,801,'Runtime 核对',23,NAVY,600)
    scene+=arrow('M650 793H703',SKY,2)+icon('check',739,777,30,PURPLE)+text(783,801,'执行与留痕',23,NAVY,600)
    sw=334;sh=sw*800/430
    phone=rect(1151,196,sw+20,sh+20,'#0D2233',r=32,id='phone-outer')
    phone+=photo('ui-mobile.png',1161,206,sw,sh,r=22,fit='xMidYMid meet').replace('<rect ', '<rect id="phone-screen" ', 1)
    phone+=arrow('M1088 509H1138',SKY,2.6)
    return page_svg(10,'手机与 AR：让现场观察进入设备任务','在安装过程中定位舵机与连接件，提示操作条件、核对身份，并收集复检与工具反馈。',[scene,phone],source='安装过程生成示意与移动端原型；固定、软件身份与复检结果仍须真实工具反馈',kicker='现场执行 / MOBILE & AR')


def slide11():
    demo=tag(64,210,'已有机械臂 AR Demo',TEAL,'#E5F4ED',20,268)+tag(911,210,'25 秒',NAVY,'#E5EEF5',20,123)
    demo+=rect(64,256,970,545.625,NAVY,r=0)+image(ASSETS/'generated/ar-demo-poster.png',64,256,970,545.625)
    demo+=rect(87,735,923,43,'#123B5DEB',r=8)+icon('play',104,743,25,CYAN)+text(141,765,'部件高亮 → 步骤提示 → 双手装配 → 结果与眼镜展示',20,'white',600)
    right=tag(1065,210,'从装配指导到设备任务',PURPLE,'#EDEFFC',20,294)+rect(1065,256,471,546,'#102C43',r=13)
    right+=text(1088,298,'迁移已有的交互能力',26,'white',700)
    rows=[('01','部件定位','关联舵机 / 关节 / 连接区域',SKY),('02','分步提示','核对身份 / 请求复检 / 留痕',TEAL),('03','结果核验','关联工具反馈与推进条件',PURPLE)]
    for i,(num,title,body,col) in enumerate(rows):
        y=326+i*110;right+=rect(1089,y,422,93,'#1D425B','#44667F',r=9)+circle(1116,y+30,15,col)+text(1116,y+36,num,16,'white',700,anchor='middle')+text(1146,y+39,title,24,'white',700)+text(1110,y+75,body,21,'#BCD8E8')
    right+=line(1089,682,1510,682,'#466B85',1)+text(1089,721,'Microduck 接入仍需验证',23,'#DCCA9D',700)+text(1089,762,'设备版本 · 工具反馈 · 复检要求',21,'#BFDAE8')
    return page_svg(11,'机械臂装配实证，支撑现场交互能力迁移','已有 Demo 展示定位、步骤与操作指导；Microduck 原型进一步关联部件身份、工具反馈与复检要求。',[demo,right],source='已有机械臂原视频；Microduck 为能力迁移原型；SVG / PDF 为静态帧，总览可播放',kicker='已有实证 / CAPABILITY TRANSFER')


def slide12():
    workspaces=''
    for x,name,title,sub,col in [(64,'build','build','部件知识与操作依据',SKY),(564,'compile','compile','EG 与可审核监督',PURPLE),(1064,'simulate','simulate','三维状态、操作与回放',TEAL)]:
        workspaces+=text(x,239,title,29,col,700)+text(x,275,sub,22,NAVY,600)
        workspaces+=rect(x-1,299,474,204.286,'white',LINE,r=8)+photo('ui-'+name+'.png',x,300,472,202.286,r=7,fit='xMidYMid slice')
    family=rect(64,520,1472,51,'#E2EEF6',r=8)+text(800,553,'MD-01  ·  MD-SERVO-CHECK-01 / Rev.A  ·  同一设备、同一操作任务',23,NAVY,600,anchor='middle')
    evidence=''
    items=[(64,'产品与沙盒基础','已有 build App / 合成装配回放','设备对象接入、工具与任务联动','cube',SKY),(564,'240 次配对实验','任务质量均值 42.3 → 68.3','EG 训练、消融与独立场景评测','chart',TEAL),(1064,'25 秒 AR 演示','已有定位、步骤提示与装配交互','设备标定、复检接入与用户验证','ar',PURPLE)]
    for x,title,body,nextwork,ic,col in items:
        evidence+=rect(x,596,472,231,'white',LINE,r=11)+icon(ic,x+20,618,34,col)+text(x+68,646,title,26,NAVY,700)+text(x+20,692,body,21,MUTED)+line(x+20,717,x+450,717,LINE,1)+text(x+20,762,'研发投入对应的验证工作',18,col,700)+text(x+20,801,nextwork,20,NAVY,600)
    return page_svg(12,'已有产品与实证，支撑设备任务持续研发','现有能力、设计原型与待验证目标分别说明；新增研发围绕设备接入、任务学习和现场验证展开。',[workspaces,family,evidence],source='上方为 Microduck 统一设计原型；机械臂为既有实证，Microduck 端到端效果待验证',kicker='可行性 / EVIDENCE & VALIDATION')


def slide13():
    return experience_loop()


def slide14():
    return platform_architecture()


def slide15():
    values=''
    entries=[('research','服务准备','操作方案迭代','准备工时 / 重复排查次数','少一次可避免的重复排查与试验','说明版本 · 评审 · 服务台账',PURPLE),('onsite','现场效率','设备有效作业','核对工时 / 可避免等待小时','让工具、任务与人员协同更及时','设备日志 · 工单 · 人员工时',SKY),('quality','服务成本','异常处置优化','同类工单的净处置成本','按复检要求比较调整与更换','异常记录 · 处置费用 · 复检',TEAL),('reuse','知识复利','任务与模型复用','适配人日 / 维护工作量','已验证任务支撑更多同类应用','资产版本 · 适配与维护台账',AMBER)]
    for i,(key,title,metric,units,mechanism,evidence,col) in enumerate(entries):
        x=64+i*374
        if i:values+=line(x-13,222,x-13,573,LINE,1)
        values+=text(x,243,f'0{i+1}',20,col,700)+text(x+41,243,title,27,NAVY,700)+_value_glyph(key,x+1,270,col)
        values+=text(x+12,416,metric,26,NAVY,700)+text(x+12,453,units,19,col,600)+text(x+12,500,mechanism,20,NAVY,width=326,leading=29,max_lines=2)+text(x+12,569,evidence,17,MUTED)
    model=rect(64,598,1472,120,NAVY,r=11)+text(89,633,'全生命周期增量价值',24,'white',700)
    model+=text(89,684,'可归因的避免支出',26,'#A9DCCE',700)+text(369,684,'−',29,'white',700)+text(415,684,'新增复检、处置与验证成本',26,'#E6D3AC',700)+text(822,684,'−',29,'white',700)+text(868,684,'平台建设与运行成本',26,'#B5D5E8',700)
    model+=text(1479,635,'安装 / 维护 / 服务成本分别入账',18,'#B3CEDE',anchor='end')
    business=rect(64,740,1472,93,'#E2EEF6',r=10)+text(89,777,'盈利潜力',24,NAVY,700)+text(283,777,'经验证的任务资产',24,TEAL,700)+arrow('M513 770H575',SKY,2)+text(601,777,'降低重复适配成本',24,NAVY,700)+arrow('M836 770H898',SKY,2)+text(923,777,'支持软件与模型持续服务',24,NAVY,700)
    business+=text(89,814,'工时、设备利用与现金分项核验；按可比工单衡量净改善，商业收益由合同与服务成本验证。',21,MUTED)
    return page_svg(15,'以全生命周期成本，衡量设备服务的经济价值','价值同时发生在安装准备、现场操作和设备维护；对比可比任务的总成本，计入新增验证与运行投入。',[values,model,business],source='经济价值核算框架；基线与归因待实测，工时与现金分别核验，设备自身收益不计入平台',kicker='经济价值 / LIFECYCLE VALUE')


def _value_glyph(kind,x,y,col):
    """Small vector study: each value domain has a distinct physical task motif."""
    g=''
    if kind=='research':
        g+=rect(x+31,y+7,151,84,'#E6EEF5',r=6)+rect(x+21,y+15,151,84,'white','#AFCADB',r=6)
        g+=rect(x+32,y+26,85,56,'#EBF4F9','#C3DAE7',r=3)
        g+=path(f'M{x+46} {y+69}V{y+42}H{x+71}L{x+96} {y+64}V{y+74}H{x+46}M{x+47} {y+64}H{x+96}M{x+71} {y+43}V{y+63}',stroke=col,sw=2)
        g+=line(x+37,y+91,x+158,y+91,'#A3BFCE',1)
        for k in range(3):g+=line(x+128,y+31+k*15,x+159,y+31+k*15,'#ABC4D3',2)
        g+=circle(x+219,y+49,27,'#E9EBFB',col,1.4)+icon('check',x+203,y+33,32,col)
        g+=arrow(f'M{x+178} {y+49}H{x+188}',col,1.8)
        g+=text(x+268,y+40,'任务包',19,col,600)+text(x+268,y+69,'Rev.A',18,MUTED)
    elif kind=='onsite':
        g+=poly([(x+24,y+83),(x+220,y+83),(x+260,y+105),(x+64,y+105)],'#D4E5ED','#AEC8D5',1)
        g+=rect(x+67,y+68,36,18,'#7799AE',r=3)+circle(x+86,y+61,14,'white',col,4)
        g+=path(f'M{x+86} {y+58}L{x+120} {y+25}L{x+170} {y+48}L{x+185} {y+63}',stroke=col,sw=13)
        for xx,yy in [(120,25),(170,48)]:g+=circle(x+xx,y+yy,8,'#D9EBF5',col,2)
        g+=rect(x+181,y+62,19,25,'#53758B',r=3)+line(x+190,y+85,x+190,y+93,CYAN,3)
        g+=rect(x+234,y+22,75,59,'#1A485F',r=5)+rect(x+242,y+30,59,34,'#E4F5F3',r=2)
        g+=path(f'M{x+249} {y+52}H{x+259}L{x+263} {y+39}L{x+270} {y+58}L{x+276} {y+44}H{x+292}',stroke=TEAL,sw=2)
        g+=line(x+272,y+81,x+272,y+94,'#7295A8',5)+line(x+253,y+96,x+291,y+96,'#7295A8',5)
    elif kind=='quality':
        g+=rect(x+36,y+9,213,91,'white','#B7CFDC',r=6)+rect(x+36,y+9,213,20,'#E6F4EF',r=5)
        for k in range(3):
            yy=y+41+k*21
            g+=circle(x+57,yy,6,'#E6F5ED',col,1.5)+path(f'M{x+54} {yy}l2 2 4-5',stroke=col,sw=1.5)
            g+=line(x+75,yy,x+166,yy,'#B6CCD8',2)+rect(x+185,yy-6,46,12,'#E6F5ED',r=3)
        g+=circle(x+275,y+63,31,'#F3FAF8',col,2)+icon('check',x+254,y+42,42,col)
    else:
        g+=rect(x+26,y+24,88,66,'#EBEBF8',col,r=6)+icon('network',x+54,y+40,33,col)
        g+=text(x+70,y+17,'任务资产',17,col,600,anchor='middle')
        for yy in [13,53,93]:
            g+=path(f'M{x+116} {y+57}H{x+160}V{y+yy+3}H{x+211}',stroke=col,sw=1.6)
            g+=rect(x+212,y+yy-12,97,30,'white','#BFCDE3',r=5)+rect(x+222,y+yy-4,13,13,'#DDDFF7',r=2)
            g+=line(x+245,y+yy+2,x+297,y+yy+2,'#A7B7CB',2)
    return g




def _industry_node(kind,cx,y,col):
    """Detailed but compact linework for four industrial uses of the same assets."""
    x=cx-100
    g=ellipse(cx,y+75,118,12,'#0E2B41')
    if kind=='research':
        g+=poly([(x+3,y+70),(x+169,y+70),(x+197,y+86),(x+27,y+86)],'#2A5770','#588298',1)
        g+=rect(x+18,y+3,112,69,'#16384D','#6F9BAB',r=5)+rect(x+25,y+10,98,54,'#285773',r=2)
        g+=path(f'M{x+39} {y+48}V{y+26}L{x+83} {y+21}L{x+103} {y+45}L{x+62} {y+54}Z M{x+39} {y+26}L{x+62} {y+39}L{x+103} {y+45}M{x+62} {y+39}V{y+54}',stroke=col,sw=1.8)
        g+=line(x+73,y+72,x+73,y+80,'#8FB7C9',5)+rect(x+139,y+23,34,49,'#35647C','#7398AD',r=4)
        for j in range(4):g+=line(x+147,y+34+j*8,x+165,y+34+j*8,'#91B5C5',1.5)
    elif kind=='onsite':
        g+=poly([(x+8,y+75),(x+173,y+75),(x+197,y+89),(x+32,y+89)],'#28556D','#577E92',1)
        g+=rect(x+30,y+58,37,21,'#54849A',r=4)+circle(x+50,y+50,12,'#305D75',col,3)
        g+=path(f'M{x+51} {y+46}L{x+82} {y+15}L{x+125} {y+39}L{x+139} {y+61}',stroke=col,sw=10)
        for xx,yy in [(82,15),(125,39)]:g+=circle(x+xx,y+yy,7,'#123B5D',col,2)
        g+=rect(x+134,y+56,13,26,'#91B8CA',r=2)+rect(x+160,y+12,26,65,'#204D67','#6D95AA',r=3)
        for yy in [22,32,42]:g+=line(x+167,y+yy,x+179,y+yy,'#7CB4C9',2)
    elif kind=='training':
        g+=rect(x+17,y+3,49,82,'#13384F','#78A5BB',r=7)+rect(x+23,y+11,37,61,'#285E76',r=3)
        g+=circle(x+41,y+33,10,'none',col,2)+path(f'M{x+29} {y+54}l8 7 15-18',stroke=col,sw=2)
        g+=circle(x+115,y+22,15,'#3B7088',col,1.7)+path(f'M{x+88} {y+78}V{y+59}Q{x+88} {y+43} {x+115} {y+43}Q{x+142} {y+43} {x+142} {y+59}V{y+78}',stroke=col,sw=3)
        g+=rect(x+148,y+24,35,49,'#214F69','#6591A5',r=5)+icon('check',x+153,y+34,25,col)
    else:
        for xx,yy,w in [(11,46,59),(86,18,48),(150,46,53)]:
            g+=rect(x+xx,y+yy,w,37,'#285C76','#6B96AA',r=3)
            g+=path(f'M{x+xx} {y+yy}l{w/3} -11v11l{w/3} -11v11',stroke=col,sw=1.7)
            for k in range(3):g+=rect(x+xx+8+k*(w-16)/3,y+yy+13,8,8,'#80B4C7',r=1)
        g+=path(f'M{x+42} {y+36}V{y+13}H{x+110}M{x+175} {y+36}V{y+13}H{x+127}',stroke=col,sw=1.6,stroke_dasharray='4 4')
    return g


def slide16():
    # Layer 1: three actual kinds of task assets, shown as documents, correction and CPN sample.
    assets=text(64,254,'01',21,CYAN,700)+text(64,293,'经验资产',26,'white',700)+text(64,329,'经审核沉淀',18,'#97BDD2')
    for x in [244,674,1104]:
        assets+=rect(x+12,223,398,145,'#254E67','#395F79',r=8)+rect(x+6,228,398,145,'#21475F','#466B83',r=8)+rect(x,233,398,145,'#183E58','#5C8197',r=8)
    assets+=rect(269,252,78,103,'#244E68','#7AA0B3',r=5)
    assets+=path('M280 324V281H306L333 306V329H280M281 310H333M306 282V310',stroke='#86CDE2',sw=1.8)
    assets+=line(279,340,337,340,'#7AA0B3',1.5)
    assets+=text(370,269,'设备与对象',25,'white',700)+text(370,305,'部件关系 · 说明版本',18,'#A8CBDE')+text(370,344,'MD-01 / Rev.A',17,'#7FD0E7',600)
    assets+=rect(699,254,78,81,'#2C526E','#8C97CA',r=6)+icon('doc',718,268,39,'#B9B5ED')+path('M712 335v14l13-14',fill='#2C526E',stroke='#8C97CA',sw=1.5)
    assets+=text(799,269,'处置与验证',25,'white',700)+text(799,305,'人工审核后确认适用性',18,'#A8CBDE')
    assets+=tag(800,326,'复检观察','#C5B2DC','#3C435F',16,97)+arrow('M907 342H939','#B7B2E8',1.6)+tag(950,326,'验证结论','#B2DFD3','#245E68',16,106)
    assets+=circle(1136,293,14,'none','#64CBBE',2)+circle(1136,293,4,'#64CBBE')+rect(1174,277,9,32,'#74D6C9',r=1)+circle(1216,293,14,'none','#8FB9EF',2)
    assets+=arrow('M1151 293H1171','#6FCDBC',1.5)+arrow('M1186 293H1200','#6FCDBC',1.5)
    assets+=text(1131,344,'状态转移样例',16,'#A8CBDE')+text(1246,269,'EG 样例',25,'white',700)+text(1246,305,'状态 · 动作 · 证据',18,'#A8CBDE')+text(1246,344,'独立评测后受控更新',17,'#8DCCBE')
    # Version gate and distribution bus: every industrial use derives from reviewed assets.
    bridges=''
    for cx in [443,873,1303]:bridges+=line(cx,379,cx,400,'#66899F',1.5)
    bridges+=line(244,400,1502,400,'#66899F',1.5)+rect(636,382,410,36,'#214F6A','#66899F',r=18)
    bridges+=text(841,407,'审核 · 版本追溯 · 独立评测',21,'#CDE7F1',600,anchor='middle')
    bridges+=line(841,419,841,442,CYAN,2)+line(350,442,1385,442,'#42718F',2)
    # Layer 2: four distinct industrial recipients, with their own pictograms and purposes.
    applications=text(64,485,'02',21,CYAN,700)+text(64,524,'设备服务',26,'white',700)
    centers=[350,695,1040,1385]
    for cx,key,title,purpose,col in zip(centers,['research','onsite','training','supplier'],['服务准备','设备操作','训练任务','服务机构'],['操作方案与问题复盘','身份与复检状态核对','操作经验转为练习','复用同类任务能力'],['#81C9EA','#79CCBE','#B6B0EC','#A9D6BA']):
        applications+=line(cx,442,cx,460,'#42718F',1.8)+_industry_node(key,cx,469,col)
        applications+=text(cx,590,title,24,'white',700,anchor='middle')+text(cx,619,purpose,17,'#9FC4D7',anchor='middle')
    # Layer 3: outcomes are backed by traceable records, not decorative impact claims.
    verification=text(64,685,'03',21,CYAN,700)+text(64,723,'价值核验',26,'white',700)
    verification+=line(240,643,1513,643,'#416A84',1.5)
    measures=[
        ('质量与可靠作业','一次验收通过率','质量台账 / 异常闭环记录','#71CEBD'),
        ('资源与设备寿命','每任务替换件与净增减能耗','备件记录 / 使用与计量能耗','#A8DAB8'),
        ('人才与普惠','独立合格作业训练时长','同任务考核 / 服务覆盖台账','#8AD0F0'),
        ('国产适配与协作','经验证的国产配置数','兼容矩阵 / 回归测试记录','#B9B4EC')]
    for cx,(title,metric,evidence,col) in zip(centers,measures):
        verification+=line(cx,635,cx,653,'#416A84',1.5)+circle(cx,654,3,col)
        verification+=text(cx,688,title,22,col,700,anchor='middle')+text(cx,725,metric,20,'white',600,anchor='middle')+text(cx,757,evidence,16,'#98BED2',anchor='middle')
    closing=rect(64,792,1472,46,'#215775',r=9)+text(800,823,'把个人经验，转化为设备服务可持续积累的操作能力。',27,'white',700,anchor='middle')
    return page_svg(16,'让设备操作经验成为可传承、可验证的能力','从一条经复核的操作经验，形成跨设备、跨服务点、跨终端的可复用能力。',[assets,bridges,applications,verification,closing],source='社会价值验证框架；备件数量与净增减能耗 kWh 分项核验；国产适配以回归结果为准',kicker='社会价值 / EQUIPMENT CAPABILITY',dark=True)




PAGES=[slide09,slide10,slide11,slide12,slide13,slide14,slide15,slide16]
