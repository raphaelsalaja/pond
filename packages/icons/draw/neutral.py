"""Neutral drawing library: geometry, the registered parts, cuts around badges and slashes, and SVG writers."""
import json, math, os, re

ICONS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(ICONS, "next")
OUT = NEXT
W = 1.25          # line stroke
H = W / 2
DW = 1.5          # duo stroked detail
SQ = math.sqrt(2)

def f(v):
    s = f"{round(v, 3):.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def pt(p):
    return f"{f(p[0])} {f(p[1])}"

# ---------- segments ----------
class Line:
    def __init__(s, a, b): s.a, s.b = a, b
    def at(s, t): return (s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t)
    def tan(s, t):
        dx, dy = s.b[0] - s.a[0], s.b[1] - s.a[1]; l = math.hypot(dx, dy); return (dx / l, dy / l)
    def d(s, t0, t1): return f"L{pt(s.at(t1))}"

class Arc:
    """Circle arc from angle a0 to a1 (radians, screen coords), sweep 1 = increasing angle."""
    def __init__(s, c, r, a0, a1): s.c, s.r, s.a0, s.a1 = c, r, a0, a1
    def ang(s, t): return s.a0 + (s.a1 - s.a0) * t
    def at(s, t):
        a = s.ang(t); return (s.c[0] + s.r * math.cos(a), s.c[1] + s.r * math.sin(a))
    def tan(s, t):
        a = s.ang(t); k = 1 if s.a1 > s.a0 else -1; return (-math.sin(a) * k, math.cos(a) * k)
    def d(s, t0, t1):
        span = abs(s.a1 - s.a0) * abs(t1 - t0)
        large = 1 if span > math.pi else 0
        sweep = 1 if s.a1 > s.a0 else 0
        return f"A{f(s.r)} {f(s.r)} 0 {large} {sweep} {pt(s.at(t1))}"

def arc_pts(c, r, p0, p1, sweep):
    a0 = math.atan2(p0[1] - c[1], p0[0] - c[0]); a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
    if sweep and a1 <= a0: a1 += 2 * math.pi
    if not sweep and a1 >= a0: a1 -= 2 * math.pi
    return Arc(c, r, a0, a1)

def path(segs, closed=False):
    out = f"M{pt(segs[0].at(0))}" + "".join(s.d(0, 1) for s in segs)
    return out + ("Z" if closed else "")

# ---------- slash band ----------
def sd(p): return (p[0] - p[1]) / SQ   # signed distance to the slash line x = y

def ok_stroke(seg, t, clear):
    p = seg.at(t); tx, ty = seg.tan(t); n = (-ty, tx)
    s1 = sd((p[0] + n[0] * H, p[1] + n[1] * H)); s2 = sd((p[0] - n[0] * H, p[1] - n[1] * H))
    return (s1 >= clear and s2 >= clear) or (s1 <= -clear and s2 <= -clear)

def bisect(fn, lo, hi):
    a = fn(lo)
    for _ in range(60):
        m = (lo + hi) / 2
        if fn(m) == a: lo = m
        else: hi = m
    return (lo + hi) / 2

def sub(seg, t0, t1):
    if isinstance(seg, Line): return f"L{pt(seg.at(t1))}"
    return Arc(seg.c, seg.r, seg.ang(t0), seg.ang(t1)).d(0, 1)

def runs(segs, keep, N=400):
    """Kept stretches of a closed path as ((i0, t0), (i1, t1)), each end refined to the boundary."""
    S = [(i, k / N) for i in range(len(segs)) for k in range(N)]
    g = [keep(segs[i], t) for i, t in S]
    n = len(S)
    starts = [j for j in range(n) if g[j] and not g[j - 1]]
    out = []
    for j in starts:
        e = j
        while g[(e + 1) % n]: e += 1
        a, b = S[j - 1], S[j]
        i0 = b[0]; t0 = bisect(lambda u: keep(segs[i0], u), b[1], b[1] - 1 / N if b[1] > 0 else 0.0) if a[0] == b[0] else (0.0 if keep(segs[b[0]], 0.0) else bisect(lambda u: keep(segs[i0], u), b[1], 0.0))
        c, d = S[e % n], S[(e + 1) % n]
        i1 = c[0]; t1 = bisect(lambda u: keep(segs[i1], u), c[1], c[1] + 1 / N) if c[0] == d[0] else (1.0 if keep(segs[i1], 1.0) else bisect(lambda u: keep(segs[i1], u), c[1], 1.0))
        out.append(((i0, t0), (i1, t1)))
    return out

def walk(segs, a, b):
    (i, t), (i1, t1) = a, b
    d = f"M{pt(segs[i].at(t))}"
    while True:
        if i == i1 and t <= t1:
            return d + sub(segs[i], t, t1)
        d += sub(segs[i], t, 1.0); i = (i + 1) % len(segs); t = 0.0

def trim_stroke(segs, clear):
    """Cuts a closed stroked path where its butt corners come within `clear` of the slash centre."""
    return [walk(segs, a, b) for a, b in runs(segs, lambda s, t: ok_stroke(s, t, clear))]

def drop_stubs(d, shortest=1.0):
    """Drops a straight end shorter than `shortest`, so a cut ends on the corner before it."""
    out = []
    for segs, closed in parse(d):
        if not closed and len(segs) > 1 and isinstance(segs[-1], Line) and math.dist(segs[-1].a, segs[-1].b) < shortest: segs = segs[:-1]
        if not closed and len(segs) > 1 and isinstance(segs[0], Line) and math.dist(segs[0].a, segs[0].b) < shortest: segs = segs[1:]
        out.append(path(segs, closed))
    return "".join(out)

def clip_fill(segs, clear):
    """Keeps a closed silhouette's parts at least `clear` from the slash centre, cut flat along the band."""
    out = []
    for side in (1, -1):
        for a, b in runs(segs, lambda s, t, side=side: side * sd(s.at(t)) >= clear):
            out.append(walk(segs, a, b) + "Z")
    return out

# ---------- corners ----------
R = 1.5        # box corner as drawn
BOX_R = 2.5    # box corner as written
EASE = 1.25    # every other corner where two lines meet
SHARE = 4      # a corner's radius is at most a quarter of its shorter segment
SHARP = 2 * math.pi / 3  # a turn past 120°, an angle under 60°, halves the radius

def _vertex(a, b):
    """Where the carriers of two lines cross."""
    u, v = a.tan(0), b.tan(0)
    den = u[0] * v[1] - u[1] * v[0]
    if abs(den) < 1e-9: return None
    t = ((b.a[0] - a.a[0]) * v[1] - (b.a[1] - a.a[1]) * v[0]) / den
    return (a.a[0] + u[0] * t, a.a[1] + u[1] * t)

def soften_segs(segs, closed, o=0.0, arcs=None, joints=()):
    """Rounds a subpath's corners: r1.5 box arcs between lines grow to BOX_R, line-line corners take EASE, each moved by o for a silhouette.

    @remarks A line-line corner where another stroke ends is a junction, so it stays sharp."""
    n = len(segs)
    if n < 2: return segs
    orient = (1 if _area(segs) > 0 else -1) if closed else 0
    def side(u, w): return 1 if not orient else (1 if (u[0] * w[1] - u[1] * w[0]) * orient > 0 else -1)
    items = [{"a": s.a, "b": s.b, "box": None} if isinstance(s, Line) else s for s in segs]
    for i, s in enumerate(segs):
        if not isinstance(s, Arc) or abs(s.a1 - s.a0) >= 2.9 or not (closed or 0 < i < n - 1): continue
        p, q = segs[i - 1], segs[(i + 1) % n]
        if not (isinstance(p, Line) and isinstance(q, Line)): continue
        x = _vertex(p, q)
        if x is None or abs(s.r - (R + side(p.tan(1), q.tan(0)) * o)) > 1e-3: continue
        items[i - 1]["b"] = x; items[(i + 1) % n]["a"] = x
        items[(i + 1) % n]["box"] = s.r * math.tan(abs(s.a1 - s.a0) / 2); items[i] = None
    items = [it for it in items if it is not None]
    m = len(items)
    line = lambda it: isinstance(it, dict)

    def corner(k):
        """The fillet where items[k-1] runs into items[k], sized by the radius table."""
        if not closed and k == 0: return None
        prev, cur = items[k - 1], items[k]
        if not (line(prev) and line(cur)) or math.dist(prev["b"], cur["a"]) > 1e-6: return None
        boxed = cur["box"] is not None
        a, b, c = prev["a"], cur["a"], cur["b"]
        if math.dist(a, b) < 1e-6 or math.dist(b, c) < 1e-6: return None
        if not boxed and any(math.dist(b, j) < 1e-6 for j in joints): return None
        u, w = Line(a, b).tan(0), Line(b, c).tan(0)
        th = math.acos(max(-1, min(1, u[0] * w[0] + u[1] * w[1])))
        if th < 1e-3 or th > 2.9: return None
        sg = side(u, w); half = math.tan(th / 2)
        r = min(BOX_R if boxed else EASE, math.dist(a, b) / SHARE, math.dist(b, c) / SHARE)
        if th > SHARP: r /= 2
        r = max(r + sg * o, 0.0)
        if r < 1e-6: return None
        tl = r * half
        cross = u[0] * w[1] - u[1] * w[0]
        return arc_from((b[0] - u[0] * tl, b[1] - u[1] * tl), (b[0] + w[0] * tl, b[1] + w[1] * tl), r, 0, 1 if cross > 0 else 0)

    fil = [corner(k) for k in range(m)]
    if arcs is not None: arcs += [a for a in fil if a]
    out = []
    for k, it in enumerate(items):
        if not line(it): out.append(it); continue
        a, b = it["a"], it["b"]
        if fil[k]: out.append(fil[k]); a = fil[k].at(1)
        nxt = (k + 1) % m if closed else k + 1
        if nxt < m and fil[nxt]: b = fil[nxt].at(0)
        if math.dist(a, b) > 1e-6: out.append(Line(a, b))
    return out

def soften(d, o=0.0, arcs=None, joints=()):
    """A path string with every subpath's corners rounded; the fillets land in arcs when given."""
    return "".join(path(soften_segs(segs, closed, o, arcs, joints), closed) for segs, closed in parse(d))

def ends(paths):
    """Every open subpath's end points."""
    return [s for d in paths for segs, closed in parse(d) if not closed for s in (segs[0].at(0), segs[-1].at(1))]

def meet_corners(d, arcs, inset=0.0):
    """Pulls an open line's end that sat on a corner now rounded back along the line to that corner's arc, inset for a silhouette."""
    out = []
    for segs, closed in parse(d):
        if not closed:
            for end in (0, -1):
                s = segs[end]
                if not isinstance(s, Line): continue
                p, q = (s.a, s.b) if end else (s.b, s.a)
                for a in arcs:
                    r = a.r - inset
                    lo, hi = sorted((a.a0, a.a1)); ang = math.atan2(q[1] - a.c[1], q[0] - a.c[0])
                    while ang < lo - 1e-9: ang += 2 * math.pi
                    while ang > lo + 2 * math.pi: ang -= 2 * math.pi
                    reach = a.r / math.cos((hi - lo) / 2) + 1e-6 - inset
                    if not (lo - 1e-6 <= ang <= hi + 1e-6 and r + 1e-6 < math.dist(q, a.c) <= reach): continue
                    u = Line(p, q).tan(0); fx, fy = p[0] - a.c[0], p[1] - a.c[1]
                    bq = fx * u[0] + fy * u[1]; disc = bq * bq - (fx * fx + fy * fy - r * r)
                    if disc < 0: continue
                    span = math.dist(p, q)
                    ts = [t for t in (-bq - math.sqrt(disc), -bq + math.sqrt(disc)) if 1e-6 < t <= span + 1e-6]
                    if not ts: continue
                    t = max(ts)
                    q = (p[0] + u[0] * t, p[1] + u[1] * t)
                    segs[end] = Line(s.a, q) if end else Line(q, s.b)
                    break
        out.append(path(segs, closed))
    return "".join(out)

# ---------- svg writers ----------
LINE_HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" '
             'stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">')

def line_svg(paths, dots=()):
    arcs, joints = [], ends(paths)
    paths = [soften(d, arcs=arcs, joints=joints) for d in paths]
    paths = [meet_corners(d, arcs) for d in paths]
    body = "".join(f'<path d="{d}"/>' for d in paths)
    body += "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="currentColor" stroke="none"/>' for x, y, r in dots)
    return LINE_HEAD + body + "</svg>\n"

def duo_svg(bg, fg=(), fg_lines=(), fg_dots=()):
    arcs = []
    joints = ends(fg_lines)
    bg, fg, fg_lines = [soften(d, H, arcs) for d in bg], [soften(d) for d in fg], [soften(d, joints=joints) for d in fg_lines]
    fg_lines = [meet_corners(d, arcs, H) for d in fg_lines]
    body = "".join(f'<path class="bg" opacity="0.35" d="{d}"/>' for d in bg)
    body += "".join(f'<path class="fg" d="{d}"/>' for d in fg)
    body += "".join(f'<circle class="fg" cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/>' for x, y, r in fg_dots)
    body += "".join(
        f'<path class="fg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="{d}"/>'
        for d in fg_lines)
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="currentColor">' + body + "</svg>\n"

def circle_d(c, r):
    x, y = c
    return f"M{f(x)} {f(y - r)}A{f(r)} {f(r)} 0 1 1 {f(x)} {f(y + r)}A{f(r)} {f(r)} 0 1 1 {f(x)} {f(y - r)}Z"

def poly(*ps, closed=True):
    return "M" + "L".join(pt(p) for p in ps) + ("Z" if closed else "")

def write(name, outline=None, duo=None, opened=None, duo_opened=None, solid=None, out=None):
    """Writes next/<name>/outline-18.svg, and duo-18.svg, outline-18-open.svg, duo-18-open.svg, fill-18.svg when given."""
    d = os.path.join(out or OUT, name); os.makedirs(d, exist_ok=True)
    for file, svg in (("outline-18.svg", outline), ("duo-18.svg", duo),
                      ("outline-18-open.svg", opened), ("duo-18-open.svg", duo_opened), ("fill-18.svg", solid)):
        p = os.path.join(d, file)
        if svg: open(p, "w").write(svg)
        elif os.path.exists(p): os.remove(p)

O = H  # silhouette offset from the line centre to its outer edge
RO = R + O


# ---------- path parsing ----------
def arc_from(p0, p1, r, large, sweep):
    """The circular arc of radius r from p0 to p1, as an Arc."""
    dx, dy = (p1[0] - p0[0]) / 2, (p1[1] - p0[1]) / 2
    dist = math.hypot(dx, dy); r = max(r, dist)
    h = math.sqrt(max(r * r - dist * dist, 0.0))
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    ux, uy = -dy / dist, dx / dist
    best = None
    for s in (1, -1):
        c = (mx + s * h * ux, my + s * h * uy)
        a0 = math.atan2(p0[1] - c[1], p0[0] - c[0]); a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
        if sweep:
            while a1 <= a0: a1 += 2 * math.pi
        else:
            while a1 >= a0: a1 -= 2 * math.pi
        span = abs(a1 - a0)
        if abs(span - math.pi) < 1e-6 or (span > math.pi) == bool(large):
            return Arc(c, r, a0, a1)
        best = Arc(c, r, a0, a1)
    return best

TOKEN = re.compile(r"[MLHVAZmlhvaz]|-?\d*\.?\d+(?:e-?\d+)?")

def parse(d):
    """Absolute M, L, H, V, A and Z into [(segs, closed)]."""
    toks = TOKEN.findall(d); i = 0; out = []; segs = []; cur = start = (0.0, 0.0); cmd = None
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    while i < len(toks):
        if toks[i].isalpha(): cmd = toks[i]; i += 1
        if cmd in "Zz":
            if math.dist(cur, start) > 1e-6: segs.append(Line(cur, start))
            out.append((segs, True)); segs = []; cur = start; cmd = None; continue
        if cmd == "M":
            if segs: out.append((segs, False)); segs = []
            cur = start = (num(), num()); cmd = "L"; continue
        if cmd == "L": p = (num(), num())
        elif cmd == "H": p = (num(), cur[1])
        elif cmd == "V": p = (cur[0], num())
        elif cmd == "A":
            r = num(); num(); num(); large = num(); sweep = num(); p = (num(), num())
            segs.append(arc_from(cur, p, r, large, sweep)); cur = p; continue
        else: raise ValueError(f"unsupported command {cmd} in {d}")
        if math.dist(cur, p) > 1e-9: segs.append(Line(cur, p))
        cur = p
    if segs: out.append((segs, False))
    return out

def render(segs, closed=False):
    return path(segs, closed)

# ---------- offsets ----------
def _area(segs):
    pts = [s.at(k / 8) for s in segs for k in range(8)]
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

def _carrier_hits(a, b, near):
    """Intersections of the carriers of a and b (line or circle) closest to `near`."""
    def line_line(p, u, q, v):
        den = u[0] * v[1] - u[1] * v[0]
        if abs(den) < 1e-12: return []
        t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den
        return [(p[0] + u[0] * t, p[1] + u[1] * t)]
    def line_circle(p, u, c, r):
        fx, fy = p[0] - c[0], p[1] - c[1]
        bq = fx * u[0] + fy * u[1]; cq = fx * fx + fy * fy - r * r
        disc = bq * bq - cq
        if disc < 0: return []
        s = math.sqrt(disc)
        return [(p[0] + u[0] * t, p[1] + u[1] * t) for t in (-bq - s, -bq + s)]
    def circle_circle(c0, r0, c1, r1):
        d = math.dist(c0, c1)
        if d < 1e-12 or d > r0 + r1 or d < abs(r0 - r1): return []
        a = (r0 * r0 - r1 * r1 + d * d) / (2 * d); h = math.sqrt(max(r0 * r0 - a * a, 0))
        mx = c0[0] + a * (c1[0] - c0[0]) / d; my = c0[1] + a * (c1[1] - c0[1]) / d
        return [(mx + h * (c1[1] - c0[1]) / d, my - h * (c1[0] - c0[0]) / d),
                (mx - h * (c1[1] - c0[1]) / d, my + h * (c1[0] - c0[0]) / d)]
    if isinstance(a, Line) and isinstance(b, Line): hits = line_line(a.a, a.tan(0), b.a, b.tan(0))
    elif isinstance(a, Line): hits = line_circle(a.a, a.tan(0), b.c, b.r)
    elif isinstance(b, Line): hits = line_circle(b.a, b.tan(0), a.c, a.r)
    else: hits = circle_circle(a.c, a.r, b.c, b.r)
    return min(hits, key=lambda p: math.dist(p, near)) if hits else None

def _set_end(seg, p, end):
    if isinstance(seg, Line):
        return Line(seg.a, p) if end else Line(p, seg.b)
    ang = math.atan2(p[1] - seg.c[1], p[0] - seg.c[0])
    ref = seg.a1 if end else seg.a0
    while ang - ref > math.pi: ang -= 2 * math.pi
    while ref - ang > math.pi: ang += 2 * math.pi
    return Arc(seg.c, seg.r, seg.a0, ang) if end else Arc(seg.c, seg.r, ang, seg.a1)

def offset_segs(segs, o):
    """A closed path of lines and arcs moved outward by o. Sharp corners miter; arcs keep their centres."""
    sign = 1 if _area(segs) > 0 else -1
    moved = []
    for s in segs:
        tx, ty = s.tan(0.5); nx, ny = ty * sign, -tx * sign
        if isinstance(s, Line):
            moved.append(Line((s.a[0] + nx * o, s.a[1] + ny * o), (s.b[0] + nx * o, s.b[1] + ny * o)))
        else:
            m = s.at(0.5); rx, ry = (m[0] - s.c[0]) / s.r, (m[1] - s.c[1]) / s.r
            r = s.r + o if rx * nx + ry * ny > 0 else s.r - o
            moved.append(Arc(s.c, r, s.a0, s.a1))
    n = len(moved); joins = []
    for i in range(n):
        a, b = moved[i - 1], moved[i]; pa, pb = a.at(1), b.at(0)
        if math.dist(pa, pb) < 1e-6: joins.append(None); continue
        x = _carrier_hits(a, b, segs[i].at(0))
        ok = x is not None and math.dist(x, segs[i].at(0)) <= 4 * max(o, 0.5)
        joins.append(("x", x) if ok else ("bridge", (pa, pb)))
    out = []
    for i in range(n):
        s, j0, j1 = moved[i], joins[i], joins[(i + 1) % n]
        if j0 and j0[0] == "x": s = _set_end(s, j0[1], False)
        if j1 and j1[0] == "x": s = _set_end(s, j1[1], True)
        if j0 and j0[0] == "bridge": out.append(Line(*j0[1]))
        if math.dist(s.at(0), s.at(1)) > 1e-6: out.append(s)
    return out


def silhouette(d, o=None):
    """The Duo base for a closed outline: its outer edge, 0.625 out from the stroke centre."""
    o = O if o is None else o
    return "".join(render(offset_segs(segs, o), True) for segs, closed in parse(d) if closed)

def shape(verts, radii, o=0.0):
    """A polygon through verts, clockwise on screen, convex corners rounded by radii, offset outward by o."""
    n = len(verts); edges = []
    for i in range(n):
        a, b = verts[i], verts[(i + 1) % n]
        l = math.hypot(b[0] - a[0], b[1] - a[1]); u = ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
        edges.append((a, u, (u[1], -u[0])))
    def inter(p, u, q, v):
        den = u[0] * v[1] - u[1] * v[0]
        t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den
        return (p[0] + u[0] * t, p[1] + u[1] * t)
    corners = []
    for i in range(n):
        ein, eout = edges[i - 1], edges[i]; r = radii[i]
        if r:
            pin = (ein[0][0] - ein[2][0] * r, ein[0][1] - ein[2][1] * r)
            pout = (eout[0][0] - eout[2][0] * r, eout[0][1] - eout[2][1] * r)
            c = inter(pin, ein[1], pout, eout[1])
            t0 = (c[0] + ein[2][0] * (r + o), c[1] + ein[2][1] * (r + o))
            t1 = (c[0] + eout[2][0] * (r + o), c[1] + eout[2][1] * (r + o))
            corners.append((t0, t1, arc_pts(c, r + o, t0, t1, 1)))
        else:
            pin = (ein[0][0] + ein[2][0] * o, ein[0][1] + ein[2][1] * o)
            pout = (eout[0][0] + eout[2][0] * o, eout[0][1] + eout[2][1] * o)
            p = inter(pin, ein[1], pout, eout[1]); corners.append((p, p, None))
    segs = []
    for i in range(n):
        if corners[i][2]: segs.append(corners[i][2])
        a, b = corners[i][1], corners[(i + 1) % n][0]
        if math.dist(a, b) > 1e-6: segs.append(Line(a, b))
    return path(segs, True)

def rect(x0, y0, x1, y1, r=R):
    """A box by its stroke centres, corners r."""
    return shape([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], [r] * 4)

# ---------- cuts ----------
def _at(segs, u):
    n = len(segs); u = min(max(u, 0.0), n); i = min(int(u), n - 1); return segs[i], u - i

def stretches(segs, closed, keep, N=160):
    """Kept stretches of a path as (u0, u1) in segment units, refined to the boundary."""
    n = len(segs)
    k = (lambda u: keep(*_at(segs, u % n))) if closed else (lambda u: keep(*_at(segs, u)))
    us = [j / N for j in range(n * N)] + ([] if closed else [float(n)])
    g = [k(u) for u in us]
    if all(g): return [(0.0, float(n))]
    if not any(g): return []
    def edge(a, b, ga):
        for _ in range(48):
            m = (a + b) / 2
            if k(m) == ga: a = m
            else: b = m
        return (a + b) / 2
    if closed:
        j0 = g.index(False); L = len(us)
        seq = [(us[(j0 + j) % L] + (n if j0 + j >= L else 0), g[(j0 + j) % L]) for j in range(L)] + [(us[j0] + n, False)]
    else:
        seq = list(zip(us, g))
    out = []; start = 0.0 if seq[0][1] else None
    for (ua, ga), (ub, gb) in zip(seq, seq[1:]):
        if ga == gb: continue
        if gb: start = edge(ua, ub, ga)
        else: out.append((start, edge(ua, ub, ga)))
    if start is not None and seq[-1][1]: out.append((start, seq[-1][0]))
    return out

def walk_u(segs, u0, u1):
    n = len(segs); s, t = _at(segs, u0 % n if u0 >= n else u0)
    d = f"M{pt(s.at(t))}"; u = u0
    while u < u1 - 1e-9:
        i = int(math.floor(u + 1e-12)); nxt = min(i + 1, u1)
        seg = segs[i % n]; d += sub(seg, u - i, nxt - i); u = nxt
    return d

BADGE_EDGE = 9.875  # a host stops 1 clear of the badge's 3-arm square

def in_badge(p): return p[0] > BADGE_EDGE and p[1] > BADGE_EDGE

def trim(paths, keep):
    """Cuts stroked paths to the stretches where keep(seg, t) holds."""
    out = []
    for d in paths:
        for segs, closed in parse(d):
            for u0, u1 in stretches(segs, closed, keep):
                if closed and u0 == 0.0 and u1 == len(segs): out.append(path(segs, True))
                else: out.append(walk_u(segs, u0, u1))
    return out

def trim_badge(paths, shortest=1.5):
    """A host's strokes, stopped at the badge clearance: centre lines end on x or y = 9.875. Pieces and end stubs under `shortest` drop."""
    out = []
    for d in trim(paths, lambda s, t: not in_badge(s.at(t))):
        length = sum(math.dist(s.at(k / 16), s.at((k + 1) / 16)) for segs, _ in parse(d) for s in segs for k in range(16))
        if length >= shortest: out.append(drop_stubs(d, shortest))
    return out

def clip_badge(bg):
    """A Duo base cut square at the badge clearance."""
    out = []
    for d in bg:
        for segs, closed in parse(d):
            runs_ = stretches(segs, closed, lambda s, t: not in_badge(s.at(t)))
            for u0, u1 in runs_:
                if u0 == 0.0 and u1 == len(segs): out.append(path(segs, True)); continue
                out.append(walk_u(segs, u0, u1) + f"L{f(BADGE_EDGE)} {f(BADGE_EDGE)}Z")
    return out

def trim_slash(paths, shortest=0.75):
    """A host's strokes, stopped where their butt corners come 1.625 from the slash centre."""
    return [drop_stubs(d, shortest) for d in trim(paths, lambda s, t: ok_stroke(s, t, H + 1))]

def clip_slash(bg):
    """A Duo base cut flat 1.75 from the slash centre."""
    out = []
    for d in bg:
        for segs, closed in parse(d):
            if closed: out += clip_fill(segs, DW / 2 + 1)
    return out

# ---------- parts ----------
RING = 7.5
FOLDER = ("M1.75 4A1.5 1.5 0 0 1 3.25 2.5L6.75 2.5L8.75 4.5L14.75 4.5A1.5 1.5 0 0 1 16.25 6"
          "L16.25 14A1.5 1.5 0 0 1 14.75 15.5L3.25 15.5A1.5 1.5 0 0 1 1.75 14Z")
FILE = ("M4.625 1.75L10.125 1.75L14.875 6.5L14.875 14.75A1.5 1.5 0 0 1 13.375 16.25L4.625 16.25"
        "A1.5 1.5 0 0 1 3.125 14.75L3.125 3.25A1.5 1.5 0 0 1 4.625 1.75Z")
FOLD = "M10.125 2.375L10.125 6.5L14.25 6.5"
FILE_FOLD_FILL = "M10.375 1.125L10.375 6.25L15.5 6.25Z"
BOX = ("M3.25 2.5L14.75 2.5A1.5 1.5 0 0 1 16.25 4L16.25 14A1.5 1.5 0 0 1 14.75 15.5L3.25 15.5"
       "A1.5 1.5 0 0 1 1.75 14L1.75 4A1.5 1.5 0 0 1 3.25 2.5Z")
SLASH = "M1.875 1.875L16.125 16.125"
BADGE_PLUS = "M13.875 10.875L13.875 16.875M10.875 13.875L16.875 13.875"
BADGE_MINUS = "M10.875 13.875L16.875 13.875"
BADGE_XMARK = "M11.25 11.25L16.5 16.5M16.5 11.25L11.25 16.5"
BADGE_ARROW_RIGHT = "M10.875 13.875L16 13.875M14.25 12.125L16 13.875L14.25 15.625"
BADGE_ARROW_DOWN = "M13.875 10.875L13.875 16M12.125 14.25L13.875 16L15.625 14.25"
BADGE_ARROW_UP_RIGHT = "M11.375 16.375L16.25 11.5M13.75 11.5L16.25 11.5L16.25 14"
BADGE_CHECK = "M11.25 14L13 15.75L16.5 12.25"
BADGE_PEN = "M11.5 16.25L11.5 14.25L14 11.75L16 13.75L13.5 16.25Z"
BADGE_BAN = "M13.875 11.5A2.375 2.375 0 1 1 13.875 16.25A2.375 2.375 0 1 1 13.875 11.5ZM12.196 12.196L15.554 15.554"
BADGE_BOLT = "M14.875 11.375L13.125 13.125L14.625 14.625L12.875 16.375"
BADGE_REFRESH = "M15.875 14.125A2 2 0 1 1 13.875 12.125M12.625 10.875L13.875 12.125L12.625 13.375"
BADGE_SEARCH = "M13.25 11.5A1.75 1.75 0 1 1 13.25 15A1.75 1.75 0 1 1 13.25 11.5ZM14.487 14.487L16.375 16.375"
BADGES = {"badge-plus": BADGE_PLUS, "badge-minus": BADGE_MINUS, "badge-xmark": BADGE_XMARK,
          "badge-arrow-right": BADGE_ARROW_RIGHT, "badge-arrow-down": BADGE_ARROW_DOWN,
          "badge-arrow-up-right": BADGE_ARROW_UP_RIGHT, "badge-check": BADGE_CHECK, "badge-pen": BADGE_PEN,
          "badge-ban": BADGE_BAN, "badge-bolt": BADGE_BOLT, "badge-refresh": BADGE_REFRESH, "badge-search": BADGE_SEARCH}

def ring(): return circle_d((9, 9), RING)

def sparkle(c, r):
    """The four-point sparkle on c, tips r out: each 90° tip sits on 45° legs that run into quarter arcs. Closed, to stroke or fill."""
    cx, cy = c
    a = max(0.25, round(r * 0.11 * 8) / 8)
    q = r - 2 * a
    d = f"M{f(cx)} {f(cy - r)}"
    for sx, sy in ((1, -1), (1, 1), (-1, 1), (-1, -1)):
        if sx * sy < 0: p0, p1, tip = (cx + sx * a, cy + sy * (r - a)), (cx + sx * (r - a), cy + sy * a), (cx + sx * r, cy)
        else: p0, p1, tip = (cx + sx * (r - a), cy + sy * a), (cx + sx * a, cy + sy * (r - a)), (cx, cy + sy * r)
        d += f"L{pt(p0)}A{f(q)} {f(q)} 0 0 0 {pt(p1)}" + (f"L{pt(tip)}" if (sx, sy) != (-1, -1) else "")
    return d + "Z"

TAG_V = [(1.75, 3.75), (10.75, 3.75), (16, 9), (10.75, 14.25), (1.75, 14.25), (1.75, 12.75), (5.5, 9), (1.75, 5.25)]
def tag_segs(o=0.0):
    """The chevron tag, clockwise on screen, offset outward by o with mitered corners."""
    n = len(TAG_V); lines = []
    for i in range(n):
        p, q = TAG_V[i], TAG_V[(i + 1) % n]
        l = math.hypot(q[0] - p[0], q[1] - p[1]); u = ((q[0] - p[0]) / l, (q[1] - p[1]) / l)
        lines.append(((p[0] + u[1] * o, p[1] - u[0] * o), u))
    pts = []
    for i in range(n):
        (p, u), (q, v) = lines[i - 1], lines[i]
        den = u[0] * v[1] - u[1] * v[0]
        t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den
        pts.append((p[0] + u[0] * t, p[1] + u[1] * t))
    return [Line(pts[i], pts[(i + 1) % n]) for i in range(n)]
def tag_sil_segs(): return tag_segs(O)
TAG = path(tag_segs()[:-1], True)

PART_PATHS = {
    "folder": [FOLDER],
    "file": ["M10.125 1.75L14.875 6.5", FOLD],
    "ring": [circle_d((9, 9), RING)],
    "sparkle": [sparkle((9, 9), 6.75)],
    "tag": [TAG],
    "slash": [SLASH],
    **{name: [d] for name, d in BADGES.items()},
}

# ---------- composition ----------
def with_badge(paths, badge, dots=(), bg=None, fg=(), fg_lines=(), fg_dots=()):
    """A host with a registered badge: (outline svg, duo svg). The Duo base is the host's silhouette unless bg is given."""
    d = BADGES[badge]
    line = line_svg(trim_badge(paths) + [d], [x for x in dots if not in_badge(x[:2])])
    base = bg if bg is not None else [silhouette(p) for p in paths if silhouette(p)]
    duo = duo_svg(clip_badge(base), fg=fg, fg_lines=trim_badge(fg_lines) + [d], fg_dots=[x for x in fg_dots if not in_badge(x[:2])])
    return line, duo

def with_slash(paths, bg=None):
    """A host with the registered slash: (outline svg, duo svg)."""
    line = line_svg(trim_slash(paths) + [SLASH])
    base = bg if bg is not None else [silhouette(p) for p in paths if silhouette(p)]
    return line, duo_svg(clip_slash(base), fg_lines=[SLASH])

def solid_svg(paths, evenodd=False):
    """A solid glyph: flat filled shapes, no strokes."""
    rule = ' fill-rule="evenodd"' if evenodd else ""
    body = "".join(f'<path d="{d}"{rule}/>' for d in paths)
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="currentColor">' + body + "</svg>\n"

# ---------- lint ----------
def lint(name, svg):
    """Prints Neutral rule breaks in an outline svg: line angles, joins under 90°, ink past the padding."""
    issues = []
    for tag in re.findall(r"<path[^>]*>", svg):
        if 'class="bg"' in tag or 'fill="currentColor"' in tag or ('class="fg"' in tag and "stroke=" not in tag): continue
        if 'fill="currentColor"' in svg.split(">", 1)[0] and "stroke=" not in tag: continue
        d = re.search(r'\sd="([^"]+)"', tag).group(1)
        for segs, closed in parse(d):
            for s in segs:
                if isinstance(s, Line):
                    a = math.degrees(math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0])) % 45
                    if math.dist(s.a, s.b) * math.sin(math.radians(min(a, 45 - a))) > 0.002: issues.append(f"line {pt(s.a)} to {pt(s.b)} is off 0/45/90")
                for p in (s.at(0), s.at(0.5), s.at(1)):
                    if not (0.875 - 1e-6 <= p[0] <= 17.125 + 1e-6 and 0.875 - 1e-6 <= p[1] <= 17.125 + 1e-6):
                        issues.append(f"centre {pt(p)} leaves the frame")
            pairs = list(zip(segs, segs[1:])) + ([(segs[-1], segs[0])] if closed else [])
            orient = 1 if closed and _area(segs) > 0 else -1 if closed else 0
            for a, b in pairs:
                u, v = a.tan(1), b.tan(0)
                if orient and (u[0] * v[1] - u[1] * v[0]) * orient < -1e-9: continue
                if orient and abs(u[0] * v[1] - u[1] * v[0]) < 1e-9 and u[0] * v[0] + u[1] * v[1] < 0: continue
                turn = math.degrees(math.acos(max(-1, min(1, u[0] * v[0] + u[1] * v[1]))))
                if 180 - turn < 90 - 0.05: issues.append(f"join at {pt(b.at(0))} is {180 - turn:.1f}°")
    for i in issues: print(f"  {name}: {i}")
    return issues

GAP = 3.4
DISC = 1.375

def _samples(segs, step=0.2):
    pts = []
    for s in segs:
        n = max(4, math.ceil((s.r * abs(s.a1 - s.a0) if isinstance(s, Arc) else math.dist(s.a, s.b)) / step))
        pts += [s.at(k / n) for k in range(n + 1)]
    return pts

def gaps(name, svg):
    """Prints details closer than GAP between centres that do not touch: strokes, discs and fills, and an open stroke folding back on itself.

    @remarks A fill's edge counts as a disc's centre line. Round caps carry ink past every end, so an end gets no allowance. Badges and the slash are cutters, so pairs with them are skipped."""
    parts = []
    for tag in re.findall(r"<path[^>]*>", svg):
        if 'class="bg"' in tag: continue
        fill = 'stroke="none"' in tag or ('class="fg"' in tag and "stroke=" not in tag)
        for segs, closed in parse(re.search(r'\sd="([^"]+)"', tag).group(1)):
            parts.append({"pts": _samples(segs), "closed": closed, "fill": fill, "r": 0.0})
    parts += [{"pts": [(float(x), float(y))], "closed": True, "fill": False, "r": float(r)}
              for x, y, r in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', svg)]
    cutter = lambda pts: all(p[0] > 10.5 and p[1] > 10.5 for p in pts) or (len(pts) > 1 and all(abs(p[0] - p[1]) < 0.01 for p in pts))
    ink = lambda c: c["r"] or (0 if c["fill"] else H)
    near = lambda m, c: min(math.dist(m, s) for s in c["pts"]) <= ink(c) + 0.05

    issues = []
    for i, a in enumerate(parts):
        for b in parts[i + 1:]:
            if cutter(a["pts"]) or cutter(b["pts"]): continue
            d, p, q = min((math.dist(p, q), p, q) for p in a["pts"] for q in b["pts"])
            need = GAP - DISC * (a["fill"] + b["fill"])
            if not ink(a) + ink(b) < d < need - 1e-6: continue
            between = [(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t) for t in (0.25, 0.5, 0.75)]
            if all(any(near(m, c) for c in parts if c is not a and c is not b) for m in between): continue
            issues.append(f"gap {d:.3f} between {pt(p)} and {pt(q)}")
    for c in parts:
        pts = c["pts"]
        if c["closed"] or c["fill"] or len(pts) < 2 or cutter(pts): continue
        run = [0.0]
        for p, q in zip(pts, pts[1:]): run.append(run[-1] + math.dist(p, q))
        joins = [pts[e] for e in (0, -1) if any(math.dist(pts[e], s) < H and abs(run[e] - run[k]) > W for k, s in enumerate(pts))]
        at_join = lambda p, q: any(math.dist(p, j) < GAP and math.dist(q, j) < GAP for j in joins)
        hits = [(math.dist(pts[i], pts[j]), i, j) for i in range(len(pts)) for j in range(i + 1, len(pts))
                if run[j] - run[i] > 2 * math.dist(pts[i], pts[j]) + 0.5 and W < math.dist(pts[i], pts[j]) < GAP - 1e-6
                and not near(((pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2), c) and not at_join(pts[i], pts[j])]
        if hits:
            d, i, j = min(hits); issues.append(f"stroke folds back {d:.3f} between {pt(pts[i])} and {pt(pts[j])}")
    for i in issues: print(f"  {name}: {i}")
    return issues

# ---------- metadata: the parts each icon names, and its row of attempts ----------
META = {}

def uses(name, *parts):
    META.setdefault(name, {})["parts"] = list(parts)

def explore(name, attempts, picked):
    """Keeps the row of attempts for the lab: [(note, outline svg)], the index of the shipped one."""
    META.setdefault(name, {})["attempts"] = [{"note": n, "svg": s, "picked": i == picked} for i, (n, s) in enumerate(attempts)]

def save_meta(family):
    d = os.path.join(NEXT, ".meta"); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f"{family}.json"), "w").write(json.dumps(META, indent=1) + "\n")
