import json,html
from pathlib import Path
root=Path(__file__).resolve().parent
d=json.loads((root/'plan-data.json').read_text());S=4;OX=1490;OY=1350
X=lambda x:OX+x*S;Y=lambda z:OY+z*S
out=[]
def a(s):out.append(s)
def text(x,y,t,size=20,color='#27463f',weight=400,anchor='start',extra=''):
 a(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{html.escape(t)}</text>')
def path(poly):return 'M'+' L'.join(f'{X(x):.2f},{Y(z):.2f}' for x,z in poly)+' Z'
def poly(p,fill,stroke='none',w=1,extra=''):a(f'<path d="{path(p)}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>')
def rect(x,z,w,h,fill,stroke='none',sw=1,rad=0):a(f'<rect x="{X(x)}" y="{Y(z)}" width="{w*S}" height="{h*S}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" rx="{rad*S}"/>')
def label(x,z,num,t,small=None):
 xx,yy=X(x),Y(z);n=len(t)*18+60
 a(f'<rect x="{xx-n/2}" y="{yy-24}" width="{n}" height="{64 if small else 46}" fill="#fffdf7" opacity=".96" rx="9" stroke="#d1c9b9"/>')
 a(f'<circle cx="{xx-n/2+23}" cy="{yy-1}" r="15" fill="#24483e"/>');text(xx-n/2+23,yy+5,num,14,'white',700,'middle');text(xx-n/2+48,yy+5,t,18,weight=600)
 if small:text(xx,yy+28,small,14,'#66746a',400,'middle')
a('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1480" viewBox="0 0 1920 1480"><defs><pattern id="parking" width="25" height="20" patternUnits="userSpaceOnUse"><path d="M2 2V18H22V2" fill="none" stroke="#c7cdc8" stroke-width="1"/></pattern><pattern id="glass" width="13" height="13" patternUnits="userSpaceOnUse"><rect width="13" height="13" fill="#c4d6d0"/><path d="M0 0H13V13" fill="none" stroke="white" stroke-width="1"/></pattern><filter id="shadow"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#1c3528" flood-opacity=".12"/></filter></defs>')
a('<rect width="1920" height="1480" fill="#f5f2e9"/>')
text(80,70,'YUNLAN  /  PHASE 01',19,'#7c826f',600,extra='letter-spacing="4"')
text(80,137,'云澜汇 · 立体艺术街区',52,weight=650)
text(80,183,'一期原地块内扩建概念 A    /    先审总图与体量，再进入游戏建模',23,'#687568')
for x,n,t in [(80,'6F + 7F','主商场 / 局部文化馆'),(455,'2–4F','开放街区'),(795,'约 6,100 ㎡','拟新增地面占用'),(1160,'47% → 57%','模型地面覆盖率')]:
 text(x,245,n,33,weight=600);text(x,275,t,17,'#7a8276')
a('<path d="M80 298H1840" stroke="#d9d7ca"/>')
rect(-350,-250,49,217,'url(#parking)','#d8ddd5',1,2)
text(188,805,'西侧停车场',21,'#809181',500,'middle');text(188,835,'保留 / 图示局部',16,'#809181',400,'middle')
# Context roads.
a('<defs><clipPath id="contextClip"><rect x="80" y="302" width="1430" height="1050"/></clipPath></defs><g clip-path="url(#contextClip)">')
for r in d['roads']:
 poly(r['poly'],'#d7dcd7')
 if r['id']=='ring-n':a(f'<path d="M{X(-350)} {Y(-262)}H{X(0)}" stroke="#fff" stroke-width="2" stroke-dasharray="16 13"/>')
 if r['id']=='ring-w':a(f'<path d="M{X(-292)} {Y(-268)}V{Y(-14)}" stroke="#fff" stroke-width="2" stroke-dasharray="16 13"/>')
a('</g>')
rect(-286,-256,270,236,'#e3e8dc')
# A continuous reserved ground edge.
rect(-284,-254,266,232,'none','#eff0e8',19,4)
# Existing mall / towers, exact source geometry.
for b in d['buildings']:
 for p in b['footprints']:poly(p[0], '#d7c5a4' if b['id']=='P1' else '#849c9c','#fffdf7',3,'filter="url(#shadow)"')
# Proposed infill.
for z in d['zones']:
 if z['type']!='infill':continue
 for p in z['polys']:poly(p,z['color'],'#fffdf7',3,'filter="url(#shadow)"')
# Source garage street ramps.
for r in d['ramps']:poly(r['poly'],'#a8b3bb','#637786',1)
# Existing P1 source boundary.
rect(-286,-256,270,236,'none','#c55f43',3,0)
a(f'<path d="M{X(-286)} {Y(-256)}H{X(-16)}V{Y(-20)}H{X(-286)}Z" fill="none" stroke="#fff8ef" stroke-width="1" stroke-dasharray="9 7"/>')
# Concept skylights and rooftop courtyards.
rect(-246,-220,52,33,'url(#glass)','#ffffff',3,11)
a(f'<circle cx="{X(-106)}" cy="{Y(-106)}" r="{20*S}" fill="url(#glass)" stroke="#fffdf7" stroke-width="5"/>')
# Rooftop garden belt schematic.
for x,z,w,h in [(-275,-234,108,4),(-275,-226,5,54),(-272,-171,65,4),(-149,-242,27,4),(-178,-52,37,4),(-56,-160,22,4)]:rect(x,z,w,h,'#6d8f71',rad=2)
# Elevated walking loop. Schematic, no floor geometry claims.
pts=[(-220,-200),(-159,-200),(-130,-225),(-88,-176),(-106,-106),(-174,-87),(-224,-127),(-220,-167),(-220,-200)]
a('<polyline points="'+' '.join(f'{X(x)},{Y(z)}' for x,z in pts)+'" fill="none" stroke="#fff9eb" stroke-width="14" stroke-linejoin="round"/>')
a('<polyline points="'+' '.join(f'{X(x)},{Y(z)}' for x,z in pts)+'" fill="none" stroke="#b88637" stroke-width="5" stroke-dasharray="11 8" stroke-linejoin="round"/>')
# Ground clear arrival axes.
for pts in [[(-114.75,-73.34),(-122,-48),(-122,-23)],[(-73.34,-114.75),(-61,-120),(-24,-120)],[(-220,-160),(-220,-154),(-208,-154),(-208,-25)]]:
 a('<polyline points="'+' '.join(f'{X(x)},{Y(z)}' for x,z in pts)+'" fill="none" stroke="#f7f6ee" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>')
# Sunken arts plaza is concept landscape, not net added footprint.
rect(-113,-52,23,18,'#c4d5c5','#f5f1e5',2,8)
for r in [7,10,13]:a(f'<path d="M{X(-105)-r*2} {Y(-43)-r} Q{X(-102)} {Y(-43)+r*2} {X(-98)+r*2} {Y(-43)-r}" fill="none" stroke="#f6f4ed" stroke-width="2"/>')
# Entrance pads, coloured for retained public access.
for e in d['entrances']:
 s=e['seg'];xx=(s['x0']+s['x1'])/2;zz=(s['z0']+s['z1'])/2
 a(f'<circle cx="{X(xx)}" cy="{Y(zz)}" r="6" fill="#24483e" stroke="#fff" stroke-width="2"/>')
# Labels.
label(-220,-191,'01','主商场','方庭与 Y 形主骨架 · 6F')
label(-129,-229,'02','文化馆','退台 + 局部 7F')
label(-158,-42,'03','弧形餐饮街','2–3F / 屋顶外摆')
label(-42,-143,'04','花园商业','3–4F')
label(-238,-128,'05','创意里巷','2–3F / 庭院街区')
label(-106,-106,'06','艺术中庭','采光穹顶 / 立体展廊')
label(-247,-80,'H','既有酒店','20F · 位置保留')
label(-35,-214,'A','既有公寓','20F · 位置保留')
text(X(-88),Y(-55),'主入口广场',18,'#63765f',600,'middle')
text(X(-103),Y(-30),'下沉艺术庭院',15,'#63765f',400,'middle')
text(X(-148),Y(-261),'北外环',16,'#78847c',500,'middle')
text(X(-150),Y(-7),'云 澜 大 道',23,'#738078',600,'middle')
text(X(-3),Y(-153),'星湾路',17,'#738078',500,'middle',extra=f'transform="rotate(90 {X(-3)} {Y(-153)})"')
text(1550,362,'规划动作',28,weight=650)
items=[('01  主体增高','3 层增至 6 层；上层退台','方庭、圆厅、Y 形动线保留'),('02  艺文锚点','北侧阅读花园部分转文化馆','艺术展、书店、剧场、餐厅'),('03  城市餐饮界面','把南侧闲置草地转为弧形街','沿街餐饮、外摆与屋顶花园'),('04  东侧填补空地','圆角商业组团 + 二层连廊','东门行人轴仍从中间穿过'),('05  酒店旁的里巷','高低错落的创意小楼','买手店、工坊、轻餐与小院'),('06  可记住的中心','圆厅升级为艺术采光中庭','扶梯可见，能一路逛到屋顶')]
for i,(h,t1,t2) in enumerate(items):
 y=415+i*115;text(1550,y,h,21,weight=650);text(1550,y+31,t1,17,'#66766b');text(1550,y+56,t2,17,'#66766b')
a('<path d="M1550 1122H1840" stroke="#d4d7c9"/>')
for yy,c,t in [(1160,'#c55f43','一期原圈地边界'),(1198,'#b88637','二层闭环动线（概念）'),(1236,'#637786','既有地下车行坡道'),(1274,'#24483e','既有地面入口 / 出口')]:
 a(f'<rect x="1550" y="{yy-13}" width="23" height="14" rx="3" fill="{c}"/>');text(1586,yy,t,17,'#66766b')
# North and scale.
a('<path d="M1412 315V264M1412 263L1404 278M1412 263L1420 278" fill="none" stroke="#284c42" stroke-width="3"/>');text(1412,251,'N',18,weight=700,anchor='middle')
a('<path d="M90 1284H290M90 1278V1290M190 1278V1290M290 1278V1290" stroke="#5d7468" stroke-width="3"/>');text(90,1311,'0',15,'#66766b');text(190,1311,'25',15,'#66766b',anchor='middle');text(290,1311,'50 m',15,'#66766b',anchor='end')
a('<path d="M80 1375H1840" stroke="#d9d7ca"/>')
text(80,1412,'基于当前游戏坐标绘制。新增量、层数和连廊为方案建议；面积按首层外轮廓估算，非建筑施工面积。',19,'#6b786d')
text(80,1443,'保留：一期边界、酒店/公寓、西侧停车场、地库坡道、入口通道。绿化集中到庭院、退台和屋顶。',19,'#6b786d')
text(1840,1443,'CONCEPT A · 2026.10.28',16,'#889080',500,'end')
a('</svg>')
(root/'masterplan.svg').write_text('\n'.join(out))
(root/'masterplan.html').write_text('<!doctype html><html><meta charset="utf-8"><title>云澜汇一期扩建概念 A</title><style>html,body{margin:0;background:#f5f2e9}svg{display:block;font-family:"PingFang SC","Helvetica Neue",sans-serif}</style>'+ '\n'.join(out)+'</html>')
