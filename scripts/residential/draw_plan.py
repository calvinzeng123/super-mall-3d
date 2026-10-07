"""Draw a Chinese-labelled plan from an evaluated Blender mesh audit.

python3 draw_plan.py --audit OUTPUT/actual-mesh-audit.json --out OUTPUT
Produces SVG and, when Pillow plus a Chinese font are available, a matching PNG.
Furniture and wall outlines come from the saved .blend audit, not JSON boxes.
"""
import argparse
import html
import json
import math
from pathlib import Path


class Canvas:
    def __init__(self, width=1600, height=1450):
        self.width, self.height = width, height
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">']
        self.image = self.draw = self.fontpath = None
        try:
            from PIL import Image, ImageDraw, ImageFont
            self.ImageFont = ImageFont
            self.image = Image.new('RGB', (width*2, height*2), '#f8f5ee')
            self.draw = ImageDraw.Draw(self.image)
            self.fontpath = next(p for p in (Path('/System/Library/Fonts/Hiragino Sans GB.ttc'), Path('/System/Library/Fonts/STHeiti Medium.ttc'), Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')) if p.exists())
        except (ImportError, StopIteration):
            self.image = self.draw = None
        self.rect((0, 0, width, height), '#f8f5ee')

    def rect(self, bounds, fill, stroke=None, width=1):
        x0,y0,x1,y1 = bounds
        self.svg.append(f'<rect x="{x0:.2f}" y="{y0:.2f}" width="{x1-x0:.2f}" height="{y1-y0:.2f}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{width}"/>')
        if self.draw:
            self.draw.rectangle(tuple(round(n*2) for n in bounds), fill=fill, outline=stroke, width=max(1,round(width*2)))

    def polygon(self, points, fill, stroke=None, width=.7):
        if len(points)<3:return
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in points)
        self.svg.append(f'<polygon points="{coords}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{width}" stroke-linejoin="round"/>')
        if self.draw:
            poly=[(round(x*2),round(y*2)) for x,y in points]
            self.draw.polygon(poly, fill=fill)
            if stroke:self.draw.line(poly+[poly[0]], fill=stroke, width=max(1,round(width*2)), joint='curve')

    def line(self, points, color, width=1, dashed=False):
        coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in points)
        dash=' stroke-dasharray="4 4"' if dashed else ''
        self.svg.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="{width}"{dash} stroke-linejoin="round"/>')
        if self.draw:
            points=[(x*2,y*2) for x,y in points]
            if not dashed:self.draw.line(points, fill=color, width=max(1,round(width*2)), joint='curve')
            else:
                for a,b in zip(points,points[1:]):
                    length=math.dist(a,b)
                    for s in range(0,int(length)+1,16):
                        lo=min(s/max(length,1e-6),1);hi=min((s+8)/max(length,1e-6),1)
                        self.draw.line([(a[0]+(b[0]-a[0])*lo,a[1]+(b[1]-a[1])*lo),(a[0]+(b[0]-a[0])*hi,a[1]+(b[1]-a[1])*hi)],fill=color,width=max(1,round(width*2)))

    def text(self, xy, value, size=18, color='#302e29', anchor='start', weight='normal'):
        x,y=xy
        self.svg.append(f'<text x="{x:.2f}" y="{y:.2f}" font-family="Hiragino Sans GB, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" dominant-baseline="middle" fill="{color}">{html.escape(value)}</text>')
        if self.draw:
            font=self.ImageFont.truetype(str(self.fontpath),size*2)
            box=self.draw.textbbox((0,0),value,font=font)
            width=box[2]-box[0]; height=box[3]-box[1]
            xx=x*2-(width/2 if anchor=='middle' else width if anchor=='end' else 0)
            self.draw.text((round(xx),round(y*2-height/2-box[1])),value,font=font,fill=color)

    def save(self, path):
        path.with_suffix('.svg').write_text('\n'.join(self.svg+['</svg>']))
        if self.image:
            from PIL import Image
            self.image.resize((self.width,self.height),Image.Resampling.LANCZOS).save(path.with_suffix('.png'))


def main(args):
    plan=json.loads(args.plan.read_text()); audit=json.loads(args.audit.read_text())
    canvas=Canvas(); scale=70; left=184; top=184
    def pt(p):return(left+p[0]*scale,top+(11.5-p[1])*scale)
    def rectangle(r):
        a,b=pt((r[0],r[3])),pt((r[2],r[1]));return(*a,*b)
    canvas.text((96,67),'云澜汇  /  住宅样板',17,'#77766c')
    canvas.text((96,111),'03 · 四房两厅',38,weight='bold')
    canvas.text((1504,74),'含墙平面 202.40 ㎡',21,anchor='end')
    canvas.text((1504,111),'独立阳台 49.28 ㎡',19,'#65766b',anchor='end')
    colors={'bedroom':'#ede5d7','bathroom':'#dce9e4','utility':'#dce9e4','kitchen':'#e4e5d8','living':'#eee8dc','dining':'#eee8dc','entry':'#eee8dc','circulation':'#f2ede3'}
    canvas.rect(rectangle(plan['balcony']['rect']),'#dde4d3')
    for room in plan['rooms']:
        for rect in room['floor_rects']:canvas.rect(rectangle(rect),colors[room['type']])

    # Individual evaluated mesh silhouettes preserve actual cabinet/chair placement.
    inventory=audit['mesh_inventory']
    for record in sorted(inventory,key=lambda r:r['bounds'][1][2]):
        if not record['footprint'] or record['role']!='furniture' or not record['obstacle']:continue
        name=record['name'].lower()
        if 'glass' in name:fill,stroke='#cadecf','#92a99f'
        elif any(w in name for w in ['mattress','duvet','pillow','bed 床','upholstered','cushion','sofa 沙发']):fill,stroke='#f9f6ed','#bdb39f'
        elif any(w in name for w in ['toilet','basin','washer','laundry machine']):fill,stroke='#f3f5ef','#adb9ad'
        elif any(w in name for w in ['leaf','foliage','plant']):fill,stroke='#9caa82','#788763'
        else:fill,stroke='#d3bfa2','#b5a28b'
        canvas.polygon([pt(p) for p in record['footprint']],fill,stroke,.5)
    for record in inventory:
        if record['role']=='wall' and record['footprint']:
            canvas.polygon([pt(p) for p in record['footprint']],'#554e44')
        elif record['name'].startswith(('Door open ','Balcony safety glass','Balcony railing post','Glass parked balcony panel','Balcony slider stile')) and record['footprint']:
            canvas.polygon([pt(p) for p in record['footprint']],'#b9a180','#6b655b',.5)
    # Symbols describe openings defined in the same plan used by the model builder.
    for wall in plan['walls']:
        a,b=wall['a'],wall['b'];length=math.dist(a,b);u=[(b[i]-a[i])/length for i in (0,1)]
        for op in wall['openings']:
            center=[a[i]+u[i]*op['at'] for i in (0,1)]
            endpoints=[[center[i]+sgn*u[i]*op['width']/2 for i in (0,1)] for sgn in (-1,1)]
            if op['type']=='window':
                canvas.line([pt(p) for p in endpoints],'#5f968f',3)
                for off in (-.045,.045):
                    canvas.line([pt((p[0]-u[1]*off,p[1]+u[0]*off)) for p in endpoints],'#d8ede6',1)
            elif op.get('open_leaf'):
                hinge,opened=op['open_leaf'];closed=max(endpoints,key=lambda p:math.dist(p,hinge))
                theta=math.atan2(closed[1]-hinge[1],closed[0]-hinge[0]);end=math.atan2(opened[1]-hinge[1],opened[0]-hinge[0]);delta=(end-theta+math.pi)%(2*math.pi)-math.pi
                radius=math.dist(hinge,opened)
                arc=[pt((hinge[0]+radius*math.cos(theta+delta*i/18),hinge[1]+radius*math.sin(theta+delta*i/18))) for i in range(19)]
                canvas.line(arc,'#a4957f',.8,True)
    if args.routes:
        route=next(r for r in audit['actual_navigation'] if r['target']=='balcony')
        if route['reachable']:canvas.line([pt(p) for p in route['points']],'#397f70',2,True)

    labels={
        'bed_primary':(2.35,1.03),'bath_primary':(4.53,4.38),'living':(9.1,.70),
        'bed_guest':(16.05,.66),'bath_guest':(16.55,4.38),'bed_northwest':(2.30,10.86),
        'bed_northeast':(15.60,10.86),'kitchen':(6.25,9.04),'dining':(10.65,5.72),
        'foyer':(8.69,10.62),'bath_common':(11.10,10.32),'laundry':(13.12,9.76),
        'gallery_west':(3.65,6.20),'gallery_east':(15.76,6.2)}
    for room in plan['rooms']:
        x,y=pt(labels[room['id']]); title=room['name'].replace('侧家庭厅廊','侧厅廊').replace('南次卧套卫','套卫').replace('独立洗衣房','洗衣房')
        # Quiet paper labels stay readable over small furniture mesh details.
        width=max(66,len(title)*19+14)
        canvas.rect((x-width/2,y-15,x+width/2,y+30),'#f8f5ee')
        canvas.text((x,y),title,18,anchor='middle')
        canvas.text((x,y+22),f"{room['zone_area_m2']:.2f} ㎡",13,'#7a776c',anchor='middle')
    x,y=pt((8.8,-1.85));canvas.rect((x-165,y-20,x+165,y+27),'#edf0e3')
    canvas.text((x,y-2),'南向通长阳台 · 49.28 ㎡',20,'#4e624c',anchor='middle')
    x,y=pt((8.55,11.90));canvas.text((x,y),'入户',17,'#77684f',anchor='middle')

    # Dimensions refer to the external footprint, with balcony shown separately.
    def dimension(a,b,label,labelpos):
        aa,bb=pt(a),pt(b);canvas.line([aa,bb],'#958d7d',1)
        for p in (aa,bb):canvas.line([(p[0]-5,p[1]+5),(p[0]+5,p[1]-5)],'#958d7d',1)
        canvas.text(pt(labelpos),label,16,'#746d60',anchor='middle')
    dimension((0,12.10),(17.6,12.10),'17.60 m',(8.8,12.31))
    dimension((-.65,0),(-.65,11.5),'11.50 m',(-1.16,5.75))
    dimension((-.65,-2.8),(-.65,0),'2.80 m',(-1.14,-1.4))
    nx,ny=1490,200;canvas.text((nx,ny-48),'北',20,anchor='middle')
    canvas.line([(nx,ny+45),(nx,ny-15)],'#535e52',2)
    canvas.polygon([(nx,ny-27),(nx-9,ny-4),(nx+9,ny-4)],'#535e52')
    canvas.text((nx,ny+69),'N',16,'#717967',anchor='middle')

    canvas.line([(96,1255),(1504,1255)],'#d7d0c2',1)
    legend=[('#ede5d7','卧室'),('#eee8dc','公共空间'),('#dce9e4','卫浴 / 家务'),('#dde4d3','阳台'),('#5f968f','外窗')]
    for i,(color,label) in enumerate(legend):
        x=100+i*183;canvas.rect((x,1282,x+20,1298),color,'#c4c2b4',.5);canvas.text((x+30,1290),label,16,'#66675d')
    # 0–5m scale remains valid in both exported formats at this fixed canvas size.
    sx,sy=1110,1281
    for i in range(5):canvas.rect((sx+i*scale,sy,sx+(i+1)*scale,sy+8),'#63675d' if i%2==0 else '#f8f5ee','#63675d',.7)
    for i in (0,1,5):canvas.text((sx+i*scale,sy+25),str(i)+' m' if i==5 else str(i),12,'#66675d',anchor='middle')
    canvas.text((96,1348),'家具及墙体轮廓取自保存后的 Blender 实际网格；门窗符号来自建模平面。',16,'#6b6e63')
    canvas.text((96,1380),'标注面积为含墙平面分区，非净使用面积。独立住宅原型，尚未接入现有园区楼层。',16,'#6b6e63')
    args.out.mkdir(parents=True,exist_ok=True)
    path=args.out/'03四房两厅_中文平面图';canvas.save(path)
    print(path.with_suffix('.svg'))
    if canvas.image:print(path.with_suffix('.png'))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--plan',type=Path,default=Path(__file__).with_name('plan_03.json'))
    parser.add_argument('--routes',action='store_true')
    main(parser.parse_args())
