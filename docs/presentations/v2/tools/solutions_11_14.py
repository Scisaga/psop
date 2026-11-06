"""Native PSOP solution pages adapted from visual references 11–14.

No legacy slide bitmap is reused. Product views are details inside native
systems, comparison, customer-service and engineering-handoff diagrams.
"""
from v2_helpers import *


def _model(name, x, y, w, h, crop=None):
    metadata=json.loads((CURRENT_ASSETS/'model-render-report.json').read_text(encoding='utf-8'))[Path(name).stem]
    sw,sh=metadata['imageSize']
    left,top,right,bottom=crop or metadata['alphaBounds']
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{left-8} {top-8} {right-left+16} {bottom-top+16}" preserveAspectRatio="xMidYMid meet">'+image(CURRENT_ASSETS/name,0,0,sw,sh)+'</svg>'


def _source(page):
    return f'解决方案设计/教学示例 · 据视觉稿第{page}页重绘；具体接入与完成状态须适配并核验'


def systems_solution():
    inputs=''
    systems=[('CRM / 客服','客户与服务入口','people'),('工单 / FSM\n服务调度','请求、派工与流转','doc'),('ERP / EAM\nCMMS 资产管理','资产、备件与记录','cube'),('IoT / 设备数据','状态、报警与运行数据','chart'),('知识库 / 文档','说明书、手册与案例','doc'),('账号 / 组织权限','人员、角色与访问范围','people')]
    for i,(name,body,ic) in enumerate(systems):
        x=64+i*246
        inputs+=rect(x,213,234,128,'white',LINE,r=11)
        inputs+=icon(ic,x+16,230,31,SKY)+text(x+60,255,name,20,NAVY,700,width=159,leading=25,max_lines=2)
        inputs+=text(x+16,312,body,19,MUTED,width=202,max_lines=1)
        inputs+=line(x+117,344,x+117,365,SKY,1.6)
    inputs+=line(181,365,1411,365,SKY,1.6)+arrow('M800 366V385',SKY,2)
    layer=rect(64,386,1472,212,NAVY,r=13)
    layer+=text(88,434,'PSOP 服务与执行层',30,'white',700)
    layer+=text(88,479,'关联知识、任务条件与反馈，\n把同一任务带到现场。',22,'#C7DCEB',width=360,leading=33,max_lines=2)
    capabilities=[('设备知识','部件、说明、版本与适用要求','输出当前任务可用的依据',SKY,'cube'),('任务与流程','工单、当前步骤与允许动作','组织指导与人员交接',PURPLE,'network'),('执行与记录','观察、操作、反馈与核验','回写经核验的服务记录',TEAL,'check')]
    for i,(name,body,out,col,ic) in enumerate(capabilities):
        x=480+i*349
        layer+=rect(x,409,328,164,'#204C6A','#416984',r=9)+icon(ic,x+18,426,30,col)
        layer+=text(x+64,454,name,27,'white',700)
        layer+=text(x+18,496,body,20,'#D8E7F0',width=292,leading=27,max_lines=2)
        output_color={PURPLE:'#CBC7F7',TEAL:'#A8DFD1'}.get(col,col)
        layer+=text(x+18,552,out,20,output_color,600,width=292,max_lines=1)
    outputs=''
    entries=[('客户','phone','取用设备资料与安装指导\n记录问题，必要时升级服务',SKY),('工程师','tool','带着观察、步骤与缺失记录接手\n继续处理并核对工具结果',PURPLE),('企业','chart','同步经核验的服务状态\n审核记录，更新知识与任务资产',TEAL)]
    for i,(name,ic,body,col) in enumerate(entries):
        x=64+i*501
        outputs+=arrow(f'M800 600V618H{x+235}V633',col,1.8)
        outputs+=rect(x,637,470,129,'white',LINE,r=11)+icon(ic,x+20,657,32,col)
        outputs+=text(x+69,685,name,26,NAVY,700)+text(x+20,725,body,21,MUTED,width=430,leading=28,max_lines=2)
    takeaway_block=takeaway('现有系统提供业务上下文，PSOP 组织设备任务、现场指导与核验记录。')
    return page_svg(5,'连接现有系统，让设备服务走到现场','CRM、工单、资产、设备数据与知识提供上下文；PSOP 组织任务指导、记录核验与服务回写。',[inputs,layer,outputs,takeaway_block],source=_source(11),kicker='解决方案 / SYSTEM CONNECTIONS')


def comparison_solution():
    widths=[198,326,326,622]
    rows=[
        ('核心定位','资料检索与参考问答','咨询受理、意图判断与分流','关联设备知识、任务条件与现场服务动作'),
        ('理解对象','文档、手册与问题','客户描述、意图与服务信息','设备、部件、步骤、状态与服务上下文'),
        ('输入与观察','通常从资料与问句开始','通常从客户描述与工单开始','图像、语音、现场记录与工具反馈'),
        ('下一步判断','返回相关依据和说明','推荐回答、分流或工单动作','结合当前步骤和证据提出允许动作'),
        ('任务执行','用户按资料操作','人工服务或接入预设服务流程','手机 / AR 分步指导；由工具与人员执行'),
        ('结果核验','依所接入的核验能力而定','依所接入的核验能力而定','Runtime 依据真实返回与任务条件核验'),
        ('服务衔接','资料供后续取用','咨询与工单形成服务记录','自助 → 工程师接手 → 现场处理 → 审核回流'),
        ('价值评估','资料查找与回答质量','响应、沟通与分流效果','任务完成、等待、返工与知识复用效果'),
    ]
    x,y=64,215;head_h,row_h=54,62
    table=rect(x,y,1472,head_h+row_h*len(rows),'white',LINE,r=11)
    headers=['比较维度','典型知识助手','典型 AI 客服','PSOP 设备任务方案']
    xx=x
    for col,(cw,label) in enumerate(zip(widths,headers)):
        table+=rect(xx,y,cw,head_h,NAVY if col!=3 else '#1D5675',r=0)
        table+=text(xx+18,y+35,label,22,'white' if col!=3 else CYAN,700)
        xx+=cw
    for i,row in enumerate(rows):
        yy=y+head_h+i*row_h;xx=x
        for j,(cw,value) in enumerate(zip(widths,row)):
            fill='#E9F5FB' if j==3 else '#F3F8FC' if i%2 else 'white'
            table+=rect(xx,yy,cw,row_h,fill,r=0)
            lines=wrap(value,cw-36,20,j==0)
            baseline=yy+(row_h-len(lines)*26)/2+20
            table+=text(xx+18,baseline,value,20,NAVY if j==0 or j==3 else MUTED,700 if j==0 else 500,width=cw-36,leading=26,max_lines=2)
            if j:table+=line(xx,yy,xx,yy+row_h,LINE,1)
            xx+=cw
        table+=line(x,yy+row_h,x+1472,yy+row_h,LINE,1)
    strengths=''
    for i,(ic,title,body,col) in enumerate([('doc','知识获取','找到资料与相关依据',SKY),('people','咨询服务','理解诉求与分流请求',PURPLE),('tool','设备任务','关联操作、反馈与核验',TEAL)]):
        xx=64+i*501
        strengths+=rect(xx,779,470,58,'white',LINE,r=9)+icon(ic,xx+15,793,27,col)
        strengths+=text(xx+57,813,title,22,NAVY,700)+text(xx+185,813,body,20,MUTED)
    return page_svg(6,'从信息服务延伸到设备任务执行','按典型方案定位比较输入、行动、证据与服务衔接；具体能力取决于产品和集成配置。',[table,strengths],source=_source(12),kicker='解决方案 / TASK CAPABILITIES')


def _step_card(x,step,title,body,w=347,h=544):
    a=rect(x,212,w,h,'white',LINE,r=12)
    a+=circle(x+28,244,16,SKY)+text(x+28,250,str(step),19,'white',700,anchor='middle')
    a+=text(x+56,251,title,25,NAVY,700)
    a+=text(x+20,299,body,21,MUTED,width=w-40,leading=30,max_lines=3)
    return a


def customer_solution():
    first=_step_card(64,1,'拍摄，发起对话','拍摄目标安装位置，口述已完成动作和当前问题。')
    first+=photo('installation-process.png',80,360,315,187,r=8,fit='xMidYMid slice')
    first+=tag(95,374,'现场观察',CYAN,'#123B5DEB',17,112)
    for i,(ic,label) in enumerate([('eye','视频'),('mic','语音'),('doc','文字')]):
        x=89+i*103
        first+=icon(ic,x,577,27,SKY)+text(x+34,600,label,20,NAVY,600)
    first+=rect(84,637,307,93,'#ECF6FC',r=8)+text(101,669,'当前任务：安装与复检',22,NAVY,700)+text(101,708,'设备 / 部件 / 操作观察',20,MUTED)

    second=_step_card(439,2,'理解，关联依据','定位设备与目标部件，查询适用说明和当前任务记录。')
    second+=rect(455,360,315,187,'#F1F6FA',LINE,r=8)
    second+=_model('model-joint-detail.png',460,364,305,178,[275,170,850,715])
    second+=tag(468,374,'部件定位候选',SKY,'white',17,160)
    for yy,label,col in [(584,'目标：教学安装区 J01',SKY),(628,'依据：对齐与固定要求',PURPLE),(672,'状态：复检记录待补',AMBER)]:
        second+=circle(471,yy-7,5,col)+text(485,yy,label,21,NAVY,600)
    second+=text(459,724,'候选判断仍需与任务记录核对',18,MUTED)

    third=_step_card(814,3,'标注，指导安装','结合当前步骤给出安装位置与操作提示，并记录现场观察。')
    third+=photo('cover-simulate.png',830,360,315,187,r=8,fit='xMidYMid slice')
    third+=rect(834,561,307,73,NAVY,r=8)+icon('mic',849,575,27,CYAN)
    third+=text(891,593,'对齐髋部安装面',22,'white',700)+text(850,620,'固定后采集检查记录',19,'#BED8E8')
    third+=text(834,678,'对齐 → 安装 → 固定与连接',20,NAVY,600)
    third+=text(834,724,'按适用说明执行，保留工具返回',18,MUTED)

    fourth=_step_card(1189,4,'记录，或转工程师','依据操作与检查记录判断后续路径，未解决的问题保留上下文。')
    for yy,title,body,col,fill,ic in [(361,'记录齐备且核验通过','进入下一步，保存任务记录',TEAL,'#ECF7F4','check'),(470,'仍缺身份或复检记录','保持状态，查询或补充',AMBER,'#FBF5E9','clock'),(579,'客户无法继续','带着已有观察转工程师',PURPLE,'#F0F0FB','people')]:
        fourth+=rect(1205,yy,315,88,fill,r=8)+icon(ic,1218,yy+17,28,col)
        fourth+=text(1257,yy+34,title,21,NAVY,700,width=251,max_lines=1)+text(1221,yy+71,body,19,MUTED)
    fourth+=text(1209,723,'完成 / 缺证 / 升级均为教学分支',18,MUTED)
    arrows=''.join(arrow(f'M{x} 488H{x+18}',SKY,2.2) for x in [415,790,1165])
    value=rect(64,777,1472,61,NAVY,r=9)+icon('people',85,794,29,CYAN)+text(131,815,'客户：获得及时指导与升级入口',23,'white',700)
    value+=line(781,791,781,823,'#3C6480',1)+icon('cube',808,794,29,CYAN)+text(854,815,'厂商：接手可追溯的问题与记录',23,'white',700)
    return page_svg(7,'客户通过设备 AI 进入自助服务','以 Microduck 安装与复检为例，把现场观察、适用指导、记录核验和人工升级连接起来。',[first,second,third,fourth,arrows,value],source=_source(13),kicker='解决方案 / CUSTOMER SELF SERVICE')


def _handoff_card(x,step,title,body,col):
    a=rect(x,212,272,554,'white',LINE,r=11)+circle(x+27,243,15,col)
    a+=text(x+27,249,str(step),18,'white',700,anchor='middle')+text(x+50,250,title,22,NAVY,700)
    a+=text(x+18,295,body,20,MUTED,width=236,leading=28,max_lines=3)
    return a


def engineer_solution():
    context=_handoff_card(64,1,'完整上下文','客户观察与动作记录\n随同一任务交给工程师。',SKY)
    context+=text(82,379,'问题上下文',22,NAVY,700)
    fields=[('cube','设备与目标部件'),('doc','问题与当前步骤'),('check','已执行的动作'),('eye','图片与操作观察'),('clock','已有与缺失记录')]
    for i,(ic,label) in enumerate(fields):
        yy=398+i*57
        context+=rect(81,yy,238,45,'#F0F7FB',r=6)+icon(ic,94,yy+10,24,SKY)+text(132,yy+31,label,20,NAVY,600)
    context+=text(82,731,'保留来源、时间与任务版本',18,MUTED)

    joint=_handoff_card(364,2,'共同判断现场','工程师通过手机或 AR 对照现场，核对目标部件与当前状态。',TEAL)
    joint+=photo('installation-process.png',380,361,240,173,r=8,fit='xMidYMid slice')
    joint+=tag(390,371,'手机 / AR',CYAN,'#123B5DEB',17,116)
    for yy,ic,title in [(577,'cube','核对目标部件'),(632,'eye','对照现场变化'),(687,'doc','记录新的观察')]:
        joint+=icon(ic,383,yy-23,27,TEAL)+text(424,yy,title,20,NAVY,600)
    joint+=text(382,735,'把新增观察关联到当前任务',18,MUTED)

    guidance=_handoff_card(664,3,'提供下一步指导','结合当前步骤与允许动作\n按检查要求继续处理。',PURPLE)
    guidance+=rect(681,361,238,332,NAVY,r=9)+text(697,399,'任务指导候选',23,'white',700)
    steps=['核对目标部件','对照安装步骤','查询工具结果','保持或请求复检']
    for i,label in enumerate(steps):
        yy=443+i*53
        guidance+=circle(704,yy-7,12,PURPLE if i==1 else '#345B77')+text(704,yy-2,str(i+1),15,'white',700,anchor='middle')
        guidance+=text(726,yy,label,19,'white' if i==1 else '#BED6E6',600 if i==1 else 400)
    guidance+=text(697,667,'说明 · 反馈 · 异常分支',16,'#B8D3E4',width=207,max_lines=1)
    guidance+=text(682,735,'执行与核验分别记录',18,MUTED)

    verify=_handoff_card(964,4,'关键节点核验','核对记录归属、实际反馈和缺失条件，按要求保持或推进。',AMBER)
    for yy,title,body,col in [(361,'操作记录','动作与结果分别留痕',SKY),(466,'身份记录','匹配设备与目标部件',PURPLE),(571,'复检记录','齐备并审核后核验',TEAL)]:
        verify+=rect(981,yy,238,85,'#F2F7FA',r=8)+icon('doc' if title!='复检记录' else 'check',993,yy+16,26,col)
        verify+=text(1035,yy+33,title,21,NAVY,700)+text(997,yy+69,body,19,MUTED)
    verify+=text(982,704,'缺证：保持状态并请求补充',18,AMBER,600)
    verify+=text(982,735,'通过：进入后续任务节点',18,TEAL,600)

    expert=_handoff_card(1264,5,'升级专家协作','超出当前处理范围时，携带任务与现场记录请求专家协同。',TEAL)
    expert+=rect(1281,361,238,114,'#EBF6F3',r=8)+icon('people',1298,386,43,TEAL)
    expert+=text(1358,404,'资深专家',24,NAVY,700)+text(1358,441,'远程共同处理',19,MUTED)
    for yy,ic,label in [(520,'eye','共享现场与记录'),(577,'ar','标注、讨论与指引'),(634,'doc','确认结论与适用范围')]:
        expert+=icon(ic,1287,yy-23,26,TEAL)+text(1326,yy,label,19,NAVY,600)
    expert+=arrow('M1400 655V681',TEAL,1.8)+rect(1281,691,238,55,'#E8F1F7',r=7)+text(1400,725,'审核后更新知识与任务',19,NAVY,600,anchor='middle')
    connectors=''.join(arrow(f'M{x} 489H{x+20}',SKY,2.2) for x in [339,639,939,1239])
    benefits=''
    for i,(ic,title) in enumerate([('check','减少重复判断'),('clock','缩短交接等待'),('people','集中专家精力'),('network','复用审核经验')]):
        x=64+i*374
        benefits+=rect(x,785,350,53,'#E3F0F8',r=8)+icon(ic,x+18,797,26,SKY)+text(x+58,820,title,22,NAVY,700)
    return page_svg(8,'工程师带着任务上下文接手现场','观察、已执行步骤、缺失记录与适用说明一起移交；工程师继续处理，复杂问题再请求专家协作。',[context,joint,guidance,verify,expert,connectors,benefits],source=_source(14),kicker='解决方案 / ENGINEERING HANDOFF')


PAGES=[systems_solution,comparison_solution,customer_solution,engineer_solution]
NAMES=['05-system-connections','06-solution-comparison','07-customer-self-service','08-engineering-handoff']


def main():
    import argparse
    import hashlib
    from PIL import Image
    from playwright.sync_api import sync_playwright
    from render_prototypes import launch_browser
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT.parents[2]/'.psop/v2-solutions-review')
    parser.add_argument('--render',action='store_true')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    reports=[]
    for number,name,fn in zip(range(5,9),NAMES,PAGES):
        value=fn();E=ET.fromstring(value)
        assert E.get('viewBox')=='0 0 1600 900'
        file=out/(name+'.svg');file.write_text(value+'\n',encoding='utf-8')
        reports.append({'page':number,'file':file.name,'title':E.find('{'+NS+'}title').text,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    if args.render:
        with sync_playwright() as p:
            browser=launch_browser(p)
            page=browser.new_page(viewport={'width':1600,'height':900},device_scale_factor=1)
            for item in reports:
                page.goto((out/item['file']).as_uri(),wait_until='load');page.evaluate('document.fonts.ready')
                info=page.evaluate('''()=>{const b=[...document.querySelectorAll('text')].map(e=>{let r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}}).filter(x=>x.w>0&&x.h>0);const overlaps=[];for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const a=b[i],c=b[j],dx=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x),dy=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y);if(dx>3&&dy>3&&dx*dy>Math.min(a.w*a.h,c.w*c.h)*.12)overlaps.push({a:a.text,b:c.text})}return {text_count:b.length,outside:b.filter(r=>r.x<-.5||r.y<-.5||r.x+r.w>1600.5||r.y+r.h>900.5),overlaps}}''')
                item.update(info)
                png=out/(Path(item['file']).stem+'.png');page.screenshot(path=str(png));item['png']=png.name
            browser.close()
        sheet=Image.new('RGB',(1600,900),'#D5E4EC')
        for i,item in enumerate(reports):
            thumb=Image.open(out/item['png']).convert('RGB').resize((800,450),Image.Resampling.LANCZOS)
            sheet.paste(thumb,((i%2)*800,(i//2)*450))
        sheet.save(out/'contact-sheet.png')
    (out/'render-checks.json').write_text(json.dumps({'pages':reports,'out_of_canvas_text':sum(len(item.get('outside',[])) for item in reports),'text_overlap_candidates':sum(len(item.get('overlaps',[])) for item in reports)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'pages':len(reports),'output':str(out),'outside':sum(len(item.get('outside',[])) for item in reports),'overlaps':sum(len(item.get('overlaps',[])) for item in reports)},ensure_ascii=False))


if __name__=='__main__':main()
