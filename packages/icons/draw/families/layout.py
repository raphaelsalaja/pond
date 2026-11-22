"""Draws the layout family in Neutral into packages/icons/next/."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *


# ---------- helpers ----------
def sh(verts, radii=None):
    """A closed polygon through verts in either winding, convex corners rounded by radii."""
    radii = list(radii or [0] * len(verts)); n = len(verts)
    a = sum(verts[i][0] * verts[(i + 1) % n][1] - verts[(i + 1) % n][0] * verts[i][1] for i in range(n))
    if a < 0: verts, radii = verts[::-1], radii[::-1]
    return shape(list(verts), radii)

def rev(s):
    return Line(s.b, s.a) if isinstance(s, Line) else Arc(s.c, s.r, s.a1, s.a0)

def oval(cx, cy, a, r, R):
    """A four-arc oval of half width a: end arcs r, side arcs R. Returns its top and bottom halves, left to right."""
    k = math.sqrt((R - r) ** 2 - (a - r) ** 2)
    lc, rc, tc, bc = (cx - a + r, cy), (cx + a - r, cy), (cx, cy + k), (cx, cy - k)
    def tp(big, small):
        dx, dy = small[0] - big[0], small[1] - big[1]; l = math.hypot(dx, dy)
        return (big[0] + R * dx / l, big[1] + R * dy / l)
    p1, p2, p3, p4 = tp(tc, lc), tp(tc, rc), tp(bc, rc), tp(bc, lc)
    left, right = (cx - a, cy), (cx + a, cy)
    top = [arc_pts(lc, r, left, p1, 1), arc_pts(tc, R, p1, p2, 1), arc_pts(rc, r, p2, right, 1)]
    bot = [arc_pts(lc, r, left, p4, 0), arc_pts(bc, R, p4, p3, 0), arc_pts(rc, r, p3, right, 0)]
    return top, bot

def closed_oval(top, bot):
    return path(top + [rev(s) for s in reversed(bot)], True)

def chk(name, svg):
    lint(name, svg); gaps(name, svg); return svg

def out(name, outline, duo=None, opened=None, duo_opened=None):
    chk(name, outline)
    if opened: chk(name + " open", opened)
    write(name, outline, duo, opened, duo_opened)


# ---------- align ----------
def bars(boxes, guides):
    return line_svg(guides + [rect(*b) for b in boxes])
ALIGN = {
    "align-2-left": bars([(5.25, 3.75, 16.25, 7.25), (5.25, 10.75, 11.75, 14.25)], ["M1.75 1.75L1.75 16.25"]),
    "align-2-right": bars([(1.75, 3.75, 12.75, 7.25), (6.25, 10.75, 12.75, 14.25)], ["M16.25 1.75L16.25 16.25"]),
    "align-2-top": bars([(3.75, 5.25, 7.25, 16.25), (10.75, 5.25, 14.25, 11.75)], ["M1.75 1.75L16.25 1.75"]),
    "align-2-bottom": bars([(3.75, 1.75, 7.25, 12.75), (10.75, 6.25, 14.25, 12.75)], ["M1.75 16.25L16.25 16.25"]),
    "align-2-horizontal": bars([(2.75, 3.75, 15.25, 7.25), (5.25, 10.75, 12.75, 14.25)],
                               ["M9 1.75L9 3.75M9 7.25L9 10.75M9 14.25L9 16.25"]),
    "align-2-vertical": bars([(3.75, 2.75, 7.25, 15.25), (10.75, 5.25, 14.25, 12.75)],
                             ["M1.75 9L3.75 9M7.25 9L10.75 9M14.25 9L16.25 9"]),
}
for n, svg in ALIGN.items(): out(n, svg)
explore("align-2-left", [
    ("guide and two boxed bars", ALIGN["align-2-left"]),
    ("guide and two line bars", line_svg(["M1.75 1.75L1.75 16.25", "M5.25 5.25L16 5.25M5.25 12.75L12 12.75"])),
], picked=0)


# ---------- frames ----------
SQUARE = rect(1.75, 1.75, 16.25, 16.25)
BAR = "M1.75 6L16.25 6"
WINDOW = [BOX, BAR]
SIDE = "M6.25 2.5L6.25 15.5"
SIDEBAR = [BOX, SIDE]
TABLE = [BOX, BAR, "M6.25 6L6.25 15.5"]
CELLS = [rect(1.75, 1.75, 7.25, 7.25), rect(10.75, 1.75, 16.25, 7.25),
         rect(1.75, 10.75, 7.25, 16.25), rect(10.75, 10.75, 16.25, 16.25)]

out("window", line_svg(WINDOW), duo_svg([silhouette(BOX)], fg_lines=[BAR]))
write("window-download", *with_badge(WINDOW, "badge-arrow-down", bg=[silhouette(BOX)], fg_lines=trim_badge([BAR])))
uses("window-download", "badge-arrow-down")
write("window-share", *with_badge(WINDOW, "badge-arrow-up-right", bg=[silhouette(BOX)], fg_lines=[BAR]))
uses("window-share", "badge-arrow-up-right")

out("sidebar-left", line_svg(SIDEBAR), duo_svg([silhouette(BOX)], fg_lines=[SIDE]))
explore("sidebar-left", [
    ("full-height divider", line_svg(SIDEBAR)),
    ("inset handle bar", line_svg([BOX, "M5.25 6L5.25 12"])),
], picked=0)
write("sidebar-edit", *with_badge(SIDEBAR, "badge-pen", bg=[silhouette(BOX)], fg_lines=[SIDE]))
uses("sidebar-edit", "badge-pen")

out("table", line_svg(TABLE), duo_svg([silhouette(BOX)], fg_lines=TABLE[1:]))
explore("table", [
    ("header and one column", line_svg(TABLE)),
    ("header, column and row", line_svg(TABLE + ["M1.75 10.75L16.25 10.75"])),
    ("square, two columns", line_svg([SQUARE, "M1.75 6.25L16.25 6.25", "M6.25 6.25L6.25 16.25M11.75 6.25L11.75 16.25"])),
], picked=0)
write("table-download", *with_badge(TABLE, "badge-arrow-down", bg=[silhouette(BOX)], fg_lines=trim_badge(TABLE[1:])))
uses("table-download", "badge-arrow-down")

out("grid", line_svg(CELLS))
explore("grid", [
    ("four cells", line_svg(CELLS)),
    ("frame split in four", line_svg([SQUARE, "M9 1.75L9 16.25M1.75 9L16.25 9"])),
], picked=0)
write("grid-plus", *with_badge(CELLS, "badge-plus"))
uses("grid-plus", "badge-plus")

APPS = CELLS[:3] + [circle_d((13.5, 13.5), 2.75)]
out("applications", line_svg(APPS))
explore("applications", [
    ("three cells and a circle", line_svg(APPS)),
    ("four circles", line_svg([circle_d((4.5 + x, 4.5 + y), 2.75) for x in (0, 9) for y in (0, 9)])),
], picked=0)

COLS = [SQUARE, "M9 1.75L9 16.25", "M1.75 10.75L9 10.75", "M9 7.25L16.25 7.25"]
ROWS = [SQUARE, "M1.75 9L16.25 9", "M10.75 1.75L10.75 9", "M7.25 9L7.25 16.25"]
out("grid-layout-cols", line_svg(COLS), duo_svg([silhouette(SQUARE)], fg_lines=COLS[1:]))
explore("grid-layout-cols", [
    ("staggered masonry", line_svg(COLS)),
    ("two columns", line_svg([SQUARE, "M9 1.75L9 16.25"])),
], picked=0)
out("grid-layout-rows", line_svg(ROWS), duo_svg([silhouette(SQUARE)], fg_lines=ROWS[1:]))
explore("grid-layout-rows", [
    ("staggered rows", line_svg(ROWS)),
    ("two rows", line_svg([SQUARE, "M1.75 9L16.25 9"])),
], picked=0)

FRAMES = [BOX, "M6.5 2.5L6.5 15.5M11.5 2.5L11.5 15.5"]
out("animation-frames", line_svg(FRAMES), duo_svg([silhouette(BOX)], fg_lines=FRAMES[1:]))
explore("animation-frames", [
    ("filmstrip of three", line_svg(FRAMES)),
    ("two frames offset", line_svg([rect(1.75, 5.25, 12.75, 16.25), "M5.25 5.25L5.25 3.25A1.5 1.5 0 0 1 6.75 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 11.25A1.5 1.5 0 0 1 14.75 12.75L12.75 12.75"])),
], picked=0)

CODE = ["M7.25 7L5.25 9L7.25 11", "M10.75 7L12.75 9L10.75 11"]
out("square-code", line_svg([SQUARE] + CODE), duo_svg([silhouette(SQUARE)], fg_lines=CODE))
explore("square-code", [
    ("brackets in a square", line_svg([SQUARE] + CODE)),
    ("brackets and slash", line_svg([SQUARE, "M6.25 6.75L4 9L6.25 11.25", "M11.75 6.75L14 9L11.75 11.25", "M7.75 12.25L10.25 5.75"])),
], picked=0)

LINK = "M5.75 5.75L12.25 5.75L12.25 12.25"
NODES = [(5.75, 5.75, 1.375), (12.25, 12.25, 1.375)]
out("canvas", line_svg([SQUARE, LINK], NODES), duo_svg([silhouette(SQUARE)], fg_lines=[LINK], fg_dots=[(x, y, 1.5) for x, y, _ in NODES]))
explore("canvas", [
    ("two nodes, elbow link", line_svg([SQUARE, LINK], NODES)),
    ("two nodes, diagonal link", line_svg([SQUARE, "M5.75 5.75L12.25 12.25"], NODES)),
], picked=0)

# ---------- shapes ----------
out("square", line_svg([SQUARE]))
ROUNDED = rect(1.75, 1.75, 16.25, 16.25, 4.5)
out("square-rounded", line_svg([ROUNDED]))
explore("square-rounded", [
    ("r4.5 corners", line_svg([ROUNDED])),
    ("r3.5 corners", line_svg([rect(1.75, 1.75, 16.25, 16.25, 3.5)])),
    ("r6 corners", line_svg([rect(1.75, 1.75, 16.25, 16.25, 6)])),
], picked=0)

def border():
    """Dashed square: an r2.5 arc at each corner and a dash centred on each side, 3.5 apart."""
    ps = ["M1.75 4.25A2.5 2.5 0 0 1 4.25 1.75", "M13.75 1.75A2.5 2.5 0 0 1 16.25 4.25",
          "M16.25 13.75A2.5 2.5 0 0 1 13.75 16.25", "M4.25 16.25A2.5 2.5 0 0 1 1.75 13.75",
          "M7.75 1.75L10.25 1.75M16.25 7.75L16.25 10.25M10.25 16.25L7.75 16.25M1.75 10.25L1.75 7.75"]
    return ps
BORDER = border()
out("border", line_svg(BORDER))
explore("border", [
    ("dashed, corner arcs and middles", line_svg(BORDER)),
    ("two dashes per side", line_svg(["M4.25 1.75L7.75 1.75M10.25 1.75L13.75 1.75M16.25 4.25L16.25 7.75M16.25 10.25L16.25 13.75"
                                      "M13.75 16.25L10.25 16.25M7.75 16.25L4.25 16.25M1.75 13.75L1.75 10.25M1.75 7.75L1.75 4.25"])),
], picked=0)

def tri_cut(cx, base, hw, cut):
    return sh([(cx, base - cut - hw), (cx + hw, base - cut), (cx + hw, base), (cx - hw, base), (cx - hw, base - cut)])

TRIANGLE = tri_cut(9, 13.375, 7.25, 1.5)
TRI_ROUND = sh([(9, 3.375), (17.75, 12.125), (0.25, 12.125)], [1.5, 1.5, 1.5])
TRI_RIGHT = sh([(1.75, 1.75), (16.25, 16.25), (1.75, 16.25)], [0, 0, 0])
out("triangle", line_svg([TRIANGLE]))
explore("triangle", [
    ("90° apex, base corners cut 1.5", line_svg([TRIANGLE])),
    ("90° apex, all corners r1.5", line_svg([TRI_ROUND])),
    ("right triangle", line_svg([TRI_RIGHT])),
], picked=0)

HEXAGON = sh([(9, 1.75), (14, 6.75), (14, 11.25), (9, 16.25), (4, 11.25), (4, 6.75)])
HEX_DIAG = sh([(1.75, 7.75), (7.75, 1.75), (16.25, 1.75), (16.25, 10.25), (10.25, 16.25), (1.75, 16.25)])
HEX_TALL = sh([(9, 1.75), (13.25, 6), (13.25, 12), (9, 16.25), (4.75, 12), (4.75, 6)])
HEX_EVEN = sh([(1.75, 9), (6, 4.75), (12, 4.75), (16.25, 9), (12, 13.25), (6, 13.25)])
out("hexagon", line_svg([HEXAGON]))
explore("hexagon", [
    ("pointed top, vertical sides", line_svg([HEXAGON])),
    ("pointed top, equal sides", line_svg([HEX_TALL])),
    ("flat top, equal sides", line_svg([HEX_EVEN])),
    ("equal sides on the diagonal", line_svg([HEX_DIAG])),
], picked=0)

TRAPEZOID = sh([(6.25, 5.75), (11.75, 5.75), (16.25, 10.25), (16.25, 12.25), (1.75, 12.25), (1.75, 10.25)])
out("trapezoid", line_svg([TRAPEZOID]))
explore("trapezoid", [
    ("45° sides, base corners cut", line_svg([TRAPEZOID])),
    ("45° sides, all corners r1.5", line_svg([sh([(5.75, 5.25), (12.25, 5.25), (19.0, 12.0), (-1.0, 12.0)], [1.5] * 4)])),
], picked=0)

PARA = sh([(7.25, 5.25), (16.25, 5.25), (16.25, 6.75), (10.75, 12.25), (1.75, 12.25), (1.75, 10.75)])
out("parallelogram", line_svg([PARA]))
explore("parallelogram", [
    ("45° slant, acute corners cut", line_svg([PARA])),
    ("45° slant, all corners r1.5", line_svg([sh([(5.75, 5.25), (19.0, 5.25), (12.25, 12.0), (-1.0, 12.0)], [1.5] * 4)])),
], picked=0)

CHEVRON = sh([(13.25, 9), (6.25, 16), (3.75, 13.5), (8.25, 9), (3.75, 4.5), (6.25, 2)])
out("chevron", line_svg([CHEVRON]))
explore("chevron", [
    ("thick chevron, square ends", line_svg([CHEVRON])),
    ("two stacked chevrons", line_svg(["M4.5 3.25L10.25 9L4.5 14.75", "M9.25 3.25L15 9L9.25 14.75"])),
], picked=0)

# ---------- 3d ----------
CUBE_OUT = [(1.75, 5.25), (5.25, 1.75), (16.25, 1.75), (16.25, 12.75), (12.75, 16.25), (1.75, 16.25)]
CUBE = sh(CUBE_OUT, [0, 0, 1.5, 0, 0, 1.5])
CUBE_EDGES = "M1.75 5.25L12.75 5.25L12.75 16.25M12.75 5.25L16.25 1.75"
CUBE_OPEN = sh([(1.75, 8.75), (5.25, 5.25), (5.25, 1.75), (16.25, 1.75), (16.25, 12.75), (12.75, 16.25), (1.75, 16.25)],
               [0, 0, 1.5, 1.5, 0, 0, 1.5])
CUBE_OPEN_EDGES = "M1.75 8.75L12.75 8.75L12.75 16.25M12.75 8.75L16.25 5.25M5.25 5.25L16.25 5.25"
out("cube", line_svg([CUBE, CUBE_EDGES]), duo_svg([silhouette(CUBE)], fg_lines=[CUBE_EDGES]),
    line_svg([CUBE_OPEN, CUBE_OPEN_EDGES]), duo_svg([silhouette(CUBE_OPEN)], fg_lines=[CUBE_OPEN_EDGES]))
ISO = sh([(9, 1.75), (13.25, 6), (13.25, 12), (9, 16.25), (4.75, 12), (4.75, 6)])
explore("cube", [
    ("oblique, box corners r1.5", line_svg([CUBE, CUBE_EDGES])),
    ("oblique, all sharp", line_svg([sh(CUBE_OUT), CUBE_EDGES])),
    ("45° diamond top", line_svg([ISO, "M4.75 6L9 10.25L13.25 6M9 10.25L9 16.25"])),
], picked=0)

CYL_A, CYL_R, CYL_BIG = 7.25, 2, 16.25
top5, bot5 = oval(9, 5, CYL_A, CYL_R, CYL_BIG)
top13, bot13 = oval(9, 13, CYL_A, CYL_R, CYL_BIG)
LID = closed_oval(top5, bot5)
CYL_BODY = path([Line((1.75, 5), (1.75, 13))] + bot13 + [Line((16.25, 13), (16.25, 5))])
CYL_SIL = path(top5 + [Line((16.25, 5), (16.25, 13))] + [rev(s) for s in reversed(bot13)] + [Line((1.75, 13), (1.75, 5))], True)
top4, bot4 = oval(9, 4, CYL_A, CYL_R, CYL_BIG)
top9, bot9 = oval(9, 9.125, CYL_A, CYL_R, CYL_BIG)
LID_UP = closed_oval(top4, bot4)
BODY_OPEN = [path(bot9), path([Line((1.75, 9.125), (1.75, 13))] + bot13 + [Line((16.25, 13), (16.25, 9.125))])]
BODY_OPEN_SIL = path(bot9 + [Line((16.25, 9.125), (16.25, 13))] + [rev(s) for s in reversed(bot13)] + [Line((1.75, 13), (1.75, 9.125))], True)
out("cylinder", line_svg([LID, CYL_BODY]), duo_svg([silhouette(CYL_SIL)], fg_lines=[path(bot5)]),
    line_svg([LID_UP] + BODY_OPEN), duo_svg([silhouette(BODY_OPEN_SIL), silhouette(LID_UP)], fg=[LID_UP]))
explore("cylinder", [
    ("four-arc oval top", line_svg([LID, CYL_BODY])),
    ("oval top and a middle band", line_svg([LID, CYL_BODY, path(oval(9, 9, CYL_A, CYL_R, CYL_BIG)[1])])),
], picked=0)

# ---------- groups and stacks ----------
def brackets(e):
    return [f"M1.75 {f(e)}L1.75 3.25A1.5 1.5 0 0 1 3.25 1.75L{f(e)} 1.75",
            f"M{f(18 - e)} 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 {f(e)}",
            f"M16.25 {f(18 - e)}L16.25 14.75A1.5 1.5 0 0 1 14.75 16.25L{f(18 - e)} 16.25",
            f"M{f(e)} 16.25L3.25 16.25A1.5 1.5 0 0 1 1.75 14.75L1.75 {f(18 - e)}"]
GROUP = brackets(4.75) + [rect(6.25, 6.25, 11.75, 11.75)]
out("group", line_svg(GROUP))
explore("group", [
    ("brackets round one square", line_svg(GROUP)),
    ("brackets round two squares", line_svg(brackets(4.75) + [rect(4.5, 4.5, 8.75, 8.75), rect(9.25, 9.25, 13.5, 13.5)])),
    ("brackets round stacked pair", line_svg(brackets(4.75) + [rect(8.5, 8.5, 13.5, 13.5), "M5 10.5L5 6.5A1.5 1.5 0 0 1 6.5 5L10.5 5"])),
], picked=0)

UNGROUP = [rect(1.75, 1.75, 8.125, 8.125), rect(9.875, 9.875, 16.25, 16.25)]
out("ungroup", line_svg(UNGROUP))

DIAMOND = sh([(9, 1.875), (13.75, 6.625), (9, 11.375), (4.25, 6.625)])
STACK = "M4.25 11.5L9 16.25L13.75 11.5"
CARD = rect(1.75, 1.75, 16.25, 9.25)
CARDS = [CARD, "M3.25 12.75L14.75 12.75", "M4.75 16.25L13.25 16.25"]
DIAMOND_UP = sh([(9, 1.875), (12.75, 5.625), (9, 9.375), (5.25, 5.625)])
out("layers", line_svg([DIAMOND, STACK]), opened=line_svg([DIAMOND_UP, STACK]))
explore("layers", [
    ("45° diamond and a chevron", line_svg([DIAMOND, STACK])),
    ("card and two edges", line_svg(CARDS)),
], picked=0)

# ---------- charts and diagrams ----------
CHART = "M4 16L4 10.5M9 16L9 6.75M14 16L14 3"
CHART_OPEN = "M4 16L4 6.5M9 16L9 4M14 16L14 2"
out("chart-bar", line_svg([CHART]), opened=line_svg([CHART_OPEN]))
explore("chart-bar", [
    ("three rising bars", line_svg([CHART])),
    ("bars on an axis", line_svg(["M1.75 2L1.75 16.25L16 16.25", "M6 12.75L6 9.25M10.5 12.75L10.5 6.25M15 12.75L15 3.25"])),
], picked=0)

MAP = ["M3.375 9L8.5 9", "M14.625 4.75L10 4.75A1.5 1.5 0 0 0 8.5 6.25L8.5 11.75A1.5 1.5 0 0 0 10 13.25L14.625 13.25"]
MAP_DOTS = [(3.375, 9, 1.375), (14.625, 4.75, 1.375), (14.625, 13.25, 1.375)]
MAP_OPEN = ["M3.375 9L14.625 9", "M14.625 3.375L10 3.375A1.5 1.5 0 0 0 8.5 4.875L8.5 13.125A1.5 1.5 0 0 0 10 14.625L14.625 14.625"]
MAP_OPEN_DOTS = [(3.375, 9, 1.375), (14.625, 3.375, 1.375), (14.625, 9, 1.375), (14.625, 14.625, 1.375)]
out("mind-map", line_svg(MAP, MAP_DOTS), opened=line_svg(MAP_OPEN, MAP_OPEN_DOTS))
explore("mind-map", [
    ("disc nodes, rounded elbows", line_svg(MAP, MAP_DOTS)),
    ("disc nodes, sharp elbows", line_svg(["M3.375 9L8.5 9", "M14.625 4.75L8.5 4.75L8.5 13.25L14.625 13.25"], MAP_DOTS)),
    ("root box, disc leaves", line_svg([rect(1.75, 7.25, 6.25, 10.75), "M6.25 9L9.5 9", "M14.625 4.75L11 4.75A1.5 1.5 0 0 0 9.5 6.25L9.5 11.75A1.5 1.5 0 0 0 11 13.25L14.625 13.25"], MAP_DOTS[1:])),
], picked=0)

def nodes_rings(t, a, r):
    T, B1, B2 = (9, t), (9 - a, t + a), (9 + a, t + a)
    k = r / SQ
    return [circle_d(T, r), circle_d(B1, r), circle_d(B2, r),
            poly((T[0] - k, T[1] + k), (B1[0] + k, B1[1] - k), closed=False),
            poly((T[0] + k, T[1] + k), (B2[0] - k, B2[1] - k), closed=False),
            poly((B1[0] + r, B1[1]), (B2[0] - r, B2[1]), closed=False)]
NODES3 = nodes_rings(6.5, 5.5, 2)
out("nodes-3", line_svg(NODES3))
explore("nodes-3", [
    ("three rings on a 90° triangle", line_svg(NODES3)),
    ("three discs on a 90° triangle", line_svg(["M2.5 12.25L9 5.75L15.5 12.25Z"], [(9, 5.75, 1.375), (2.5, 12.25, 1.375), (15.5, 12.25, 1.375)])),
    ("right-angle network, discs", line_svg(["M4 4L14 4L4 14Z"], [(4, 4, 1.375), (14, 4, 1.375), (4, 14, 1.375)])),
], picked=0)

# ---------- filters and controls ----------
FILTER_LINES = "M2 4.75L16 4.75M4.5 9L13.5 9M7 13.25L11 13.25"
out("bars-filter", line_svg([FILTER_LINES]))

FUNNEL = ("M3.25 2.5L14.75 2.5A1.5 1.5 0 0 1 16.25 4L10.75 9.5L10.75 15.5L7.25 15.5L7.25 9.5L1.75 4"
          "A1.5 1.5 0 0 1 3.25 2.5Z")
write("filter-plus", *with_badge([FUNNEL], "badge-plus"))
uses("filter-plus", "badge-plus")
write("filter-off", *with_badge([FUNNEL], "badge-xmark"))
uses("filter-off", "badge-xmark")
for n, b in (("filter-plus", "badge-plus"), ("filter-off", "badge-xmark")):
    lint(n, with_badge([FUNNEL], b)[0])

KNOB = 2.125
SLIDERS = ["M2 5.25L9.375 5.25M13.625 5.25L16 5.25", circle_d((11.5, 5.25), KNOB),
           "M2 12.75L4.375 12.75M8.625 12.75L16 12.75", circle_d((6.5, 12.75), KNOB)]
out("sliders", line_svg(SLIDERS))
explore("sliders", [
    ("two rails, ring knobs", line_svg(SLIDERS)),
    ("three faders, bar knobs", line_svg(["M4 2L4 9.5M4 13L4 16M9 2L9 5M9 8.5L9 16M14 2L14 11M14 14.5L14 16",
                                          "M2 11.25L6 11.25M7 6.75L11 6.75M12 12.75L16 12.75"])),
], picked=0)

# ---------- eye ----------
EYE = "M1.875 9A8 8 0 0 1 16.125 9A8 8 0 0 1 1.875 9Z"
PUPIL = (9, 9, 2)
write("view-plus-sign", *with_badge([EYE], "badge-plus", dots=[PUPIL], fg_dots=[(9, 9, 2.125)]))
uses("view-plus-sign", "badge-plus")
lint("view-plus-sign", with_badge([EYE], "badge-plus", dots=[PUPIL])[0])
explore("view-plus-sign", [
    ("r8 arcs, r2 pupil", with_badge([EYE], "badge-plus", dots=[PUPIL])[0]),
    ("r10 flatter eye, r1.375 pupil", with_badge(["M1.875 9A10 10 0 0 1 16.125 9A10 10 0 0 1 1.875 9Z"], "badge-plus", dots=[(9, 9, 1.375)])[0]),
], picked=0)

# ---------- shortcut ----------
def command(lo, hi, r):
    """The command key: a square whose sides run on into four 270° loops of radius r."""
    a, b = lo - r, hi + r
    return (f"M{f(a)} {f(lo)}L{f(b)} {f(lo)}A{f(r)} {f(r)} 0 1 0 {f(hi)} {f(a)}L{f(hi)} {f(b)}"
            f"A{f(r)} {f(r)} 0 1 0 {f(b)} {f(hi)}L{f(a)} {f(hi)}A{f(r)} {f(r)} 0 1 0 {f(lo)} {f(b)}"
            f"L{f(lo)} {f(a)}A{f(r)} {f(r)} 0 1 0 {f(a)} {f(lo)}Z")
def bolt(xl, a, flat, c, y0=1.75, y1=16.25):
    """A bolt on 45° and 90° lines, point symmetric about (9, 9), every acute corner cut flat."""
    m = lambda p: (18 - p[0], y0 + y1 - p[1])
    T0 = (xl + a, y0); T1 = (xl + a + flat, y0)
    L1 = (xl, y0 + a); L0 = (xl, y0 + a + c); M1 = (18 - T1[0], y0 + a + c)
    return sh([T0, T1, m(M1), m(L0), m(L1), m(T0), m(T1), M1, L0, L1])
COMMAND = command(6.75, 11.25, 2.5)
out("quick-access", line_svg([COMMAND]))
explore("quick-access", [
    ("command key", line_svg([COMMAND])),
    ("zigzag bolt stroke", line_svg(["M12.75 1.75L7.5 7L11.5 11L6.25 16.25"])),
    ("45° bolt, flat tips", line_svg([bolt(3.25, 6.5, 1.25, 1.25)])),
], picked=0)

# ---------- ground plane ----------
def plane(xl, xr, yt, yb, cut=1):
    k = yb - yt - cut
    return sh([(xl + k, yt), (xr, yt), (xr, yt + cut), (xr - k, yb), (xl, yb), (xl, yb - cut)])
PLANE = plane(1.75, 16.25, 12, 16)
SCAN = brackets(4.75) + [plane(4.75, 13.25, 6.75, 11.25)]
DROP = "M9 1.75L9 8.5M6.75 6.25L9 8.5L11.25 6.25"
out("ground-plane-detection", line_svg(SCAN))
explore("ground-plane-detection", [
    ("plane inside scan brackets", line_svg(SCAN)),
    ("arrow down onto a plane", line_svg([PLANE, DROP])),
    ("ball above a plane", line_svg([PLANE, circle_d((9, 5.25), 3.25)])),
], picked=0)

# ---------- figures ----------
FIG = [tri_cut(9, 7.25, 4, 1.25), rect(1.75, 10.75, 7.25, 16.25), circle_d((13.5, 13.5), 2.75)]
FIG_OPEN = [tri_cut(4.5, 6.25, 2.75, 1.25), circle_d((4.75, 13.25), 3), sh([(13, 5.75), (16.25, 9), (13, 12.25), (9.75, 9)])]
out("figures", line_svg(FIG), opened=line_svg(FIG_OPEN))
explore("figures", [
    ("triangle over square and circle", line_svg(FIG)),
    ("square and circle overlapping", line_svg([rect(1.75, 6.75, 11.25, 16.25), "M7.75 6.75A4.75 4.75 0 1 1 11.25 11.5"])),
], picked=0)

# ---------- pointer and hand ----------
def cursor(dx=0.0):
    v = [(3.75, 1.75), (5, 1.75), (12.5, 9.25), (12.5, 10.5), (8.5, 10.5), (11.25, 13.25), (8.75, 15.75), (6, 13), (3.75, 13)]
    return sh([(x + dx, y) for x, y in v])
CURSOR = cursor(1)
out("cursor", line_svg([CURSOR]))
explore("cursor", [
    ("pointer with tail", line_svg([CURSOR])),
    ("notched pointer, no tail", line_svg([sh([(4, 1.75), (5.25, 1.75), (14.25, 10.75), (14.25, 12), (9.75, 12), (6.75, 15), (6.75, 16.25), (4, 16.25)])])),
], picked=0)

HAND = ("M5.75 8.5L5.75 4.25A1.75 1.75 0 0 1 9.25 4.25L9.25 3.5A1.75 1.75 0 0 1 12.75 3.5L12.75 5A1.75 1.75 0 0 1 16.25 5"
        "L16.25 11.5A4.75 4.75 0 0 1 11.5 16.25L8.75 16.25A1.5 1.5 0 0 1 7.25 14.75L7.25 12L5.25 14A1.768 1.768 0 0 1 2.75 11.5Z")
HAND_HEEL = ("M5.75 8L5.75 4.25A1.75 1.75 0 0 1 9.25 4.25L9.25 3.5A1.75 1.75 0 0 1 12.75 3.5L12.75 5A1.75 1.75 0 0 1 16.25 5"
             "L16.25 11.5A4.75 4.75 0 0 1 11.5 16.25L10.5 16.25L6.5 12.25L5.25 13.5A1.768 1.768 0 0 1 2.75 11Z")
MOVE = ["M9 1.75L9 16.25M1.75 9L16.25 9",
        "M6.75 4L9 1.75L11.25 4M14 6.75L16.25 9L14 11.25M11.25 14L9 16.25L6.75 14M4 11.25L1.75 9L4 6.75"]
out("hand", line_svg(MOVE))
explore("hand", [
    ("four-way move arrows", line_svg(MOVE)),
    ("open hand, three fingers and a 45° thumb", line_svg([HAND])),
    ("open hand, 45° heel into the thumb", line_svg([HAND_HEEL])),
], picked=0)

# ---------- rating ----------
def star(cx, cy, R):
    k = R / SQ; m = R - k
    v = [(cx + R, cy), (cx + k, cy + m), (cx + k, cy + k), (cx + m, cy + k), (cx, cy + R), (cx - m, cy + k), (cx - k, cy + k),
         (cx - k, cy + m), (cx - R, cy), (cx - k, cy - m), (cx - k, cy - k), (cx - m, cy - k), (cx, cy - R), (cx + m, cy - k),
         (cx + k, cy - k), (cx + k, cy - m)]
    return sh(v)
FAV_LINES = "M2 4.5L16 4.5M2 9L6.75 9M2 13.5L6 13.5"
FAV_HEART = "M12.875 12A1.75 1.75 0 1 0 9.875 13.25L12.875 16.25L15.875 13.25A1.75 1.75 0 1 0 12.875 12Z"
out("list-favs", line_svg([FAV_LINES, FAV_HEART]))
explore("list-favs", [
    ("lines and a heart", line_svg([FAV_LINES, FAV_HEART])),
    ("lines and an 8-point star", line_svg(["M2 4.5L16 4.5M2 9L8.5 9M2 13.5L7 13.5", star(13.5, 13.5, 2.5)])),
    ("lines and a solid 8-point star", line_svg(["M2 4.5L16 4.5M2 9L8.5 9M2 13.5L7 13.5"]).replace("</svg>", f'<path d="{star(13.5, 13.5, 3.125)}" fill="currentColor" stroke="none"/></svg>')),
], picked=0)

save_meta("layout")

FAMILY = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "families.json")))["layout"]
found = 0
for n in FAMILY:
    for fn in sorted(os.listdir(os.path.join(NEXT, n))):
        if fn.startswith("outline"):
            svg = open(os.path.join(NEXT, n, fn)).read()
            found += len(lint(f"{n}/{fn}", svg)) + len(gaps(f"{n}/{fn}", svg))
print(f"layout: {len(FAMILY)} icons, {found} lint and gap findings")
