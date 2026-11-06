"""Small, deterministic SVG authoring helpers for the PSOP presentation."""
from pathlib import Path
from html import escape
from functools import lru_cache
import base64
import math
import re
import xml.etree.ElementTree as ET
from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
W, H = 1600, 900
NAVY, SKY, CYAN = '#123B5D', '#3AAFE6', '#52C7F5'
TEAL, PURPLE, AMBER, CORAL = '#138F84', '#6E78D8', '#B77A17', '#CC5865'
INK, MUTED, LINE, BG = '#102A43', '#526F84', '#D5E4EC', '#F3F8FC'
FONT = 'Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

@lru_cache(None)
def font(size, bold=False):
    candidates = [
        Path('C:/Windows/Fonts') / ('msyhbd.ttc' if bold else 'msyh.ttc'),
        Path('/mnt/c/Windows/Fonts') / ('msyhbd.ttc' if bold else 'msyh.ttc'),
        Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), int(size))
    return ImageFont.load_default(size=int(size))

def wrap(value, width, size=24, bold=False):
    output = []
    for paragraph in str(value).split('\n'):
        current = ''
        for char in paragraph:
            if current and font(size, bold).getlength(current + char) > width:
                output.append(current.rstrip())
                current = char.lstrip()
            else:
                current += char
        output.append(current)
    return output

def text(x, y, value, size=24, color=INK, weight=400, width=None, leading=None, anchor='start', max_lines=None, **attrs):
    lines = wrap(value, width, size, weight >= 600) if width else str(value).split('\n')
    if max_lines and len(lines) > max_lines:
        raise ValueError(f'Text needs {len(lines)} lines, expected {max_lines}: {value}')
    leading = leading or size * 1.42
    attr = ' '.join(f'{k.replace("_", "-")}="{escape(str(v), quote=True)}"' for k, v in attrs.items())
    measure = f' data-max-width="{width}"' if width else ''
    spans = ''.join(f'<tspan x="{x}" y="{y+i*leading:.2f}">{escape(line)}</tspan>' for i, line in enumerate(lines))
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}"{measure} {attr}>{spans}</text>'

def rect(x, y, w, h, fill='white', stroke=None, r=14, sw=1.5, **attrs):
    attr = ' '.join(f'{k.replace("_", "-")}="{v}"' for k,v in attrs.items())
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}" {attr}/>'

def line(x1,y1,x2,y2,color=LINE,sw=2,dash=None,marker=False):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"'+(f' stroke-dasharray="{dash}"' if dash else '')+(f' marker-end="url(#arrow)"' if marker else '')+'/>'

def path(d, fill='none', stroke=SKY, sw=2, **attrs):
    attr=' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" {attr}/>'

def circle(x,y,r,fill='white',stroke=None,sw=2,**attrs):
    attr=' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}" {attr}/>'

def ellipse(x,y,rx,ry,fill,stroke=None,sw=1.5):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}"/>'

def poly(points,fill,stroke=None,sw=2):
    return f'<polygon points="'+ ' '.join(f'{a},{b}' for a,b in points)+f'" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}" stroke-linejoin="round"/>'

def group(name,content,transform=None):
    return f'<g id="{name}"'+(f' transform="{transform}"' if transform else '')+'>'+content+'</g>'

def tag(x,y,label,color=SKY,fill='#E7F4FC',size=18,w=None):
    w=w or font(size,True).getlength(label)+28
    return rect(x,y,w,32,fill,r=7)+text(x+w/2,y+23,label,size,color,600,anchor='middle')

def icon(name,x,y,size=36,color=SKY):
    shapes={
      'mic':'<rect x="13" y="3" width="10" height="20" rx="5"/><path d="M8 17v2a10 10 0 0020 0v-2M18 29v5M12 34h12"/>',
      'doc':'<rect x="6" y="3" width="22" height="29" rx="3"/><path d="M12 11h10M12 17h10M12 23h7"/>',
      'cube':'<path d="m18 3 15 8v16l-15 8L3 27V11zM3 11l15 8 15-8M18 19v16M10 7l15 8"/>',
      'model':'<rect x="9" y="9" width="18" height="18" rx="4"/><path d="M14 2v7m8-7v7M14 27v7m8-7v7M2 14h7m-7 8h7m18-8h7m-7 8h7M14 15h8v6h-8z"/>',
      'check':'<circle cx="18" cy="18" r="14"/><path d="m10 18 6 6 12-13"/>',
      'eye':'<path d="M2 18s7-11 16-11 16 11 16 11-7 11-16 11S2 18 2 18z"/><circle cx="18" cy="18" r="5"/>',
      'phone':'<rect x="8" y="2" width="20" height="32" rx="4"/><path d="M14 7h8M16 29h4"/>',
      'network':'<circle cx="18" cy="18" r="5"/><circle cx="5" cy="5" r="3"/><circle cx="31" cy="5" r="3"/><circle cx="5" cy="31" r="3"/><circle cx="31" cy="31" r="3"/><path d="m7 7 7 7m8 8 7 7M7 29l7-7m8-8 7-7"/>',
      'people':'<circle cx="18" cy="10" r="6"/><path d="M7 32v-6c0-7 22-7 22 0v6M3 12c-4 0-4 8 0 8m30-8c4 0 4 8 0 8"/>',
      'leaf':'<path d="M30 4C6 2 1 19 11 28c11 10 24-6 19-24zM7 34 25 11M15 24l-3-9m8 3 7 1"/>',
      'tool':'<path d="M32 5a10 10 0 0 1-13 14L8 31a4 4 0 0 1-6-6l12-11A10 10 0 0 1 28 1l-8 8 7 7z"/>',
      'play':'<circle cx="18" cy="18" r="15"/><path d="m14 10 12 8-12 8z"/>',
      'globe':'<circle cx="18" cy="18" r="15"/><ellipse cx="18" cy="18" rx="7" ry="15"/><path d="M4 12h28M4 24h28M3 18h30"/>',
      'flask':'<path d="M12 2h12M14 2v12L4 30q-1 3 3 3h22q4 0 3-3L22 14V2M9 23h18"/>',
      'ar':'<path d="M2 10h32v14H22l-4-5-4 5H2zM7 14h5m12 0h5M2 10l3-5m29 5-3-5"/>',
      'chart':'<path d="M4 3v29h29M10 26v-8m9 8V9m9 17V4"/>',
      'clock':'<circle cx="18" cy="18" r="15"/><path d="M18 8v11l7 5"/>',
    }
    return f'<g transform="translate({x} {y}) scale({size/36})" fill="none" stroke="{color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">{shapes.get(name,shapes["cube"])}</g>'

def arrow(points,color=SKY,sw=2.4,dash=None):
    return path(points,stroke=color,sw=sw,marker_end='url(#arrow)',**({'stroke_dasharray':dash} if dash else {}))

def image(pathname,x,y,w,h,fit='xMidYMid meet',opacity=1):
    p=Path(pathname);suffix=p.suffix.lower();mime={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}.get(suffix,'image/jpeg')
    data=base64.b64encode(p.read_bytes()).decode()
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="{fit}" opacity="{opacity}" href="data:{mime};base64,{data}"/>'

def figure(pathname,x,y,w,h,ident,chart=False,table=False):
    root=ET.parse(pathname).getroot()
    root.set('x',str(x));root.set('y',str(y));root.set('width',str(w));root.set('height',str(h));root.set('id',ident)
    for e in root.iter():
        if e.tag.endswith('style') and e.text:
            css=e.text
            if chart:
                css=css.replace('font-size:16px','font-size:22px').replace('font-size:15px','font-size:22px')
            if table:css=css.replace('font-size:18px','font-size:21px')
            e.text=re.sub(r'([^{}]+)\{',lambda m:','.join('#'+ident+' '+s.strip() for s in m.group(1).split(','))+'{',css)
        if chart and e.tag.endswith('text') and e.get('class')=='axis-label':
            val=e.text or '';e.text=None
            if val=='任务与现场状态判断':e.set('x','114')
            labels={'任务与现场状态判断':['任务与现场','状态判断'],'下一动作正确性':['下一动作','正确性'],'关键动作覆盖':['关键动作','覆盖'],'顺序与依赖':['顺序与','依赖'],'验证与状态推进闭环':['验证与状态','推进闭环'],'下一动作成功率':['下一动作','成功率']}
            for i,v in enumerate(labels.get(val,[val])):
                sp=ET.SubElement(e,'{'+NS+'}tspan',{'x':e.get('x'),'y':str(365+i*26)});sp.text=v
        if table and e.tag.endswith('text'):
            # Give the complete model identifier enough room; values are unchanged.
            positions={'272':'336','401':'498','570':'659','734':'821','893':'982','1068':'1143','1249':'1304','1466':'1474'}
            if e.get('x') in positions:e.set('x',positions[e.get('x')])
    if chart:root.set('viewBox','20 10 860 410')
    return ET.tostring(root,encoding='unicode')

def footer(page,source='',dark=False):
    c='#91B4CC' if dark else MUTED
    return line(64,851,1536,851,'#315775' if dark else LINE,1)+text(64,879,'PSOP · 设备任务与服务',16,c,600)+text(304,879,source,16,c,width=1120,max_lines=1)+text(1536,879,f'{page:02d} / 16',17,c,600,anchor='end')

def header(page,title,subtitle,kicker='设备任务 · 能力运营',dark=False):
    c='white' if dark else NAVY
    return text(64,48,'PSOP  /  '+kicker,17,CYAN if dark else SKY,700,letter_spacing=1)+text(64,119,title,48,c,700,width=1460,max_lines=1)+text(64,168,subtitle,23,'#B9D3E6' if dark else MUTED,width=1472,max_lines=1)

def takeaway(value,fill=NAVY,color='white',y=792):
    return rect(64,y,1472,46,fill,r=9)+text(800,y+31,value,23,color,600,anchor='middle')

DEFS='''<defs>
 <linearGradient id="metal" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#F7FBFD"/><stop offset=".42" stop-color="#B7CCD8"/><stop offset="1" stop-color="#E4EDF2"/></linearGradient>
 <linearGradient id="metalDark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7895A8"/><stop offset="1" stop-color="#B7CBD7"/></linearGradient>
 <linearGradient id="viewport" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#EDF4F8"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
 <linearGradient id="darkBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#123B5D"/><stop offset="1" stop-color="#09243C"/></linearGradient>
 <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="context-stroke" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>'''

def page_svg(page,title,subtitle,blocks,source='',kicker='设备任务 · 能力运营',dark=False):
    base=rect(0,0,1600,900,'url(#darkBg)' if dark else BG,r=0)
    if not dark:base+=path('M1180 0H1600V214C1420 226 1280 169 1180 0Z',fill='#E4F2FA',stroke='none',sw=0)
    base+=footer(page,source,dark)
    return f'<svg xmlns="{NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="svgTitle svgDesc" style="font-family:{FONT}"><title id="svgTitle">{escape(title)}</title><desc id="svgDesc">{escape(subtitle)}</desc>'+DEFS+group('base',base)+group('title',header(page,title,subtitle,kicker,dark))+''.join(group(f'beat_{i+1:02d}',b) for i,b in enumerate(blocks))+'</svg>'

def part(x,y,scale=1,exploded=False,selected=True,axes=True):
    """Editable generic equipment bracket; illustrative geometry only."""
    a=ellipse(328,337,248,27,'#D9E5EC')
    a+=poly([(49,224),(406,123),(583,222),(215,334)],'url(#metal)','#7895A8')
    a+=poly([(49,224),(215,334),(215,351),(49,243)],'#9BB3C2','#7895A8')
    a+=poly([(215,334),(583,222),(583,240),(215,351)],'#7895A8','#65879E')
    a+=poly([(97,208),(106,65),(448,8),(450,134)],'url(#metal)','#7895A8',2.5)
    a+=poly([(97,208),(106,65),(92,62),(82,203)],'#90A8B7','#7895A8')
    for cx,cy,rx,ry in [(162,129,33,46),(258,106,38,49),(365,79,35,44)]:
        a+=ellipse(cx,cy,rx,ry,'#CBDDE8','#688CA3',2.5)
        a+=path(f'M{cx-rx+6} {cy+ry-10}Q{cx-rx-1} {cy-ry+4} {cx+rx-9} {cy-ry+4}',stroke='#F3FAFE',sw=4)
    for px,py in [(143,212),(246,182),(359,154),(457,182)]:
        a+=poly([(px,py),(px+9,py-86),(px+62,py+36)],'#C6D6E0','#829EAF')
        a+=poly([(px+9,py-86),(px+18,py-89),(px+70,py+32),(px+62,py+36)],'#8FA9BA','#7895A8')
    for bx,by in [(91,245),(181,302),(283,294),(387,264),(496,232),(402,146)]:
        a+=ellipse(bx,by,12,7,'#7898AD','#5C8099')+ellipse(bx,by-2,7,4,'#D7E7F0','#7898AD')
    # A replaceable connecting plate, plus visible mounting points.
    shift=-80 if exploded is True else (-float(exploded) if exploded else 0)
    a+=poly([(329,239+shift),(417,214+shift),(466,243+shift),(374,271+shift)],'#BDDFF0' if selected else '#CDDCE5',SKY if selected else '#7895A8',3)
    for bx,by in [(355,242),(413,228),(435,244),(380,259)]:
        a+=ellipse(bx,by+shift,8,5,'#547E97',SKY if selected else '#658399',1.4)
        if exploded:a+=line(bx,by+shift+7,bx,by,'#86AFC5',1.5,'4 5')
    if selected:
        a+=path('M325 234 417 207 475 244 374 278Z',stroke=CYAN,sw=2,stroke_dasharray='6 5')
        a+=circle(417,214+shift,13,'none',AMBER,2.5)
    if axes:
        a+=arrow('M55 333h47',CORAL,2)+arrow('M55 333v-48',TEAL,2)+arrow('M55 333l-24 19',SKY,2)
        a+=text(107,339,'X',16,CORAL)+text(51,278,'Z',16,TEAL)+text(14,367,'Y',16,SKY)
    return f'<g transform="translate({x} {y}) scale({scale})">{a}</g>'

def app_shell(x=64,y=208,w=1472,h=577,stage='build',tabs=None):
    a=rect(x,y,w,h,'white',LINE,r=14)+rect(x,y,w,54,NAVY,r=14)+rect(x,y+28,w,26,NAVY,r=0)
    a+=icon('network',x+18,y+13,28,CYAN)+text(x+58,y+35,'PSOP',22,'white',700)
    positions=[x+246,x+373,x+513]
    for pos,label in zip(positions,['build','compile','simulate']):
        if label==stage:a+=rect(pos-16,y+9,118,36,'#285371',r=7)
        a+=text(pos,y+34,label,20,'white' if label==stage else '#A8C3D6',700 if label==stage else 400)
    a+=tag(x+w-149,y+11,'原型设计',CYAN,'#244D6C',17,127)
    a+=text(x+22,y+85,'MD-01  /  Microduck 舵机识别与复检  /  Rev.A',18,MUTED,600)
    if tabs:
        tx=x+690
        for tab in tabs:
            a+=text(tx,y+85,tab,18,PURPLE if tab=='任务图' else MUTED,600);tx+=120
    a+=line(x,y+104,x+w,y+104,LINE,1)
    return a

def matrix(x,y,widths,headers,rows,rowh=70,head_h=48,font_size=22,emphasize=None):
    w=sum(widths);h=head_h+len(rows)*rowh
    a=rect(x,y,w,h,'white',LINE,r=14)
    a+=rect(x,y,w,head_h,NAVY,r=14)+rect(x,y+head_h-14,w,14,NAVY,r=0)
    pos=x
    for cw,lab in zip(widths,headers):
        a+=text(pos+20,y+32,lab,20,'white',600,width=cw-36,max_lines=1);pos+=cw
    for i,row in enumerate(rows):
        yy=y+head_h+i*rowh
        if emphasize is not None and i in emphasize:a+=rect(x+1,yy,w-2,rowh,'#E4F3F8',r=0)
        elif i%2:a+=rect(x+1,yy,w-2,rowh,'#F5F9FB',r=0)
        if i:a+=line(x,yy,x+w,yy,LINE,1)
        pos=x
        for j,(cw,cell) in enumerate(zip(widths,row)):
            lines=wrap(cell,cw-38,font_size,j==0)
            y0=yy+(rowh-len(lines)*font_size*1.3)/2+font_size
            a+=text(pos+20,y0,'\n'.join(lines),font_size,NAVY if j==0 else INK,600 if j==0 else 400,leading=font_size*1.3)
            pos+=cw
    return a
