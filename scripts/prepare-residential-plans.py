#!/usr/bin/env python3
"""Build runtime plans from the delivered models' measured body-band geometry.

Run: uv run --with shapely scripts/prepare-residential-plans.py
The generated JS has no Python or geometry-library runtime dependency.
"""
import hashlib
import json
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]


def point(p):
    return [round(p[0], 5), round(11.5 - p[1], 5)]


def rect(r):
    return dict(x0=r[0], z0=round(11.5-r[3], 5), x1=r[2], z1=round(11.5-r[1], 5))


def bounds(rs):
    return dict(x0=min(r['x0'] for r in rs), z0=min(r['z0'] for r in rs),
                x1=max(r['x1'] for r in rs), z1=max(r['z1'] for r in rs))


def ring(coords):
    return [point(p) for p in list(coords)[:-1]]


def source_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def create(unit):
    source = ROOT / 'scripts' / 'residential' / f'plan_{unit}.json'
    audit_path = ROOT / 'prototypes' / f'residential{unit}' / 'actual-mesh-audit.json'
    p, audit = json.loads(source.read_text()), json.loads(audit_path.read_text())
    records = [r for r in audit['mesh_inventory'] if r['obstacle'] and len(r['footprint']) >= 3]
    # Exact union removes overlapping bed/cabinet components and internal edges.
    # A 1mm topology-preserving simplification retains actual door and furniture gaps.
    merged = unary_union([Polygon(r['footprint']).buffer(0) for r in records]).simplify(.001, preserve_topology=True)
    polys = list(merged.geoms) if merged.geom_type == 'MultiPolygon' else [merged]
    obstacles = [dict(id=f'measured-solid-{i}', poly=ring(q.exterior.coords),
                      holes=[ring(h.coords) for h in q.interiors]) for i, q in enumerate(polys)]
    rooms = []
    for r in p['rooms']:
        rs = [rect(q) for q in r['floor_rects']]
        rooms.append(dict(id=r['id'], kind=r['type'], name=r['name'], rect=bounds(rs), rects=rs))
    balcony = rect(p['balcony']['rect'])
    rooms.append(dict(id='balcony', kind='balcony', name=p['balcony']['name'], rect=balcony, rects=[balcony]))
    partitions = []
    facade = []
    entry = None
    # The delivered bathroom module creates its own shower glass. In particular,
    # plan_03's old shower_screens were not built; do not publish those ghost doors.
    for w in p['walls']:
        a, b = point(w['a']), point(w['b'])
        length = ((b[0]-a[0])**2+(b[1]-a[1])**2)**.5
        openings = [o for o in w.get('openings', []) if o['type'] == 'door']
        # Metadata records clear openings; the measured polygons are collision truth.
        if openings:
            for o in openings:
                intervals = o.get('clear_intervals') or [[o['at']-o['width']/2, o['at']+o['width']/2]]
                for j, interval in enumerate(intervals):
                    lo, hi = interval
                    partitions.append(dict(id=f"{w['id']}/{o['id']}/{j}", a=a, b=b,
                                           door=dict(at=(lo+hi)/2, width=hi-lo), role=w['type']))
                if o['id'] == 'entry':
                    entry = dict(at=round(a[0]+(b[0]-a[0])*o['at']/length, 5), width=o['width'],
                                 inside=[round(a[0]+(b[0]-a[0])*o['at']/length, 5), .8])
        else:
            partitions.append(dict(id=w['id'], a=a, b=b, role=w['type']))
        facade.append(dict(id=w['id'], a=a, b=b, thickness=w['thickness'], height=w['top'],
                           type=w['type'], openings=w.get('openings', [])))
    inventory = {r['name']: r for r in audit['mesh_inventory']}
    for r in audit['mesh_inventory']:
        if not r['name'].startswith('Shower front fixed safety glass'):
            continue
        suffix = r['name'].removeprefix('Shower front fixed safety glass')
        side = inventory['Shower return safety glass' + suffix]
        lo, hi = r['bounds']; slo, shi = side['bounds']
        # All delivered modules have their access along X, including mirrored 02.
        start, end = (hi[0], slo[0]) if hi[0] < slo[0] else (shi[0], lo[0])
        front = (lo[1] + hi[1]) / 2
        width = round(end-start, 5)
        partitions.append(dict(id='actual-shower-access' + suffix,
                               a=point([start, front]), b=point([end, front]),
                               door=dict(at=width/2, width=width), role='measured-shower',
                               sourceMeshes=[r['name'], side['name']]))
    beds = []
    for f in p['furniture']:
        if f['type'] != 'bed':
            continue
        r = rect(f['footprint'])
        beds.append(dict(x=(r['x0']+r['x1'])/2, z=(r['z0']+r['z1'])/2,
                         w=r['x1']-r['x0'], d=r['z1']-r['z0'], room=f['room']))
    bathrooms = [dict(id=r['id'], rect=r['rect']) for r in rooms if r['kind'] == 'bathroom']
    targets = [dict(id=t['target'], point=point(t['adjusted_point']),
                    path=[point(q) for q in t['points']]) for t in audit['actual_navigation']]
    width = p['envelope']['outer_rect'][2]
    return dict(prototype=unit, kind='residential', model='residential-prototype',
                type='four-bedroom' if unit == '03' else 'three-bedroom',
                modelTransform=dict(scale=1, translate=[0, 0, 11.5]),
                width=width, depth=14.3, area=p['area']['interior_envelope_m2'], balconyArea=p['area']['balcony_m2'],
                entryDoor=entry, rooms=rooms, beds=beds, bathrooms=bathrooms,
                kitchen=next((dict(rect=r['rect']) for r in rooms if r['kind']=='kitchen'), None),
                living=next((dict(rect=r['rect']) for r in rooms if r['kind']=='living'), None),
                balcony=balcony, partitions=partitions, facadeWalls=facade,
                obstacles=obstacles, collisionFromModel=True,
                navigationTargets=targets, navigationOrigin=targets[0]['path'][0],
                source=dict(plan=source.relative_to(ROOT).as_posix(), planSHA256=source_hash(source),
                            audit=audit_path.relative_to(ROOT).as_posix(), auditSHA256=source_hash(audit_path),
                            measuredSolids=len(records), unionPolygons=len(obstacles),
                            bodyBand=[.12,1.75], simplificationTolerance=.001))


data = {u: create(u) for u in ['01', '02', '03']}
out = ROOT / 'src' / 'layout' / 'residential-plan-data.js'
out.write_text('// Generated by scripts/prepare-residential-plans.py; do not hand-edit.\n'
               '// Coordinates: local x east, local z from entrance toward balcony; metres.\n'
               'export const RESIDENTIAL_PLAN_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(json.dumps({u: d['source'] for u, d in data.items()}, ensure_ascii=False, indent=2))
