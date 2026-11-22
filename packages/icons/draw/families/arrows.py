"""Draws the arrows family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *

# ---------- seed constants ----------
PLUS = "M9 2.5L9 15.5M2.5 9L15.5 9"
XMARK = "M3.375 3.375L14.625 14.625M14.625 3.375L3.375 14.625"
CHECK = "M2.5 9.25L6.75 13.5L15.5 4.75"
CHEVRON_DOWN = "M3.75 6.125L9 11.375L14.25 6.125"
DOTS = [(3.375, 9, 1.375), (9, 9, 1.375), (14.625, 9, 1.375)]
ARROW_RIGHT = "M2 9L15.125 9M11.625 12.5L15.125 9L11.625 5.5"
ARROW_UP_RIGHT = "M4.375 13.625L13.5 4.5M8 4.5L13.5 4.5L13.5 10"

# ---------- helpers ----------
HEAD = 3.5    # axis arrow head: arms 3.5 per axis on 45°
DHEAD = 5.5   # diagonal arrow head: arms 5.5 along the axes
CHEV = 5.25   # chevron arms per axis, 90° at the point

def head(tip, d):
    """The seed head at tip, pointing along d: an axis (1, 0) or a diagonal (1, -1)."""
    dx, dy = d
    if dx and dy:
        a, b = (tip[0] - DHEAD * dx, tip[1]), (tip[0], tip[1] - DHEAD * dy)
    else:
        px, py = -dy, dx
        a = (tip[0] - HEAD * dx + HEAD * px, tip[1] - HEAD * dy + HEAD * py)
        b = (tip[0] - HEAD * dx - HEAD * px, tip[1] - HEAD * dy - HEAD * py)
    return poly(a, tip, b, closed=False)

def sign(v): return (v > 1e-9) - (v < -1e-9)

def arrow(tail, tip):
    """A straight arrow: the stem runs to the tip, the seed head on it."""
    d = (sign(tip[0] - tail[0]), sign(tip[1] - tail[1]))
    return poly(tail, tip, closed=False) + head(tip, d)

def chevron(tip, d):
    """The seed chevron with its point at tip, pointing along axis d."""
    dx, dy = d; px, py = -dy, dx
    a = (tip[0] - CHEV * dx + CHEV * px, tip[1] - CHEV * dy + CHEV * py)
    b = (tip[0] - CHEV * dx - CHEV * px, tip[1] - CHEV * dy - CHEV * py)
    return poly(a, tip, b, closed=False)

def arc(c, r, a0, a1):
    """A true arc from screen angle a0 to a1 in degrees, as a path."""
    s = Arc(c, r, math.radians(a0), math.radians(a1))
    return f"M{pt(s.at(0))}" + s.d(0, 1)

def turn(c, r, start, end, d, tip_y=None, tip_x=None):
    """An arc ending at a 45° point, run on along its tangent to a tip with the diagonal head."""
    s = Arc(c, r, math.radians(start), math.radians(end)); p = s.at(1)
    if tip_y is not None: k = (tip_y - p[1]) / d[1]
    elif tip_x is not None: k = (tip_x - p[0]) / d[0]
    else: k = 0
    tip = (p[0] + k * d[0], p[1] + k * d[1])
    return f"M{pt(s.at(0))}" + s.d(0, 1) + f"L{pt(tip)}" + head(tip, d)

def mirror_x(d):
    """A path flipped left to right about x = 9; arcs flip their sweep."""
    out = []
    for segs, closed in parse(d):
        flipped = []
        for s in segs:
            if isinstance(s, Line): flipped.append(Line((18 - s.a[0], s.a[1]), (18 - s.b[0], s.b[1])))
            else: flipped.append(Arc((18 - s.c[0], s.c[1]), s.r, math.pi - s.a0, math.pi - s.a1))
        out.append(path(flipped, closed))
    return "".join(out)

def out(name, paths, dots=(), **kw):
    svg = line_svg(paths, dots)
    lint(name, svg); gaps(name, svg)
    write(name, svg, **kw)
    return svg

def alt(paths, dots=()):
    svg = line_svg(paths, dots); lint("attempt", svg); gaps("attempt", svg); return svg

assert arrow((2, 9), (15.125, 9)) == ARROW_RIGHT
assert arrow((4.375, 13.625), (13.5, 4.5)) == ARROW_UP_RIGHT
assert chevron((9, 11.375), (0, 1)) == CHEVRON_DOWN

# ---------- seeds and plain siblings ----------
out("plus", [PLUS])
out("minus", ["M2.5 9L15.5 9"])
out("xmark", [XMARK])
out("check", [CHECK])
out("dots", [], DOTS)
out("chevron-down", [CHEVRON_DOWN])
out("chevron-right", [chevron((11.375, 9), (1, 0))])
out("chevron-left", [chevron((6.625, 9), (-1, 0))])
out("arrow-right", [ARROW_RIGHT])
out("arrow-left", [arrow((16, 9), (2.875, 9))])
out("arrow-up", [arrow((9, 16), (9, 2.875))])
out("arrow-down", [arrow((9, 2), (9, 15.125))])
out("arrow-up-right", [ARROW_UP_RIGHT])

# ---------- double and corner arrows ----------
EXPAND_X = "M2.875 9L15.125 9" + head((15.125, 9), (1, 0)) + head((2.875, 9), (-1, 0))
EXPAND_Y = "M9 2.875L9 15.125" + head((9, 2.875), (0, -1)) + head((9, 15.125), (0, 1))
out("arrows-expand-x", [EXPAND_X])
out("arrows-expand-y", [EXPAND_Y])

DIAG = "M3.25 14.75L14.75 3.25" + head((14.75, 3.25), (1, -1)) + head((3.25, 14.75), (-1, 1))
out("arrows-expand-diagonal", [DIAG])
explore("arrows-expand-diagonal", [
    ("one stem, two heads", alt([DIAG])),
    ("two arrows from the centre", alt([arrow((10.25, 7.75), (15.25, 2.75)), arrow((7.75, 10.25), (2.75, 15.25))])),
], picked=0)

def corner_arrow(tip, d, s=4.5):
    return poly((tip[0] - s * d[0], tip[1] - s * d[1]), tip, closed=False) + head(tip, d)

EXPAND = [corner_arrow((1.75, 1.75), (-1, -1)), corner_arrow((16.25, 1.75), (1, -1)),
          corner_arrow((16.25, 16.25), (1, 1)), corner_arrow((1.75, 16.25), (-1, 1))]
out("arrows-expand", EXPAND)
explore("arrows-expand", [
    ("four corner arrows", alt(EXPAND)),
    ("two diagonals, four heads", alt([DIAG, mirror_x(DIAG)])),
], picked=0)

COLLAPSE = [arrow((15.5, 2.5), (10.25, 7.75)), arrow((2.5, 15.5), (7.75, 10.25))]
out("caret-minimize", COLLAPSE)
explore("caret-minimize", [
    ("two arrows in to the centre", alt(COLLAPSE)),
    ("four arrows in", alt(COLLAPSE + [arrow((2.5, 2.5), (7.75, 7.75)), arrow((15.5, 15.5), (10.25, 10.25))])),
], picked=0)

BRACKET_BL = "M1.75 10L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L8 16.25"
FIT_IN = arrow((15.125, 2.875), (6, 12))
out("arrow-diagonal-in", [BRACKET_BL, FIT_IN])
explore("arrow-diagonal-in", [
    ("arrow into a corner bracket", alt([BRACKET_BL, FIT_IN])),
    ("arrow alone", alt([arrow((14.625, 3.375), (5.5, 12.5))])),
    ("arrow onto a dot", alt([arrow((15.125, 2.875), (8.5, 9.5))], dots=[(4.25, 13.75, 1.375)])),
], picked=0)

# ---------- arrows against a line ----------
BAR_X = (2.5, 15.5)
def bar(y): return f"M{f(BAR_X[0])} {f(y)}L{f(BAR_X[1])} {f(y)}"

DOWN_TO_LINE = [arrow((9, 2), (9, 12)), bar(15.5)]
out("arrow-down-to-line", DOWN_TO_LINE)
explore("arrow-down-to-line", [
    ("arrow onto a floor", alt(DOWN_TO_LINE)),
    ("chevron onto a floor", alt([chevron((9, 10.75), (0, 1)), bar(15.5)])),
], picked=0)

MOVE_UP = [arrow((9, 12), (9, 2.5)), bar(15.5)]
out("move-obj-up", MOVE_UP)
out("move-obj-down", [arrow((9, 6), (9, 15.5)), bar(2.5)])
explore("move-obj-up", [
    ("arrow up off a floor", alt(MOVE_UP)),
    ("arrow up from a box", alt([arrow((9, 15.5), (9, 2.5)), "M3.25 12.5L1.75 12.5L1.75 16.25L16.25 16.25L16.25 12.5L14.75 12.5"])),
], picked=0)

def span(y): return f"M2.875 {f(y)}L15.125 {f(y)}" + head((15.125, y), (1, 0)) + head((2.875, y), (-1, 0))
RESIZE = [span(7.5), bar(14.5)]
out("resize-x", RESIZE)
explore("resize-x", [
    ("double arrow over a page edge", alt(RESIZE)),
    ("double arrow over an open tray", alt([span(5.5), "M1.75 9.5L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L14.75 16.25"
                                                       "A1.5 1.5 0 0 0 16.25 14.75L16.25 9.5"])),
    ("double arrow under two end ticks", alt(["M1.75 1.75L1.75 5.75M16.25 1.75L16.25 5.75", span(12.5)])),
], picked=0)

# ---------- sorting ----------
SORT = [arrow((5.25, 16), (5.25, 2.875)), arrow((12.75, 2), (12.75, 15.125))]
out("sort-arrows", SORT)
explore("sort-arrows", [
    ("up and down side by side", alt(SORT)),
    ("chevrons stacked", alt([chevron((9, 1.875), (0, -1)), chevron((9, 16.125), (0, 1))])),
], picked=0)

UP_AT = arrow((12.75, 16), (12.75, 2.875))
DOWN_AT = arrow((12.75, 2), (12.75, 15.125))
ROWS = (3.75, 9, 14.25)
def rows(ends): return "".join(f"M1.75 {f(y)}L{f(x)} {f(y)}" for y, x in zip(ROWS, ends))
ASC = [rows((4.75, 7, 9.25)), UP_AT]
out("ascending-sorting", ASC)
out("descending-sorting", [rows((9.25, 7, 4.75)), DOWN_AT])
explore("ascending-sorting", [
    ("lines grow down, arrow up", alt(ASC)),
    ("lines grow up, arrow up", alt([rows((9.25, 7, 4.75)), UP_AT])),
], picked=0)

def letter_a(w, legs, bar_y):
    """A capital A from x 1.75: vertical legs, a 90° apex on 45° shoulders, a crossbar."""
    h = w / 2; x1 = 1.75 + w
    return (f"M1.75 {f(legs)}L1.75 {f(1.75 + h)}L{f(1.75 + h)} 1.75L{f(x1)} {f(1.75 + h)}L{f(x1)} {f(legs)}"
            f"M1.75 {f(bar_y)}L{f(x1)} {f(bar_y)}")
ALPHA_DOWN = arrow((12.75, 2.5), (12.75, 15.625))
ALPHA = [letter_a(6, 9, 6.25), ALPHA_DOWN]
out("sort-alpha-ascending", ALPHA)
explore("sort-alpha-ascending", [
    ("wide A, crossbar on the shoulders", alt([letter_a(7.5, 8.625, 5.5), ALPHA_DOWN])),
    ("A over short-to-long lines", alt([letter_a(6, 8.5, 6.25), "M1.75 12L5.75 12M1.75 15.5L7.5 15.5", ALPHA_DOWN])),
    ("narrow A, lower crossbar", alt(ALPHA)),
], picked=2)

# ---------- turning arrows ----------
UNDO = "M6.25 15.5L11.5 15.5A4.75 4.75 0 0 0 11.5 6L2.75 6" + head((2.75, 6), (-1, 0))
out("undo", [UNDO])
ROT_CCW = turn((9.25, 9.25), 6.5, 135, -135, (-1, 1), tip_y=7.25)
explore("undo", [
    ("U-turn back to the left", alt([UNDO])),
    ("anticlockwise turn", alt([ROT_CCW])),
], picked=0)

out("arrow-rotate-anticlockwise", [ROT_CCW])
out("arrow-rotate-clockwise", [mirror_x(ROT_CCW)])
TOP_HEAD = arc((9, 10.75), 5.5, 210, -90) + head((9, 5.25), (-1, 0))
explore("arrow-rotate-anticlockwise", [
    ("corner head on the 45° tangent", alt([ROT_CCW])),
    ("head on the top tangent", alt([TOP_HEAD])),
], picked=0)

def refresh_half(r=6.25):
    start = 180 + math.degrees(math.asin((9 - 7.25) / r))
    return turn((9, 9), r, start, 315, (1, 1), tip_y=7.25)
REFRESH_A = refresh_half()
REFRESH_B = "".join(path([Line((18 - s.a[0], 18 - s.a[1]), (18 - s.b[0], 18 - s.b[1])) if isinstance(s, Line)
                          else Arc((18 - s.c[0], 18 - s.c[1]), s.r, s.a0 + math.pi, s.a1 + math.pi) for s in segs], closed)
                     for segs, closed in parse(REFRESH_A))
out("refresh", [REFRESH_A, REFRESH_B])
explore("refresh", [
    ("two arcs, corner heads", alt([REFRESH_A, REFRESH_B])),
    ("one arc, corner head", alt([mirror_x(ROT_CCW)])),
], picked=0)

REPEAT = ["M1.75 9A3.75 3.75 0 0 1 5.5 5.25L15.125 5.25" + head((15.125, 5.25), (1, 0)),
          "M16.25 9A3.75 3.75 0 0 1 12.5 12.75L2.875 12.75" + head((2.875, 12.75), (-1, 0))]
out("animation-repeat", REPEAT)
explore("animation-repeat", [
    ("quarter arcs r3.75", alt(REPEAT)),
    ("r1.5 corners", alt(["M1.75 9L1.75 6.75A1.5 1.5 0 0 1 3.25 5.25L15.125 5.25" + head((15.125, 5.25), (1, 0)),
                          "M16.25 9L16.25 11.25A1.5 1.5 0 0 1 14.75 12.75L2.875 12.75" + head((2.875, 12.75), (-1, 0))])),
], picked=0)

CONVERT = [arrow((2, 5.5), (15.125, 5.5)), arrow((16, 12.5), (2.875, 12.5))]
out("conversion", CONVERT)
explore("conversion", [
    ("two opposed arrows", alt(CONVERT)),
    ("two arcs", alt([REFRESH_A, REFRESH_B])),
], picked=0)

WRAP = ["M1.75 2.25L16.25 2.25",
        "M1.75 5.75L12.75 5.75A3.5 3.5 0 0 1 12.75 12.75L9.25 12.75" + head((9.25, 12.75), (-1, 0)),
        "M1.75 12.75L5.25 12.75"]
out("arrow-anticlockwise-text", WRAP)
explore("arrow-anticlockwise-text", [
    ("three lines, middle wraps back", alt(WRAP)),
    ("two lines, the second wraps back", alt(WRAP[:2])),
], picked=0)

POP_IN = "M15 2L15 8A4 4 0 0 1 11 12L2.75 12" + head((2.75, 12), (-1, 0))
out("arrow-back-to-bottom-left", [POP_IN])
explore("arrow-back-to-bottom-left", [
    ("down, round the r4 corner, left", alt([POP_IN])),
    ("down, sharp corner, left", alt(["M15 2L15 12L2.75 12" + head((2.75, 12), (-1, 0))])),
], picked=0)

MERGE = ["M1.75 3.25L4 3.25L9.75 9L4 14.75L1.75 14.75", arrow((9.75, 9), (15.125, 9))]
out("merge", MERGE)
explore("merge", [
    ("two tails meet at 90°, one arrow out", alt(MERGE)),
    ("no tails", alt(["M4 3.25L9.75 9L4 14.75", arrow((9.75, 9), (15.125, 9))])),
], picked=0)

SHUFFLE = [arrow((1.75, 16.25), (16.25, 1.75)), "M1.75 1.75L7 7", arrow((11, 11), (16.25, 16.25))]
out("shuffle", SHUFFLE)
explore("shuffle", [
    ("crossing diagonals, one passes under", alt(SHUFFLE)),
    ("crossing diagonals, unbroken", alt([arrow((1.75, 16.25), (16.25, 1.75)), arrow((1.75, 1.75), (16.25, 16.25))])),
], picked=0)

# ---------- containers ----------
TRAY = "M1.75 11L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L14.75 16.25A1.5 1.5 0 0 0 16.25 14.75L16.25 11"
TRAY_OPEN = "M1.75 12.25L5.75 16.25L12.25 16.25L16.25 12.25"
DOWN_IN = arrow((9, 2), (9, 12.25))
out("download", [DOWN_IN, TRAY], opened=line_svg([DOWN_IN, TRAY_OPEN]))
lint("download open", line_svg([DOWN_IN, TRAY_OPEN]))
explore("download", [
    ("arrow down into a tray", alt([DOWN_IN, TRAY])),
    ("arrow down onto a floor", alt([arrow((9, 2), (9, 12)), bar(15.5)])),
], picked=0)

UP_OUT = arrow((9, 12.25), (9, 2.875))
out("upload", [UP_OUT, TRAY])
explore("upload", [
    ("arrow up out of a tray", alt([UP_OUT, TRAY])),
    ("arrow up off a floor", alt(MOVE_UP)),
], picked=0)

EXPORT_BOX = ("M5.5 9.25L3.25 9.25A1.5 1.5 0 0 0 1.75 10.75L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L14.75 16.25"
              "A1.5 1.5 0 0 0 16.25 14.75L16.25 10.75A1.5 1.5 0 0 0 14.75 9.25L12.5 9.25")
EXPORT = [arrow((9, 12.75), (9, 2.25)), EXPORT_BOX]
out("export", EXPORT)
explore("export", [
    ("arrow up out of an open box", alt(EXPORT)),
    ("arrow up-right out of a box corner", alt(["M7.25 3.25L3.25 3.25A1.5 1.5 0 0 0 1.75 4.75L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25"
                                                "L13.25 16.25A1.5 1.5 0 0 0 14.75 14.75L14.75 10.75",
                                                arrow((7.125, 10.875), (16.25, 1.75))])),
], picked=0)

LINK_BOX = ("M7.25 3.25L3.25 3.25A1.5 1.5 0 0 0 1.75 4.75L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L13.25 16.25"
            "A1.5 1.5 0 0 0 14.75 14.75L14.75 10.75")
LINK = [LINK_BOX, arrow((7.125, 10.875), (16.25, 1.75))]
out("external-link", LINK)
explore("external-link", [
    ("head outside the box corner", alt(LINK)),
    ("arrow inside the full box", alt(["M9.5 1.75L3.25 1.75A1.5 1.5 0 0 0 1.75 3.25L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25"
                                       "L14.75 16.25A1.5 1.5 0 0 0 16.25 14.75L16.25 8.5", arrow((6.25, 11.75), (13, 5))])),
], picked=0)

NODES = [((6.375, 9), 2), ((11.625, 3.75), 2), ((11.625, 14.25), 2)]
def share(nodes):
    (l, r0), (t, r1), (b, r2) = nodes; k = 1 / SQ
    lines = [poly((l[0] + r0 * k, l[1] - r0 * k), (t[0] - r1 * k, t[1] + r1 * k), closed=False),
             poly((l[0] + r0 * k, l[1] + r0 * k), (b[0] - r2 * k, b[1] - r2 * k), closed=False)]
    return [circle_d(c, r) for c, r in nodes] + lines
SHARE = share(NODES)
out("share", SHARE)
explore("share", [
    ("three rings r2.25, short links", alt(share([((6.5, 9), 2.25), ((11.5, 4), 2.25), ((11.5, 14), 2.25)]))),
    ("three rings r2 on 45° links", alt(SHARE)),
    ("arrow up out of an open box", alt(EXPORT)),
], picked=1)

TITLE = "M1.75 6L16.25 6"
WINDOW = [BOX, TITLE]
line, duo = with_badge(WINDOW, "badge-plus", fg_lines=[TITLE])
lint("open-in-new-window", line); gaps("open-in-new-window", line)
write("open-in-new-window", line, duo=duo)
uses("open-in-new-window", "badge-plus")
explore("open-in-new-window", [
    ("window with a plus badge", line),
    ("window with an arrow-right badge", with_badge(WINDOW, "badge-arrow-right")[0]),
    ("box with a plus badge, no title bar", with_badge([BOX], "badge-plus")[0]),
], picked=0)

CORNERS = ["M1.75 6.5L1.75 3.25A1.5 1.5 0 0 1 3.25 1.75L6.5 1.75",
           "M11.5 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 6.5",
           "M16.25 11.5L16.25 14.75A1.5 1.5 0 0 1 14.75 16.25L11.5 16.25",
           "M6.5 16.25L3.25 16.25A1.5 1.5 0 0 1 1.75 14.75L1.75 11.5"]
out("full-screen", CORNERS)
explore("full-screen", [
    ("four corner brackets", alt(CORNERS)),
    ("four arrows to the corners", alt(EXPAND)),
], picked=0)

SQUARE = rect(1.75, 1.75, 16.25, 16.25, 1.5)
MARKS = ["M5.25 7.25L5.25 5.25L7.25 5.25", "M10.75 5.25L12.75 5.25L12.75 7.25",
         "M12.75 10.75L12.75 12.75L10.75 12.75", "M7.25 12.75L5.25 12.75L5.25 10.75"]
CONTENT = rect(5.25, 5.25, 12.75, 12.75, 1.5)
FIT = [SQUARE] + MARKS
out("size-lg", FIT, duo=duo_svg([silhouette(SQUARE)], fg_lines=MARKS))
explore("size-lg", [
    ("window with fit marks inside", alt(FIT)),
    ("content box inside corner brackets", alt(CORNERS + [CONTENT])),
    ("window with a content box inside", alt([SQUARE, CONTENT])),
], picked=0)

# ---------- solids and dots ----------
write("caret-right", solid=solid_svg([poly((6.5, 4), (11.5, 9), (6.5, 14))]))

out("grip-dots-vertical", [], [(x, y, 1.375) for y in (3.375, 9, 14.625) for x in (6.75, 11.25)])

save_meta("arrows")
