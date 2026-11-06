from svg_lib import *
import json

CURRENT_ASSETS=ASSETS/'generated/microduck'
PROTOTYPES=ROOT/'prototypes'

def photo(name,x,y,w,h,r=12,fit='xMidYMid slice'):
    p=Path(name) if isinstance(name,Path) else CURRENT_ASSETS/name
    ident=re.sub('[^a-zA-Z0-9_-]','_',f'clip_{p.stem}_{x}_{y}_{w}_{h}')
    return f'<defs><clipPath id="{ident}">'+rect(x,y,w,h,'white',r=r)+'</clipPath></defs>'+f'<g clip-path="url(#{ident})">'+image(p,x,y,w,h,fit=fit)+'</g>'

def screen(name,x=64,y=202,w=1472):
    h=w*720/1680
    return rect(x-1,y-1,w+2,h+2,'white','#B8CDDE',r=10)+photo('ui-'+name+'.png',x,y,w,h,r=9,fit='xMidYMid meet')

def native_cpn(x=64,y=202,w=1472):
    checks=json.loads((CURRENT_ASSETS/'prototype-render-checks.json').read_text(encoding='utf-8'))
    box=next(p['cpn'] for p in checks if p['prototype']=='compile')
    scale=w/1680
    root=ET.parse(PROTOTYPES/'eg-cpn.svg').getroot()
    root.set('x',str(x+box['x']*scale));root.set('y',str(y+box['y']*scale))
    root.set('width',str(box['width']*scale));root.set('height',str(box['height']*scale))
    return ET.tostring(root,encoding='unicode')

def pin(x,y,n='1',color=SKY,r=16):
    return circle(x,y,r,color,'white',2)+text(x,y+6,n,18,'white',700,anchor='middle')

def custom_page(title,description,blocks,extra_defs=''):
    return f'<svg xmlns="{NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="svgTitle svgDesc" style="font-family:{FONT}"><title id="svgTitle">{escape(title)}</title><desc id="svgDesc">{escape(description)}</desc>'+DEFS+extra_defs+''.join(group('base' if i==0 else 'title' if i==1 else f'beat_{i-1:02d}',b) for i,b in enumerate(blocks))+'</svg>'
