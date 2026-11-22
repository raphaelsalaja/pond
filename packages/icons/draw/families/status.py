"""Draws the status family in Neutral into packages/icons/next/."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *

C = (9, 9)
D45 = 1 / SQ


def P(c, r, deg):
    a = math.radians(deg)
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def arc(c, r, d0, d1, move=True):
    """An arc from angle d0 to d1 in degrees, screen coords, turning the way d1 lies from d0."""
    p0, p1 = P(c, r, d0), P(c, r, d1)
    large = 1 if abs(d1 - d0) > 180 else 0
    sweep = 1 if d1 > d0 else 0
    return (f"M{pt(p0)}" if move else "") + f"A{f(r)} {f(r)} 0 {large} {sweep} {pt(p1)}"


def svg(paths, dots=(), fills=()):
    """An outline with optional flat filled shapes."""
    s = line_svg(paths, dots)
    body = "".join(f'<path d="{d}" fill="currentColor" stroke="none"/>' for d in fills)
    return s.replace("</svg>", body + "</svg>")


def _samples(segs, closed, step=0.1):
    pts, s0 = [], 0.0
    for seg in segs:
        L = math.dist(seg.a, seg.b) if isinstance(seg, Line) else seg.r * abs(seg.a1 - seg.a0)
        n = max(1, math.ceil(L / step))
        pts += [(seg.at(k / n), s0 + L * k / n, seg.tan(k / n)) for k in range(n)]
        s0 += L
    if not closed: pts.append((segs[-1].at(1), s0, segs[-1].tan(1)))
    return pts, s0


def gaps(name, svg_, need=3.4):
    """Prints stroke centres closer than `need` between details that do not touch, or where a path doubles back.
    A dot counts as the centre line of its ring, r - 0.625."""
    items = []
    for tag in re.findall(r"<(?:path|circle)\s[^>]*>", svg_):
        if "class=" in tag: continue
        if tag.startswith("<circle"):
            x, y, r = (float(re.search(fr'\s{k}="([^"]+)"', tag).group(1)) for k in ("cx", "cy", "r"))
            items.append(([((x + (r - H) * math.cos(k * math.pi / 16), y + (r - H) * math.sin(k * math.pi / 16)), 0, (0, 0))
                           for k in range(32)], 0, True, True))
            continue
        if 'fill="currentColor"' in tag: continue
        for segs, closed in parse(re.search(r'\sd="([^"]+)"', tag).group(1)):
            p, tot = _samples(segs, closed)
            items.append((p, tot, closed, False))
    grid = {}
    for i, (ps, *_r) in enumerate(items):
        for j, (p, *_s) in enumerate(ps):
            grid.setdefault((int(p[0] // need), int(p[1] // need)), []).append((i, j))
    pair, own = {}, {}
    for (gx, gy), cell in grid.items():
        near = [e for dx in (-1, 0, 1) for dy in (-1, 0, 1) for e in grid.get((gx + dx, gy + dy), ())]
        for i, j in cell:
            p, s, u = items[i][0][j]
            for k, l in near:
                if (k, l) <= (i, j): continue
                q, t, v = items[k][0][l]
                e = math.dist(p, q)
                if e >= need: continue
                if k != i:
                    key = (min(i, k), max(i, k))
                    if e < pair.get(key, (9, 0))[0]: pair[key] = (e, p, q)
                elif not items[i][3]:
                    L = abs(s - t)
                    if items[i][2]: L = min(L, items[i][1] - L)
                    if L > e + 0.2 and u[0] * v[0] + u[1] * v[1] < -0.98 and e < own.get(i, (9, 0))[0]: own[i] = (e, p, q)
    found = [v for v in pair.values() if v[0] > 0.2] + list(own.values())
    for e, p, q in found: print(f"  {name}: gap {e:.3f} between {pt(p)} and {pt(q)}")
    return found


CHECKED = []

def check(name, outline):
    CHECKED.append(name)
    return lint(name, outline) + gaps(name, outline)


def check_solid(name, paths):
    """Solids keep the stroke rules on their edges: lines on 0/45/90 and corners of 90° or more."""
    return lint(name, line_svg(paths))


def out(name, outline, opened=None, **kw):
    check(name, outline)
    if opened: check(name + " open", opened)
    write(name, outline, opened=opened, **kw)


def stroke_outline(pts):
    """The outline of a 1.25 butt-capped, mitered stroke along a polyline, as a closed polygon."""
    def off(a, b, s):
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy); n = (-dy / l * H * s, dx / l * H * s)
        return (a[0] + n[0], a[1] + n[1]), (b[0] + n[0], b[1] + n[1])
    def side(s):
        lines = [off(pts[i], pts[i + 1], s) for i in range(len(pts) - 1)]
        ps = [lines[0][0]]
        for (a0, a1), (b0, b1) in zip(lines, lines[1:]):
            u = (a1[0] - a0[0], a1[1] - a0[1]); v = (b1[0] - b0[0], b1[1] - b0[1])
            den = u[0] * v[1] - u[1] * v[0]
            t = ((b0[0] - a0[0]) * v[1] - (b0[1] - a0[1]) * v[0]) / den
            ps.append((a0[0] + u[0] * t, a0[1] + u[1] * t))
        ps.append(lines[-1][1])
        return ps
    return side(1) + side(-1)[::-1]


RING = ring()
RING_SIL = silhouette(RING)
DISC = circle_d(C, 7.5 + O)

# ---------- seeds ----------
CHECK_IN = "M5.75 8.875L7.875 11L12.25 6.625"
HANDS = "M9 4.875L9 9L11.875 11.875"
LENS = circle_d((8, 8), 5.75)
HANDLE = "M12.125 12.125L15.75 15.75"
GLINT = "M5.75 8A2.25 2.25 0 0 1 8 5.75"

out("circle-check", line_svg([RING, CHECK_IN]), duo=duo_svg([RING_SIL], fg_lines=[CHECK_IN]))
uses("circle-check", "ring")
out("clock", line_svg([RING, HANDS]), duo=duo_svg([RING_SIL], fg_lines=[HANDS]))
uses("clock", "ring")
out("magnifier", line_svg([LENS, HANDLE]),
    duo=duo_svg([circle_d((8, 8), 5.75 + O)], fg_lines=["M12.508 12.508L15.75 15.75"]),
    opened=line_svg([LENS, HANDLE, GLINT]),
    duo_opened=duo_svg([circle_d((8, 8), 5.75 + O)], fg_lines=["M12.508 12.508L15.75 15.75", GLINT]))

# ---------- ring family ----------
out("circle", line_svg([RING]))
uses("circle", "ring")

UP_STEM = "M9 13L9 5"
UP_HEAD = "M5.5 8.5L9 5L12.5 8.5"
explore("circle-arrow-up", [
    ("head arms 3.5", line_svg([RING, UP_STEM, UP_HEAD])),
    ("head only", line_svg([RING, "M5.5 10.75L9 7.25L12.5 10.75"])),
], picked=0)
out("circle-arrow-up", line_svg([RING, UP_STEM, UP_HEAD]), duo=duo_svg([RING_SIL], fg_lines=[UP_STEM, UP_HEAD]))
uses("circle-arrow-up", "ring")

# a dot and a stem 3.4 apart leave a stem of 3 inside the ring
INFO_STEM = "M7.75 10L9 10L9 13"
INFO_DOT = (9, 5.75, 1.375)
explore("circle-info", [
    ("plain stem", line_svg([RING, "M9 10L9 13"], [INFO_DOT])),
    ("stem with a flag serif", line_svg([RING, INFO_STEM], [INFO_DOT])),
], picked=1)
out("circle-info", line_svg([RING, INFO_STEM], [INFO_DOT]),
    duo=duo_svg([RING_SIL], fg_lines=[INFO_STEM], fg_dots=[(9, 5.75, 1.5)]))
uses("circle-info", "ring")

WARN_STEM = "M9 5L9 8"
WARN_DOT = (9, 12.25, 1.375)
explore("circle-warning", [
    ("exclamation", line_svg([RING, WARN_STEM], [WARN_DOT])),
    ("bar across", line_svg([RING, "M5.25 9L12.75 9"])),
], picked=0)
out("circle-warning", line_svg([RING, WARN_STEM], [WARN_DOT]),
    duo=duo_svg([RING_SIL], fg_lines=[WARN_STEM], fg_dots=[(9, 12.25, 1.5)]))
uses("circle-warning", "ring")

def hook(cy, r, stub_end):
    """A question hook: an arc over the top into a 45° drop, then an upright."""
    q = P((9, cy), r, 45)
    drop = (9, q[1] + (q[0] - 9))
    return f"M{pt((9 - r, cy))}" + arc((9, cy), r, 180, 405, move=False) + f"L{pt(drop)}L9 {f(stub_end)}"

# a dot 3.4 under the hook leaves no room for the hook, so the mark is the hook alone
Q_HOOK = hook(7.25, 2.25, 13)
BUOY = [circle_d(C, 4)] + [f"M{pt(P(C, 4, a_))}L{pt(P(C, 7.5, a_))}" for a_ in (45, 135, 225, 315)]
explore("circle-question", [
    ("hook, no dot", line_svg([RING, Q_HOOK])),
    ("lifebuoy", line_svg([RING] + BUOY)),
], picked=0)
out("circle-question", line_svg([RING, Q_HOOK]), duo=duo_svg([RING_SIL], fg_lines=[Q_HOOK]))
uses("circle-question", "ring")

def ring_hits(c2, r2):
    """Where a circle meets the ring, left point first."""
    d = math.dist(C, c2); a = (RING_R ** 2 - r2 ** 2 + d * d) / (2 * d); h = math.sqrt(RING_R ** 2 - a * a)
    ux, uy = (c2[0] - C[0]) / d, (c2[1] - C[1]) / d
    m = (C[0] + ux * a, C[1] + uy * a)
    p, q = (m[0] - uy * h, m[1] + ux * h), (m[0] + uy * h, m[1] - ux * h)
    return sorted([p, q])

RING_R = 7.5
HEAD = circle_d((9, 7.25), 2.25)
SH_C, SH_R = (9, 18), 5
_l, _r = ring_hits(SH_C, SH_R)
SHOULDERS = f"M{pt(_l)}" + arc_pts(SH_C, SH_R, _l, _r, 1).d(0, 1)
HEAD_B = circle_d((9, 6.75), 2.125)
BUST_B = "M6.25 13.75A2.75 2.75 0 0 1 11.75 13.75Z"
explore("circle-user", [
    ("shoulders meet the ring", line_svg([RING, HEAD, SHOULDERS])),
    ("closed bust inside", line_svg([RING, HEAD_B, BUST_B])),
], picked=0)
out("circle-user", line_svg([RING, HEAD, SHOULDERS]), duo=duo_svg([RING_SIL], fg_lines=[HEAD, SHOULDERS]))
uses("circle-user", "ring")

XMARK_IN = "M6.125 6.125L11.875 11.875M11.875 6.125L6.125 11.875"
out("circle-xmark", line_svg([RING, XMARK_IN]), duo=duo_svg([RING_SIL], fg_lines=[XMARK_IN]))
uses("circle-xmark", "ring")

# solids: the disc of the ring's outer edge, the mark knocked out as its stroke outline
CHECK_PTS = [(5.75, 8.875), (7.875, 11), (12.25, 6.625)]
write("circle-check-fill", solid=solid_svg([DISC + poly(*stroke_outline(CHECK_PTS))], evenodd=True))
a, b = 6.125, 11.875; k = H * D45 * 2
XO = [(a + k / 2, a - k / 2), (9, 9 - k), (b - k / 2, a - k / 2), (b + k / 2, a + k / 2), (9 + k, 9),
      (b + k / 2, b - k / 2), (b - k / 2, b + k / 2), (9, 9 + k), (a + k / 2, b + k / 2), (a - k / 2, b - k / 2),
      (9 - k, 9), (a - k / 2, a + k / 2)]
write("circle-xmark-fill", solid=solid_svg([DISC + poly(*XO)], evenodd=True))

BAN = f"M{pt(P(C, 7.5, 225))}L{pt(P(C, 7.5, 45))}"
explore("ban", [
    ("diagonal into the ring", line_svg([RING, BAN])),
    ("registered slash, ring cut", with_slash([RING])[0]),
], picked=0)
out("ban", line_svg([RING, BAN]), duo=duo_svg([RING_SIL], fg_lines=[BAN]))
uses("ban", "ring")

HALF = "M9 1.5A7.5 7.5 0 0 1 9 16.5Z"
explore("contrast", [
    ("right half filled to the ring", svg([RING], fills=[HALF])),
    ("inset half disc", svg([RING], fills=["M9 4.875A4.125 4.125 0 0 1 9 13.125Z"])),
    ("diameter only", line_svg([RING, "M9 1.5L9 16.5"])),
], picked=0)
out("contrast", svg([RING], fills=[HALF]),
    duo=duo_svg([RING_SIL], fg=[f"M9 {f(9 - 7.5 - O)}A{f(7.5 + O)} {f(7.5 + O)} 0 0 1 9 {f(9 + 7.5 + O)}Z"]))
uses("contrast", "ring")

CP_HANDS = "M9 5L9 9L6.125 11.875"
explore("clock-plus", [
    ("clock hands, cut by the badge", with_badge([RING, HANDS], "badge-plus")[0]),
    ("hands turned to seven, clear of the badge", with_badge([RING, CP_HANDS], "badge-plus")[0]),
], picked=1)
cp_line, _ = with_badge([RING, CP_HANDS], "badge-plus")
_, cp_duo = with_badge([RING], "badge-plus", bg=[RING_SIL], fg_lines=[CP_HANDS])
out("clock-plus", cp_line, duo=cp_duo)
uses("clock-plus", "ring", "badge-plus")

# history: a dial run anticlockwise into a head at nine o'clock, set right so the head's arms fit the frame
HC, HR = (10.875, 9), 5.625
HT = (HC[0] - HR, HC[1])
HIST_ARC = arc(HC, HR, 135, -180)
HIST_HEAD = f"M{pt((HT[0] - 3.5, HT[1] - 3.5))}L{pt(HT)}L{pt((HT[0] + 3.5, HT[1] - 3.5))}"
HIST_HANDS = "M13 9L10.875 9L10.875 11.125"
HIST_HAND = "M10.875 9L12.375 10.5"
HC2, HR2 = (10.75, 9.5), 5.5
HT2 = (HC2[0] - HR2, HC2[1])
explore("history", [
    ("dial set right, hands at three and six", line_svg([HIST_ARC, HIST_HEAD, HIST_HANDS])),
    ("dial set right, one hand", line_svg([HIST_ARC, HIST_HEAD, HIST_HAND])),
    ("smaller dial, lower", line_svg([arc(HC2, HR2, 135, -180), f"M{pt((HT2[0] - 3.5, HT2[1] - 3.5))}L{pt(HT2)}L{pt((HT2[0] + 3.5, HT2[1] - 3.5))}",
                                     "M12.75 9.5L10.75 9.5L10.75 11.5"])),
], picked=0)
out("history", line_svg([HIST_ARC, HIST_HEAD, HIST_HANDS]))

# dashed clock: the ring broken into dashes, gaps of 30° so the dash ends stay 3.4 apart
def dashes(n, gap_deg, start=-90):
    step = 360 / n; dash = step - gap_deg
    return [arc(C, 7.5, start + i * step - dash / 2, start + i * step + dash / 2) for i in range(n)]

explore("circle-dashed-clock", [
    ("6 dashes, gap at twelve", line_svg(dashes(6, 30, -60) + [HANDS])),
    ("6 dashes, dash at twelve", line_svg(dashes(6, 30) + [CP_HANDS.replace("6.125", "11.875")])),
    ("4 dashes, 45° gaps", line_svg(dashes(4, 45, -45) + [HANDS])),
], picked=0)
out("circle-dashed-clock", line_svg(dashes(6, 30, -60) + [HANDS]))

# compass: a needle of 45° and 90° edges, the north half filled
NEEDLE_NE = poly((11.875, 6.125), (9.375, 6.125), (6.125, 9.375), (6.125, 11.875), (8.625, 11.875), (11.875, 8.625))
NORTH_NE = poly((11.875, 6.125), (9.375, 6.125), (7.75, 7.75), (10.25, 10.25), (11.875, 8.625))
NEEDLE_N = poly((9, 4.875), (10.75, 6.625), (10.75, 11.375), (9, 13.125), (7.25, 11.375), (7.25, 6.625))
NORTH_N = poly((9, 4.875), (10.75, 6.625), (10.75, 9), (7.25, 9), (7.25, 6.625))
DIAMOND_NEEDLE = poly((9, 5), (13, 9), (9, 13), (5, 9))
NORTH_DIAMOND = poly((9, 5), (13, 9), (5, 9))
explore("compass", [
    ("hex needle turned NE, north filled", svg([RING, NEEDLE_NE], fills=[NORTH_NE])),
    ("diamond needle pointing up", svg([RING, DIAMOND_NEEDLE], fills=[NORTH_DIAMOND])),
    ("hex needle pointing up", svg([RING, NEEDLE_N], fills=[NORTH_N])),
], picked=1)
out("compass", svg([RING, DIAMOND_NEEDLE], fills=[NORTH_DIAMOND]),
    duo=duo_svg([RING_SIL], fg=[NORTH_DIAMOND], fg_lines=[DIAMOND_NEEDLE]),
    opened=svg([RING, NEEDLE_NE], fills=[NORTH_NE]),
    duo_opened=duo_svg([RING_SIL], fg=[NORTH_NE], fg_lines=[NEEDLE_NE]))
uses("compass", "ring")

# globe: a lens of two r10.25 meridians and the equator; open is the map, unrolled
MERIDIANS = "M9 1.5A10.25 10.25 0 0 0 9 16.5A10.25 10.25 0 0 0 9 1.5Z"
EQUATOR = "M1.5 9L16.5 9"
MAP_LINES = ["M1.75 9L16.25 9", "M6.5 2.5A17.5 17.5 0 0 0 6.5 15.5", "M11.5 2.5A17.5 17.5 0 0 1 11.5 15.5"]
explore("globe", [
    ("lens meridians and equator", line_svg([RING, MERIDIANS, EQUATOR])),
    ("lens meridians only", line_svg([RING, MERIDIANS])),
    ("cross of meridian and equator", line_svg([RING, "M9 1.5L9 16.5", EQUATOR])),
], picked=0)
out("globe", line_svg([RING, MERIDIANS, EQUATOR]), duo=duo_svg([RING_SIL], fg_lines=[MERIDIANS, EQUATOR]),
    opened=line_svg([BOX] + MAP_LINES), duo_opened=duo_svg([silhouette(BOX)], fg_lines=MAP_LINES))
uses("globe", "ring")

# aperture: blades on 0/45/90 lines, each an edge of the hole run out to the ring
def blades(n, ap):
    rv = ap / math.cos(math.radians(180 / n)); out_ = []
    for k in range(n):
        phi = k * 360 / n - 90
        v0, v1 = P(C, rv, phi - 180 / n), P(C, rv, phi + 180 / n)
        u = ((v1[0] - v0[0]) / math.dist(v0, v1), (v1[1] - v0[1]) / math.dist(v0, v1))
        fx, fy = v0[0] - 9, v0[1] - 9; bq = fx * u[0] + fy * u[1]
        t = -bq + math.sqrt(bq * bq - (fx * fx + fy * fy - 56.25))
        out_.append(f"M{pt(v0)}L{pt((v0[0] + u[0] * t, v0[1] + u[1] * t))}")
    return out_

# eight blades leave 1.5 between alternate blade edges at the hole, so the iris has four
BLADES = blades(4, 2)
explore("aperture", [
    ("4 blades, square hole 4", line_svg([RING] + BLADES)),
    ("4 blades, square hole 5", line_svg([RING] + blades(4, 2.5))),
    ("4 blades, square hole 4.5", line_svg([RING] + blades(4, 2.25))),
], picked=0)
out("aperture", line_svg([RING] + BLADES), duo=duo_svg([RING_SIL], fg_lines=BLADES))
uses("aperture", "ring")

# eye: two r7.875 lids, a pupil disc
EYE = "M1.875 9A7.5 7.5 0 0 1 16.125 9A7.5 7.5 0 0 1 1.875 9Z"
PUPIL = (9, 9, 2.25)
explore("eye", [
    ("rounder r7.5 lids, pupil r2.25", line_svg([EYE], [PUPIL])),
    ("r7.875 lids, pupil r1.625", line_svg(["M1.875 9A7.875 7.875 0 0 1 16.125 9A7.875 7.875 0 0 1 1.875 9Z"], [(9, 9, 1.625)])),
], picked=0)
out("eye", line_svg([EYE], [PUPIL]), duo=duo_svg([silhouette(EYE)], fg_dots=[(9, 9, 2.375)]))

es_line, es_duo = with_slash([EYE])
pupil_cut = []
for segs, closed in parse(circle_d(C, 2.5)):
    pupil_cut += clip_fill(segs, H + 1)
explore("eye-slash", [
    ("no pupil", es_line),
    ("pupil moved off the slash", line_svg(trim_slash([EYE]) + [SLASH], [(11.125, 6.875, 1.375)])),
    ("pupil cut by the slash", svg(trim_slash([EYE]) + [SLASH], fills=pupil_cut)),
], picked=0)
out("eye-slash", es_line, duo=es_duo)
uses("eye-slash", "slash")

# a glint and a pupil cannot both stay 3.4 clear inside the ring; the glint alone reads as a spinner
LENS_GLINT = arc(C, 4, 180, 270)
LENS_BARREL = circle_d(C, 4)
explore("eye-lens", [
    ("glint arc", line_svg([RING, LENS_GLINT])),
    ("inner barrel ring", line_svg([RING, LENS_BARREL])),
    ("large pupil", line_svg([RING], [(9, 9, 2.75)])),
], picked=1)
out("eye-lens", line_svg([RING, LENS_BARREL]), duo=duo_svg([RING_SIL], fg_lines=[LENS_BARREL]))
uses("eye-lens", "ring")

EYES = [(6.5, 6.875, 1.375), (11.5, 6.875, 1.375)]
EYES_DUO = [(6.5, 6.875, 1.5), (11.5, 6.875, 1.5)]
SMILE = arc(C, 3.75, 45, 135)
# an outlined grin is under 3.4 deep, so the open mouth is filled
GRIN = "M6 10.5L12 10.5A3 3 0 0 1 6 10.5Z"
explore("face-smile", [
    ("smile arc 90°", line_svg([RING, SMILE], EYES)),
    ("filled grin", svg([RING], EYES, fills=[GRIN])),
], picked=0)
out("face-smile", line_svg([RING, SMILE], EYES), duo=duo_svg([RING_SIL], fg_lines=[SMILE], fg_dots=EYES_DUO),
    opened=svg([RING], EYES, fills=[GRIN]), duo_opened=duo_svg([RING_SIL], fg=[GRIN], fg_dots=EYES_DUO))
uses("face-smile", "ring")

# palette: the ring with a thumb hole bitten out at the lower right
def bitten(rb, at=45):
    """The ring with a bite of radius rb, centred so both tips are exactly 90°."""
    bc = P(C, math.sqrt(7.5 ** 2 + rb ** 2), at)
    d = math.dist(C, bc); a_ = (7.5 ** 2 - rb ** 2 + d * d) / (2 * d); h = math.sqrt(7.5 ** 2 - a_ * a_)
    ux, uy = (bc[0] - 9) / d, (bc[1] - 9) / d; m = (9 + ux * a_, 9 + uy * a_)
    p1, p2 = (m[0] + uy * h, m[1] - ux * h), (m[0] - uy * h, m[1] + ux * h)
    outer = max((arc_pts(C, 7.5, p2, p1, s) for s in (0, 1)), key=lambda A: math.dist(A.at(0.5), bc))
    inner = min((arc_pts(bc, rb, p1, p2, s) for s in (0, 1)), key=lambda A: math.dist(A.at(0.5), C))
    return path([outer, inner], True), bc

# three paints 3.4 apart and 3.4 inside the ring; the hole is wide enough to hold a brush tip 3.4 clear
PALETTE, BITE_C = bitten(4.25)
PAINT = [(6.75, 6.75, 1.375), (7.375, 11.75, 1.375), (11.75, 7.375, 1.375)]
BRUSH_TIP = (15.125, 15.125, 1.375)
BRUSH = "M15.125 15.125L16.25 16.25"
PALETTE_S, _ = bitten(3)
explore("palette", [
    ("wide thumb hole, three paints", line_svg([PALETTE], PAINT)),
    ("small thumb hole, three paints", line_svg([PALETTE_S], [(6.75, 6.75, 1.375), (8, 12.125, 1.375), (12.125, 8, 1.375)])),
], picked=0)
out("palette", line_svg([PALETTE], PAINT), duo=duo_svg([silhouette(PALETTE)], fg_dots=[(x, y, 1.5) for x, y, _ in PAINT]),
    opened=line_svg([PALETTE, BRUSH], PAINT + [BRUSH_TIP]),
    duo_opened=duo_svg([silhouette(PALETTE)], fg_lines=[BRUSH], fg_dots=[(x, y, 1.5) for x, y, _ in PAINT + [BRUSH_TIP]]))

# badge-check: two squares, one turned 45°, as one eight-point rosette
def rosette(a_, b_):
    k_ = b_ - a_
    return poly((9, 9 - b_), (9 + k_, 9 - a_), (9 + a_, 9 - a_), (9 + a_, 9 - k_), (9 + b_, 9), (9 + a_, 9 + k_),
                (9 + a_, 9 + a_), (9 + k_, 9 + a_), (9, 9 + b_), (9 - k_, 9 + a_), (9 - a_, 9 + a_), (9 - a_, 9 + k_),
                (9 - b_, 9), (9 - a_, 9 - k_), (9 - a_, 9 - a_), (9 - k_, 9 - a_))

def scallops(n, c_, rb):
    """n arcs of radius rb on a circle of radius c_, joined at their crossings."""
    half = 180 / n
    ux = math.cos(math.radians(half)); dq = c_ * ux + math.sqrt((c_ * ux) ** 2 - (c_ * c_ - rb * rb))
    segs = []
    for k in range(n):
        th = -90 + k * 360 / n
        ck = P(C, c_, th)
        segs.append(arc_pts(ck, rb, P(C, dq, th - half), P(C, dq, th + half), 1))
    return path(segs, True)

# the octagram's inner corners sit 5.5 from the centre, too close for a tick, so the seal is scalloped
SEAL = scallops(12, 5.75, 1.75)
BADGE_TICK = "M6.625 8.875L8.125 10.375L11.375 7.125"
explore("badge-check", [
    ("twelve scallops", line_svg([SEAL, BADGE_TICK])),
    ("ten scallops", line_svg([scallops(10, 5.5, 2), BADGE_TICK])),
    ("square and diamond rosette, small tick", line_svg([rosette(5.125, 7.125), "M7.625 9.25L8.625 10.25L10.75 8.125"])),
], picked=0)
out("badge-check", line_svg([SEAL, BADGE_TICK]), duo=duo_svg([silhouette(SEAL)], fg_lines=[BADGE_TICK]))

# shield-check: flat top, upright sides that bow in to a blunt point
def shield(x0, x1, ys, top=1.75, bottom=16.25):
    """Sides upright to ys, then arcs tangent to them meeting at the bottom centre."""
    cx, w = (x0 + x1) / 2, (x1 - x0) / 2
    R = ((bottom - ys) ** 2 + w * w) / (2 * w)
    return (f"M{f(x0 + 1.5)} {f(top)}L{f(x1 - 1.5)} {f(top)}A1.5 1.5 0 0 1 {f(x1)} {f(top + 1.5)}L{f(x1)} {f(ys)}"
            f"A{f(R)} {f(R)} 0 0 1 {f(cx)} {f(bottom)}A{f(R)} {f(R)} 0 0 1 {f(x0)} {f(ys)}L{f(x0)} {f(top + 1.5)}"
            f"A1.5 1.5 0 0 1 {f(x0 + 1.5)} {f(top)}Z"), R

SHIELD, SH_R = shield(3.125, 14.875, 8)
SHIELD_TICK = "M6.75 9.125L8.125 10.5L11.25 7.375"

def shield_halves(inner=1.75, foot=3.5):
    """SHIELD split down the middle with each side pushed to the padding; the point is squared off by a foot."""
    xi, xo = 9 + inner, 16.25
    cx = xo - SH_R
    qx = round((xi + foot) * 8) / 8
    qy = round((8 + math.sqrt(SH_R ** 2 - (qx - cx) ** 2)) * 8) / 8
    right = (f"M{f(xi)} 1.75L{f(xo - 1.5)} 1.75A1.5 1.5 0 0 1 {f(xo)} 3.25L{f(xo)} 8"
             f"A{f(SH_R)} {f(SH_R)} 0 0 1 {f(qx)} {f(qy)}L{f(xi)} {f(qy)}Z")
    left = (f"M{f(18 - xi)} 1.75L{f(18 - xo + 1.5)} 1.75A1.5 1.5 0 0 0 {f(18 - xo)} 3.25L{f(18 - xo)} 8"
            f"A{f(SH_R)} {f(SH_R)} 0 0 0 {f(18 - qx)} {f(qy)}L{f(18 - xi)} {f(qy)}Z")
    return [left, right]

HALVES = shield_halves()
explore("shield-check", [
    ("upright sides bowing to a blunt point", line_svg([SHIELD, SHIELD_TICK])),
    ("sides bow from higher up", line_svg([shield(3.125, 14.875, 5.5)[0], SHIELD_TICK])),
], picked=0)
out("shield-check", line_svg([SHIELD, SHIELD_TICK]), duo=duo_svg([silhouette(SHIELD)], fg_lines=[SHIELD_TICK]),
    opened=line_svg(HALVES))

# triangle-warning: a triangle on 45° sides has no room for a mark 3.4 clear, so the caution sign is an octagon
OCTAGON = poly((6, 1.75), (12, 1.75), (16.25, 6), (16.25, 12), (12, 16.25), (6, 16.25), (1.75, 12), (1.75, 6))
WARN2_STEM = "M9 5.25L9 7.75"
WARN2_DOT = (9, 12, 1.375)
BANG = "M9 1.75L9 11.125"
explore("triangle-warning", [
    ("octagon sign", line_svg([OCTAGON, WARN2_STEM], [WARN2_DOT])),
    ("bare exclamation", line_svg([BANG], [(9, 15.375, 1.375)])),
    ("diamond sign, stem only", line_svg([poly((9, 1.75), (16.25, 9), (9, 16.25), (1.75, 9)), "M9 6.75L9 11.25"])),
], picked=0)
out("triangle-warning", line_svg([OCTAGON, WARN2_STEM], [WARN2_DOT]),
    duo=duo_svg([silhouette(OCTAGON)], fg_lines=[WARN2_STEM], fg_dots=[(9, 12, 1.5)]))

# stopwatch: a hand from the centre stays under 3 long, so the needle runs through the centre with a tail
SW_C, SW_R = (9, 10), 6.25
SW_BODY = circle_d(SW_C, SW_R)
SW_CROWN = "M9 3.75L9 1.75"
SW_BUTTON = f"M{pt(P(SW_C, SW_R, -45))}L14.75 4.25"
SW_HAND = "M9 11.5L9 7.25"
SW_HAND_RUN = "M7.875 11.125L10.875 8.125"
SW_WEDGE = "M9 10L9 3.75A6.25 6.25 0 0 1 15.25 10Z"
explore("stopwatch", [
    ("needle with a tail", line_svg([SW_BODY, SW_CROWN, SW_BUTTON, SW_HAND])),
    ("hand from the centre", line_svg([SW_BODY, SW_CROWN, SW_BUTTON, "M9 10L9 7.25"])),
    ("filled sweep", svg([SW_BODY, SW_CROWN, SW_BUTTON], fills=[SW_WEDGE])),
], picked=0)
SW_SIL = circle_d(SW_C, SW_R + O)
out("stopwatch", line_svg([SW_BODY, SW_CROWN, SW_BUTTON, SW_HAND]),
    duo=duo_svg([SW_SIL], fg_lines=[SW_CROWN, SW_BUTTON, SW_HAND]),
    opened=line_svg([SW_BODY, SW_CROWN, SW_BUTTON, SW_HAND_RUN]),
    duo_opened=duo_svg([SW_SIL], fg_lines=[SW_CROWN, SW_BUTTON, SW_HAND_RUN]))

# pocket watch: the bow needs a 3.4 counter above the case, which sets the case at r5.5
def bow(cx, cy_body, r_body, w=3.5, top=1.75):
    rb = w / 2; x0, x1 = cx - rb, cx + rb
    yl = cy_body - math.sqrt(r_body ** 2 - rb ** 2)
    return f"M{f(x0)} {f(yl)}L{f(x0)} {f(top + rb)}A{f(rb)} {f(rb)} 0 0 1 {f(x1)} {f(top + rb)}L{f(x1)} {f(yl)}"

PW_BOW = bow(9, 10.75, 5.5)
PW_BODY = SW_BODY
PW_KNOB = (9, 3, 1.375)
PW_HANDS = "M9 7.25L9 10L11.75 10"
explore("pocket-watch", [
    ("bow over an r5.5 case", line_svg([circle_d((9, 10.75), 5.5), PW_BOW, "M9 8.75L9 10.75L11 10.75"])),
    ("crown knob on an r6.25 case, longer hands", line_svg([PW_BODY, PW_HANDS], [PW_KNOB])),
], picked=1)
# open: the lid swung out to the lower left; the case shrinks to r5.5 so the lid meets it at 90° inside the padding
PO_C, PO_R = (10.75, 10.75), 5.5
LID_C, LID_R = (4.75, 13.25), 3
d_ = math.dist(PO_C, LID_C); a_ = (PO_R ** 2 - LID_R ** 2 + d_ * d_) / (2 * d_)
hx = math.sqrt(PO_R ** 2 - a_ * a_)
ux, uy = (LID_C[0] - PO_C[0]) / d_, (LID_C[1] - PO_C[1]) / d_
mx, my = PO_C[0] + ux * a_, PO_C[1] + uy * a_
L1, L2 = (mx + uy * hx, my - ux * hx), (mx - uy * hx, my + ux * hx)
lid_arc = max((arc_pts(LID_C, LID_R, L1, L2, s) for s in (0, 1)), key=lambda A: math.dist(A.at(0.5), PO_C))
PW_LID = f"M{pt(lid_arc.at(0))}" + lid_arc.d(0, 1)
PO_KNOB = (10.75, 4.5, 1.375)
PO_HANDS = "M10.75 8.75L10.75 10.75L12.75 10.75"
PW_SIL = circle_d(SW_C, SW_R + O)
out("pocket-watch", line_svg([PW_BODY, PW_HANDS], [PW_KNOB]),
    duo=duo_svg([PW_SIL], fg_lines=[PW_HANDS], fg_dots=[(9, 3, 1.5)]),
    opened=line_svg([circle_d(PO_C, PO_R), PO_HANDS, PW_LID], [PO_KNOB]),
    duo_opened=duo_svg([circle_d(PO_C, PO_R + O)], fg_lines=[PO_HANDS, PW_LID], fg_dots=[(10.75, 4.5, 1.5)]))

# gauge: three quarters of the ring, a needle
GAUGE = arc(C, 7.5, 135, 405)
NEEDLE = "M9 9L11.875 6.125"
explore("gauge", [
    ("open dial, needle from centre", line_svg([GAUGE, NEEDLE])),
    ("needle on a hub", line_svg([GAUGE, NEEDLE], [(9, 9, 1.375)])),
    ("dial closed by a chord", line_svg([GAUGE + "Z", NEEDLE])),
], picked=0)
out("gauge", line_svg([GAUGE, NEEDLE]))

# image tools
BRACKETS = ["M1.75 5.25L1.75 3.25A1.5 1.5 0 0 1 3.25 1.75L5.25 1.75",
            "M12.75 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 5.25",
            "M16.25 12.75L16.25 14.75A1.5 1.5 0 0 1 14.75 16.25L12.75 16.25",
            "M5.25 16.25L3.25 16.25A1.5 1.5 0 0 1 1.75 14.75L1.75 12.75"]
FOCUS_RING = circle_d(C, 2.5)
explore("focus", [
    ("brackets and a ring", line_svg(BRACKETS + [FOCUS_RING])),
    ("brackets and a dot", line_svg(BRACKETS, [(9, 9, 1.375)])),
    ("brackets and a cross", line_svg(BRACKETS + ["M9 6L9 12M6 9L12 9"])),
], picked=0)
out("focus", line_svg(BRACKETS + [FOCUS_RING]))

SCAN_LINE = "M4.75 9L13.25 9"
explore("scan", [
    ("line inside the brackets", line_svg(BRACKETS + [SCAN_LINE])),
    ("line across the frame", line_svg(BRACKETS + ["M1.75 9L16.25 9"])),
], picked=0)
out("scan", line_svg(BRACKETS + [SCAN_LINE]))

CROP = ["M5.25 1.75L5.25 11.25A1.5 1.5 0 0 0 6.75 12.75L16.25 12.75",
        "M1.75 5.25L11.25 5.25A1.5 1.5 0 0 1 12.75 6.75L12.75 16.25"]
explore("crop", [
    ("r1.5 corners", line_svg(CROP)),
    ("sharp corners", line_svg(["M5.25 1.75L5.25 12.75L16.25 12.75", "M1.75 5.25L12.75 5.25L12.75 16.25"])),
], picked=0)
out("crop", line_svg(CROP))

ROT_BOX = rect(1.75, 9.25, 7.25, 16.25)
ROT_SHAFT = "M5.25 3.25L9.25 3.25A3.5 3.5 0 0 1 12.75 6.75L12.75 10.75"
ROT_HEAD = "M9.25 7.25L12.75 10.75L16.25 7.25"
explore("rotate-image-clockwise", [
    ("portrait image, arms 3.5", line_svg([ROT_BOX, ROT_SHAFT, ROT_HEAD])),
    ("narrow image, arms 3.5", line_svg([rect(1.75, 10.25, 5.75, 16.25), "M4.75 3.25L9.25 3.25A3.5 3.5 0 0 1 12.75 6.75L12.75 13", "M9.25 9.5L12.75 13L16.25 9.5"])),
], picked=0)
out("rotate-image-clockwise", line_svg([ROT_BOX, ROT_SHAFT, ROT_HEAD]),
    duo=duo_svg([silhouette(ROT_BOX)], fg_lines=[ROT_SHAFT, ROT_HEAD]))

FLIP_H = ["M5.25 3.25L3.25 3.25A1.5 1.5 0 0 0 1.75 4.75L1.75 13.25A1.5 1.5 0 0 0 3.25 14.75L5.25 14.75",
          "M12.75 3.25L14.75 3.25A1.5 1.5 0 0 1 16.25 4.75L16.25 13.25A1.5 1.5 0 0 1 14.75 14.75L12.75 14.75",
          "M9 1.75L9 16.25"]
FLIP_V = ["M3.25 5.25L3.25 3.25A1.5 1.5 0 0 1 4.75 1.75L13.25 1.75A1.5 1.5 0 0 1 14.75 3.25L14.75 5.25",
          "M3.25 12.75L3.25 14.75A1.5 1.5 0 0 0 4.75 16.25L13.25 16.25A1.5 1.5 0 0 0 14.75 14.75L14.75 12.75",
          "M1.75 9L16.25 9"]
explore("flip-horizontal-2", [
    ("frame halves either side of the axis", line_svg(FLIP_H)),
    ("chevrons out from the axis", line_svg(["M9 1.75L9 16.25", "M5.25 5.5L1.75 9L5.25 12.5", "M12.75 5.5L16.25 9L12.75 12.5"])),
], picked=0)
out("flip-horizontal-2", line_svg(FLIP_H))
out("flip-vertical-2", line_svg(FLIP_V))

POWER = arc(C, 7.5, -45, 225)
POWER_LINE = "M9 1.5L9 8.5"
explore("power-off", [
    ("90° gap", line_svg([POWER, POWER_LINE])),
    ("60° gap", line_svg([arc(C, 7.5, -60, 240), POWER_LINE])),
], picked=0)
out("power-off", line_svg([POWER, POWER_LINE]))

# media solids
def mirror(ps): return [(18 - x, y) for x, y in ps]
# a 45° tip on a squared back: every corner is 90° or wider, and the body is deep enough to read
PLAY = [(5, 2.5), (6.5, 2.5), (13, 9), (6.5, 15.5), (5, 15.5)]
explore("media-play", [
    ("squared back, 90° tip", solid_svg([poly(*PLAY)])),
    ("deeper back", solid_svg([poly((3.75, 2.5), (6.75, 2.5), (13.25, 9), (6.75, 15.5), (3.75, 15.5))])),
    ("shorter", solid_svg([poly((4.5, 3.5), (7, 3.5), (12.5, 9), (7, 14.5), (4.5, 14.5))])),
], picked=0)
check_solid("media-play", [poly(*PLAY)])
write("media-play", solid=solid_svg([poly(*PLAY)]))
PAUSE = [rect(4.25, 2.5, 7.75, 15.5, 0), rect(10.25, 2.5, 13.75, 15.5, 0)]
explore("media-pause", [
    ("sharp bars", solid_svg(PAUSE)),
    ("r1.5 bars", solid_svg([rect(4.25, 2.5, 7.75, 15.5), rect(10.25, 2.5, 13.75, 15.5)])),
], picked=0)
check_solid("media-pause", PAUSE)
write("media-pause", solid=solid_svg(PAUSE))
FF = [[(1.125, 3.5), (2.375, 3.5), (7.875, 9), (2.375, 14.5), (1.125, 14.5)],
      [(10.125, 3.5), (11.375, 3.5), (16.875, 9), (11.375, 14.5), (10.125, 14.5)]]
FF_TIGHT = [[(1.75, 4.25), (3, 4.25), (7.75, 9), (3, 13.75), (1.75, 13.75)],
            [(10, 4.25), (11.25, 4.25), (16, 9), (11.25, 13.75), (10, 13.75)]]
explore("media-fast-forward", [
    ("two play shapes 2.25 apart", solid_svg([poly(*t) for t in FF])),
    ("smaller, inside the padding", solid_svg([poly(*t) for t in FF_TIGHT])),
], picked=0)
check_solid("media-fast-forward", [poly(*t) for t in FF])
write("media-fast-forward", solid=solid_svg([poly(*t) for t in FF]))
write("media-fast-backwards", solid=solid_svg([poly(*mirror(t)) for t in FF]))

save_meta("status")
