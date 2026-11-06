"""Build two standalone, static teaching SVGs (Python standard library only).

Concept/parts plan (Figure tier, not CAD or manufacturing evidence):
* Selection: four views of the same four-hole mounting plate and servo housing;
  mounting holes keep their identity, while rings show selection, not new holes.
* Spatial relations: shaft alignment benches; supported mounting faces; L-shaped
  and crossed guide rails. Bases, supports, caps and screws ground the geometry.

Only intended illustrative geometry is encoded. This is not a collision solver,
an assembly kernel, or a claim that the depicted fixtures exist in Microduck.
Run: python docs/architecture/figures/hardware-ontology/build.py
"""

from html import escape
from math import cos, sin, pi
from pathlib import Path


OUT = Path(__file__).resolve().parent
INK, MID, LOW, PAPER = "#26313a", "#71818d", "#b8c2c8", "#f8f9fa"


def text(x, y, value, size=24, weight=400, anchor="start", color=INK):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="{anchor}" fill="{color}">{escape(value)}</text>')


def line(x1, y1, x2, y2, color=MID, width=1.5, extra=""):
    return (f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
            f'stroke="{color}" stroke-width="{width}" {extra}/>')


def rect(x, y, w, h, fill, radius=0, stroke=LOW):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')


def circle(x, y, r, fill, stroke=INK, width=1.2):
    return (f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{width}"/>')


def poly(points, fill, stroke=MID, width=1.2):
    coords = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return f'<polygon points="{coords}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def group(x, y, body):
    return f'<g transform="translate({x} {y})">{body}</g>'


def screw(x, y, r=3):
    return circle(x, y, r, "#dbe1e5", MID) + line(x-r*.65, y, x+r*.65, y, MID, 1)


class Iso:
    """Orthographic axonometric drawing: z vertical, x/y receding equally."""
    def __init__(self, ox=185, oy=65, scale=1.5):
        self.ox, self.oy, self.s = ox, oy, scale

    def p(self, x, y, z):
        return self.ox + (x-y)*.866*self.s, self.oy + ((x+y)*.5-z)*self.s

    def box(self, x, y, z, w, d, h, tone="mid"):
        shades = {
            "lo": ("#dce2e6", "#9aa8b2", "#bdc7ce"),
            "mid": ("#eef1f3", "#8b9ba7", "#bac5cd"),
            "hi": ("#ffffff", "#acbac5", "#d4dde3"),
            "dark": ("#60727f", "#293944", "#425563"),
        }[tone]
        p = self.p
        top = [p(x,y,z+h), p(x+w,y,z+h), p(x+w,y+d,z+h), p(x,y+d,z+h)]
        # Opaque front faces, then top. Within one convex prism no hidden edges.
        a = [p(x+w,y,z), p(x+w,y+d,z), p(x+w,y+d,z+h), p(x+w,y,z+h)]
        b = [p(x,y+d,z), p(x+w,y+d,z), p(x+w,y+d,z+h), p(x,y+d,z+h)]
        return poly(a, shades[1]) + poly(b, shades[2]) + poly(top, shades[0])

    def path(self, points, **kwargs):
        pts = [self.p(*p) for p in points]
        return "".join(line(*a, *b, **kwargs) for a, b in zip(pts, pts[1:]))

    def ring(self, x, y, z, r, fill, stroke=INK, width=1.2):
        pts = [self.p(x+r*cos(t*2*pi/40), y+r*sin(t*2*pi/40), z) for t in range(40)]
        return poly(pts, fill, stroke, width)


def svg(name, title, description, height, body):
    doc = f'''<svg xmlns="http://www.w3.org/2000/svg" width="840" height="{height}" viewBox="0 0 840 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title>
<desc id="desc">{escape(description)}</desc>
<defs><linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aab8c4"/><stop offset=".3" stop-color="#fafcfd"/><stop offset=".65" stop-color="#cbd5dd"/><stop offset="1" stop-color="#7c8d9a"/></linearGradient></defs>
<g font-family="Noto Sans CJK SC, Noto Sans CJK JP, sans-serif" stroke-linejoin="round" stroke-linecap="round">
{rect(1,1,838,height-2,"#fff",16)}
{body}
</g></svg>
'''
    (OUT/name).write_text(doc, encoding="utf-8")


def selection_view(selected, second=()):
    # A plate in top/oblique view: two mounting flanges around a central housing.
    b = rect(60, 59, 270, 160, "#d5dde3", 15)
    b += rect(60, 51, 270, 160, "#f3f5f7", 15)
    b += rect(135, 86, 120, 99, "#97a8b5", 9)
    b += rect(135, 77, 120, 99, "#dce4e9", 9)
    b += rect(154, 89, 82, 65, "#edf1f4", 6)
    # Cap, output seat, assembly screws and the flange/housing seams.
    b += circle(195, 121, 21, "#93a3b0") + circle(195, 118, 17, "#f8fafb")
    b += circle(195, 118, 7, "#435766")
    for x in (145, 245):
        for y in (88, 164):
            b += screw(x,y,3)
    b += line(142,171,248,171,"#7a8d9a",1)
    holes = [(91,78),(299,78),(299,183),(91,183)]
    for i,(x,y) in enumerate(holes,1):
        if i in selected:
            b += circle(x,y,14,INK,INK) + circle(x,y,5,"#fff","#fff")
        elif i in second:
            b += circle(x,y,14,"#fff",INK,2.5) + circle(x,y,9,"#fff",INK,2.5)
        else:
            b += circle(x,y,10,"#fff",LOW,2) + circle(x,y,4,"#c5ced5",LOW)
        b += text(x, y+(54 if i in (3,4) else -24),f"H{i}",21,500,"middle")
    return b


def make_selection():
    body = text(26,43,"图 1  同一组孔，可以怎样选择？",30,700)
    body += text(26,77,"孔保持原身份；选择和占用随连接变化",23,color=MID)
    panels = [
        ("① 两孔选择", (1,2), (), "示例：H1、H2"),
        ("② 三孔选择", (1,2,3), (), "示例：H1、H2、H3"),
        ("③ 对角选择", (1,3), (), "示例：H1、H3"),
        ("④ 分给两个连接", (1,2), (3,4), "● C1：H1/H2  ◎ C2：H3/H4"),
    ]
    for i,(title,first,second,caption) in enumerate(panels):
        x,y = 20+(i%2)*410, 103+(i//2)*320
        p = rect(0,0,390,302,PAPER,10)
        p += text(18,35,title,26,600)
        p += group(0,8,selection_view(first,second))
        p += text(195,279,caption,22,500,"middle")
        body += group(x,y,p)
    body += text(26,765,"实心圈 / 双圈：选中；浅色圈：未选中。",23)
    body += text(26,800,"仅示意，非 Microduck 图纸；候选选孔不等于允许承载。",22,color=MID)
    svg("hole-selection.svg","四孔安装面的子集选择",
        "四个面板均为同一个合成四孔安装面。H1与H2为上排，H4与H3为下排。"
        "依次选上排两孔、三个孔、H1和H3对角孔；最后分为互不重叠的两组，给两个不同连接。"
        "没有给出实际产品尺寸或安装许可。",826,body)


def shaft_bench(offset=0):
    b = rect(30,185,330,16,"#9aaab6",5) + rect(30,180,330,15,"#dce4ea",5)
    for x in (43,337):
        b += rect(x,200,15,8,"#718490",2)
    for x in range(50,350,10):
        b += line(x,180,x,180+(8 if x%50==0 else 4),MID,1)
    for x,y in ((58,121),(223,121-offset)):
        b += rect(x+28,y+15,38,180-y-15,"#bdc9d2",3)
        b += rect(x+16,174,62,8,"#8d9fac",2)
        b += screw(x+23,178,2.5) + screw(x+70,178,2.5)
        # Shaft is supported below; cap and barrel are separate filled surfaces.
        b += f'<rect x="{x}" y="{y-14}" width="109" height="28" fill="url(#shaft)" stroke="{MID}"/>'
        b += f'<ellipse cx="{x}" cy="{y}" rx="5" ry="14" fill="#c5d0d8" stroke="{MID}"/>'
        b += f'<ellipse cx="{x+109}" cy="{y}" rx="5" ry="14" fill="#edf2f5" stroke="{MID}"/>'
        b += line(x+2,y,x+106,y,INK,1.3,'stroke-dasharray="5 5"')
        b += circle(x+109,y,2,INK)
    if not offset:
        b += line(167,121,223,121,INK,1.3,'stroke-dasharray="5 5"')
    else:
        b += line(167,121,212,121,INK,1.3,'stroke-dasharray="5 5"')
        b += line(182,121-offset,223,121-offset,INK,1.3,'stroke-dasharray="5 5"')
        b += line(194,121-offset,194,121,INK,1.7)
        b += line(188,121-offset,200,121-offset,INK,1.7) + line(188,121,200,121,INK,1.7)
    return b


def plane_bench(raised=False):
    p = Iso(154,72,1.28)
    b = p.box(-8,-7,0,169,83,7,"lo")
    # Back-to-front independent platforms. The supports meet the plate underside.
    for x,z in ((0,29),(85,54 if raised else 29)):
        b += p.box(x+7,7,7,56,56,z-13,"lo")
        b += p.box(x,0,z-6,70,70,6,"hi")
        b += p.path([(x+5,5,z+.2),(x+65,5,z+.2),(x+65,65,z+.2),(x+5,65,z+.2),(x+5,5,z+.2)],color=LOW,width=.8)
        for sx,sy in ((x+7,7),(x+63,7),(x+63,63),(x+7,63)):
            b += p.ring(sx,sy,z+.3,2,"#9aacba",MID,.8)
        origin,tip = p.p(x+35,35,z+.4),p.p(x+35,35,z+31)
        b += line(*origin,*tip,INK,2)
        b += poly([(tip[0],tip[1]-3),(tip[0]-4,tip[1]+6),(tip[0]+4,tip[1]+6)],INK,INK)
    return b


def direction_bench(skew=False):
    p = Iso(184,78,1.4)
    b = p.box(-5,-5,0,115,90,7,"lo")
    for x,y in ((0,0),(100,0),(100,75),(0,75)):
        b += p.ring(x,y,7.1,2,"#92a4b1",MID,.8)
    if skew:
        # Low x rail and high y bridge, with no physical intersection.
        b += p.box(42,0,7,16,12,39,"lo")
        b += p.box(0,32,7,100,12,11,"mid")
        b += p.path([(4,38,18.1),(96,38,18.1)],color=INK,width=2)
        b += p.box(42,68,7,16,12,39,"lo")
        b += p.box(42,0,46,16,80,7,"hi")
        b += p.path([(50,4,53.1),(50,76,53.1)],color=INK,width=2)
    else:
        # A physical L square. Two datum lines meet at the inside corner.
        b += p.box(4,7,7,96,14,11,"mid")
        b += p.box(86,21,7,14,55,11,"mid")
        b += p.path([(10,14,18.1),(93,14,18.1),(93,70,18.1)],color=INK,width=2)
        b += p.path([(81,14,18.2),(81,26,18.2),(93,26,18.2)],color=MID,width=1.3)
    return b


def make_spatial():
    body = text(26,43,"图 2  方向相同，不等于位置相同",30,700)
    body += text(26,77,"左列与右列对照：还差哪个条件？",23,color=MID)
    panels = [
        ("① 同轴",shaft_bench(),"方向平行，横向偏移为 0"),
        ("仅平行，不同轴",shaft_bench(32),"方向一样，但轴线错开"),
        ("② 共面",plane_bench(),"法向平行，安装面无错层"),
        ("仅平行，不共面",plane_bench(True),"法向一样，但安装面错层"),
        ("③ 方向正交且相交",direction_bench(),"两条基准线在同一面相交"),
        ("方向正交，但不相交",direction_bench(True),"空间方向成 90°，高度不同"),
    ]
    for i,(title,drawing,caption) in enumerate(panels):
        x,y = 20+(i%2)*410, 103+(i//2)*300
        p = rect(0,0,390,284,PAPER,10)
        p += text(16,35,title,25,600)
        p += group(0,10,drawing)
        p += text(195,260,caption,23,400,"middle")
        body += group(x,y,p)
    body += text(26,1032,"方向线 / 法向箭头为数学标记；图中角度按三维关系理解。",22)
    body += text(26,1068,"理想几何示意，非加工图；实际检查还要给出容差。",22,color=MID)
    svg("spatial-relations.svg","同轴、共面、平行和方向正交的机械示意",
        "六个对照面板。第一行两段轴：共轴与平行错开。第二行两个支撑的安装面：共面与平行错层。"
        "第三行定位导轨上的基准方向：同一面相交成直角，以及分处不同高度、方向正交但不相交。"
        "全部为无产品尺寸的教学图，不证明实机可装配。",1094,body)


if __name__ == "__main__":
    make_selection()
    make_spatial()
    print("Built hole-selection.svg and spatial-relations.svg (illustrations only).")
