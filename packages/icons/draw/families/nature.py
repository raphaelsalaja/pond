"""Draws the nature family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *

D2R = math.pi / 180


def on(c, r, deg):
    return (c[0] + r * math.cos(deg * D2R), c[1] + r * math.sin(deg * D2R))


def cc(c1, r1, c2, r2):
    """Both intersections of two circles."""
    d = math.dist(c1, c2)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d); h = math.sqrt(max(r1 * r1 - a * a, 0))
    mx = c1[0] + a * (c2[0] - c1[0]) / d; my = c1[1] + a * (c2[1] - c1[1]) / d
    return [(mx + h * (c2[1] - c1[1]) / d, my - h * (c2[0] - c1[0]) / d),
            (mx - h * (c2[1] - c1[1]) / d, my + h * (c2[0] - c1[0]) / d)]


def lc(p, u, c, r):
    """Intersections of the line p + t*u (u unit) with a circle, by increasing t."""
    fx, fy = p[0] - c[0], p[1] - c[1]
    b = fx * u[0] + fy * u[1]; q = fx * fx + fy * fy - r * r
    s = math.sqrt(max(b * b - q, 0))
    return [(p[0] + u[0] * t, p[1] + u[1] * t) for t in (-b - s, -b + s)]


class Pen:
    def __init__(s, p):
        s.parts = [f"M{pt(p)}"]; s.cur = p

    def L(s, *ps):
        for p in ps:
            s.parts.append(f"L{pt(p)}"); s.cur = p
        return s

    def A(s, c, p, cw=True):
        """Arc around centre c to p; cw is clockwise on screen."""
        r = math.dist(c, p)
        a0 = math.atan2(s.cur[1] - c[1], s.cur[0] - c[0]); a1 = math.atan2(p[1] - c[1], p[0] - c[0])
        span = (a1 - a0) % (2 * math.pi) if cw else (a0 - a1) % (2 * math.pi)
        s.parts.append(f"A{f(r)} {f(r)} 0 {1 if span > math.pi else 0} {1 if cw else 0} {pt(p)}"); s.cur = p
        return s

    def Z(s): return "".join(s.parts) + "Z"
    def d(s): return "".join(s.parts)


def lens(p0, p1, th=45):
    """Two arcs leaving the chord at th degrees, meeting at 2·th points: the vesica at 45."""
    r = math.dist(p0, p1) / (2 * math.sin(th * D2R))
    return f"M{pt(p0)}A{f(r)} {f(r)} 0 0 1 {pt(p1)}A{f(r)} {f(r)} 0 0 1 {pt(p0)}Z"


def g(v): return round(v * 8) / 8


def snapd(d):
    """Snaps every anchor in absolute M/L/A path data to the grid; arc radii stay as drawn."""
    out = []; toks = re.findall(r"[MLAZ]|-?\d*\.?\d+", d); i = 0; cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1; out.append(t)
            if t == "Z": continue
        if cmd in "ML":
            out.append(f"{f(g(float(toks[i])))} {f(g(float(toks[i + 1])))}"); i += 2
        elif cmd == "A":
            r1, r2, rot, large, sw, x, y = toks[i:i + 7]
            out.append(f"{r1} {r2} {rot} {large} {sw} {f(g(float(x)))} {f(g(float(y)))}"); i += 7
    return "".join(out)


def ray(c, deg, r0, r1):
    """A radial line on 0/45/90 with both ends snapped to the grid."""
    dx, dy = round(math.cos(deg * D2R)), round(math.sin(deg * D2R))
    k0, k1 = (g(r0 / SQ), g(r1 / SQ)) if dx and dy else (r0, r1)
    return f"M{pt((c[0] + dx * k0, c[1] + dy * k0))}L{pt((c[0] + dx * k1, c[1] + dy * k1))}"


def stadium(c, half, r, deg):
    u = (math.cos(deg * D2R), math.sin(deg * D2R)); n = (-u[1], u[0])
    a = (c[0] - u[0] * half, c[1] - u[1] * half); b = (c[0] + u[0] * half, c[1] + u[1] * half)
    p = lambda q, k: (q[0] + n[0] * r * k, q[1] + n[1] * r * k)
    return Pen(p(a, -1)).L(p(b, -1)).A(b, p(b, 1)).L(p(a, 1)).A(a, p(a, -1)).Z()


def mirror(d):
    """Mirrors absolute M/L/A path data across x = 9."""
    out = []; toks = re.findall(r"[MLAZ]|-?\d*\.?\d+", d); i = 0; cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1; out.append(t)
            if t == "Z": continue
        if cmd in "ML":
            out.append(f"{f(18 - float(toks[i]))} {toks[i + 1]}"); i += 2
        elif cmd == "A":
            r1, r2, rot, large, sweep, x, y = toks[i:i + 7]
            out.append(f"{r1} {r2} {rot} {large} {1 - int(sweep)} {f(18 - float(x))} {y}"); i += 7
    return "".join(out)


GAP, STEP, TOUCH = 3.4, 0.1, 0.13


def samples(svg):
    """Stroke centrelines as point runs; a dot counts as the centreline of a stroke with the same outer edge."""
    runs_ = []
    for tag in re.findall(r"<path[^>]*>", svg):
        for segs, closed in parse(re.search(r'\sd="([^"]+)"', tag).group(1)):
            pts = []
            for s in segs:
                L = math.dist(s.a, s.b) if isinstance(s, Line) else s.r * abs(s.a1 - s.a0)
                n = max(2, int(L / STEP) + 1)
                pts += [s.at(k / n) for k in range(n)]
            if not closed: pts.append(segs[-1].at(1))
            runs_.append((pts, closed, None))
    for x, y, r in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', svg):
        x, y, r = float(x), float(y), float(r) - H
        n = max(8, int(2 * math.pi * r / STEP))
        runs_.append(([(x + r * math.cos(2 * math.pi * k / n), y + r * math.sin(2 * math.pi * k / n)) for k in range(n)], True, (x, y, r)))
    strokes = [p for pts, _, dot in runs_ if not dot for p in pts]
    for _, _, dot in list(runs_):
        if not dot or not any(math.dist(dot[:2], p) < 0.06 for p in strokes): continue
        x, y, r = dot
        for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            n = max(2, int(r / STEP) + 1)
            runs_.append(([(x + dx * r * k / n, y + dy * r * k / n) for k in range(n + 1)], False, "spoke"))
    return runs_


def off_grid(svg):
    """Path anchors and dot centres that miss the 0.125 grid."""
    out, bad = [], lambda v: abs(v * 8 - round(v * 8)) > 0.01
    for tag in re.findall(r"<path[^>]*>", svg):
        for segs, _ in parse(re.search(r'\sd="([^"]+)"', tag).group(1)):
            for s in segs:
                for p in (s.at(0), s.at(1)):
                    if bad(p[0]) or bad(p[1]): out.append(f"anchor {p[0]:.3f} {p[1]:.3f} is off the grid")
    for x, y in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)"', svg):
        if bad(float(x)) or bad(float(y)): out.append(f"dot {x} {y} is off the grid")
    for pts, _, dot in samples(svg):
        for p in pts:
            if not all(1.74 <= v <= 16.26 for v in p): out.append(f"centre {p[0]:.2f} {p[1]:.2f} leaves 1.75–16.25"); break
    return sorted(set(out))


def gaps(name, svg):
    """Prints spots where two strokes come within GAP of each other without being joined there."""
    import heapq
    P, adj = [], []
    for pts, closed, _ in samples(svg):
        base = len(P)
        for i, p in enumerate(pts):
            P.append(p); adj.append([])
            if i: adj[-1].append((base + i - 1, math.dist(p, pts[i - 1]))); adj[base + i - 1].append((len(P) - 1, math.dist(p, pts[i - 1])))
        if closed and len(pts) > 2:
            adj[base].append((len(P) - 1, math.dist(pts[0], pts[-1]))); adj[-1].append((base, math.dist(pts[0], pts[-1])))
    grid = {}
    for i, p in enumerate(P): grid.setdefault((int(p[0] // GAP), int(p[1] // GAP)), []).append(i)
    near = [[] for _ in P]
    for i, p in enumerate(P):
        gx, gy = int(p[0] // GAP), int(p[1] // GAP)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((gx + dx, gy + dy), ()):
                    if j > i:
                        d = math.dist(p, P[j])
                        if d < TOUCH: adj[i].append((j, d)); adj[j].append((i, d))
                        elif d < GAP - 1e-6: near[i].append((j, d))
    found = {}
    for i in range(len(P)):
        if not near[i]: continue
        dist = {i: 0.0}; q = [(0.0, i)]; lim = 2 * GAP
        while q:
            g, u = heapq.heappop(q)
            if g > dist.get(u, 1e9) or g > lim: continue
            for v, w in adj[u]:
                if g + w < dist.get(v, 1e9): dist[v] = g + w; heapq.heappush(q, (g + w, v))
        for j, d in near[i]:
            g = dist.get(j, 1e9)
            if g > d + 2.0 and g > 2.0 * d:
                key = (round(P[i][0]), round(P[i][1]))
                if key not in found or d < found[key][0]: found[key] = (d, P[i], P[j])
    out = [f"gap {d:.2f} between {pt(a)} and {pt(b)}" for d, a, b in sorted(found.values())]
    out += junctions(svg) + off_grid(svg)
    for o in out[:8]: print(f"  {name}: {o}")
    return out


def junctions(svg):
    """Where separate strokes meet, every pair of neighbouring arms must open at least 90°; a dot touching a stroke must sit centred on it."""
    runs_ = samples(svg)
    out = []
    strokes = [p for pts, _, dot in runs_ if not dot for p in pts]
    for _, _, dot in runs_:
        if not isinstance(dot, tuple) or not strokes: continue
        x, y, r = dot
        m = min(math.dist((x, y), p) for p in strokes)
        if 0.06 < m < r + TOUCH: out.append(f"dot at {f(x)} {f(y)} touches a stroke off centre")
    hits, grid = {}, {}
    for a, (pa, _, dot) in enumerate(runs_):
        if dot: continue
        for p in pa: grid.setdefault((int(p[0] // TOUCH), int(p[1] // TOUCH)), []).append((a, p))
    for (gx, gy), cell in grid.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for a, p in cell:
                    for b, q in grid.get((gx + dx, gy + dy), ()):
                        if b > a and math.dist(p, q) < TOUCH:
                            hits.setdefault((round(p[0] * 2) / 2, round(p[1] * 2) / 2), p)
    for key, J in hits.items():
        def score(c):
            ds = sorted(min(math.dist(c, q) for q in pts) for pts, _, dot in runs_ if not dot)
            return (-sum(d < 0.06 for d in ds), sum(ds[:2]))
        J = min(((g(J[0]) + i / 8, g(J[1]) + j / 8) for i in range(-2, 3) for j in range(-2, 3)), key=score)
        arms = []
        for pts, closed, dot in runs_:
            if dot: continue
            k = min(range(len(pts)), key=lambda i: math.dist(pts[i], J))
            if math.dist(pts[k], J) > TOUCH: continue
            for step in (-1, 1):
                idx, got = k, []
                while len(got) < 2:
                    idx += step
                    if closed: idx %= len(pts)
                    elif not 0 <= idx < len(pts): break
                    if idx == k: break
                    q = pts[idx]
                    if math.dist(q, J) >= 0.2 * (len(got) + 1):
                        got.append(math.degrees(math.atan2(q[1] - J[1], q[0] - J[0])))
                if len(got) == 2:
                    d = (got[1] - got[0] + 180) % 360 - 180
                    arms.append((got[0] - d) % 360)
                elif got: arms.append(got[0] % 360)
        arms.sort()
        merged = [a for i, a in enumerate(arms) if i == 0 or a - arms[i - 1] > 3]
        if len(merged) > 1 and 360 - merged[-1] + merged[0] <= 3: merged = merged[1:]
        for i, a in enumerate(merged):
            b = merged[(i + 1) % len(merged)]
            span = (b - a) % 360
            if len(merged) > 1 and span < 88.5:
                out.append(f"junction at {pt(J)} opens {span:.0f}°"); break
    return out


def check(name, svg):
    lint(name, svg); gaps(name, svg); return svg


ALL = {}


ONLY = os.environ.get("ONLY", "").split()


def ship(name, outline, opened, duo=None, duo_opened=None, attempts=None, picked=0):
    if ONLY and name not in ONLY: return
    check(name, outline); check(name + " open", opened)
    write(name, outline, duo, opened, duo_opened)
    if attempts:
        for note, s in attempts: check(f"{name} ({note})", s)
        explore(name, attempts, picked)


# ---------------- leaf ----------------
LEAF = lens((5, 13), (16.25, 1.75))
LEAF_STEM = "M1.75 16.25L5 13"
leaf_a = line_svg([LEAF, LEAF_STEM])
leaf_b = line_svg([lens((9, 1.75), (9, 12.5)), "M9 12.5L9 16.25"])
leaf_c = line_svg([lens((5.5, 12.5), (15.75, 2.25), 60), "M1.75 16.25L5.5 12.5"])


def sprig(stem_y, fork_y, k=2.25, tip_x=2, th=60):
    """A stem forking on 45° into two leaves that keep heading out on 45°."""
    l0, r0 = (9 - k, fork_y - k), (9 + k, fork_y - k)
    lt = (tip_x, l0[1] - (l0[0] - tip_x)); rt = (18 - tip_x, lt[1])
    return [f"M9 {f(stem_y)}L9 {f(fork_y)}", f"M{pt(l0)}L9 {f(fork_y)}L{pt(r0)}", lens(lt, l0, th), lens(r0, rt, th)]


LEAF_OPEN = sprig(16.25, 10.5)
ship("leaf", leaf_a, line_svg(LEAF_OPEN),
     attempts=[("diagonal leaf on a short stem", leaf_a), ("upright on a stem", leaf_b), ("full leaf, 120° tips", leaf_c)])

# ---------------- seedling ----------------
GROUND = "M1.75 16.25L16.25 16.25"
HILL = "M5 16.25A4 4 0 0 1 13 16.25"
MOUND = [GROUND, HILL]
SEED_LEAF = lens((9, 8.5), (15.75, 1.75))
SEED_STEM = "M9 12.25L9 8.5"
seed_a = line_svg(MOUND + [SEED_STEM, SEED_LEAF])
seed_b = line_svg(["M1.75 15.5L16.25 15.5", "M9 15.5L9 8.5", SEED_LEAF])
POT = Pen((4.75, 11.75)).L((13.25, 11.75), (13.25, 14.75)).A((11.75, 14.75), (11.75, 16.25)).L((6.25, 16.25)).A((6.25, 14.75), (4.75, 14.75)).Z()
seed_c = line_svg([POT, "M9 11.75L9 8.5", SEED_LEAF])
SEED_OPEN = MOUND + sprig(12.25, 10)
ship("seedling", seed_a, line_svg(SEED_OPEN),
     duo=duo_svg([silhouette(HILL + "Z"), silhouette(SEED_LEAF)], fg_lines=[SEED_STEM, GROUND]),
     attempts=[("mound, one leaf", seed_a), ("ground line", seed_b), ("pot", seed_c)])

# ---------------- flower ----------------
def tulip(x0, x1, tip_y, notch_y, side_y):
    """Three petal points in a 45° crown over a round cup."""
    m, r = (x0 + x1) / 2, (x1 - x0) / 2
    return (Pen((x0, notch_y)).L(((x0 + m) / 2, tip_y), (m, notch_y), ((m + x1) / 2, tip_y), (x1, notch_y), (x1, side_y))
            .A((m, side_y), (x0, side_y)).Z()), side_y + r


TULIP, CUP_Y = tulip(5, 13, 2, 4, 6.25)
STEM = f"M9 {f(CUP_Y)}L9 16.25"
flower_a = line_svg([TULIP, STEM])
BUD = lens((9, 1.75), (9, 10.5), 55)
flower_b = line_svg([BUD, "M9 10.5L9 16.25"])
T3, C3 = tulip(4.5, 13.5, 1.75, 4, 7)
flower_c = line_svg([T3, f"M9 {f(C3)}L9 16.25"])


def petals(c, n, a, rp, rot=-90):
    """The outline of n petal circles around c; valleys snapped to the grid."""
    cs = [on(c, a, rot + 360 * k / n) for k in range(n)]
    vs = []
    for k in range(n):
        p, q = cs[k], cs[(k + 1) % n]
        v = max(cc(p, rp, q, rp), key=lambda v: math.dist(v, c))
        vs.append((g(v[0]), g(v[1])))
    pen = Pen(vs[-1])
    for k in range(n): pen.A(cs[k], vs[k])
    return pen.Z()


BLOOM = petals((9, 9), 5, 4.25, 2.875)
CENTRE = (9, 9, 1.375)
ship("flower", flower_a, line_svg([BLOOM], dots=[CENTRE]),
     duo=duo_svg([silhouette(TULIP)], fg_lines=[STEM]),
     duo_opened=duo_svg([silhouette(BLOOM)], fg_dots=[(9, 9, 1.5)]),
     attempts=[("tulip on a stem", flower_a), ("bud on a stem", flower_b), ("tall tulip", flower_c)])

# ---------------- mountain ----------------
def peak(apex, base, x0=1.75, x1=16.25):
    """A 45° peak cut square by the frame edges, so its feet run off the sides."""
    return poly((x0, base), (x0, apex[1] + apex[0] - x0), apex, (x1, apex[1] + x1 - apex[0]), (x1, base))


def snowcap(apex, s=2.5):
    return f"M{pt((apex[0] - s, apex[1] + s))}L{pt((apex[0], apex[1] + 2 * s))}L{pt((apex[0] + s, apex[1] + s))}"


MTN_APEX = (12, 5.25)
PEAK = poly((1.75, 15.75), (1.75, 11.5), (5, 8.25), (7, 10.25), MTN_APEX, (16.25, 9.5), (16.25, 15.75))
SNOW = snowcap(MTN_APEX)
mtn_a = line_svg([PEAK, SNOW])
RANGE = poly((1.75, 15.75), (1.75, 12), (6.75, 7), (9.25, 9.5), (12.5, 6.25), (16.25, 10), (16.25, 15.75))
mtn_b = line_svg([RANGE], dots=[(3.25, 3.75, 1.375)])
mtn_c = line_svg([peak((9, 2.75), 16.25), snowcap((9, 2.75))])
MTN_SUN = (3, 3.5, 1.375)
ship("mountain", mtn_a, line_svg([PEAK, SNOW], dots=[MTN_SUN]),
     duo=duo_svg([silhouette(PEAK)], fg_lines=[SNOW]),
     duo_opened=duo_svg([silhouette(PEAK)], fg_lines=[SNOW], fg_dots=[(3, 3.5, 1.5)]),
     attempts=[("snowy peak with a low one behind, cropped by the frame", mtn_a), ("even range, sun", mtn_b), ("one tall peak, snowcap", mtn_c)])

# ---------------- sun ----------------
def rays(c, r0, r1, angles):
    return "".join(ray(c, a, r0, r1) for a in angles)


SUN_RING = circle_d((9, 9), 2)
SUN_RAYS = rays((9, 9), 5.5, 7.25, range(0, 360, 45))
sun_a = line_svg([SUN_RING, SUN_RAYS])
sun_b = line_svg([SUN_RAYS], dots=[(9, 9, 2.5)])
sun_c = line_svg([circle_d((9, 9), 1.75), rays((9, 9), 5.25, 7.25, range(0, 360, 45))])
HZ, RISE_R = 14.5, 4.25
RISE = f"M{f(9 - RISE_R)} {f(HZ)}A{f(RISE_R)} {f(RISE_R)} 0 0 1 {f(9 + RISE_R)} {f(HZ)}"
HORIZON = f"M1.75 {f(HZ)}L16.25 {f(HZ)}"
RISE_RAYS = rays((9, HZ), 7.75, 10, (225, 270, 315))
sun_open = line_svg([RISE, HORIZON, RISE_RAYS])
ship("sun", sun_a, sun_open,
     duo=duo_svg([silhouette(SUN_RING)], fg_lines=[SUN_RAYS]),
     duo_opened=duo_svg([silhouette(RISE + "Z")], fg_lines=[HORIZON, RISE_RAYS]),
     attempts=[("small ring, eight rays", sun_a), ("disc, eight rays", sun_b), ("smaller ring, longer rays", sun_c)])

# ---------------- moon ----------------
def crescent(c, r, t0, t1):
    """Outer circle with a bite whose circle meets it at 90° at angles t0, t1."""
    p0, p1 = on(c, r, t0), on(c, r, t1)
    # centre of the cutting circle: where the tangents at p0 and p1 meet
    u0 = (-math.sin(t0 * D2R), math.cos(t0 * D2R)); u1 = (-math.sin(t1 * D2R), math.cos(t1 * D2R))
    den = u0[0] * u1[1] - u0[1] * u1[0]
    t = ((p1[0] - p0[0]) * u1[1] - (p1[1] - p0[1]) * u1[0]) / den
    q = (p0[0] + u0[0] * t, p0[1] + u0[1] * t)
    return Pen(p1).A(c, p0).A(q, p1, cw=False).Z(), Pen(p0).A(q, p1, cw=False).d()


MOON, TERMINATOR = crescent((9, 9), 7.25, -90, 0)
moon_a = line_svg([MOON])
moon_b = line_svg([crescent((9, 9), 7.25, -90, math.degrees(math.atan2(5, 5.25)))[0]])
moon_c = line_svg(["M9 1.75A7.25 7.25 0 0 1 9 16.25Z"])
MOON_FULL = circle_d((9, 9), 7.25)
ship("moon", moon_a, line_svg([MOON_FULL, TERMINATOR]),
     duo_opened=duo_svg([silhouette(MOON_FULL)], fg_lines=[TERMINATOR]),
     attempts=[("quarter bite", moon_a), ("wide bite", moon_b), ("half moon", moon_c)])


# ---------------- flame ----------------
def drop(b, rb, tip):
    """Bottom circle b, rb with two convex arcs rising to a 90° tip."""
    out = []
    for n in ((SQ / 2, SQ / 2), (-SQ / 2, SQ / 2)):
        tb = (tip[0] - b[0], tip[1] - b[1])
        R = (rb * rb - (tb[0] ** 2 + tb[1] ** 2)) / (2 * (n[0] * tb[0] + n[1] * tb[1] + rb))
        q = (tip[0] + R * n[0], tip[1] + R * n[1])
        k = R / math.dist(b, q)
        out.append((q, (q[0] + (b[0] - q[0]) * k, q[1] + (b[1] - q[1]) * k)))
    (ql, pl), (qr, pr) = out
    return snapd(Pen(tip).A(qr, pr).A(b, pl).A(ql, tip).Z())


def tear(b, k):
    """Bottom circle r k·√2 with straight 45° sides to a 90° tip, every anchor on the grid."""
    tip, pl, pr = (b[0], b[1] - 2 * k), (b[0] - k, b[1] - k), (b[0] + k, b[1] - k)
    return f"M{pt(tip)}L{pt(pr)}A{f(k * SQ)} {f(k * SQ)} 0 1 1 {pt(pl)}Z"


FLAME_B = (9, 11)
FLAME = drop(FLAME_B, 5.25, (9, 1.75))
FLAME_IN = tear(FLAME_B, 1.25)
flame_a = line_svg([FLAME, FLAME_IN])
flame_b = line_svg([drop((9, 11.75), 4.5, (9, 1.75))])
flame_c = line_svg([drop((8.5, 11), 5.125, (10, 1.75))])
SPARKS = [(2.5, 2.5, 1.375), (15.5, 2.5, 1.375)]
ship("flame", flame_a, line_svg([FLAME, FLAME_IN], dots=SPARKS),
     duo=duo_svg([silhouette(FLAME)], fg=[tear(FLAME_B, 1.5)]),
     duo_opened=duo_svg([silhouette(FLAME)], fg=[tear(FLAME_B, 1.5)], fg_dots=[(x, y, 1.5) for x, y, _ in SPARKS]),
     attempts=[("drop, inner flame", flame_a), ("plain drop", flame_b), ("leaning tip, no inner flame", flame_c)])


# ---------------- bird ----------------
def pick(ps, near): return min(ps, key=lambda p: math.dist(p, near))


def arc_c(p0, p1, th, cw=True):
    """Centre of the arc p0 -> p1 whose tangent leaves the chord at th degrees."""
    L = math.dist(p0, p1); r = L / (2 * math.sin(th * D2R))
    u = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L); n = (-u[1], u[0]) if cw else (u[1], -u[0])
    m = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); h = r * math.cos(th * D2R)
    return (m[0] + n[0] * h, m[1] + n[1] * h), r


def sweep(c, a, b):
    """Clockwise screen angle from a to b around c, in radians."""
    t0 = math.atan2(a[1] - c[1], a[0] - c[0]); t1 = math.atan2(b[1] - c[1], b[0] - c[0])
    return (t1 - t0) % (2 * math.pi)


def bird(tail, end, th_back, th_belly, head_c, head_r, beak, wing=None, low=None):
    """A 90° tail, a back and a fuller belly arc, a head circle and a 90° beak."""
    kc, kr = arc_c(tail, end, th_back)
    bc, br = arc_c(end, tail, th_belly)
    ib = min(cc(kc, kr, head_c, head_r), key=lambda p: sweep(kc, tail, p))
    ia = min(cc(bc, br, head_c, head_r), key=lambda p: sweep(bc, p, tail))
    pen = Pen(tail)
    if wing:
        root, tip, wth = (*wing, 45)[:3]
        ac, ar = arc_c(root, tip, wth); rc, rr = arc_c(tip, root, wth)
        x1 = min(cc(kc, kr, ac, ar), key=lambda p: sweep(kc, tail, p))
        x2 = max(cc(kc, kr, rc, rr), key=lambda p: -sweep(kc, p, ib))
        pen.A(kc, x1).A(ac, tip).A(rc, x2)
    pen.A(kc, ib)
    if isinstance(beak, list):
        for p in beak: pen.A(head_c, p)
    else:
        bu = lc(beak, (-SQ / 2, -SQ / 2), head_c, head_r)[0]
        bl = lc(beak, (-SQ / 2, SQ / 2), head_c, head_r)[0]
        pen.A(head_c, bu).L(beak, bl)
    pen.A(head_c, ia)
    if low: pen.A(bc, low)
    pen.A(bc, tail)
    return snapd(pen.Z()), (bc, br)


def legs(belly, degs, foot=16.25):
    """Legs leave the belly along its radius, so they meet it square."""
    (c, r) = belly; out = ""
    for t in degs:
        dx, dy = round(math.cos(t * D2R)), round(math.sin(t * D2R))
        k = g(r / SQ) if dx else r
        a = (g(c[0]) + dx * k, g(c[1] + dy * k)) if dx else (g(c[0]), g(c[1] + r))
        b = (a[0] + dx * (foot - a[1]), foot)
        out += f"M{pt(a)}L{pt(b)}"
    return out


def belly_th(c, r, tail, end):
    """Belly angle that puts tail and end on the circle (c, r), so the leg meets its lowest point."""
    return math.degrees(math.asin(math.dist(tail, end) / (2 * r)))


def chick(c, r, tail, end, th_back, head_c, head_r, beak, wing=None):
    low = (c[0], c[1] + r)
    body, belly = bird(tail, end, th_back, belly_th(c, r, tail, end), head_c, head_r, beak, wing, low)
    return body, f"M{pt(low)}L{pt((c[0], 16.25))}"


BIRD_ARGS = ((6.75, 8), 6.25, (1.75, 11.75), (13, 8), 40, (12, 5.25), 3.25, (16, 5.25))
SING_C, SING_R = (12, 5.5), 2.25 * SQ
SINGING, _ = chick(*BIRD_ARGS[:5], SING_C, SING_R, [(9.75, 3.25), (14.25, 3.25), (14.25, 7.75)])
CHIRP = rays(SING_C, SING_R, 3.75 * SQ, (315, 45))
BIRD, BIRD_LEGS = chick(*BIRD_ARGS)
bird_a = line_svg([BIRD, BIRD_LEGS])
b2, l2 = chick((6.75, 8.5), 6.25, (1.75, 12.25), (11.75, 4.75), 30, (11.5, 5.25), 3.25, (15.5, 5.25))
bird_b = line_svg([b2, l2])
b3, l3 = chick((6.75, 8), 6.25, (1.75, 11.75), (13, 8), 45, (12, 5.25), 3.25, (16, 5.25))
bird_c = line_svg([b3, l3])
ship("bird", bird_a, line_svg([SINGING, CHIRP, BIRD_LEGS]),
     attempts=[("tilted body, one leg", bird_a), ("level body", bird_b), ("steeper body", bird_c)])

# ---------------- birdcage ----------------
CAGE_C, CAGE_R = (9, 8.75), 5.25
CAGE = Pen((3.75, 14.5)).L((3.75, 8.75)).A(CAGE_C, (14.25, 8.75)).L((14.25, 14.5)).d()
BASE = "M2.25 14.5L15.75 14.5"
HOOK = "M9 3.5L9 1.75"
SPRING = "M3.75 8.75L14.25 8.75"
BARS = "M7.25 8.75L7.25 14.5M10.75 8.75L10.75 14.5"
cage_a = line_svg([CAGE, BASE, HOOK, SPRING, BARS])
cage_b = line_svg([CAGE, BASE, HOOK, SPRING, "M9 8.75L9 14.5"])
cage_c = line_svg([CAGE, BASE, HOOK, "M9 3.5L9 14.5"])
DOORWAY = "M7.25 14.5L7.25 11A1.75 1.75 0 0 1 10.75 11L10.75 14.5"
ship("birdcage", cage_a, line_svg([CAGE, BASE, HOOK, DOORWAY]),
     attempts=[("dome on a ring, two bars", cage_a), ("one bar", cage_b), ("one bar from the hook", cage_c)])

# ---------------- butterfly ----------------
def quarter(corner, r, dx, dy):
    """A quarter disc with its sharp corner at `corner`, edges running dx and dy."""
    a, b = (corner[0] + dx * r, corner[1]), (corner[0], corner[1] + dy * r)
    return Pen(corner).L(a).A(corner, b, cw=(dx * dy > 0)).Z()


def wing(x, top_y, up, low_y, lo, side=-1):
    """A forewing and a hindwing circle on one side of the body line x; each meets the line at a grid point.
    up and lo are (offset from the line, drop to the meeting point, radius) Pythagorean triples."""
    (ux, uy, ur), (lx, ly, lr) = up, lo
    uy = uy or math.sqrt(ur * ur - ux * ux); ly = ly or math.sqrt(lr * lr - lx * lx)
    uc, lc_ = (x + side * ux, top_y + uy), (x + side * lx, low_y - ly)
    w = min(cc(uc, ur, lc_, lr), key=lambda p: side * (p[0] - x) * -1)
    w = (g(w[0]), g(w[1]))
    n, b = (x, top_y), (x, low_y)
    cw = side > 0
    pen = Pen(n)
    ue, le = (uc[0] + side * ur, uc[1]), (lc_[0] + side * lr, lc_[1])
    if ue[1] < w[1]: pen.A(uc, ue, cw=cw)
    pen.A(uc, w, cw=cw)
    if le[1] > w[1]: pen.A(lc_, le, cw=cw)
    return pen.A(lc_, b, cw=cw).d(), n, b


def spread(top_y, up, low_y, lo):
    l, n, b = wing(9, top_y, up, low_y, lo, -1)
    r, _, _ = wing(9, top_y, up, low_y, lo, 1)
    return [l, r, f"M{pt(n)}L{pt(b)}"]


def side(x, top_y, up, low_y, lo):
    s, n, b = wing(x, top_y, up, low_y, lo, -1)
    return [s, f"M{pt(n)}L{pt(b)}"]


UP, LO = (2.625, 3.5, 4.375), (2.25, 3, 3.75)
BF_SPREAD = spread(3, UP, 14.75, LO)
BF_SIDE = side(12.5, 3, (3, 4, 5), 15.25, (2.25, 3, 3.75))
bf_spread = line_svg(BF_SPREAD)
bf_spread2 = line_svg(spread(2.75, (2, 3.75, 4.25), 14.25, (2.25, 3, 3.75)))
bf_side = line_svg(BF_SIDE)
bf_side2 = line_svg(side(12.5, 3, (3, 4, 5), 15, (3, 4, 5)))
ship("butterfly", bf_spread, bf_side,
     duo=duo_svg([silhouette(w + "Z") for w in BF_SPREAD[:2]], fg_lines=[BF_SPREAD[2]]),
     duo_opened=duo_svg([silhouette(BF_SIDE[0] + "Z")], fg_lines=[BF_SIDE[1]]),
     attempts=[("spread, big forewings", bf_spread), ("spread, even wings", bf_spread2),
               ("rejected: side view as the closed outline, reads as a bean at 12px", bf_side),
               ("side view, equal wings", bf_side2)])

# ---------------- cat ----------------
def cat_head(cheek_x, cheek_top, chin_c, ear_tip_x, brow_y):
    r = chin_c[0] - cheek_x
    tip_y = cheek_top - (ear_tip_x - cheek_x)
    inner = (ear_tip_x + (brow_y - tip_y), brow_y)
    left = [(cheek_x, chin_c[1]), (cheek_x, cheek_top), (ear_tip_x, tip_y), inner]
    right = [(18 - p[0], p[1]) for p in reversed(left)]
    pen = Pen(left[0]).L(*left[1:], *right)
    return pen.A(chin_c, left[0]).Z()


def shut(y, xs=(6.25, 11.75), r=1):
    return "".join(f"M{pt((x - r, y))}A{f(r)} {f(r)} 0 0 0 {pt((x + r, y))}" for x in xs)


CAT = cat_head(1.75, 7.5, (9, 9), 5.5, 5.5)
EYES_SHUT = shut(9.5)
EYES = [(6.25, 9.75, 1.375), (11.75, 9.75, 1.375)]
cat_a = line_svg([CAT, EYES_SHUT])
cat_b = line_svg([cat_head(1.75, 8, (9, 9), 6, 5.5), EYES_SHUT])
cat_c = line_svg([cat_head(1.75, 7, (9, 9), 4.75, 5.5), EYES_SHUT])
ship("cat", cat_a, line_svg([CAT], dots=EYES),
     duo=duo_svg([silhouette(CAT)], fg_lines=[EYES_SHUT]),
     duo_opened=duo_svg([silhouette(CAT)], fg_dots=[(x, y, 1.5) for x, y, _ in EYES]),
     attempts=[("45° ears, shut eyes", cat_a), ("tall ears", cat_b), ("short ears", cat_c)])

# ---------------- paw ----------------
def pad(c0, r0, c1, r1):
    c2 = (18 - c1[0], c1[1])
    il = pick(cc(c0, r0, c1, r1), (c1[0] - 3, c0[1] - 3))
    ir = (18 - il[0], il[1])
    n = max(cc(c1, r1, c2, r1), key=lambda p: p[1])
    return Pen(il).A(c0, ir).A(c2, n).A(c1, il).Z()


PAD = circle_d((9, 12.5), 3)
TOES = [(2.5, 9.5, 1.375), (6.5, 5, 1.375), (11.5, 5, 1.375), (15.5, 9.5, 1.375)]
CLAWS = "M2.5 9.5L2.5 6.25M6.5 5L6.5 1.75M11.5 5L11.5 1.75M15.5 9.5L15.5 6.25"
paw_a = line_svg([PAD], dots=TOES)
paw_b = line_svg([stadium((9, 13), 1.5, 2.5, 0)], dots=[(2.5, 8.5, 1.375), (6.25, 4.75, 1.375), (11.75, 4.75, 1.375), (15.5, 8.5, 1.375)])
paw_c = line_svg([circle_d((9, 12.25), 3.25)], dots=[(3.25, 6.5, 1.375), (9, 3.75, 1.375), (14.75, 6.5, 1.375)])
ship("paw", paw_a, line_svg([PAD, CLAWS], dots=TOES),
     duo=duo_svg([silhouette(PAD)], fg_dots=[(x, y, 1.5) for x, y, _ in TOES]),
     duo_opened=duo_svg([silhouette(PAD)], fg_lines=[CLAWS], fg_dots=[(x, y, 1.5) for x, y, _ in TOES]),
     attempts=[("round pad, four toes", paw_a), ("wide pad", paw_b), ("three toes", paw_c)])

# ---------------- shell ----------------
def scallop(cy, r, bumps, s, ear=None):
    """A fan: 45° sides from the hinge, the top cut into outward bumps of sagitta s."""
    hy = cy + r
    angs = [180 + 180 * k / bumps for k in range(bumps + 1)]
    pts = [on((9, cy), r, t) for t in angs]
    if ear:
        ey, w, eb = ear; k = hy - ey
        pen = Pen((9 - k, ey)).L(pts[0])
    else:
        pen = Pen((9, hy)).L(pts[0])
    for p0, p1 in zip(pts, pts[1:]):
        L = math.dist(p0, p1); rb = (L * L / 4 + s * s) / (2 * s)
        c, _ = arc_c(p0, p1, math.degrees(math.asin(L / 2 / rb)))
        pen.A(c, p1)
    if ear:
        pen.L((9 + k, ey), (9 + w, ey), (9 + w, eb), (9 - w, eb), (9 - w, ey))
    else:
        pen.L((9, hy))
    return snapd(pen.Z()), [(g(p[0]), g(p[1])) for p in pts[1:-1]]


def fan(hinge, R, bumps, s):
    """A quarter-circle fan from a 90° hinge; the rim is cut into outward bumps of sagitta s."""
    pts = [(g(p[0]), g(p[1])) for p in (on(hinge, R, 225 + 90 * k / bumps) for k in range(bumps + 1))]
    pen = Pen(hinge).L(pts[0])
    for p0, p1 in zip(pts, pts[1:]):
        L = math.dist(p0, p1); rb = (L * L / 4 + s * s) / (2 * s)
        c, _ = arc_c(p0, p1, math.degrees(math.asin(L / 2 / rb)))
        pen.A(c, p1)
    return snapd(pen.L(hinge).Z()), pts


SHELL, SV = fan((9, 16.25), 10, 4, 0.75)
SHELL_RIB = f"M{pt(SV[2])}L9 11.375"
shell_a = line_svg([SHELL, SHELL_RIB])
s5, _ = fan((9, 16.25), 10, 5, 1)
shell_b = line_svg([s5])
SPIRAL = "M9 9.25A1.75 1.75 0 0 1 12.5 9.25A3.5 3.5 0 0 1 5.5 9.25A5.25 5.25 0 0 1 16 9.25A7 7 0 0 1 2 9.25"
shell_c = line_svg([SPIRAL])
BOWL = Pen((4.25, 11.5)).L((13.75, 11.5)).A((9, 11.5), (4.25, 11.5)).Z()
LID = Pen((13.75, 7.25)).L((4.25, 7.25)).A((9, 7.25), (13.75, 7.25)).Z()
HINGE = "M4.25 7.25L4.25 11.5"
PEARL = (9, 11.5, 1.375)
ship("shell", shell_a, line_svg([BOWL, LID, HINGE], dots=[PEARL]),
     duo=duo_svg([silhouette(SHELL)], fg_lines=[SHELL_RIB]),
     duo_opened=duo_svg([silhouette(BOWL), silhouette(LID)], fg_lines=[HINGE], fg_dots=[(*PEARL[:2], 1.5)]),
     attempts=[("fan, four bumps, centre rib", shell_a), ("fan, five bumps", shell_b), ("spiral", shell_c)])

# ---------------- egg ----------------
def egg(cx, bottom, r):
    """Moss egg: base circle r, two 2r side arcs, a top arc."""
    cy = bottom - r; tc = (cx, cy - r)
    jl, jr = on((cx + r, cy), 2 * r, 225), on((cx - r, cy), 2 * r, -45)
    return cy, jl, jr, tc


def egg_d(cx, bottom, r):
    cy, jl, jr, tc = egg(cx, bottom, r)
    return snapd(Pen((cx - r, cy)).A((cx + r, cy), jl).A(tc, jr).A((cx - r, cy), (cx + r, cy)).A((cx, cy), (cx - r, cy)).Z())


def crack(cx, bottom, r, a):
    """A zigzag across the widest line; its ends meet the shell square."""
    cy = bottom - r
    return poly((cx - r, cy), (cx - 2 * a, cy), (cx - a, cy - a), (cx, cy), (cx + a, cy - a), (cx + 2 * a, cy), (cx + r, cy), closed=False)


def cracked(cx, bottom, r, a, gap):
    """Split at the widest line so every cut meets the shell square."""
    cy, jl, jr, tc = egg(cx, bottom, r)
    zig = [(cx + r, cy), (cx + 2 * a, cy), (cx + a, cy - a), (cx, cy), (cx - a, cy - a), (cx - 2 * a, cy), (cx - r, cy)]
    low = Pen(zig[-1]).A((cx, cy), zig[0], cw=False).L(*zig[1:]).Z()
    up = lambda p: (p[0], p[1] - gap)
    cap = Pen(up(zig[-1])).A(up((cx + r, cy)), up(jl)).A(up(tc), up(jr)).A(up((cx - r, cy)), up(zig[0]))
    return [low, cap.L(*[up(p) for p in zig[1:-1]]).Z()]


EGG = egg_d(9, 16.25, 5.5)
egg_a = line_svg([EGG])
egg_b = line_svg([egg_d(9, 16.25, 5.25)])
egg_c = line_svg([egg_d(9, 16.25, 5), crack(9, 16.25, 5, 1.25)])
EGG_CRACK = crack(9, 16.25, 5.5, 1.25)
ship("egg", egg_a, line_svg([EGG, EGG_CRACK]),
     duo_opened=duo_svg([silhouette(EGG)], fg_lines=[EGG_CRACK]),
     attempts=[("r5.5 egg", egg_a), ("narrow", egg_b), ("small egg, crack", egg_c)])

# ---------------- bug ----------------
def beetle(top, half, head_r):
    cy = top + 3.5
    body = Pen((9 - half, top)).L((9 + half, top), (9 + half, cy)).A((9, cy), (9 - half, cy)).Z()
    head = Pen((9 + head_r, top)).A((9, top), (9 - head_r, top), cw=False).d()
    return body, head, cy


def bug(top=7.5, half=4.25, head_r=4.25, cy=11.5):
    """Beetle: a capsule split into head and body, six legs and two feelers that all meet it square."""
    c = (9, cy)
    k = g(half / SQ); kh = g(head_r / SQ)
    body = (Pen((9 - half, top)).L((9 + half, top), (9 + half, cy)).A(c, (9 + k, cy + k)).A(c, (9, cy + half))
            .A(c, (9 - k, cy + k)).A(c, (9 - half, cy)).Z())
    hr = f"A{f(head_r)} {f(head_r)} 0 0 1 "
    head = (f"M{pt((9 - head_r, top))}{hr}{pt((9 - kh, top - kh))}{hr}{pt((9, top - head_r))}"
            f"{hr}{pt((9 + kh, top - kh))}{hr}{pt((9 + head_r, top))}")
    legs = (f"M1.75 {f(top)}L{f(9 - half)} {f(top)}M{f(9 + half)} {f(top)}L16.25 {f(top)}"
            f"M1.75 {f(top + 3.5)}L{f(9 - half)} {f(top + 3.5)}M{f(9 + half)} {f(top + 3.5)}L16.25 {f(top + 3.5)}"
            f"M{f(9 - k)} {f(cy + k)}L{f(9 - k - (16.25 - cy - k))} 16.25M{f(9 + k)} {f(cy + k)}L{f(9 + k + (16.25 - cy - k))} 16.25")
    feelers = f"M{f(9 - kh)} {f(top - kh)}L{f(9 - kh - 1.75)} {f(top - kh - 1.75)}M{f(9 + kh)} {f(top - kh)}L{f(9 + kh + 1.75)} {f(top - kh - 1.75)}"
    seam = f"M9 {f(top)}L9 {f(cy + half)}"
    wings = f"M9 {f(top)}L9 {f(cy)}L{f(9 - k)} {f(cy + k)}M9 {f(cy)}L{f(9 + k)} {f(cy + k)}"
    head_d = head + "Z"
    neck = f"M{f(9 - half)} {f(top)}L{f(9 + half)} {f(top)}"
    return body, head, head_d, legs, feelers, seam, wings, neck


BUG_BODY, BUG_HEAD, BUG_HEAD_D, BUG_LEGS, BUG_FEELERS, BUG_SEAM, BUG_WINGS, BUG_NECK = bug(7.25, 5.125, 5.125, 11.125)
bug_a = line_svg([BUG_BODY, BUG_HEAD, BUG_LEGS, BUG_FEELERS, BUG_SEAM])
bug_b = line_svg([BUG_BODY, BUG_HEAD, BUG_LEGS, BUG_SEAM])
bc_ = bug(7.5, 4.25, 4.25, 11.5)
bug_c = line_svg([bc_[0], bc_[1], bc_[3], bc_[4], bc_[5]])
ship("bug", bug_a, line_svg([BUG_BODY, BUG_HEAD, BUG_LEGS, BUG_FEELERS, BUG_WINGS]),
     duo=duo_svg([silhouette(BUG_BODY), silhouette(BUG_HEAD_D)], fg_lines=[BUG_LEGS, BUG_FEELERS, BUG_SEAM, BUG_NECK]),
     duo_opened=duo_svg([silhouette(BUG_BODY), silhouette(BUG_HEAD_D)], fg_lines=[BUG_LEGS, BUG_FEELERS, BUG_WINGS, BUG_NECK]),
     attempts=[("wide capsule beetle, seam, feelers", bug_a), ("no feelers", bug_b),
               ("rejected: narrow capsule, feelers 3 from the neck", bug_c)])

# ---------------- atom ----------------
NUCLEUS = (9, 9, 1.375)


def bohr(r, a, b, n=2):
    """Nucleus, one orbit, and n electrons centred on it at the grid point (a, b) turned by 180/n."""
    es = [(9 + a, 9 - b), (9 - a, 9 + b), (9 + b, 9 + a), (9 - b, 9 - a)][:n] if n != 2 else [(9 + a, 9 - b), (9 - a, 9 + b)]
    return [circle_d((9, 9), r)], [NUCLEUS] + [(x, y, 1.375) for x, y in es]


ORBIT, ATOM_DOTS = bohr(6.5, 6, 2.5)
atom_a = line_svg(ORBIT, dots=ATOM_DOTS)
atom_b = line_svg(*bohr(5, 4, 3))
atom_c = line_svg(*bohr(6.5, 6, 2.5, 4))
SPIN = ["M3 6.5A6.5 6.5 0 0 1 15 6.5", "M15 11.5A6.5 6.5 0 0 1 3 11.5"]
ship("atom", atom_a, line_svg(SPIN, dots=ATOM_DOTS),
     attempts=[("orbit, two electrons", atom_a), ("tight orbit", atom_b), ("four electrons", atom_c)])

# ---------------- apple ----------------
def apple(cy=10, r=6.25, a=1.75, b=6, yb=4.75, bite=None):
    """Round body with a shallow arc dip at the top for the stem; bite = (b_a, b_b, centre x) cuts a concave bite on the right."""
    c = (9, cy); yc = cy - b
    y0 = (a * a + yc * yc - yb * yb) / (2 * (yc - yb))
    dc = (9, y0)
    left, right, low = (9 - a, yc), (9 + a, yc), (9, yb)
    pen = Pen(right)
    if bite:
        ba, bb, bx = bite
        top, bot = (9 + ba, cy - bb), (9 + ba, cy + bb)
        pen.A(c, top).A((bx, cy), bot, cw=False).A(c, (9, cy + r)).A(c, left)
    else:
        pen.A(c, (9 + r, cy)).A(c, (9, cy + r)).A(c, (9 - r, cy)).A(c, left)
    pen.A(dc, low, cw=False).A(dc, right, cw=False)
    return pen.Z(), f"M9 {f(yb)}L9 1.75"


APPLE, APPLE_STEM = apple(a=3.75, b=5, yb=5.75)
BITTEN, _ = apple(a=3.75, b=5, yb=5.75, bite=(5, 3.75, 18))
apple_a = line_svg([APPLE, APPLE_STEM])
apple_b = line_svg(list(apple()))
apple_c = line_svg(list(apple(cy=11.25, r=5, a=3, b=4, yb=7.75)))
ship("apple", apple_a, line_svg([BITTEN, APPLE_STEM]),
     duo=duo_svg([silhouette(APPLE)], fg_lines=[APPLE_STEM]),
     duo_opened=duo_svg([silhouette(BITTEN)], fg_lines=[APPLE_STEM]),
     attempts=[("round, wide flat dip, stem", apple_a), ("narrow dip", apple_b), ("small body", apple_c)])

# ---------------- rocket ----------------
def rocket_d(half=3.5, oy=7.75, fin_top=9.75, fin=2.75, bottom=12.75, fin_bottom=15.25, tip=1.75):
    """A blunt ogive nose on straight sides, and fins on 45° that hang below the base as legs."""
    x0, x1 = 9 - half, 9 + half
    R = (half * half + (oy - tip) ** 2) / (2 * half)
    pen = Pen((9, tip)).A((x1 - R, oy), (x1, oy)).L((x1, fin_top), (x1 + fin, fin_top + fin), (x1 + fin, fin_bottom))
    if fin_bottom > bottom:
        pen.L((x1, fin_bottom), (x1, bottom), (x0, bottom), (x0, fin_bottom))
    else:
        pen.L((x0 - fin, fin_bottom))
    body = pen.L((x0 - fin, fin_bottom), (x0 - fin, fin_top + fin), (x0, fin_top), (x0, oy)).A((x0 + R, oy), (9, tip)).Z()
    return body.replace(f"L{pt((x0 - fin, fin_bottom))}L{pt((x0 - fin, fin_bottom))}", f"L{pt((x0 - fin, fin_bottom))}"), f"M{f(x0)} {f(oy)}L{f(x1)} {f(oy)}"


ROCKET, ROCKET_SEAM = rocket_d(oy=7, fin_top=8.875, fin=3.5, bottom=13.75, fin_bottom=15.75)
EXHAUST = "M9 13.75L9 16.25"
rocket_a = line_svg([ROCKET, ROCKET_SEAM])
rb, rs = rocket_d(oy=7.25, fin_top=9.5, fin=2.75, bottom=14.25, fin_bottom=14.25)
rocket_b = line_svg([rb, rs])
rc, rcs = rocket_d(half=3.75, oy=7.5, fin_top=9.125, fin=3.5, bottom=14, fin_bottom=16)
rocket_c = line_svg([rc, rcs])
ship("rocket", rocket_a, line_svg([ROCKET, ROCKET_SEAM, EXHAUST]),
     duo=duo_svg([silhouette(ROCKET)], fg_lines=[ROCKET_SEAM]),
     duo_opened=duo_svg([silhouette(ROCKET)], fg_lines=[ROCKET_SEAM, EXHAUST]),
     attempts=[("ogive, fins as legs, seam", rocket_a), ("fins flush with the base", rocket_b), ("longer nose and legs", rocket_c)])

# ---------------- plane ----------------
def plane(w0=5.75, w1=9.25, span=7.25, t0=12.75, t1=16.25, tail_span=3.75, half=1.75, trails=False):
    """Top view: a round-nosed fuselage, straight wings and a tail plane as bands with r1.5 corners; trails run the wing tips to the bottom."""
    r = 1.5; xa, xb = 9 - half, 9 + half; ny = 1.75 + half
    X, x, T, t = 9 + span, 9 - span, 9 + tail_span, 9 - tail_span
    def tail(pen):
        (pen.L((xb, t0), (T - r, t0)).A((T - r, t0 + r), (T, t0 + r)).L((T, t1 - r)).A((T - r, t1 - r), (T - r, t1))
         .L((t + r, t1)).A((t + r, t1 - r), (t, t1 - r)).L((t, t0 + r)).A((t + r, t0 + r), (t + r, t0)).L((xa, t0), (xa, w1)))
    if not trails:
        pen = Pen((xa, ny)).A((9, ny), (xb, ny)).L((xb, w0), (X - r, w0)).A((X - r, w0 + r), (X, w0 + r)).L((X, w1 - r))
        pen.A((X - r, w1 - r), (X - r, w1)).L((xb, w1))
        tail(pen)
        pen.L((x + r, w1)).A((x + r, w1 - r), (x, w1 - r)).L((x, w0 + r)).A((x + r, w0 + r), (x + r, w0)).L((xa, w0))
        return [pen.Z()]
    top = (Pen((X, 16.25)).L((X, w0 + r)).A((X - r, w0 + r), (X - r, w0), cw=False).L((xb, w0), (xb, ny)).A((9, ny), (xa, ny), cw=False)
           .L((xa, w0), (x + r, w0)).A((x + r, w0 + r), (x, w0 + r), cw=False).L((x, 16.25)).d())
    low = Pen((X, w1)).L((xb, w1))
    tail(low)
    return [top, low.L((x, w1)).d()]


PLANE = plane()
PLANE_OPEN = plane(trails=True)
plane_a = line_svg(PLANE)
plane_b = line_svg(plane(tail_span=3.25))
plane_c = line_svg(plane(w0=5.5, w1=9, span=6.75, tail_span=4))
ship("plane", plane_a, line_svg(PLANE_OPEN),
     attempts=[("straight wings and tail", plane_a), ("small tail", plane_b), ("shorter wings, wider tail", plane_c)])

# ---------------- car ----------------
def car(belt=9.25, bottom=13.5, roof=5.75, rear=(3.25, 6.75), front=(10.25, 13.75), top=True):
    """Side view: a box body with r1.5 corners and a 45° cabin; top=False drops the roof for a convertible."""
    r = 1.5
    pen = Pen((1.75, belt + r)).A((1.75 + r, belt + r), (1.75 + r, belt))
    if top:
        pen.L((rear[0], belt), (rear[1], roof), (front[0], roof), (front[1], belt))
    pen.L((16.25 - r, belt)).A((16.25 - r, belt + r), (16.25, belt + r)).L((16.25, bottom - r)).A((16.25 - r, bottom - r), (16.25 - r, bottom))
    pen.L((1.75 + r, bottom)).A((1.75 + r, bottom - r), (1.75, bottom - r))
    return pen.Z()


WHEELS = [(6, 13.5, 1.375), (12, 13.5, 1.375)]
CAR = car()
CAR_PILLAR = "M8.25 5.75L8.25 9.25"
WINDSHIELD = "M12.75 9.25L12.75 6.25M7.75 9.25L7.75 6.75"
CONVERTIBLE = car(top=False)
car_a = line_svg([CAR, CAR_PILLAR], dots=WHEELS)
car_b = line_svg([car(rear=(3.25, 3.25)).replace("L3.25 9.25L3.25 5.75", "L3.25 5.75"), "M8.75 5.75L8.75 9.25"], dots=WHEELS)
car_c = line_svg([car(roof=6, rear=(3.5, 6.75), front=(10, 13.25))], dots=WHEELS)
ship("car", car_a, line_svg([CONVERTIBLE, WINDSHIELD], dots=WHEELS),
     duo=duo_svg([silhouette(CAR)], fg_lines=[CAR_PILLAR], fg_dots=[(x, y, 1.5) for x, y, _ in WHEELS]),
     duo_opened=duo_svg([silhouette(CONVERTIBLE)], fg_lines=[WINDSHIELD], fg_dots=[(x, y, 1.5) for x, y, _ in WHEELS]),
     attempts=[("sedan, wheels on the sill", car_a), ("hatchback", car_b), ("plain cabin", car_c)])

# ---------------- sailboat ----------------
def hull(deck=12.75, r=3.5, bottom=16.25):
    """Deck line with quarter-arc ends down to a flat keel line."""
    return (Pen((1.75, deck)).L((16.25, deck)).A((16.25 - r, deck), (16.25 - r, bottom)).L((1.75 + r, bottom))
            .A((1.75 + r, deck), (1.75, deck)).Z())


def rig(mast_x, boom_y, main_r, jib_r=0, deck=12.75):
    """A mast from the deck to the top, a quarter-disc main sail aft of it and an optional quarter-disc jib ahead."""
    top = boom_y - main_r
    parts = [f"M{f(mast_x)} {f(deck)}L{f(mast_x)} {f(top)}",
             f"M{f(mast_x)} {f(top)}A{f(main_r)} {f(main_r)} 0 0 1 {f(mast_x + main_r)} {f(boom_y)}L{f(mast_x - jib_r)} {f(boom_y)}"]
    if jib_r:
        parts.append(f"M{f(mast_x - jib_r)} {f(boom_y)}A{f(jib_r)} {f(jib_r)} 0 0 1 {f(mast_x)} {f(boom_y - jib_r)}")
    return parts


HULL = hull(12.5, 3.75)
MAIN = rig(7.25, 9, 7.25, deck=12.5)
sail_a = line_svg([HULL] + MAIN)
sail_b = line_svg([hull(12.25, 4)] + rig(6.75, 8.75, 7, deck=12.25))
sail_c = line_svg([HULL] + rig(8.5, 9, 7.25, deck=12.5))
ship("sailboat", sail_a, line_svg([HULL] + rig(7.25, 9, 7.25, 5.25, deck=12.5)),
     duo=duo_svg([silhouette(HULL), silhouette("M7.25 1.75A7.25 7.25 0 0 1 14.5 9L7.25 9Z")], fg_lines=["M7.25 12.5L7.25 9"]),
     attempts=[("main sail on the mast", sail_a), ("deeper hull", sail_b), ("mast near the middle", sail_c)])

# ---------------- tent ----------------
def tent(apex_y=5.5, pole=1.75):
    """A 45° ridge tent with short walls at the frame edges and the poles crossing out through the apex."""
    body = peak((9, apex_y), 16.25)
    poles = f"M{f(9 - pole)} {f(apex_y - pole)}L9 {f(apex_y)}L{f(9 + pole)} {f(apex_y - pole)}" if pole else ""
    return body, poles


TENT, TENT_POLES = tent()
TENT_SEAM = "M9 10.5L9 16.25"
TENT_DOOR = "M5.25 16.25A3.75 3.75 0 0 1 12.75 16.25"
tent_a = line_svg([TENT, TENT_POLES, TENT_SEAM])
tb, _ = tent(5.5, 0)
tent_b = line_svg([tb, TENT_SEAM])
tc, _ = tent(4.5, 0)
tent_c = line_svg([tc, "M9 9.5L9 16.25"])
ship("tent", tent_a, line_svg([TENT, TENT_POLES, TENT_DOOR]),
     duo=duo_svg([silhouette(TENT)], fg_lines=[TENT_POLES, TENT_SEAM]),
     duo_opened=duo_svg([silhouette(TENT)], fg_lines=[TENT_POLES, TENT_DOOR]),
     attempts=[("ridge tent, poles out the top, door seam", tent_a), ("no poles", tent_b), ("tall walls, no poles", tent_c)])

save_meta("nature")
