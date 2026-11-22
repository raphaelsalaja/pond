"""Draws the home family in Neutral into packages/icons/next/."""
import heapq, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *
from neutral import _area


# ---------- helpers ----------
def unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy); return (dx / l, dy / l)

def rr(verts, radii=0, closed=True):
    """A polyline through verts with true arcs of the given radii at its corners."""
    n = len(verts)
    radii = [radii] * n if isinstance(radii, (int, float)) else list(radii)
    corners = []
    for i, c in enumerate(verts):
        r = radii[i]
        if (not closed and i in (0, n - 1)) or not r:
            corners.append((c, c, None)); continue
        u = unit(verts[i - 1], c); v = unit(c, verts[(i + 1) % n])
        cr = u[0] * v[1] - u[1] * v[0]
        th = math.acos(max(-1, min(1, u[0] * v[0] + u[1] * v[1]))); t = r * math.tan(th / 2)
        corners.append(((c[0] - u[0] * t, c[1] - u[1] * t), (c[0] + v[0] * t, c[1] + v[1] * t), (r, 1 if cr > 0 else 0)))
    seq = list(range(1, n)) + [0] if closed else list(range(1, n))
    cur = corners[0][1] if closed else corners[0][0]
    d = f"M{pt(cur)}"
    for i in seq:
        pin, pout, arc = corners[i]
        if math.dist(cur, pin) > 1e-9: d += f"L{pt(pin)}"
        if arc: d += f"A{f(arc[0])} {f(arc[0])} 0 0 {arc[1]} {pt(pout)}"
        cur = pout
    return d + ("Z" if closed else "")

def rot(p, deg, c=(9, 9)):
    a = math.radians(deg); x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))

def A(r, p, sweep, large=0):
    return f"A{f(r)} {f(r)} 0 {large} {sweep} {pt(p)}"

def on_circle(c, r, deg):
    a = math.radians(deg); return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))

def sil(*ds):
    """One Duo base path from several closed outlines, so overlaps never double the 0.35."""
    return ["".join(silhouette(d) for d in ds)]

def swing(xh, xo, y0, y1):
    """A door seen swung open on a hinge at xh: its free edge at xo, shortened 45° top and bottom."""
    w = abs(xo - xh)
    return [(xh, y0), (xo, y0 + w), (xo, y1 - w), (xh, y1)]

GRID, GAP = 0.125, 3.4
SEED = {"trash", "trash-xmark"}

def on_grid(v): return abs(v / GRID - round(v / GRID)) < 0.01

def carrier_ok(s):
    """A straight line lies on a 0/45/90 line through a grid point; a circle has a grid centre and radius (r1.5 corners derive)."""
    if isinstance(s, Arc): return abs(s.r - R) < 1e-6 or (on_grid(s.c[0]) and on_grid(s.c[1]) and on_grid(s.r))
    dx, dy = s.b[0] - s.a[0], s.b[1] - s.a[1]
    if abs(dy) < 1e-6: return on_grid(s.a[1])
    if abs(dx) < 1e-6: return on_grid(s.a[0])
    if abs(dx - dy) < 1e-6: return on_grid(s.a[0] - s.a[1])
    if abs(dx + dy) < 1e-6: return on_grid(s.a[0] + s.a[1])
    return False

def on_carrier(p, s):
    if isinstance(s, Arc): return abs(math.dist(p, s.c) - s.r) < 0.004
    (ax, ay), (bx, by) = s.a, s.b; l = math.hypot(bx - ax, by - ay)
    return abs((bx - ax) * (ay - p[1]) - (ax - p[0]) * (by - ay)) / l < 0.004

def same_carrier(s, t):
    if isinstance(s, Arc) != isinstance(t, Arc): return False
    if isinstance(s, Arc): return math.dist(s.c, t.c) < 0.01 and abs(s.r - t.r) < 0.01
    return on_carrier(t.a, s) and on_carrier(t.b, s)

def seg_len(s): return math.dist(s.a, s.b) if isinstance(s, Line) else s.r * abs(s.a1 - s.a0)

def audit(name, svg):
    """Grid carriers and derived anchors, padding, and details closer than 3.4 that no short stroke joins."""
    issues = []
    subs = []
    for tag in re.findall(r"<path[^>]*>", svg):
        subs += parse(re.search(r'\sd="([^"]+)"', tag).group(1))
    dots = [(float(x), float(y), float(r)) for x, y, r in
            re.findall(r'<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"', svg)]
    allsegs = [s for segs, _ in subs for s in segs]
    fillets, concave = set(), []
    for k, (segs, closed) in enumerate(subs):
        n = len(segs)
        for i, s in enumerate(segs):
            a, b = (segs[i - 1] if closed or i else None), (segs[(i + 1) % n] if closed or i < n - 1 else None)
            if isinstance(s, Arc) and isinstance(a, Line) and isinstance(b, Line) and on_grid(s.r):
                if math.dist(a.tan(1), s.tan(0)) < 1e-3 and math.dist(s.tan(1), b.tan(0)) < 1e-3: fillets.add(id(s))
        if closed:
            o = 1 if _area(segs) > 0 else -1
            for i in range(n):
                u, v = segs[i - 1].tan(1), segs[i].tan(0)
                if (u[0] * v[1] - u[1] * v[0]) * o < -1e-6: concave.append((k, segs[i].at(0)))
    for s in allsegs:
        if not (carrier_ok(s) or id(s) in fillets): issues.append(f"{'arc' if isinstance(s, Arc) else 'line'} at {pt(s.at(0.5))} off the grid carriers")
        for p in (s.at(0), s.at(1)):
            if on_grid(p[0]) and on_grid(p[1]): continue
            hits = [t for t in allsegs if not same_carrier(s, t) and on_carrier(p, t)]
            if not hits:
                issues.append(f"anchor {pt(p)} is neither on the grid nor where two carriers meet")
    for x, y, r in dots:
        if not (on_grid(x) and on_grid(y)): issues.append(f"dot {f(x)} {f(y)} off the grid")
        if not (2.5 - 1e-6 <= x <= 15.5 + 1e-6 and 2.5 - 1e-6 <= y <= 15.5 + 1e-6): issues.append(f"dot {f(x)} {f(y)} past the padding")
    nodes, sub_of, adj = [], [], {}
    for k, (segs, closed) in enumerate(subs):
        first = len(nodes)
        for s in segs:
            n = max(1, math.ceil(seg_len(s) / 0.125))
            for j in range(n):
                nodes.append(s.at(j / n)); sub_of.append(k)
        if not closed:
            nodes.append(segs[-1].at(1)); sub_of.append(k)
        last = len(nodes) - 1
        for i in range(first, last):
            adj.setdefault(i, []).append(i + 1); adj.setdefault(i + 1, []).append(i)
        if closed: adj.setdefault(last, []).append(first); adj.setdefault(first, []).append(last)
    for p in nodes:
        if not (1.75 - 0.004 <= p[0] <= 16.25 + 0.004 and 1.75 - 0.004 <= p[1] <= 16.25 + 0.004):
            issues.append(f"stroke centre {pt(p)} past the padding"); break
    cell = {}
    for i, p in enumerate(nodes): cell.setdefault((int(p[0] // 0.5), int(p[1] // 0.5)), []).append(i)
    def near(p, rad):
        cx, cy, k = int(p[0] // 0.5), int(p[1] // 0.5), int(rad // 0.5) + 1
        for gx in range(cx - k, cx + k + 1):
            for gy in range(cy - k, cy + k + 1):
                yield from cell.get((gx, gy), ())
    for i, p in enumerate(nodes):
        for j in near(p, 0.14):
            if abs(j - i) > 2 and math.dist(p, nodes[j]) < 0.14:
                adj.setdefault(i, []).append(j)
    found = {}
    for i, p in enumerate(nodes):
        close = [(j, math.dist(p, nodes[j])) for j in near(p, GAP) if j > i]
        close = [(j, d) for j, d in close if d < GAP - 1e-6]
        if not close: continue
        lim = 1.5 * GAP + 0.3; geo = {i: 0.0}; heap = [(0.0, i)]
        while heap:
            g, u = heapq.heappop(heap)
            if g > geo.get(u, 1e9) or g > lim: continue
            for v in adj.get(u, ()):
                ng = g + math.dist(nodes[u], nodes[v])
                if ng < geo.get(v, 1e9) and ng <= lim: geo[v] = ng; heapq.heappush(heap, (ng, v))
        for j, d in close:
            if geo.get(j, 1e9) > 1.5 * d + 0.25:
                if any(k == sub_of[i] == sub_of[j] and math.dist(p, c) < GAP and math.dist(nodes[j], c) < GAP for k, c in concave): continue
                key = tuple(sorted((sub_of[i], sub_of[j]))) + (round(p[0] / 3), round(p[1] / 3))
                if key not in found or d < found[key][0]: found[key] = (d, p, nodes[j])
    for d, p, q in found.values(): issues.append(f"gap {d:.2f} between {pt(p)} and {pt(q)}")
    for a in range(len(dots)):
        for b in range(a + 1, len(dots)):
            d = math.dist(dots[a][:2], dots[b][:2])
            if d < GAP: issues.append(f"dots {f(dots[a][0])} {f(dots[a][1])} and {f(dots[b][0])} {f(dots[b][1])} only {d:.2f} apart")
        x, y = dots[a][:2]
        track = {k for k, (segs, _) in enumerate(subs) for s in segs if isinstance(s, Line) and on_carrier((x, y), s)
                 and min(s.a[0], s.b[0]) - 1e-6 <= x <= max(s.a[0], s.b[0]) + 1e-6 and min(s.a[1], s.b[1]) - 1e-6 <= y <= max(s.a[1], s.b[1]) + 1e-6}
        m = min((math.dist(dots[a][:2], q) for q, k in zip(nodes, sub_of) if k not in track), default=99)
        if m < GAP: issues.append(f"dot {f(dots[a][0])} {f(dots[a][1])} only {m:.2f} from a stroke")
    for i in issues: print(f"  {name}: {i}")
    return issues

def W(name, outline, duo=None, opened=None, duo_opened=None):
    for tag, svg in (("", outline), (" open", opened)):
        if not svg: continue
        lint(name + tag, svg)
        gaps(name + tag, svg)
        if name not in SEED: audit(name + tag, svg)
    write(name, outline, duo, opened, duo_opened)

def tries(name, attempts, picked):
    for note, svg in attempts:
        lint(f"{name} [{note}]", svg)
        if os.environ.get("TRY") and name.startswith(os.environ["TRY"]):
            audit(f"~{name} [{note}]", svg); gaps(f"~{name} [{note}]", svg)
    explore(name, attempts, picked)


# ---------- trash (seed) ----------
LID = "M1.625 4.75L16.375 4.75"
HANDLE = "M6.625 4.75L6.625 3.25A1.5 1.5 0 0 1 8.125 1.75L9.875 1.75A1.5 1.5 0 0 1 11.375 3.25L11.375 4.75"
BODY = "M3.75 4.75L3.75 14.75A1.5 1.5 0 0 0 5.25 16.25L12.75 16.25A1.5 1.5 0 0 0 14.25 14.75L14.25 4.75"
SLATS = "M7.25 8.25L7.25 12.75M10.75 8.25L10.75 12.75"
BODY_SIL = (f"M3.125 6.5L14.875 6.5L14.875 14.75A{f(RO)} {f(RO)} 0 0 1 12.75 16.875L5.25 16.875"
            f"A{f(RO)} {f(RO)} 0 0 1 3.125 14.75Z")
TRASH = [BODY, SLATS, LID, HANDLE]
W("trash", line_svg(TRASH), duo_svg([BODY_SIL], fg_lines=[SLATS, LID, HANDLE]))

W("trash-xmark", *with_badge(TRASH, "badge-xmark", bg=[BODY_SIL], fg_lines=[SLATS, LID, HANDLE]))
uses("trash-xmark", "badge-xmark")


# ---------- house ----------
HOUSE_V = [(9, 2), (16.25, 9.25), (16.25, 16.25), (1.75, 16.25), (1.75, 9.25)]
HOUSE = rr(HOUSE_V, [0, 0, R, R, 0])
def doorway(x0, x1, top, base=16.25):
    """An arched doorway cut into a floor line: r1.5 feet, straight jambs up to the head centre at top."""
    r = (x1 - x0) / 2
    return (f"L{f(x0 - R)} {f(base)}" + A(R, (x0, base - R), 0) + f"L{f(x0)} {f(top)}" + A(r, (x1, top), 1)
            + f"L{f(x1)} {f(base - R)}" + A(R, (x1 + R, base), 0))

HOUSE_DOOR = "M7 16.25L7 13.75A2 2 0 0 1 11 13.75L11 16.25"
HOUSE_OPEN = ("M12.5 16.25L14.75 16.25" + A(R, (16.25, 14.75), 0) + "L16.25 9.25L9 2L1.75 9.25L1.75 14.75"
              + A(R, (3.25, 16.25), 0) + doorway(7, 11, 13.75) + "Z")
square_door = rr([(7, 16.25), (7, 11.75), (11, 11.75), (11, 16.25)], [0, R, R, 0], closed=False)
tries("house", [
    ("arched door", line_svg([HOUSE, HOUSE_DOOR])),
    ("square door, r1.5", line_svg([HOUSE, square_door])),
    ("no door, window disc", line_svg([HOUSE], dots=[(9, 11.75, 1.375)])),
], 0)
W("house", line_svg([HOUSE, HOUSE_DOOR]), duo_svg(sil(HOUSE), fg_lines=[HOUSE_DOOR]),
  opened=line_svg([HOUSE_OPEN]))


# ---------- building ----------
TOWER = rr([(1.75, 16.25), (1.75, 1.75), (12.25, 1.75), (12.25, 7.25), (16.25, 7.25), (16.25, 16.25)],
           [R, R, R, 0, R, R])
WING = "M12.25 7.25L12.25 16.25"
WINDOWS = [(5.25, 5.25, 1.375), (8.75, 5.25, 1.375), (5.25, 8.75, 1.375), (8.75, 8.75, 1.375)]
B_DOOR = "M5.25 16.25L5.25 14A1.75 1.75 0 0 1 8.75 14L8.75 16.25"
TOWER_OPEN = ("M10.25 16.25L14.75 16.25" + A(R, (16.25, 14.75), 0) + "L16.25 8.75" + A(R, (14.75, 7.25), 0)
              + "L12.25 7.25L12.25 3.25" + A(R, (10.75, 1.75), 0) + "L3.25 1.75" + A(R, (1.75, 3.25), 0)
              + "L1.75 14.75" + A(R, (3.25, 16.25), 0) + doorway(5.25, 8.75, 14) + "Z")
WING_OPEN = "M12.25 7.25L12.25 16.25"
tries("building", [
    ("tower, wing, door", line_svg([TOWER, WING, B_DOOR], WINDOWS)),
    ("tower, six windows", line_svg([TOWER, WING], WINDOWS + [(5.25, 12.25, 1.375), (8.75, 12.25, 1.375)])),
    ("one block, no wing", line_svg([rect(3.125, 1.75, 14.875, 16.25), "M7.25 16.25L7.25 12.5A1.75 1.75 0 0 1 10.75 12.5L10.75 16.25"],
                                     [(6.625, 5.25, 1.375), (11.375, 5.25, 1.375), (6.625, 8.75, 1.375), (11.375, 8.75, 1.375)])),
], 0)
W("building", line_svg([TOWER, WING, B_DOOR], WINDOWS),
  duo_svg(sil(TOWER), fg_lines=[WING, B_DOOR], fg_dots=[(x, y, 1.5) for x, y, _ in WINDOWS]),
  line_svg([TOWER_OPEN, WING_OPEN], WINDOWS),
  duo_svg(sil(TOWER_OPEN), fg_lines=[WING_OPEN], fg_dots=[(x, y, 1.5) for x, y, _ in WINDOWS]))


# ---------- door ----------
DOOR = rect(3.125, 1.75, 14.875, 16.25)
KNOB = (11.375, 9.25)
DOOR_OPEN = rr([(3.125, 1.75)] + swing(10.875, 14.875, 1.75, 16.25) + [(3.125, 16.25)], [R, 0, 0, 0, 0, R])
def hinge(x, y0, y1, top=1.75, bottom=16.25):
    """The hinge edge of a swung leaf, kept 3.4 clear of the leaf's 45° edges."""
    k = 3.4 * SQ
    a, b = max(y0, math.ceil((top + k) * 8) / 8), min(y1, math.floor((bottom - k) * 8) / 8)
    return f"M{f(x)} {f(a)}L{f(x)} {f(b)}"

HINGE = hinge(10.875, 1.75, 16.25)
door_left = rr([(7.125, 1.75), (14.875, 1.75), (14.875, 16.25), (7.125, 16.25)] + list(reversed(swing(7.125, 3.125, 1.75, 16.25)))[1:3],
               [0, R, R, 0, 0, 0])
tries("door", [
    ("panel swung out right, short hinge", line_svg([DOOR_OPEN, HINGE])),
    ("panel swung out left, short hinge", line_svg([door_left, hinge(7.125, 1.75, 16.25)])),
    ("panel swung out right, no hinge", line_svg([DOOR_OPEN])),
], 0)
W("door", line_svg([DOOR], [(*KNOB, 1.375)]), duo_svg(sil(DOOR), fg_dots=[(*KNOB, 1.5)]),
  line_svg([DOOR_OPEN, HINGE]), duo_svg(sil(DOOR_OPEN), fg_lines=[HINGE]))


# ---------- wardrobe ----------
WR = rect(1.75, 1.75, 16.25, 14.5)
WR_SEAM = "M9 1.75L9 14.5"
WR_HANDLES = "M5.5 6.75L5.5 9.5M12.5 6.75L12.5 9.5"
WR_LEGS = "M3.75 14.5L3.75 16.25M14.25 14.5L14.25 16.25"
WR_OPEN = rr([(1.75, 1.75)] + swing(12.75, 16.25, 1.75, 14.5) + [(1.75, 14.5)], [R, 0, 0, 0, 0, R])
WR_LEGS_OPEN = "M3.75 14.5L3.75 16.25M10.75 14.5L10.75 16.25"
WR_HANDLE_LEFT = "M5.5 6.75L5.5 9.5"
WR_RAIL = "M9 6.625L12.75 6.625L12.75 9.625"
tries("wardrobe", [
    ("open: right door swung, rail into a short hinge", line_svg([WR_OPEN, WR_SEAM, WR_HANDLE_LEFT, WR_RAIL, WR_LEGS_OPEN])),
    ("open: right door swung, no hinge line", line_svg([WR_OPEN, WR_SEAM, WR_HANDLE_LEFT, WR_LEGS_OPEN])),
    ("open: full hinge line", line_svg([WR_OPEN, "M12.75 1.75L12.75 14.5", WR_SEAM, WR_HANDLE_LEFT, WR_LEGS_OPEN])),
], 0)
W("wardrobe", line_svg([WR, WR_SEAM, WR_HANDLES, WR_LEGS]),
  duo_svg(sil(WR), fg_lines=[WR_SEAM, WR_HANDLES, WR_LEGS]),
  line_svg([WR_OPEN, WR_SEAM, WR_HANDLE_LEFT, WR_RAIL, WR_LEGS_OPEN]),
  duo_svg(sil(WR_OPEN), fg_lines=[WR_SEAM, WR_HANDLE_LEFT, WR_RAIL, WR_LEGS_OPEN]))


# ---------- fridge ----------
FRIDGE = rect(3.125, 1.75, 14.875, 16.25)
FR_SPLIT = "M3.125 8.75L14.875 8.75"
FR_HANDLES = [(6.625, 5.25, 1.375), (6.625, 12.5, 1.375)]
FRIDGE_OPEN = rr([(3.125, 1.75)] + swing(11.375, 14.875, 1.75, 16.25) + [(3.125, 16.25)], [R, 0, 0, 0, 0, R])
FR_SHELVES = "M3.125 7.25L11.375 7.25L11.375 10.75L3.125 10.75"
tries("fridge", [
    ("closed: two doors, disc handles", line_svg([FRIDGE, FR_SPLIT], FR_HANDLES)),
    ("open: door swung, shelves meet a short hinge", line_svg([FRIDGE_OPEN, FR_SHELVES])),
    ("open: door swung, free shelves", line_svg([FRIDGE_OPEN, "M3.125 7.25L9.375 7.25M3.125 10.75L9.375 10.75"])),
], 1)
W("fridge", line_svg([FRIDGE, FR_SPLIT], FR_HANDLES),
  duo_svg(sil(FRIDGE), fg_lines=[FR_SPLIT], fg_dots=[(x, y, 1.5) for x, y, _ in FR_HANDLES]),
  line_svg([FRIDGE_OPEN, FR_SHELVES]), duo_svg(sil(FRIDGE_OPEN), fg_lines=[FR_SHELVES]))


# ---------- safe ----------
SAFE = rect(1.75, 1.75, 16.25, 14.25)
SAFE_LEGS = "M4.25 14.25L4.25 16.25M13.75 14.25L13.75 16.25"
DIAL = circle_d((9, 8), 2.75)
SAFE_OPEN = rr([(1.75, 5.25), (5.25, 1.75), (16.25, 1.75), (16.25, 14.25), (5.25, 14.25), (1.75, 10.75)], [0, 0, R, R, 0, 0])
SAFE_SHELF = hinge(5.25, 1.75, 14.25, bottom=14.25) + "M5.25 8L16.25 8"
SAFE_LEGS_OPEN = "M8.75 14.25L8.75 16.25M13.75 14.25L13.75 16.25"
tries("safe", [
    ("closed: dial ring", line_svg([SAFE, DIAL, SAFE_LEGS])),
    ("closed: no legs, ring and hub", line_svg([rect(1.75, 1.75, 16.25, 16.25), circle_d((9, 9), 3.5)], [(9, 9, 1.375)])),
    ("open: door swung left, shelf on a short hinge", line_svg([SAFE_OPEN, SAFE_SHELF, SAFE_LEGS_OPEN])),
], 0)
W("safe", line_svg([SAFE, DIAL, SAFE_LEGS]), duo_svg(sil(SAFE), fg_lines=[DIAL, SAFE_LEGS]),
  line_svg([SAFE_OPEN, SAFE_SHELF, SAFE_LEGS_OPEN]), duo_svg(sil(SAFE_OPEN), fg_lines=[SAFE_SHELF, SAFE_LEGS_OPEN]))


# ---------- curtains ----------
ROD = "M1.75 1.75L16.25 1.75"
DRAPES = rr([(1.75, 1.75), (16.25, 1.75), (16.25, 16.25), (1.75, 16.25)], [0, 0, R, R])
DRAPE_SEAM = "M9 1.75L9 16.25"
FOLDS = "M5.375 1.75L5.375 16.25M12.625 1.75L12.625 16.25"

def drape(x0=7.25, xt=5.25, yt=9, mirror=False):
    """A drape tied back: the inner edge runs down, pinches 45° in to the tie and flares 45° back out."""
    k = x0 - xt
    p = [(1.75, 1.75), (x0, 1.75), (x0, yt - k), (xt, yt), (x0, yt + k), (x0, 16.25), (1.75, 16.25)]
    if mirror: p = [(18 - x, y) for x, y in p]
    return rr(p, [0, 0, 0, 0, 0, R, R])

DRAPE_L, DRAPE_R = drape(), drape(mirror=True)
drape_low = [drape(yt=11), drape(yt=11, mirror=True)]
drape_high = [drape(yt=7.5), drape(yt=7.5, mirror=True)]
tries("curtains", [
    ("open: drapes pinched 45° at a mid tie", line_svg([ROD, DRAPE_L, DRAPE_R])),
    ("open: low tie", line_svg([ROD] + drape_low)),
    ("open: high tie", line_svg([ROD] + drape_high)),
], 0)
W("curtains", line_svg([ROD, DRAPES, DRAPE_SEAM, FOLDS]), duo_svg(sil(DRAPES), fg_lines=[ROD, DRAPE_SEAM, FOLDS]),
  line_svg([ROD, DRAPE_L, DRAPE_R]), duo_svg(sil(DRAPE_L, DRAPE_R), fg_lines=[ROD]))


# ---------- chest ----------
def dome_box(top, bottom, x0=2, x1=16, r=8.75):
    """A box whose lid is a dome: an r8.75 arc meeting the sides 3.5 below its crown, r1.5 bottom corners."""
    y = top + 3.5
    return (f"M{f(x0)} {f(y)}" + A(r, (x1, y), 1) + f"L{f(x1)} {f(bottom - R)}" + A(R, (x1 - R, bottom), 1)
            + f"L{f(x0 + R)} {f(bottom)}" + A(R, (x0, bottom - R), 1) + "Z")

CHEST = dome_box(1.75, 16.25)
CHEST_SEAM = "M2 9.25L16 9.25"
CLASP = rr([(7.25, 9.25), (7.25, 12.75), (10.75, 12.75), (10.75, 9.25)], [0, R, R, 0], closed=False)
CHEST_LID_ARCH = "M2 5.25" + A(8.75, (16, 5.25), 1)
CHEST_BODY_OPEN = rect(2, 8.75, 16, 16.25)
CLASP_OPEN = rr([(7.25, 8.75), (7.25, 12.25), (10.75, 12.25), (10.75, 8.75)], [0, R, R, 0], closed=False)
tries("chest", [
    ("open: dome lid lifted straight up", line_svg([dome_box(1.75, 7.75), rect(2, 11.25, 16, 16.25)])),
    ("open: arch lid lifted off a clasped body", line_svg([CHEST_LID_ARCH, CHEST_BODY_OPEN, CLASP_OPEN])),
    ("open: flat lid lifted", line_svg([rect(2, 3.5, 16, 7.75), rect(2, 11.25, 16, 16.25)])),
], 1)
W("chest", line_svg([CHEST, CHEST_SEAM, CLASP]), duo_svg(sil(CHEST), fg_lines=[CHEST_SEAM, CLASP]),
  line_svg([CHEST_LID_ARCH, CHEST_BODY_OPEN, CLASP_OPEN]), duo_svg(sil(CHEST_BODY_OPEN), fg_lines=[CHEST_LID_ARCH, CLASP_OPEN]))


# ---------- toolbox ----------
TB = rect(1.75, 6, 16.25, 15.5)
TB_HANDLE = rr([(6.25, 6), (6.25, 2.5), (11.75, 2.5), (11.75, 6)], [0, R, R, 0], closed=False)
TB_SEAM = "M1.75 9.5L16.25 9.5"
TB_BODY_OPEN = rect(1.75, 12.25, 16.25, 16.25)
TB_LID_OPEN = [rect(1.75, 5.25, 16.25, 8.75),
               rr([(6.25, 5.25), (6.25, 1.75), (11.75, 1.75), (11.75, 5.25)], [0, R, R, 0], closed=False)]
tries("toolbox", [
    ("open: lid and handle lifted straight up", line_svg([TB_BODY_OPEN] + TB_LID_OPEN)),
    ("open: lid lifted, handle stays on the body", line_svg([rect(1.75, 8.75, 16.25, 15.5), rect(1.75, 1.75, 16.25, 5.25)])),
    ("open: body only, handle up", line_svg([rect(1.75, 6, 16.25, 15.5), TB_HANDLE])),
], 0)
W("toolbox", line_svg([TB, TB_HANDLE, TB_SEAM]), duo_svg(sil(TB), fg_lines=[TB_HANDLE, TB_SEAM]),
  line_svg([TB_BODY_OPEN] + TB_LID_OPEN), duo_svg(sil(TB_BODY_OPEN, TB_LID_OPEN[0]), fg_lines=[TB_LID_OPEN[1]]))


# ---------- settings-wrench ----------
def wrench(c, r, jaw, end=(2.5, 15.5)):
    """An open-end wrench: a C-shaped jaw around c opening up-right between the grid points jaw, a straight handle down-left."""
    (dx0, dy0), (dx1, dy1) = jaw
    a, b = (c[0] + dx0, c[1] + dy0), (c[0] + dx1, c[1] + dy1)
    h = (c[0] - r / SQ, c[1] + r / SQ)
    return [f"M{pt(a)}" + A(r, b, 1, 1), f"M{pt(h)}L{pt(end)}"]

WRENCH = wrench((11.5, 6.5), 3.125, [(3.125, 0), (0, -3.125)])
WRENCH_OPEN = wrench((11.5, 6.5), 3.125, [(2.5, 1.875), (-1.875, -2.5)])
tries("settings-wrench", [
    ("C jaw, straight handle", line_svg(WRENCH)),
    ("C jaw, small head", line_svg(wrench((12, 6), 2.5, [(2.5, 0), (0, -2.5)], (3, 15)))),
    ("open: jaw opened wide", line_svg(WRENCH_OPEN)),
], 0)
W("settings-wrench", line_svg(WRENCH), opened=line_svg(WRENCH_OPEN))


# ---------- gear-3 ----------
TRACKS = "M1.75 4.25L16.25 4.25M1.75 9L16.25 9M1.75 13.75L16.25 13.75"
knobs = lambda *xs, r=1.375: [(x, y, r) for x, y in zip(xs, (4.25, 9, 13.75))]
AXIS_TEETH = [((0, -1), (1, 0)), ((1, 0), (0, 1)), ((0, 1), (-1, 0)), ((-1, 0), (0, -1))]
DIAG_TEETH = [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]

def cog(teeth, h, out, rb=5.25, chamfer=0, c=(9, 9)):
    """A body circle rb with square teeth; h and out step along each tooth's own axis vectors so diagonal teeth stay on the grid."""
    def tooth(D, P):
        n = math.hypot(*D); sj = math.sqrt((rb / n) ** 2 - h * h)
        L = lambda s, t: (c[0] + s * D[0] + t * P[0], c[1] + s * D[1] + t * P[1])
        if chamfer:
            vs = [L(sj, -h), L(out - chamfer, -h), L(out, chamfer - h), L(out, h - chamfer), L(out - chamfer, h), L(sj, h)]
            return vs, 0
        return [L(sj, -h), L(out, -h), L(out, h), L(sj, h)], [0, R, R, 0]
    parts = [tooth(D, P) for D, P in teeth]
    d = f"M{pt(parts[-1][0][-1])}"
    for vs, radii in parts:
        d += A(rb, vs[0], 1) + re.sub(r"^M[^A-Za-z]*", "", rr(vs, radii, closed=False))
    return d + "Z"

def star_cog(a=5.125, b=7.25, c=(9, 9)):
    """A square and a diamond overlaid: eight r1.5 points with sharp notches between."""
    k = b - a
    q = [(c[0], c[1] - b), (c[0] + k, c[1] - a), (c[0] + a, c[1] - a), (c[0] + a, c[1] - k)]
    vs = [rot(p, 90 * i, c) for i in range(4) for p in q]
    return rr(vs, [R, 0, R, 0] * 4)

HOLE = circle_d((9, 9), 2)
GEAR, GEAR_OPEN_DOT = star_cog(4.875), (9, 9, 1.375)
COG4 = cog(AXIS_TEETH, 2.5, 7.25, chamfer=1)
COG4_OPEN = cog(DIAG_TEETH, 1.5, 5.75, chamfer=0.75)
ring = circle_d((9, 9), 1.75)
OCTAGON = rr([(6, 1.75), (12, 1.75), (16.25, 6), (16.25, 12), (12, 16.25), (6, 16.25), (1.75, 12), (1.75, 6)], 0)
tries("gear-3", [
    ("three sliders, collides with sliders", line_svg([TRACKS], knobs(11.75, 6.25, 10.25))),
    ("four teeth, width 4, round tips", line_svg([cog(AXIS_TEETH, 2, 7.25), ring])),
    ("four teeth, width 5, round tips", line_svg([cog(AXIS_TEETH, 2.5, 7.25), ring])),
    ("four teeth, width 5, chamfered tips", line_svg([COG4, ring])),
    ("four teeth turned 45°, chamfered tips", line_svg([COG4_OPEN, ring])),
    ("octagon nut, centre ring", line_svg([OCTAGON, circle_d((9, 9), 2.5)])),
    ("eight-point cog, shallow notches", line_svg([star_cog(), HOLE])),
    ("eight-point cog, deeper notches", line_svg([GEAR, HOLE])),
    ("two stacked toggles", line_svg([rect(1.75, 1.75, 16.25, 7.25, 2.75), rect(1.75, 10.75, 16.25, 16.25, 2.75)],
                                     [(4.5, 4.5, 1.375), (13.5, 13.5, 1.375)])),
    ("one toggle", line_svg([rect(1.75, 5.5, 16.25, 12.5, 3.5)], [(5.25, 9, 1.375)])),
    ("open: eight-point cog, hub disc", line_svg([GEAR], [GEAR_OPEN_DOT])),
], 7)
W("gear-3", line_svg([GEAR, HOLE]), duo_svg(sil(GEAR), fg_lines=[HOLE]),
  line_svg([GEAR], [GEAR_OPEN_DOT]), duo_svg(sil(GEAR), fg_dots=[(9, 9, 1.5)]))


# ---------- key ----------
BOW_C, BOW_R = (5.5, 12.5), 3.25
def key(deg=0):
    g = lambda p: rot(p, deg)
    s0 = on_circle(BOW_C, BOW_R, -45)
    shaft = f"M{pt(g(s0))}L{pt(g((15.5, 2.5)))}"
    teeth = "".join(f"M{pt(g(p))}L{pt(g((p[0] + 1.625, p[1] + 1.625)))}" for p in [(14.25, 3.75), (11.75, 6.25)])
    return [circle_d(g(BOW_C), BOW_R), shaft, teeth]

KEY, KEY_OPEN = key(), key(90)
tries("key", [
    ("ring bow, two teeth", line_svg(KEY)),
    ("ring bow, one long bit", line_svg([circle_d(BOW_C, BOW_R), f"M{pt(on_circle(BOW_C, BOW_R, -45))}L15.5 2.5",
                                         rr([(12.5, 5.5), (14.5, 7.5), (13, 9)], 0, closed=False)])),
], 0)
W("key", line_svg(KEY), opened=line_svg(KEY_OPEN))


# ---------- lock ----------
LOCK = rect(3.125, 8, 14.875, 16.25)
SHACKLE = "M5.5 8L5.5 5.25A3.5 3.5 0 0 1 12.5 5.25L12.5 8"
LOCK_OPEN = rect(3.125, 9.25, 14.875, 16.25)
SHACKLE_OPEN = "M12.5 9.25L12.5 5.25A3.5 3.5 0 0 0 5.5 5.25"
KEYHOLE_OPEN = (9, 12.75, 1.375)
KEYHOLE = (9, 12.125, 1.375)
tries("lock", [
    ("open: shorter body, shackle free on the left", line_svg([LOCK_OPEN, SHACKLE_OPEN], [KEYHOLE_OPEN])),
    ("open: full body, shackle cut at 45°", line_svg([LOCK, "M12.5 8L12.5 5.25" + A(3.5, (9 - 3.5 / SQ, 5.25 - 3.5 / SQ), 0)], [KEYHOLE])),
    ("open: full body, semicircle shackle", line_svg([LOCK, "M12.5 8L12.5 5.25A3.5 3.5 0 0 0 5.5 5.25"], [KEYHOLE])),
], 0)
W("lock", line_svg([LOCK, SHACKLE], [KEYHOLE]), duo_svg(sil(LOCK), fg_lines=[SHACKLE], fg_dots=[(9, 12.125, 1.5)]),
  line_svg([LOCK_OPEN, SHACKLE_OPEN], [KEYHOLE_OPEN]), duo_svg(sil(LOCK_OPEN), fg_lines=[SHACKLE_OPEN], fg_dots=[(9, 12.75, 1.5)]))


# ---------- bell ----------
def bell(cx=9, half=5.25, top=2.25, rim=12, flare=2):
    """A dome bell: semicircle crown, straight sides down to a rim line that flares past them, a clapper disc below."""
    x0, x1, yc = cx - half, cx + half, top + half
    body = f"M{f(x0)} {f(rim)}L{f(x0)} {f(yc)}" + A(half, (x1, yc), 1) + f"L{f(x1)} {f(rim)}"
    return [body, f"M{f(x0 - flare)} {f(rim)}L{f(x1 + flare)} {f(rim)}"], [(cx, 15.5, 1.375)]

BELL, CLAPPER = bell()
BELL_RING, CLAPPER_RING = bell(7.75, 4.25, 3.75, 12, 1.75)
ALERT = (15.5, 2.5, 1.375)
tries("bell", [
    ("dome, rim, clapper disc", line_svg(BELL, CLAPPER)),
    ("open: smaller bell with an alert disc", line_svg(BELL_RING, CLAPPER_RING + [ALERT])),
    ("open: clapper swung right", line_svg(BELL, [(11.5, 15.5, 1.375)])),
], 0)
W("bell", line_svg(BELL, CLAPPER), opened=line_svg(BELL_RING, CLAPPER_RING + [ALERT]))


# ---------- broom ----------
def broom(h, s=1.25, flare=8, chop=2.25, band=None, bristles=(), reach=1.5):
    """A broom on the 45° diagonal: the stick from the top-right corner to h, a head flaring 90° from a binding of half-width s."""
    b1, b2 = (h[0] - s, h[1] - s), (h[0] + s, h[1] + s)
    c1, c2 = (b1[0] - flare, b1[1]), (b2[0], b2[1] + flare)
    head = rr([b1, c1, (c1[0], c1[1] + chop), (c2[0] - chop, c2[1]), c2, b2], [0, R, 0, 0, R, 0])
    out = [f"M16.25 1.75L{pt(h)}", head]
    if band is not None:
        k = h[0] - h[1] - band
        out.append(f"M{pt((b1[1] + k, b1[1]))}L{pt((b2[0], b2[0] - k))}")
    tip = c1[0] - c1[1] - chop
    for k in bristles:
        p = ((k + tip) / 2, (k - tip) / 2)
        out.append(f"M{pt(p)}L{pt((p[0] + reach, p[1] - reach))}")
    return out

def upright_broom(neck=7.25, top=1.25, foot=12.75, half=5.25, bristles=(5.5, 9, 12.5), cx=9):
    """A vertical stick into a trapezoid head flaring at 45°, with bristles hanging below the head."""
    shoulder = neck + half - top
    head = rr([(cx - top, neck), (cx + top, neck), (cx + half, shoulder), (cx + half, foot), (cx - half, foot), (cx - half, shoulder)],
              [0, 0, 0, R, R, 0])
    return [f"M{f(cx)} 1.75L{f(cx)} {f(neck)}", head] + [f"M{f(x)} {f(foot)}L{f(x)} 16.25" for x in bristles]

BROOM = broom((12, 6), flare=6, bristles=(13, 18, 23), reach=-2.5)
tries("broom", [
    ("diagonal, flared head", line_svg(broom((11.5, 6.5)))),
    ("diagonal, flared head, band", line_svg(broom((11.5, 6.5), band=5))),
    ("diagonal, flared head, two bristles", line_svg(broom((11.5, 6.5), bristles=(15.5, 20.5)))),
    ("diagonal, longer stick, wider head, three bristles", line_svg(broom((10.5, 7.5), flare=7.5, bristles=(13, 18, 23)))),
    ("upright, short head, long bristles", line_svg(upright_broom(neck=8.25, foot=12.25, half=4.75, bristles=(6, 9, 12)))),
    ("upright, narrow neck, short sides", line_svg(upright_broom())),
    ("upright, trapezoid head, three bristles", line_svg(upright_broom(neck=6.5, top=2, foot=13))),
    ("upright, shorter head, longer bristles", line_svg(upright_broom(neck=5.75, top=2, foot=12.25))),
    ("diagonal, bristles sweeping out of the head", line_svg(BROOM)),
], 8)
W("broom", line_svg(BROOM), duo_svg(sil(BROOM[1]), fg_lines=[BROOM[0], *BROOM[2:]]))


# ---------- bottle ----------
BOTTLE = rr([(7.25, 1.75), (10.75, 1.75), (10.75, 7.25), (13.25, 9.75), (13.25, 16.25), (4.75, 16.25), (4.75, 9.75), (7.25, 7.25)],
            [0, 0, 0, 0, R, R, 0, 0])
CAP_LINE = "M7.25 5.25L10.75 5.25"
BOTTLE_OPEN = rr([(8.75, 3.75), (8.75, 7.25), (11.25, 9.75), (11.25, 16.25), (2.75, 16.25), (2.75, 9.75), (5.25, 7.25), (5.25, 3.75)],
                 [0, 0, 0, R, R, 0, 0, 0], closed=False)
CAP_OFF = rect(12.25, 1.75, 16.25, 5.25)
tries("bottle", [
    ("open: cap set beside the neck", line_svg([BOTTLE_OPEN, CAP_OFF])),
    ("open: no cap", line_svg([BOTTLE_OPEN])),
    ("open: cap tipped as a diamond", line_svg([BOTTLE_OPEN, poly((14.25, 1.75), (16.25, 3.75), (14.25, 5.75), (12.25, 3.75))])),
], 0)
W("bottle", line_svg([BOTTLE, CAP_LINE]), duo_svg(sil(BOTTLE), fg_lines=[CAP_LINE]),
  line_svg([BOTTLE_OPEN, CAP_OFF]))


# ---------- can ----------
def can(top):
    return rr([(6.25, top), (11.75, top), (13.75, top + 2), (13.75, 14.25), (11.75, 16.25), (6.25, 16.25), (4.25, 14.25),
               (4.25, top + 2)], 0)

CAN = can(1.75)
CAN_RIBS = "M4.25 7L13.75 7M4.25 11L13.75 11"
CAN_OPEN = can(5.25)
STRAW = "M10.25 5.25L10.25 1.75"
tries("can", [
    ("chamfered, label band", line_svg([CAN, CAN_RIBS])),
    ("open: shorter can, straw", line_svg([CAN_OPEN, STRAW])),
    ("open: shorter can, straw, band", line_svg([CAN_OPEN, STRAW, "M4.25 10.75L13.75 10.75"])),
], 1)
W("can", line_svg([CAN, CAN_RIBS]), duo_svg(sil(CAN), fg_lines=[CAN_RIBS]),
  line_svg([CAN_OPEN, STRAW]), duo_svg(sil(CAN_OPEN), fg_lines=[STRAW]))


# ---------- jar ----------
def jar(top):
    return rr([(4.25, top), (13.75, top), (15.75, top + 2), (15.75, 16.25), (2.25, 16.25), (2.25, top + 2)], [0, 0, 0, R, R, 0])

JAR_LID = rect(3.25, 1.75, 14.75, 5.25)
JAR = jar(5.25)
JAR_SEAM = "M4.25 5.25L13.75 5.25"
tries("jar", [
    ("lid, shoulders", line_svg([JAR_LID, JAR])),
    ("straight sides", line_svg([JAR_LID, rr([(3.25, 5.25), (14.75, 5.25), (14.75, 16.25), (3.25, 16.25)], [0, 0, R, R])])),
    ("label band", line_svg([JAR_LID, JAR, "M2.25 10.75L15.75 10.75"])),
], 0)
W("jar", line_svg([JAR_LID, JAR]), duo_svg(sil(JAR_LID, JAR), fg_lines=[JAR_SEAM]),
  line_svg([JAR_LID, jar(8.75)]))


# ---------- flask ----------
FLASK = rr([(7.25, 1.75), (10.75, 1.75), (10.75, 4.25), (15.75, 9.25), (15.75, 16.25), (2.25, 16.25), (2.25, 9.25), (7.25, 4.25)],
           [0, 0, 0, 0, R, R, 0, 0])
FLASK_LIP = "M5.75 1.75L12.25 1.75"
LIQUID = "M2.25 12.75L15.75 12.75"
BUBBLE = (9, 9.25, 1.375)
bulb_y = 11.25 - math.sqrt(25 - 1.75 ** 2)
tries("flask", [
    ("conical, liquid line", line_svg([FLASK, FLASK_LIP, LIQUID])),
    ("round bottom", line_svg([f"M7.25 1.75L10.75 1.75L10.75 {f(bulb_y)}" + A(5, (7.25, bulb_y), 1, 1) + "Z", FLASK_LIP,
                               "M4.25 12.75L13.75 12.75"])),
    ("test tube", line_svg(["M6.75 1.75L6.75 13.75" + A(2.25, (11.25, 13.75), 0) + "L11.25 1.75", "M5.25 1.75L12.75 1.75"])),
], 0)
W("flask", line_svg([FLASK, FLASK_LIP, LIQUID]), duo_svg(sil(FLASK), fg_lines=[FLASK_LIP, LIQUID]),
  line_svg([FLASK, FLASK_LIP, LIQUID], [BUBBLE]),
  duo_svg(sil(FLASK), fg_lines=[FLASK_LIP, LIQUID], fg_dots=[(9, 9.25, 1.5)]))


# ---------- coffee ----------
MUG = rect(1.75, 8.25, 12.25, 16.25)
MUG_HANDLE = rr([(12.25, 10.5), (16.25, 10.5), (16.25, 14.5), (12.25, 14.5)], [0, R, R, 0], closed=False)
steam = lambda *xs: "".join(f"M{f(x)} 1.75L{f(x)} 4.75" for x in xs)
STEAM, STEAM_OPEN = steam(5.25, 8.75), steam(3.5, 7, 10.5)

def wisp(x):
    """A steam S of two r1.5 quarter arcs rising 3 and drifting 3 right."""
    return f"M{f(x)} 4.75" + A(R, (x + 1.5, 3.25), 1) + A(R, (x + 3, 1.75), 0)

tries("coffee", [
    ("mug, square handle, two steam lines", line_svg([MUG, MUG_HANDLE, STEAM])),
    ("open: three steam lines", line_svg([MUG, MUG_HANDLE, STEAM_OPEN])),
    ("open: two steam wisps", line_svg([MUG, MUG_HANDLE, wisp(2.25), wisp(7.25)])),
], 0)
W("coffee", line_svg([MUG, MUG_HANDLE, STEAM]), duo_svg(sil(MUG), fg_lines=[MUG_HANDLE, STEAM]),
  line_svg([MUG, MUG_HANDLE, STEAM_OPEN]), duo_svg(sil(MUG), fg_lines=[MUG_HANDLE, STEAM_OPEN]))


# ---------- fork-knife ----------
FORK = "M1.75 1.75L1.75 5.25A3.5 3.5 0 0 0 8.75 5.25L8.75 1.75M5.25 1.75L5.25 5.25M5.25 8.75L5.25 16.25"
KNIFE = "M12.5 16.25L12.5 3.625A1.875 1.875 0 0 1 16.25 3.625L16.25 8.75" + A(R, (14.75, 10.25), 1) + "L12.5 10.25"

def crossed(c=(9.25, 9), tine=5.75, u=2.5, blade=(2.5, 5), w=2.5, end=6.75):
    """Fork on x+y and knife on x−y through c, built in 45° frames whose steps keep every anchor on the grid."""
    pf = lambda s, t: (c[0] + s + t, c[1] - s + t)
    pk = lambda s, t: (c[0] - s + t, c[1] - s - t)
    fork = [rr([pf(tine, -1.25), pf(u, -1.25), pf(u, 1.25), pf(tine, 1.25)], [0, R, R, 0], closed=False),
            f"M{pt(pf(u, 0))}L{pt(pf(-end, 0))}"]
    b0, b1 = blade
    knife = rr([pk(-end, 0), pk(b1, 0), pk(b1, -w), pk(b0, -w), pk(b0, 0)], [0, R, R, R, 0], closed=False)
    return fork + [knife]

FK_OPEN = crossed((9.75, 9), 5.25, blade=(2.5, 5.25), w=2.75, end=6.5)
tries("fork-knife", [
    ("three-tine fork, round-tip knife", line_svg([FORK, KNIFE])),
    ("open: crossed, blade on the left", line_svg(crossed())),
    ("open: crossed on the centre, short blade", line_svg(crossed((9, 9), 6, blade=(2.5, 4.75)))),
    ("open: wide blade 3", line_svg(crossed(blade=(2, 4.5), w=3))),
    ("open: wide blade 2.75", line_svg(crossed(blade=(2.25, 4.75), w=2.75))),
    ("open: longer blade, crossing nudged right", line_svg(FK_OPEN)),
], 0)
W("fork-knife", line_svg([FORK, KNIFE]), opened=line_svg(FK_OPEN))


# ---------- takeout ----------
TAKEOUT = rr([(3.75, 9), (6.75, 6), (11.25, 6), (14.25, 9), (14.25, 16.25), (3.75, 16.25)], [0, 0, 0, 0, R, R])
TK_HANDLE = "M7.25 6L7.25 3.5A1.75 1.75 0 0 1 10.75 3.5L10.75 6"
TK_OPEN = rr([(3.75, 9), (14.25, 9), (14.25, 16.25), (3.75, 16.25)], [0, 0, R, R])
TK_FLAPS = "M3.75 9L1.75 7M14.25 9L16.25 7"
TK_HANDLE_OPEN = "M6.75 9L6.75 4A2.25 2.25 0 0 1 11.25 4L11.25 9"
tries("takeout", [
    ("gable box, wire handle, no fold", line_svg([TAKEOUT, TK_HANDLE])),
    ("gable box with fold line", line_svg([TAKEOUT, "M3.75 9L14.25 9", TK_HANDLE])),
    ("box, arc handle", line_svg([rect(3.75, 7.5, 14.25, 16.25), "M5.25 7.5A3.75 3.75 0 0 1 12.75 7.5"])),
], 0)
W("takeout", line_svg([TAKEOUT, TK_HANDLE]), duo_svg(sil(TAKEOUT), fg_lines=[TK_HANDLE]),
  line_svg([TK_OPEN, TK_FLAPS, TK_HANDLE_OPEN]))


# ---------- dice ----------
DIE = rect(1.75, 1.75, 16.25, 16.25)
PIPS5 = [(5.375, 5.375), (12.625, 5.375), (9, 9), (5.375, 12.625), (12.625, 12.625)]
PIPS4 = [(5.375, 5.375), (12.625, 5.375), (5.375, 12.625), (12.625, 12.625)]
PIPS6 = [(x, y) for x in (5.375, 12.625) for y in (4.75, 9, 13.25)]
DIE_TILT = rr([(9, 1.75), (16.25, 9), (9, 16.25), (1.75, 9)], R)
PIPS2 = [(7, 9), (11, 9)]
dots = lambda ps, r=1.375: [(x, y, r) for x, y in ps]
tries("dice", [
    ("five", line_svg([DIE], dots(PIPS5))),
    ("open: tilted, two pips 4 apart", line_svg([DIE_TILT], dots(PIPS2))),
    ("open: tilted, one pip", line_svg([DIE_TILT], dots([(9, 9)]))),
], 0)
W("dice", line_svg([DIE], dots(PIPS5)), duo_svg(sil(DIE), fg_dots=dots(PIPS5, 1.5)),
  line_svg([DIE_TILT], dots(PIPS2)), duo_svg(sil(DIE_TILT), fg_dots=dots(PIPS2, 1.5)))


# ---------- puzzle ----------
def knob(c, r, axis_off):
    """Half the chord where a knob circle of radius r crosses an edge axis_off from its centre."""
    return math.sqrt(r * r - axis_off * axis_off)

kr = 2.125; kd = knob((0, 0), kr, 1.625)
PUZZLE = (f"M3.25 5.5L{pt((7.125 - kd, 5.5))}" + A(kr, (7.125 + kd, 5.5), 1, 1) + "L11 5.5" + A(R, (12.5, 7), 1)
          + f"L{pt((12.5, 10.875 - kd))}" + A(kr, (12.5, 10.875 + kd), 1, 1) + "L12.5 14.75" + A(R, (11, 16.25), 1)
          + "L3.25 16.25" + A(R, (1.75, 14.75), 1) + "L1.75 7" + A(R, (3.25, 5.5), 1) + "Z")
PUZZLE_TOP = (f"M3.25 5.5L{pt((7.125 - kd, 5.5))}" + A(kr, (7.125 + kd, 5.5), 1, 1) + "L11 5.5" + A(R, (12.5, 7), 1)
              + "L12.5 14.75" + A(R, (11, 16.25), 1) + "L3.25 16.25" + A(R, (1.75, 14.75), 1) + "L1.75 7" + A(R, (3.25, 5.5), 1) + "Z")
PUZZLE_NOTCH = (f"M3.25 5.5L{pt((7.125 - kd, 5.5))}" + A(kr, (7.125 + kd, 5.5), 1, 1) + "L11 5.5" + A(R, (12.5, 7), 1)
                + f"L{pt((12.5, 10.875 - kd))}" + A(kr, (12.5, 10.875 + kd), 1, 1) + "L12.5 14.75" + A(R, (11, 16.25), 1)
                + "L3.25 16.25" + A(R, (1.75, 14.75), 1) + "L1.75 13" + A(kr, (1.75, 8.75), 0) + "L1.75 7"
                + A(R, (3.25, 5.5), 1) + "Z")
def piece(x0, y0, x1, y1, feats, kr=2.125, ko=1):
    """A piece with r1.5 corners; feats maps a side (0 top, 1 right, 2 bottom, 3 left) to [(kind, offset)], a knob out or a socket in."""
    kh = math.sqrt(kr * kr - ko * ko)
    cs = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    d = f"M{pt((x0 + R, y0))}"
    for i in range(4):
        P, Q, N = cs[i], cs[(i + 1) % 4], cs[(i + 2) % 4]
        u = unit(P, Q); v = unit(Q, N)
        for kind, t in feats.get(i, []):
            c = (P[0] + u[0] * t, P[1] + u[1] * t)
            d += f"L{pt((c[0] - u[0] * kh, c[1] - u[1] * kh))}" + A(kr, (c[0] + u[0] * kh, c[1] + u[1] * kh), 1 if kind == "knob" else 0, 1)
        d += f"L{pt((Q[0] - u[0] * R, Q[1] - u[1] * R))}" + A(R, (Q[0] + v[0] * R, Q[1] + v[1] * R), 1)
    return d + "Z"

P_KNOBS = {0: [("knob", 5.375)], 1: [("knob", 5.375)]}
PUZZLE_K1 = piece(1.75, 5.5, 12.5, 16.25, P_KNOBS)
PUZZLE_K1_OPEN = [piece(1.75, 3.5, 5.75, 14.5, {1: [("knob", 5.5)]}, 1.75, 0),
                  piece(11, 3.5, 16.25, 14.5, {3: [("socket", 5.5)]}, 1.75, 0)]
PUZZLE_V_OPEN = [piece(1.75, 1.75, 16.25, 5.25, {2: [("knob", 7.25)]}, 1.75, 0),
                 piece(1.75, 10.25, 16.25, 16.25, {0: [("socket", 7.25)]}, 1.75, 0)]
PUZZLE_PAIR = [rect(1.75, 3.5, 16.25, 14.5), f"M9 3.5L9 {f(9 - knob((0, 0), 2, 1.25))}" + A(2, (9, 9 + knob((0, 0), 2, 1.25)), 1, 1) + "L9 14.5"]
LID_K = "M1.75 4.75L4.875 4.75" + A(2.25, (9.375, 4.75), 1) + "L12.5 4.75"
BODY_U = rr([(1.75, 8.25), (1.75, 16.25), (12.5, 16.25), (12.5, 8.25)], [0, R, R, 0], closed=False)
BODY_U_K = ("M1.75 8.25L1.75 14.75" + A(R, (3.25, 16.25), 0) + "L11 16.25" + A(R, (12.5, 14.75), 0)
            + "L12.5 13.5" + A(2, (12.5, 9.5), 0) + "L12.5 8.25")
tries("puzzle", [
    ("open: knob cap lifted off", line_svg([LID_K, BODY_U_K])),
    ("open: knob cap lifted, plain body", line_svg([LID_K, BODY_U])),
    ("open: two pieces pulled apart sideways", line_svg(PUZZLE_K1_OPEN)),
    ("open: two pieces pulled apart vertically", line_svg(PUZZLE_V_OPEN)),
    ("open: interlocked halves", line_svg(PUZZLE_PAIR)),
], 0)
W("puzzle", line_svg([PUZZLE_K1]), opened=line_svg([LID_K, BODY_U_K]))


# ---------- gift ----------
GIFT_LID = rect(1.75, 5.5, 16.25, 9)
GIFT_BODY = "M2.75 9L2.75 14.75" + A(R, (4.25, 16.25), 0) + "L13.75 16.25" + A(R, (15.25, 14.75), 0) + "L15.25 9"
GIFT_BODY_SIL = rr([(2.75, 9), (15.25, 9), (15.25, 16.25), (2.75, 16.25)], [0, 0, R, R])
RIBBON = "M9 5.5L9 16.25"
loop = lambda x: f"M{f(x)} 5.5L{f(x)} 3.5" + A(1.75, (x + 3.5, 3.5), 1) + f"L{f(x + 3.5)} 5.5"
BOW = loop(3.75) + loop(10.75)
GIFT_SEAM = "M2.75 9L15.25 9"
GIFT_LID_UP = rect(1.75, 1.75, 16.25, 5.25)
GIFT_BODY_OPEN = rr([(2.75, 8.75), (15.25, 8.75), (15.25, 16.25), (2.75, 16.25)], [0, 0, R, R])
RIBBON_OPEN = "M9 1.75L9 5.25M9 8.75L9 16.25"
tries("gift", [
    ("lid band, two loops either side of the ribbon", line_svg([GIFT_LID, GIFT_BODY, RIBBON, BOW])),
    ("lid band, no bow", line_svg([GIFT_LID, GIFT_BODY, RIBBON])),
    ("lid band, loops sharing the ribbon", line_svg([GIFT_LID, GIFT_BODY, "M9 3.5L9 16.25",
                                                     "M5.5 5.5L5.5 3.5" + A(1.75, (9, 3.5), 1), "M12.5 5.5L12.5 3.5" + A(1.75, (9, 3.5), 0)])),
], 0)
W("gift", line_svg([GIFT_LID, GIFT_BODY, RIBBON, BOW]),
  duo_svg(sil(GIFT_LID, GIFT_BODY_SIL), fg_lines=[GIFT_SEAM, RIBBON, BOW]),
  line_svg([GIFT_LID_UP, GIFT_BODY_OPEN, RIBBON_OPEN]),
  duo_svg(sil(GIFT_LID_UP, GIFT_BODY_OPEN), fg_lines=[RIBBON_OPEN]))


# ---------- party-popper ----------
def popper(apex=(2.25, 18.75), r=12.5, band=8.5, base=16.25):
    """A 45° cone from a virtual apex past the canvas, chopped flat at base, its mouth an arc round the apex."""
    ax, ay = apex
    d = lambda k: (ax + k / SQ, ay - k / SQ)
    chop = (ax + ay - base, base)
    cone = (f"M{f(ax)} {f(base - R)}L{f(ax)} {f(ay - r)}" + A(r, d(r), 1) + f"L{pt(chop)}"
            + f"L{f(ax + R)} {f(base)}" + A(R, (ax, base - R), 1) + "Z")
    return cone, f"M{f(ax)} {f(ay - band)}" + A(band, d(band), 1)

def corner_cone(side=6.75, step=1.5, tip=(1.75, 16.25)):
    """A 90° cone tipped into the bottom-left corner, its mouth a 45° rim facing top-right with short square shoulders."""
    x, y = tip; s = side
    return rr([tip, (x, y - s), (x + step, y - s), (x + s, y - step), (x + s, y)], [R, R, 0, 0, R])

def quarter_cone(r=7.5, tip=(1.75, 16.25)):
    x, y = tip
    return f"M{f(x)} {f(y - R)}L{f(x)} {f(y - r)}" + A(r, (x + r, y), 1) + f"L{f(x + R)} {f(y)}" + A(R, (x, y - R), 1) + "Z"

CONE, CONE_BAND = popper()
POPPER = corner_cone(9, 3)
STREAMERS = ["M7 1.75L7 4.25", "M10.25 7.75L13 5", "M13.75 11L16.25 11"]
BURST, BURST_MORE = [(10.5, 2.5), (15.5, 7.5)], [(10.5, 2.5), (15.5, 7.5), (3, 3), (15, 15)]
STREAMERS0 = ["M7 1.75L7 5", "M9.75 8.25L12.75 5.25", "M13 11L16.25 11"]
QBAND = "M1.75 12.125" + A(4.125, (5.875, 16.25), 1)
tries("party-popper", [
    ("long 45° cone, arc mouth, band", line_svg([CONE, CONE_BAND])),
    ("quarter-circle cone r7, burst", line_svg([quarter_cone(7)] + STREAMERS0, dots(BURST))),
    ("quarter-circle cone r7.625, burst", line_svg([quarter_cone(7.625)] + STREAMERS0, dots(BURST))),
    ("quarter-circle cone, stripe, burst", line_svg([quarter_cone(7.625), QBAND] + STREAMERS0, dots(BURST))),
    ("corner cone, shoulders 1.5", line_svg([corner_cone()])),
    ("corner cone, short sides, burst", line_svg([corner_cone(8, 2.75)] + STREAMERS0, dots(BURST))),
    ("corner cone, longer sides, no burst", line_svg([POPPER])),
    ("corner cone, longer sides, streamers and confetti from the mouth", line_svg([POPPER] + STREAMERS, dots(BURST))),
    ("open: more confetti", line_svg([POPPER] + STREAMERS, dots(BURST_MORE))),
], 7)
W("party-popper", line_svg([POPPER] + STREAMERS, dots(BURST)),
  duo_svg(sil(POPPER), fg_lines=STREAMERS, fg_dots=dots(BURST, 1.5)),
  line_svg([POPPER] + STREAMERS, dots(BURST_MORE)),
  duo_svg(sil(POPPER), fg_lines=STREAMERS, fg_dots=dots(BURST_MORE, 1.5)))


# ---------- trophy ----------
CUP = ("M5.25 7.5L5.25 3.25" + A(R, (6.75, 1.75), 1) + "L11.25 1.75" + A(R, (12.75, 3.25), 1)
       + "L12.75 7.5" + A(3.75, (5.25, 7.5), 1) + "Z")
EARS = [rr([(5.25, 3.5), (1.75, 3.5), (1.75, 7), (5.25, 7)], [0, R, R, 0], closed=False),
        rr([(12.75, 3.5), (16.25, 3.5), (16.25, 7), (12.75, 7)], [0, R, R, 0], closed=False)]
STEM = "M9 11.25L9 16.25"
BASE = "M5.75 16.25L12.25 16.25"
EMBLEM = (9, 5.5, 1.375)
tries("trophy", [
    ("rounded cup, square ears, stem, base", line_svg([CUP, *EARS, STEM, BASE])),
    ("no ears", line_svg([CUP, STEM, BASE])),
    ("open: emblem disc in the cup", line_svg([CUP, *EARS, STEM, BASE], [EMBLEM])),
], 0)
W("trophy", line_svg([CUP, *EARS, STEM, BASE]), duo_svg(sil(CUP), fg_lines=[*EARS, STEM, BASE]),
  line_svg([CUP, *EARS, STEM, BASE], [EMBLEM]), duo_svg(sil(CUP), fg_lines=[*EARS, STEM, BASE], fg_dots=[(9, 5.5, 1.5)]))


# ---------- scissors ----------
e = 2.5 / math.sqrt(2)
RINGS = [circle_d((4.75, 13.25), 2.5), circle_d((13.25, 13.25), 2.5)]
ARMS = f"M{pt((4.75 + e, 13.25 - e))}L9 9L{pt((13.25 - e, 13.25 - e))}"
BLADE = "M9 9L9 1.75"
BLADES_OPEN = f"M{pt((4.75 + e, 13.25 - e))}L16.25 1.75M{pt((13.25 - e, 13.25 - e))}L1.75 1.75"
tries("scissors", [
    ("rings, arms, closed blade", line_svg(RINGS + [ARMS, BLADE])),
    ("with pivot", line_svg(RINGS + [ARMS, BLADE], [(9, 9, 1.375)])),
], 0)
W("scissors", line_svg(RINGS + [ARMS, BLADE]), opened=line_svg(RINGS + [BLADES_OPEN]))


# ---------- candle ----------
CANDLE = rect(6, 6.5, 12, 16.25)
WICK = "M9 3.75L9 6.5"
def flame(apex=(9, 1.75), r=1.75):
    """A teardrop: a 90° tip on the grid, 45° sides, and an r fillet round the bottom."""
    c = (apex[0], apex[1] + r * SQ)
    return f"M{pt(apex)}L{pt(on_circle(c, r, -45))}" + A(r, on_circle(c, r, 225), 1, 1) + "Z", c[1] + r

FLAME, flame_bottom = flame()
CANDLE_LOW = rect(6, 9.5, 12, 16.25)
WICK_LOW = f"M9 {f(flame_bottom)}L9 9.5"
tries("candle", [
    ("pillar, wick", line_svg([CANDLE, WICK])),
    ("open: shorter pillar, teardrop flame on a grid tip", line_svg([CANDLE_LOW, WICK_LOW, FLAME])),
    ("open: flame only, no wick", line_svg([rect(6, 8.75, 12, 16.25), FLAME])),
], 1)
W("candle", line_svg([CANDLE, WICK]), opened=line_svg([CANDLE_LOW, WICK_LOW, FLAME]))


# ---------- fan ----------
def sector(c, r, a0, a1):
    """A folding-fan leaf: a pie slice from pivot c spanning a0..a1 degrees, clockwise on screen."""
    return f"M{pt(c)}L{pt(on_circle(c, r, a0))}" + A(r, on_circle(c, r, a1), 1, int(a1 - a0 > 180)) + "Z"

def fan_ribs(c, r0, r1, *angles):
    return "".join(f"M{pt(on_circle(c, r0, a))}L{pt(on_circle(c, r1, a))}" for a in angles)

FAN = [sector((9, 12.75), 10.25, 225, 315), fan_ribs((9, 12.75), 5, 10.25, 270), "M9 12.75L9 16.25"]
FAN_OPEN = ["M1.75 9" + A(7.25, (16.25, 9), 1) + A(R, (14.75, 10.5), 1) + "L3.25 10.5" + A(R, (1.75, 9), 1) + "Z",
            fan_ribs((9, 9), 3.5 * SQ, 7.25, 225, 315) + fan_ribs((9, 9), 5, 7.25, 270), "M9 10.5L9 16.25"]
tries("fan", [
    ("quarter sector, centre rib, handle", line_svg(FAN)),
    ("quarter sector, no rib", line_svg([FAN[0], FAN[2]])),
    ("open: half disc with a rounded skirt, three ribs, handle", line_svg(FAN_OPEN)),
], 0)
W("fan", line_svg(FAN), duo_svg(sil(FAN[0]), fg_lines=FAN[1:]),
  line_svg(FAN_OPEN), duo_svg(sil(FAN_OPEN[0]), fg_lines=FAN_OPEN[1:]))


save_meta("home")
