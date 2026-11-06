from v2_helpers import *
from copy import deepcopy
PRODUCTS=ASSETS/'reference-products-2026'

def _cover_model_geometry(name,x,y,w,h):
    info=json.loads((CURRENT_ASSETS/'model-render-report.json').read_text(encoding='utf-8'))[Path(name).stem]
    sw,sh=info['imageSize'];left,top,right,bottom=info['alphaBounds']
    pad=12;left-=pad;top-=pad;right+=pad;bottom+=pad
    scale=min(w/(right-left),h/(bottom-top))
    dx=x+(w-(right-left)*scale)/2;dy=y+(h-(bottom-top)*scale)/2
    def project(point):return [dx+(point[0]-left)*scale,dy+(point[1]-top)*scale]
    body=f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{left} {top} {right-left} {bottom-top}" preserveAspectRatio="xMidYMid meet">'+image(CURRENT_ASSETS/name,0,0,sw,sh)+'</svg>'
    return body,info,project

def _cover_model(name,x,y,w,h):
    return _cover_model_geometry(name,x,y,w,h)[0]

def _cover_phone(x,y,w=176,h=320):
    # A mobile usage example; the camera region is registered to the actual
    # fastener in the existing installation-process illustration.
    body=rect(x,y,w,h,'#071824','#557182',r=25,sw=1.8)
    body+=rect(x+6,y+6,w-12,h-12,'#102C3E',r=20)
    body+=rect(x+w/2-27,y+8,54,6,'#050D12',r=3)
    body+=text(x+17,y+37,'PSOP',16,'white',700)
    body+=text(x+w-17,y+37,'2 / 5',13,'#91BCD0',anchor='end')
    body+=text(x+17,y+60,'对齐髋部支架',17,'#D4EAF2',600)
    px,py,pw,ph=x+11,y+72,w-22,186
    body+=photo('installation-process.png',px,py,pw,ph,r=4,fit='xMidYMid slice')
    scale=max(pw/1672,ph/941)
    target=[px+(pw-1672*scale)/2+883*scale,py+(ph-941*scale)/2+527*scale]
    ax,ay=target
    body+=circle(ax,ay,15,'none',CYAN,2)
    body+=path(f'M{ax-23} {ay-15}v-8h8M{ax+15} {ay-23}h8v8M{ax+23} {ay+15}v8h-8M{ax-15} {ay+23}h-8v-8',stroke=CYAN,sw=2)
    body+=text(px+8,py+ph-13,'J01 · 安装位置',13,'white',600)
    body+=text(x+15,y+279,'抬升组件，对齐安装面',14,'#C5E0E9',600)
    body+=text(x+15,y+301,'固定后采集复检记录',13,'#88B4C4')
    body+=rect(x+w/2-24,y+h-13,48,3,'#9BBACA',r=2)
    return body,target

def slide01():
 from cover_task_eg import cover_task_eg
 base=rect(0,0,1600,900,'#0A2234',r=0)
 extra='<defs><radialGradient id="cover-scene-glow"><stop stop-color="#24526A" stop-opacity=".38"/><stop offset="1" stop-color="#0A2234" stop-opacity="0"/></radialGradient><radialGradient id="cover-ground-glow"><stop stop-color="#426A80" stop-opacity=".24"/><stop offset="1" stop-color="#426A80" stop-opacity="0"/></radialGradient><clipPath id="cover-ground-clip"><ellipse cx="1030" cy="783" rx="300" ry="51"/></clipPath></defs>'
 base+=ellipse(1110,606,422,269,'url(#cover-scene-glow)')
 base+=line(400,65,400,810,'#294556',1)
 base+=footer(1,'来源装配与安装预演；EG 为教学设计，现场安装图为生成示意 · 既有实验见第 5 页',True)
 title=text(60,110,'PSOP',68,'white',800,letter_spacing=2)
 title+=text(64,158,'设备任务、能力运营',22,'#99C7DC',600)+text(64,190,'与现场服务平台',22,'#99C7DC',600)
 title+=text(62,294,'理解设备状态',39,'white',700)+text(62,355,'指导操作与验证',39,'white',700)+text(62,416,'沉淀服务能力',39,'white',700)
 claim=text(64,491,'部件知识 · 操作条件',22,CYAN,600)+text(64,526,'现场核对 · 验证与学习',22,CYAN,600)
 claim+=line(64,568,351,568,'#315268',1)
 claim+=text(64,610,'EG 驱动任务对齐微调与蒸馏',20,'#D5E8F0',600)
 claim+=text(64,645,'领域语音 · 三维沙盒 · 现场执行',18,'#8FB5C7')
 claim+=text(64,741,'让人把任务做对',27,'white',700)+text(64,783,'让模型学到操作经验',27,'white',700)
 product=text(460,78,'让设备知识，贯穿任务与现场操作',33,'white',700)
 product+=text(460,116,'MICRODUCK / MD-01   ·   安装与复检   ·   当前：对齐髋部支架',18,'#9EBFD0',600)

 build=text(460,226,'build / 设备知识',22,'#8DD6EF',700)
 build+=_cover_model('cover-build-exploded.png',448,247,250,485)
 build+=text(462,772,'部件 · 连接 · 操作依据',18,'#A9CAD9',500)
 build+=line(465,744,667,744,'#35566A',1)
 build+=arrow('M669 532C704 532 703 229 723 229','#5B839A',1.4,dash='3 6')
 build='<g id="cover-build">'+build+'</g>'

 eg=text(736,151,'compile / 任务 EG',22,'#B9BCFA',700)
 eg+=cover_task_eg(706,167,840,250).replace('id="cover-task-eg"','id="cover-task-eg-graph"',1)
 eg='<g id="cover-task-eg" data-viewbox="700 124 850 280">'+eg+'</g>'

 ground=ellipse(1070,792,315,50,'url(#cover-ground-glow)')
 grid=''
 for yy in [754,762,772,785,802,825]:grid+=line(729,yy,1360,yy,'#2A4C60',.8)
 for xx in range(760,1370,46):grid+=line(1060,690,xx,845,'#2A4C60',.8)
 ground+='<g clip-path="url(#cover-ground-clip)" opacity=".7">'+grid+'</g>'
 model,info,project=_cover_model_geometry('cover-installation.png',812,422,516,394)
 sx,sy=project(info['sourceTargetAnchor']);mx,my=project(info['movingJointAnchor'])
 install=ground+model
 install+=circle(sx,sy,11,'none','#8BE2F2',1.6)
 install+=arrow(f'M{mx:.2f} {my:.2f}L{sx:.2f} {sy:.2f}','#F7C769',2.6)
 install+=text(mx+18,my-46,'对齐方向',17,'#F7D18B',600)
 install+=text(859,839,'simulate / 安装预演',21,'#83D8CC',700)
 install=f'<g id="cover-installation" data-stage="2" data-source-target="{sx:.3f},{sy:.3f}" data-moving-anchor="{mx:.3f},{my:.3f}">'+install+'</g>'

 phone,phone_target=_cover_phone(1365,488)
 field=text(1238,540,'AR / mobile',19,'#9ADDF3',700)+phone
 field+=line(1336,547,1358,560,'#6B9FB4',1.1)
 field+=text(1370,837,'现场指导与反馈',18,'#A9CAD9',600)
 field+='<g opacity=".75">'+path(f'M{sx+12:.2f} {sy+5:.2f}C1267 748 1300 688 {phone_target[0]-17:.2f} {phone_target[1]:.2f}',stroke='#6FBDCF',sw=1.2,stroke_dasharray='3 6')+'</g>'
 field=f'<g id="cover-field" data-ar-target="{phone_target[0]:.3f},{phone_target[1]:.3f}">'+field+'</g>'
 return custom_page('PSOP｜理解设备状态，指导操作与验证','同一设备任务的连续主视觉：真实爆炸结构、任务 EG 概览、安装预演及移动端现场指导',[base,title,claim,product,build,eg,install,field],extra_defs=extra)

def slide03():
 cards=''
 entries=[('01','更换的是哪个舵机？','microduck-joint.svg','部件身份','部件型号、关节位置与连接关系','确认对象 → 绑定任务版本',PURPLE),('02','复检记录齐备了吗？','task-checks.svg','复检状态','身份记录、连接核对与工具反馈','核对记录 → 找到缺失证据',SKY),('03','下一步能否继续？','device-knowledge.svg','操作条件','适用说明、验证要求与异常分支','补充复检 → 满足推进条件',AMBER)]
 for i,(num,title,img,stage,body,next_,col) in enumerate(entries):
  x=64+i*501;cards+=rect(x,217,470,529,'white',LINE,r=12)+text(x+20,254,num,21,col,700)+text(x+64,258,stage,27,NAVY,700)
  cards+=photo(img,x+1,282,468,274,r=0,fit='xMidYMid slice')
  cards+=text(x+20,605,title,27,NAVY,700)+text(x+20,650,body,20,MUTED,width=431,leading=28,max_lines=2)+text(x+20,716,next_,22,col,600)
 return page_svg(3,'设备任务，需要回答具体的操作问题','同一设备关联部件身份、连接关系、操作记录与复检要求，才能判断下一步。',[cards,takeaway('把部件、工具反馈与操作依据，转化为可检查、可操作、可验证的任务。')],source='Microduck 舵机识别与复检教学示例；任务、状态与图形为原型设定',kicker='问题针对性 / EQUIPMENT QUESTIONS')

def slide04():
 inputs=rect(64,211,1472,74,'#E3EFF7',r=10)+text(88,255,'设备输入',25,NAVY,700)
 for x,lab,col in [(273,'部件 / 图纸 / 连接关系',SKY),(692,'说明 / 复检 / 异常依据',TEAL),(1110,'现场观察 / 工具 / 语音',PURPLE)]:inputs+=text(x,255,lab,23,col,600)
 cards=''
 for i,(name,cap,desc,out,col,ic) in enumerate([('build','组织设备对象与约束','舵机、关节、连接与操作要求','设备知识包 / 部件关系',SKY,'cube'),('compile','编译任务与学习监督','EG、场景、数据、训练与评测','任务包 / 模型包 / 回放约束',PURPLE,'network'),('simulate','操作三维世界并验证','部件选择、分支试验与回放','状态变化 / 验证记录 / 难例',TEAL,'play')]):
  x=64+i*501;cards+=rect(x,318,470,252,'white',LINE,r=12)+icon(ic,x+24,339,34,col)+text(x+76,376,name,38,col,700)+text(x+24,424,cap,27,NAVY,700)+text(x+24,467,desc,21,MUTED)+line(x+24,489,x+446,489,LINE,1)+text(x+24,536,out,22,col,600)
  if i<2:cards+=arrow(f'M{x+474} 437h23',SKY,2)
 runtime=rect(64,601,1472,166,NAVY,r=12)+text(89,640,'同一任务上下文，连接智能、操作验证与现场执行',27,'white',700)
 for x,lab,sub,col in [(90,'可替换模型','理解现场 / 提出操作候选','#B3D8F1'),(573,'PSOP Runtime','核对条件 / 证据 / 状态提交','#AFCFC9'),(1057,'设备工具与执行端','文档 / 驱动 / 检查 / 人与设备','#D0C8F5')]:
  runtime+=text(x,690,lab,25,col,700)+text(x,730,sub,20,'#D8E8F1')
 runtime+=arrow('M431 692H541',CYAN,2)+arrow('M918 692H1029',CYAN,2)
 return page_svg(4,'一套设备知识，形成可运行与可学习的任务','设备对象、任务语义与可验证轨迹贯穿三个工作台，支撑现场执行和模型学习。',[inputs,cards,runtime,takeaway('任务定义执行条件，操作证据支持判断，验证后的轨迹支持学习。')],source='目标产品架构；训练、评测与模型发布为独立步骤，设备控制与联锁由底层系统承担',kicker='产品体系 / EQUIPMENT TASK STACK')

def slide06():
 return page_svg(6,'build：把部件、连接与操作依据组织起来','展开 Microduck 的舵机、关节与连接，关联部件身份、适用说明和复检要求。',[screen('build')],source='Microduck 设备知识关系原型；部件参数、文档与状态为教学示例，须绑定实际设备版本',kicker='设备知识 / BUILD')

def slide07():
 return page_svg(7,'compile：把识别与复检条件编译为 EG','身份记录与复检证据并行收集；关联正确、记录齐备且核验通过，才能离开当前节点。',[screen('compile'),native_cpn()],source='Microduck 教学 EG 原型；任务、观察、动作与验证结果用于组织监督样例',kicker='任务编译 / COMPILE')

def slide08():
 return page_svg(8,'simulate：预演设备安装步骤','准备部件 → 对齐髋部支架 → 安装舵机与连接件 → 固定与连接 → 复检待完成。',[screen('simulate')],source='来源几何与安装预演原型；安装位移和步骤为教学示意，固定及复检需真实工具反馈',kicker='安装预演 / SIMULATE')

def slide02():
    cards=''
    nodes=[
        ('01.14','YOLO26','yolov26.png','正式发布 · 目标检测','定位设备与工装对象',SKY),
        ('01.29','Qwen3-ASR','qwen-asr.png','语音识别开源模型','术语微调＋任务热词',SKY),
        ('05.11','MiniCPM-V 4.6','minicpm-v.png','开源 · 端侧视觉语言模型','视觉理解与任务推理',PURPLE),
        ('06.01','NVIDIA Cosmos 3','cosmos3.png','世界模型 · 07.20 Edge','物理场景理解与预演',TEAL),
        ('09.11','RelateAnything','relateanything.png','预印本首次提交','预测对象间空间／语义关系',TEAL),
        ('10.02','Muse Gadget SDK','muse-gadget.png','官方仓库初始提交','连接模型、相机与设备',AMBER)]
    for i,(date,name,asset,release,theme,col) in enumerate(nodes):
        x=64+i*249
        cards+=rect(x,207,227,263,'white',LINE,r=12)+rect(x,207,227,5,col,r=0)
        cards+=text(x+15,244,'2026.'+date,24,col,700)
        cards+=photo(PRODUCTS/asset,x+12,260,203,107,r=7,fit='xMidYMid meet')
        cards+=text(x+15,399,name,21,NAVY,700)+text(x+15,429,release,16,col,600)+text(x+15,457,theme,16,MUTED)
    task=rect(64,490,1472,286,NAVY,r=13)+text(87,530,'PSOP：四类能力，共享设备任务上下文',26,'white',700)
    task+=text(1512,528,'MD-01  /  MD-SERVO-CHECK-01',18,'#AACBDC',anchor='end')
    # Speech joins task reasoning in parallel; regions from detection feed relationship prediction.
    task+=rect(87,550,417,87,'#1B4662','#456984',r=9)+rect(87,550,5,87,SKY,r=0)
    task+=text(107,582,'语音识别 · 领域微调',23,'#9EDDEB',700)+text(107,615,'录音＋校订文本 → 设备术语',20,'white')
    task+=arrow('M512 604H964',CYAN,2.2)+text(738,588,'关节 / 步骤 / 型号',20,'#C4DFEB',anchor='middle')
    task+=rect(87,656,417,96,'#1B4662','#456984',r=9)+rect(87,656,5,96,SKY,r=0)
    task+=text(107,690,'目标检测 · 领域适配',23,'#9EDDEB',700)+text(107,728,'画面 → 舵机 / 关节 / 连接区域',20,'white')
    task+=arrow('M513 709H541',CYAN,2.2)
    task+=rect(551,656,377,96,'#1B4E59','#477C7C',r=9)+rect(551,656,5,96,TEAL,r=0)
    task+=text(571,690,'关系理解 · RelateAnything',22,'#93E1D7',700)+text(571,728,'图像＋区域＋谓词 → 关系候选',19,'white')
    task+=arrow('M935 709H964','#93E1D7',2.2)
    task+=rect(978,550,534,202,'#284F71','#62749A',r=10)
    task+=text(1000,585,'任务推理 · EG 对齐微调与蒸馏',25,'white',700)
    task+=text(1000,620,'术语＋对象＋关系＋复检记录',20,'#C6DCEB')+line(1000,635,1490,635,'#57768F',1)
    task+=text(1000,669,'结合说明与反馈，判断下一步',25,'#D1CFFF',700)+text(1000,704,'缺少依据 → 请求复核与补证',22,'white',600)
    task+=text(1000,735,'操作与完成结论关联适用验证依据',18,'#C6DCEB')
    return page_svg(2,'2026：模型能力正在进入设备现场','语音、目标检测、关系理解与任务推理协同；世界模型、端侧推理与设备接口提供基础。',[cards,task,takeaway('听清术语、找到对象、理解关系，结合 EG 完成任务核对。')],source='官方产品视觉与日期见资料索引；RelateAnything 采用 2026 作者项目，下方为集成设计',kicker='今年技术进展 / 2026')


def slide05():
    nums=rect(64,201,720,104,'#E5F6F1',stroke='#B8DED2',r=13)+text(88,274,'+61%',62,TEAL,800)+text(332,241,'5 维任务质量均值',24,NAVY,700)+text(332,278,'42.3 → 68.3  ·  +26.0 个百分点',21,TEAL,600)
    nums+=rect(816,201,720,104,'#E7F4FC',stroke='#BDDDEC',r=13)+text(840,275,'+31.3',57,SKY,800)+text(1038,275,'个百分点',20,SKY,700)+text(1191,240,'下一动作成功率',23,NAVY,700)+text(1191,276,'7.9% → 39.2%',22,SKY,600)
    charts=text(83,338,'A  智能体 Harness',23,NAVY,700)+text(833,338,'B  PSOP',23,NAVY,700)
    charts+=figure(ASSETS/'experiment/control.svg',72,349,704,327,'chartA',chart=True)+figure(ASSETS/'experiment/runtime.svg',822,349,704,327,'chartB',chart=True)
    tab=text(64,686,'完整配对增量',22,NAVY,700)+text(1536,685,'单位：百分点  ·  颜色与折线对应',18,MUTED,anchor='end')
    tab+=figure(ASSETS/'experiment/delta-table.svg',64,698,1472,138,'deltaTable',table=True)
    return page_svg(5,'PSOP 更适配设备领域任务','机械臂组装受控模拟｜4 个模型 × 6 个场景 × 10 次重复＝240 个完整配对。',[nums,charts,tab],source='±1 样本 SD；不含 Qwen3.6-flash 与安全／异常维度；非 Microduck 实测或微调结论',kicker='设备任务适配 / EQUIPMENT TASK ADAPTATION')



PAGES=[slide01,slide02,slide03,slide04,slide05,slide06,slide07,slide08]
