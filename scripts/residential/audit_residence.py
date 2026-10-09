"""Audit the evaluated geometry of a saved residential .blend, without saving it.

Blender --background --python audit_residence.py -- --blend FILE --out DIR
The plan supplies room labels and intended apertures only. Bounds, collision
footprints, door intrusions and navigation obstacles come from the .blend.
"""
import argparse
import heapq
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def hull(points):
    pts = sorted(set((round(float(x), 5), round(float(y), 5)) for x, y in points))
    if len(pts) < 3:
        return pts
    def turn(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    low, high = [], []
    for p in pts:
        while len(low) > 1 and turn(low[-2], low[-1], p) <= 0:
            low.pop()
        low.append(p)
    for p in reversed(pts):
        while len(high) > 1 and turn(high[-2], high[-1], p) <= 0:
            high.pop()
        high.append(p)
    return low[:-1] + high[:-1]


def world_mesh(obj, graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    try:
        verts = np.empty(len(mesh.vertices)*3, dtype=np.float64)
        mesh.vertices.foreach_get('co', verts)
        verts = verts.reshape((-1, 3))
        matrix = np.array(evaluated.matrix_world, dtype=np.float64)
        verts = verts @ matrix[:3, :3].T + matrix[:3, 3]
        edges = np.empty(len(mesh.edges)*2, dtype=np.int32)
        mesh.edges.foreach_get('vertices', edges)
        return verts, edges.reshape((-1, 2))
    finally:
        evaluated.to_mesh_clear()


def band_hull(vertices, edges, bottom=.12, top=1.75):
    """Clip real mesh edges to the pedestrian body band before XY projection."""
    selected = [vertices[(vertices[:, 2] >= bottom) & (vertices[:, 2] <= top), :2]]
    a, b = vertices[edges[:, 0]], vertices[edges[:, 1]]
    for z in (bottom, top):
        mask = ((a[:, 2] < z) & (b[:, 2] > z)) | ((b[:, 2] < z) & (a[:, 2] > z))
        aa, bb = a[mask], b[mask]
        if len(aa):
            t = (z-aa[:, 2])/(bb[:, 2]-aa[:, 2])
            selected.append((aa+(bb-aa)*t[:, None])[:, :2])
    return hull(np.vstack(selected)) if selected else []


def inside_or_distance(xx, yy, polygon):
    """Convex projected mesh hull: conservative, never a net floor-area claim."""
    inside = np.ones(xx.shape, dtype=bool)
    nearest = np.full(xx.shape, np.inf)
    for a, b in zip(polygon, polygon[1:]+polygon[:1]):
        dx, dy = b[0]-a[0], b[1]-a[1]
        inside &= dx*(yy-a[1])-dy*(xx-a[0]) >= -1e-8
        sq = dx*dx+dy*dy
        t = np.clip(((xx-a[0])*dx+(yy-a[1])*dy)/max(sq, 1e-16), 0, 1)
        nearest = np.minimum(nearest, np.hypot(xx-a[0]-dx*t, yy-a[1]-dy*t))
    return np.where(inside, 0, nearest)


def group_name(obj):
    while obj.parent:
        obj = obj.parent
    return obj.name


def ignored(name):
    words = ('rug', 'runner', 'curtain', 'artwork', 'art 挂画', 'art book',
             'floor drain', 'ceiling', 'downlight', 'pendant', 'hanging light')
    return any(word in name.lower() for word in words)


def make_bvh(obj, graph):
    ev = obj.evaluated_get(graph)
    mesh = ev.to_mesh()
    try:
        vertices = [ev.matrix_world @ v.co for v in mesh.vertices]
        return BVHTree.FromPolygons(vertices, [list(p.vertices) for p in mesh.polygons]), vertices
    finally:
        ev.to_mesh_clear()


def run(args):
    bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    plan = json.loads(args.plan.read_text())
    records, objects = [], {}
    for obj in bpy.context.scene.objects:
        if obj.type not in ('MESH', 'CURVE'):
            continue
        vertices, edges = world_mesh(obj, graph)
        if not len(vertices):
            continue
        lo, hi = vertices.min(axis=0), vertices.max(axis=0)
        cols = [c.name for c in obj.users_collection]
        role = 'wall' if obj.name.startswith('Wall ') else ('furniture' if 'Furnishings' in cols else 'detail')
        obstacle = (role in ('wall', 'furniture') or any(c in cols for c in ('Windows', 'Joinery')))
        obstacle &= not ignored(obj.name) and hi[2] > .12 and lo[2] < 1.75
        poly = band_hull(vertices, edges) if obstacle else []
        record = dict(name=obj.name, group=group_name(obj), role=role,
                      bounds=[list(np.round(lo, 5)), list(np.round(hi, 5))],
                      collections=cols, obstacle=bool(obstacle and len(poly) >= 3),
                      footprint=poly, vertex_count=len(vertices))
        records.append(record)
        objects[obj.name] = obj
    walls = [r for r in records if r['role'] == 'wall']
    furnishings = [r for r in records if r['role'] == 'furniture' and not ignored(r['name'])]
    bvh_cache = {}
    conflicts = []
    wall_normal_axes = {w['id']: (0 if abs(w['a'][0]-w['b'][0]) < .001 else 1)
                        for w in plan['walls']}
    # AABB broad phase, evaluated triangle surface/containment confirmation.
    for f in furnishings:
        for w in walls:
            lower = np.maximum(f['bounds'][0], w['bounds'][0])
            upper = np.minimum(f['bounds'][1], w['bounds'][1])
            overlap = upper-lower
            if min(overlap) <= .001:
                continue
            normal_axis = next((axis for name, axis in wall_normal_axes.items()
                                if w['name'].startswith('Wall '+name)), 0)
            fmid = (f['bounds'][0][normal_axis]+f['bounds'][1][normal_axis])/2
            wmid = (w['bounds'][0][normal_axis]+w['bounds'][1][normal_axis])/2
            penetration = (f['bounds'][1][normal_axis]-w['bounds'][0][normal_axis]
                           if fmid < wmid else w['bounds'][1][normal_axis]-f['bounds'][0][normal_axis])
            if penetration <= args.contact_tolerance+1e-5:
                continue
            for record in (f, w):
                if record['name'] not in bvh_cache:
                    bvh_cache[record['name']] = make_bvh(objects[record['name']], graph)
            fb, fv = bvh_cache[f['name']]
            wb, _ = bvh_cache[w['name']]
            intersections = fb.overlap(wb)
            wl, wh = np.array(w['bounds'][0])+.008, np.array(w['bounds'][1])-.008
            contained = any(all(wl[k] < v[k] < wh[k] for k in range(3)) for v in fv)
            if intersections or contained:
                conflicts.append(dict(furniture=f['name'], group=f['group'], wall=w['name'],
                                      overlap_xyz_m=list(np.round(overlap, 4)),
                                      wall_normal_penetration_m=round(float(penetration), 4),
                                      triangle_surface_pairs=len(intersections), contained_vertices=bool(contained)))

    door_checks, window_checks = [], []
    aperture_fixtures = furnishings + [r for r in records if 'Joinery' in r['collections']
                                      and not ignored(r['name'])
                                      and not r['name'].startswith(('Door ', 'Skirting '))]
    for wall in plan['walls']:
        a, b = np.array(wall['a']), np.array(wall['b'])
        tangent = (b-a)/np.linalg.norm(b-a)
        normal = np.array([-tangent[1], tangent[0]])
        for aperture in wall['openings']:
            center = a+tangent*aperture['at']
            lo, hi = -aperture['width']/2, aperture['width']/2
            candidates = []
            for f in aperture_fixtures:
                vertical_overlap = min(f['bounds'][1][2], aperture['top'])-max(f['bounds'][0][2], aperture['bottom'], .12)
                if vertical_overlap <= .03:
                    continue
                fl, fh = f['bounds']
                corners = np.array([[fl[0], fl[1]], [fl[0], fh[1]], [fh[0], fl[1]], [fh[0], fh[1]]])-center
                along, across = corners @ tangent, corners @ normal
                projection = min(hi, along.max())-max(lo, along.min())
                distance = max(across.min(), -across.max(), 0)
                if projection <= .04:
                    continue
                # The aperture itself is the wall-depth portal. Furniture in its
                # approach is handled by the real mesh navigation, not mislabeled
                # as penetrating the doorway merely for being beside the jamb.
                if aperture['type'] == 'door' and distance < wall['thickness']/2+.025:
                    candidates.append(dict(name=f['name'], group=f['group'], aperture_overlap_m=round(float(projection), 3), distance_to_wall_plane_m=round(float(distance), 3)))
                elif aperture['type'] == 'window' and distance < .65 and fh[2] > 1.25:
                    # Small taps/lights should not be labelled as a tall cabinet.
                    height = fh[2]-fl[2]
                    size = max(fh[0]-fl[0], fh[1]-fl[1])
                    minimum_height = .12 if 'Joinery' in f['collections'] else .48
                    if height > minimum_height and size > .32:
                        candidates.append(dict(name=f['name'], group=f['group'], aperture_overlap_m=round(float(projection), 3),
                                               vertical_overlap_m=round(float(vertical_overlap), 3), distance_to_wall_plane_m=round(float(distance), 3)))
            actual_glass = [r for r in records if r['name'] == 'Glass '+aperture['id']
                            or r['name'].startswith('Glass '+aperture['id']+'.')]
            actual_glass_bounds = None
            if actual_glass:
                actual_glass_bounds = [list(np.min([r['bounds'][0] for r in actual_glass], axis=0)),
                                       list(np.max([r['bounds'][1] for r in actual_glass], axis=0))]
            entry = dict(id=aperture['id'], intended_width_m=aperture['width'],
                         intended_bottom_m=aperture['bottom'], intended_top_m=aperture['top'],
                         actual_glass_bounds=actual_glass_bounds, candidates=candidates)
            (door_checks if aperture['type'] == 'door' else window_checks).append(entry)

    # Real mesh-based occupancy, radius-inflated per individual object, with A*.
    step, radius = args.grid_step, args.radius
    envelope = plan['envelope']['outer_rect']; balcony = plan['balcony']['rect']
    xmin, ymin = min(envelope[0], balcony[0])-.8, min(envelope[1], balcony[1])-.8
    xmax, ymax = max(envelope[2], balcony[2])+.8, max(envelope[3], balcony[3])+.8
    xs = np.arange(xmin, xmax+step/2, step)
    ys = np.arange(ymin, ymax+step/2, step)
    blocked = np.zeros((len(ys), len(xs)), dtype=bool)
    obstacles = [r for r in records if r['obstacle']]
    for r in obstacles:
        poly = r['footprint']; arr = np.array(poly)
        x0 = max(0, int(math.floor((arr[:, 0].min()-radius-xmin)/step)))
        x1 = min(len(xs), int(math.ceil((arr[:, 0].max()+radius-xmin)/step))+1)
        y0 = max(0, int(math.floor((arr[:, 1].min()-radius-ymin)/step)))
        y1 = min(len(ys), int(math.ceil((arr[:, 1].max()+radius-ymin)/step))+1)
        if x1 <= x0 or y1 <= y0:
            continue
        xx, yy = np.meshgrid(xs[x0:x1], ys[y0:y1])
        blocked[y0:y1, x0:x1] |= inside_or_distance(xx, yy, poly) < radius-1e-6

    def cell(point):
        return (int(round((point[1]-ymin)/step)), int(round((point[0]-xmin)/step)))
    start = cell(plan.get('entry_audit_start', (8.55, 11.95)))
    distance, previous = {start: 0.0}, {}
    queue = [(0.0, start)]
    if blocked[start]:
        raise RuntimeError('Entry audit start is blocked by actual geometry')
    while queue:
        cost, q = heapq.heappop(queue)
        if cost != distance[q]:
            continue
        y, x = q
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            yy, xx = y+dy, x+dx
            if not (0 <= yy < len(ys) and 0 <= xx < len(xs)) or blocked[yy, xx]:
                continue
            if dx and dy and (blocked[y, xx] or blocked[yy, x]):
                continue
            nxt = (yy, xx); newcost = cost+step*(math.sqrt(2) if dx and dy else 1)
            if newcost < distance.get(nxt, math.inf):
                distance[nxt] = newcost; previous[nxt] = q; heapq.heappush(queue, (newcost, nxt))

    anchors = dict(bed_primary=(3.02, 2.0), bed_guest=(15.95, 1.5), bed_northwest=(2, 8.4),
                   bed_northeast=(15.35, 8.4), living=(7, 2), dining=(8.6, 7.4),
                   kitchen=(6.2, 9.3), foyer=(8.65, 10.5), bath_primary=(4.12, 3.7),
                   bath_guest=(16.02, 3.7), bath_common=(10.55, 10), laundry=(13.1, 10.1),
                   gallery_west=(5.5, 6.2), gallery_east=(15.5, 6.2), balcony=(9.2, -1.4))
    anchors = plan.get('navigation_targets', anchors)
    targets = [(key, point) for key, point in anchors.items()]
    for r in furnishings:
        if r['name'].startswith('Flush shower tray'):
            lo, hi = r['bounds']
            targets.append(('actual_'+r['name'], ((lo[0]+hi[0])/2, (lo[1]+hi[1])/2)))
    routes = []
    for name, point in targets:
        target = cell(point)
        # Limit relocation to 0.35m: never turn a remote reachable cell into a pass.
        search = []
        for dy in range(-7, 8):
            for dx in range(-7, 8):
                cy, cx = target[0]+dy, target[1]+dx
                if 0 <= cy < len(ys) and 0 <= cx < len(xs) and not blocked[cy, cx]:
                    offset = math.hypot(xs[cx]-point[0], ys[cy]-point[1])
                    if offset <= .35:
                        search.append((offset, (cy, cx)))
        chosen = min(search)[1] if search else None
        ok = chosen in distance if chosen else False
        trace = []
        if ok:
            node = chosen
            while node != start:
                trace.append([round(float(xs[node[1]]), 3), round(float(ys[node[0]]), 3)])
                node = previous[node]
            trace.append([float(xs[start[1]]), float(ys[start[0]])]);trace.reverse()
        routes.append(dict(target=name, intended_point=list(point), adjusted_point=trace[-1] if trace else None,
                           reachable=ok, path_length_m=round(distance[chosen], 3) if ok else None, points=trace))

    groups = {}
    for r in furnishings:
        group = groups.setdefault(r['group'], dict(name=r['group'], bounds=r['bounds'], members=0))
        group['bounds'] = [list(np.minimum(group['bounds'][0], r['bounds'][0])), list(np.maximum(group['bounds'][1], r['bounds'][1]))]
        group['members'] += 1
    outside = [dict(name=r['name'],bounds=r['bounds']) for r in records
               if r['bounds'][0][0]<min(envelope[0],balcony[0])-.15 or r['bounds'][1][0]>max(envelope[2],balcony[2])+.15
               or r['bounds'][0][1]<min(envelope[1],balcony[1])-.15 or r['bounds'][1][1]>max(envelope[3],balcony[3])+.15]
    report = dict(schema_version=2, unit=plan.get('unit','03'), outside_envelope=outside, source_blend=str(args.blend.resolve()),
                  blend_mtime=args.blend.stat().st_mtime, blender_version=bpy.app.version_string,
                  method=dict(source='Evaluated .blend meshes and transforms; JSON only supplies room/aperture intent',
                              body_height_band_m=[.12, 1.75], navigation_radius_m=radius, grid_step_m=step,
                              contact_tolerance_m=args.contact_tolerance,
                              projection='Individual mesh convex hulls, clipped to body height; conservative for concave or disconnected meshes',
                              exclusions='Ground rugs/runners/curtains, ceilings, wall artwork and objects wholly below .12m or above 1.75m are not walking obstacles',
                              limitations='Conservative geometric audit; does not certify regulations, accessibility, door swing animation or every furniture operation'),
                  summary=dict(outside_envelope_objects=len(outside), mesh_objects=len(records), furniture_objects=len(furnishings), wall_penetrations=len(conflicts),
                               door_intrusions=sum(bool(d['candidates']) for d in door_checks),
                               window_obstruction_candidates=sum(bool(d['candidates']) for d in window_checks),
                               navigation_targets=len(routes), reachable_targets=sum(r['reachable'] for r in routes)),
                  wall_penetrations=conflicts, door_checks=door_checks, window_checks=window_checks,
                  actual_navigation=routes, furniture_groups=list(groups.values()),
                  retained_source_furniture=[dict(name=r['name'], bounds=r['bounds'],
                                                  world_axis_scale=[round(objects[r['name']].matrix_world.to_3x3().col[k].length, 6) for k in range(3)])
                                             for r in records if r['name'].startswith('Furniture ')],
                  mesh_inventory=records)
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out/'actual-mesh-audit.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print('ACTUAL_MESH_AUDIT', json.dumps(dict(report= str(path), **report['summary']), ensure_ascii=False))
    for conflict in conflicts[:20]:
        print('WALL_CONFLICT', json.dumps(conflict, ensure_ascii=False))
    for check in door_checks+window_checks:
        if check['candidates']:
            print('APERTURE_REVIEW', json.dumps(check, ensure_ascii=False))
    for route in routes:
        if not route['reachable']:
            print('UNREACHABLE_TARGET', route['target'], route['intended_point'])


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--plan', type=Path, default=Path(__file__).with_name('plan_03.json'))
    parser.add_argument('--radius', type=float, default=.30)
    parser.add_argument('--grid-step', type=float, default=.05)
    parser.add_argument('--contact-tolerance', type=float, default=.03)
    run(parser.parse_args(argv))
