"""Draws the text family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *


# ---------- helpers ----------
def P(c, r, deg):
    a = math.radians(deg)
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def arc(c, r, d0, d1, move=True):
    """An arc from angle d0 to d1 in degrees, screen coords, turning the way d1 lies from d0."""
    p0, p1 = P(c, r, d0), P(c, r, d1)
    large = 1 if abs(d1 - d0) > 180 else 0
    sweep = 1 if d1 > d0 else 0
    return (f"M{pt(p0)}" if move else "") + f"A{f(r)} {f(r)} 0 {large} {sweep} {pt(p1)}"


def L(*ps):
    return "L" + "L".join(pt(p) for p in ps)


def svg(paths, dots=(), fills=()):
    """An outline with optional flat filled shapes."""
    s = line_svg(paths, dots)
    body = "".join(f'<path d="{d}" fill="currentColor" stroke="none"/>' for d in fills)
    return s.replace("</svg>", body + "</svg>")


def out(name, outline, **kw):
    lint(name, outline)
    gaps(name, outline)
    if kw.get("opened"):
        lint(name + " open", kw["opened"])
        gaps(name + " open", kw["opened"])
    write(name, outline, **kw)


def sq(x0, y0, x1, y1):
    return poly((x0, y0), (x1, y0), (x1, y1), (x0, y1))


def mirror_x(ps): return [(18 - x, y) for x, y in ps]


# ---------- shared constants ----------
ROWS = (4.5, 9, 13.5)          # list rows, 4.5 apart
LINE_X1 = 16                   # list lines end
DISC_R = 1.375
SQUARE = rect(1.75, 1.75, 16.25, 16.25)
CAP_T, CAP_B = 3, 15           # heading cap height on ink


def house_a(x0, x1, top, bar, base):
    """A capital A: vertical legs under a 45° roof meeting at 90°, with a crossbar."""
    cx, h = (x0 + x1) / 2, (x1 - x0) / 2
    apex = top + H * SQ
    return [poly((x0, base), (x0, apex + h), (cx, apex), (x1, apex + h), (x1, base), closed=False),
            f"M{f(x0)} {f(bar)}L{f(x1)} {f(bar)}"]


# ---------- text and letterforms ----------
T_BAR = "M2.75 2.875L15.25 2.875"
T_STEM = "M9 2.875L9 15.75"
T_SERIF = ["M2.75 5.375L2.75 2.875L15.25 2.875L15.25 5.375", "M9 2.875L9 15.125", "M6.5 15.125L11.5 15.125"]
explore("text", [("plain T", line_svg([T_BAR, T_STEM])),
                 ("serifed T", line_svg(T_SERIF))], picked=0)
out("text", line_svg([T_BAR, T_STEM]))

A_HOUSE = house_a(4, 14, 2.25, 11.625, 15.75)
A_ARCH = ["M4.5 15.75L4.5 7.5" + arc((9, 7.5), 4.5, 180, 360, False) + "L13.5 15.75", "M4.5 11.25L13.5 11.25"]
explore("text-a", [("house A, 45° roof", line_svg(A_HOUSE)),
                   ("arched A", line_svg(A_ARCH))], picked=0)
out("text-a", line_svg(A_HOUSE))

B_OUT = ("M4 2.875L10.5 2.875" + arc((10.5, 5.75), 2.875, 270, 450, False)
         + arc((10.5, 11.875), 3.25, 270, 450, False) + "L4 15.125Z")
B_MID = "M4 8.625L10.5 8.625"
B_COUNTERS = ["M4.625 3.5L10.5 3.5" + arc((10.5, 5.75), 2.25, 270, 450, False) + "L4.625 8Z",
              "M4.625 9.25L10.5 9.25" + arc((10.5, 11.875), 2.625, 270, 450, False) + "L4.625 14.5Z"]
B_DOUBLE = "M7.5 2.875L7.5 15.125"
explore("text-bold", [("plain B", line_svg([B_OUT, B_MID])),
                      ("filled counters", svg([B_OUT], fills=B_COUNTERS)),
                      ("doubled stem", line_svg([B_OUT, B_MID, B_DOUBLE]))], picked=0)
out("text-bold", line_svg([B_OUT, B_MID]))

def italic_i(cx, rho, flick):
    """A lowercase italic i: a 45° stem curling through a round bottom into a 45° exit, with its dot on the stem's line."""
    c = (cx, 15.125 - H - rho)
    e = P(c, rho, 225)
    x = P(c, rho, 45)
    top = (e[0] + 7.5 - rho * SQ, e[1] - 7.5 + rho * SQ)
    tail = f"M{pt(top)}L{pt(e)}" + arc(c, rho, 225, 45, False) + (f"L{pt((x[0] + flick, x[1] - flick))}" if flick else "")
    return tail, (round((top[0] + 2.5) * 8) / 8, round((top[1] - 2.5) * 8) / 8, DISC_R)


I_TAIL, I_DOT = italic_i(6.75, 1.75, 1.5)
I_WIDE, I_WIDE_DOT = italic_i(6.5, 2.125, 0)
I_ZED = ["M16.5 3.5L14.5 3.5L3.5 14.5L1.5 14.5"]
explore("text-italic", [("italic i, curl and exit stroke", line_svg([I_TAIL], [I_DOT])),
                        ("italic i, wide curl", line_svg([I_WIDE], [I_WIDE_DOT])),
                        ("slanted I, one-sided serifs", line_svg(I_ZED))], picked=0)
out("text-italic", line_svg([I_TAIL], [I_DOT]))

U = "M4.5 2.25L4.5 7.75" + arc((9, 7.75), 4.5, 180, 0, False) + "L13.5 2.25"
UNDER = "M2.5 15.75L15.5 15.75"
out("text-underline", line_svg([U, UNDER]))

S_R = 2.5
S_CY = 9 - SQ * S_R
S_RUNS = ("M12.5 " + f(S_CY - S_R) + "L9 " + f(S_CY - S_R) + arc((9, S_CY), S_R, 270, 135, False)
          + f"L{pt(P((9, 18 - S_CY), S_R, 315))}" + arc((9, 18 - S_CY), S_R, -45, 90, False) + "L5.5 " + f(18 - S_CY + S_R))
S_PURE = (arc((9, S_CY), S_R, 330, 135) + f"L{pt(P((9, 18 - S_CY), S_R, 315))}" + arc((9, 18 - S_CY), S_R, -45, 150, False))
STRIKE = "M2.5 9L15.5 9"
explore("text-strikethrough", [("S with flat runs", line_svg([S_RUNS, STRIKE])),
                               ("S of arcs", line_svg([S_PURE, STRIKE]))], picked=0)
out("text-strikethrough", line_svg([S_RUNS, STRIKE]))

# ---------- headings: H plus a digit ----------
H_GLYPH = ["M1.75 3L1.75 15", "M7.25 3L7.25 15", "M1.75 9L7.25 9"]
DX0, DX1, DY0, DY1 = 10.75, 16.25, CAP_T + H, CAP_B - H


def digit_2(x0, x1, y0, y1, tangent=True):
    r = (x1 - x0) / 2
    c = (x0 + r, y0 + r)
    if tangent:
        p = P(c, r, 45)
        t = p[0] - x0
        return arc(c, r, 180, 405) + L((x0, p[1] + t), (x0, y1), (x1, y1))
    t = x1 - x0
    return arc(c, r, 180, 360) + L((x0, c[1] + t), (x0, y1), (x1, y1))


def digit_3(x1, y0, y1, rt):
    ym = y0 + 2 * rt
    rb = (y1 - ym) / 2
    ct, cb = (x1 - rt, y0 + rt), (x1 - rb, ym + rb)
    return [arc(ct, rt, 210, 450) + f"L{f(x1 - rb - 1)} {f(ym)}",
            f"M{f(cb[0])} {f(ym)}" + arc(cb, rb, 270, 510, False)]


D1 = ["M11 3.625L13.5 3.625L13.5 14.375", "M10.75 14.375L16.25 14.375"]
D2 = [digit_2(DX0, DX1, DY0, DY1)]
D2_CORNER = [digit_2(DX0, DX1, DY0, DY1, tangent=False)]
D3 = digit_3(DX1, DY0, DY1, 2.375)
D4 = ["M10.75 3L10.75 11L16.25 11", "M14.25 3L14.25 15"]
out("heading-1", line_svg(H_GLYPH + D1))
explore("heading-2", [("2 with a curved neck", line_svg(H_GLYPH + D2)),
                      ("2 with a cornered neck", line_svg(H_GLYPH + D2_CORNER))], picked=0)
out("heading-2", line_svg(H_GLYPH + D2))
out("heading-3", line_svg(H_GLYPH + D3))
out("heading-4", line_svg(H_GLYPH + D4))

# ---------- type ----------
TYPE_BIG = ["M1.75 2.875L10.25 2.875", "M6 2.875L6 15.75"]
TYPE_SMALL = ["M10.75 8.375L16.25 8.375", "M13.5 8.375L13.5 15.75"]
out("type-scale", line_svg(TYPE_BIG + TYPE_SMALL))


def small_a(cx, base, r):
    cy = base - H - r
    return [circle_d((cx, cy), r), f"M{f(cx + r)} {f(cy - r - H)}L{f(cx + r)} {f(base)}"]


AA = house_a(1.75, 7.75, 2.25, 10.5, 15.75) + small_a(13.75, 15.75, 2.5)
AA_OPEN = house_a(1.75, 7.75, 2.25, 9.625, 12.5) + small_a(13.75, 12.5, 2.5) + ["M1.75 16L16.25 16"]
out("typography", line_svg(AA), opened=line_svg(AA_OPEN))

SPELL_A = house_a(1.75, 8.25, 2.25, 9.875, 13.25)
SPELL_CHECK = "M11.625 14L13.125 15.5L16.5 12.125"
out("spell-check", line_svg(SPELL_A + [SPELL_CHECK]))

FIELD_OPEN = "M8.5 5L3.25 5A1.5 1.5 0 0 0 1.75 6.5L1.75 11.5A1.5 1.5 0 0 0 3.25 13L8.5 13"
IBEAM = ["M12.75 2.75L12.75 15.25", "M11.25 2.75L14.25 2.75", "M11.25 15.25L14.25 15.25"]
FIELD = rect(1.75, 4.5, 16.25, 13.5)
RENAME = ["M5.5 5.5L3.25 5.5A1.5 1.5 0 0 0 1.75 7L1.75 11A1.5 1.5 0 0 0 3.25 12.5L5.5 12.5",
          "M12.5 5.5L14.75 5.5A1.5 1.5 0 0 1 16.25 7L16.25 11A1.5 1.5 0 0 1 14.75 12.5L12.5 12.5",
          "M9 2.5L9 15.5", "M7.5 2.5L10.5 2.5", "M7.5 15.5L10.5 15.5"]
explore("rename", [("open field and I-beam", line_svg([FIELD_OPEN] + IBEAM)),
                   ("field with a caret", line_svg([FIELD, "M5 9L10 9", "M12.75 6.75L12.75 11.25"])),
                   ("field broken by the I-beam", line_svg(RENAME))], picked=2)
out("rename", line_svg(RENAME))

# ---------- lists and alignment ----------
def rows(spans):
    return [f"M{f(a)} {f(y)}L{f(b)} {f(y)}" for (a, b), y in zip(spans, ROWS)]


out("text-align-left", line_svg(rows([(2, 16), (2, 11), (2, 13.5)])))
out("text-align-center", line_svg(rows([(2, 16), (4.5, 13.5), (3.25, 14.75)])))
out("text-align-right", line_svg(rows([(2, 16), (7, 16), (4.5, 16)])))

EDGE_T, EDGE_B, MID_A, MID_B = "M2 2.25L16 2.25", "M2 15.75L16 15.75", 6.75, 11.25
out("text-align-top", line_svg([EDGE_T, f"M4 {f(MID_A)}L14 {f(MID_A)}", f"M5.5 {f(MID_B)}L12.5 {f(MID_B)}"]))
out("text-align-bottom", line_svg([f"M4 {f(MID_A)}L14 {f(MID_A)}", f"M5.5 {f(MID_B)}L12.5 {f(MID_B)}", EDGE_B]))
out("text-align-middle", line_svg([EDGE_T, f"M4 {f(MID_A)}L14 {f(MID_A)}", f"M4 {f(MID_B)}L14 {f(MID_B)}", EDGE_B]))

BULLET_LINES = [f"M7.25 {f(y)}L{f(LINE_X1)} {f(y)}" for y in ROWS]
out("bullet-list", line_svg(BULLET_LINES, dots=[(3.375, y, DISC_R) for y in ROWS]))

QUOTE_BAR = "M2.625 3.875L2.625 14.125"
QUOTE_LINES = [f"M6.5 {f(ROWS[0])}L16 {f(ROWS[0])}", f"M6.5 {f(ROWS[1])}L16 {f(ROWS[1])}", f"M6.5 {f(ROWS[2])}L12.5 {f(ROWS[2])}"]
QUOTE_MARK = ["M4.125 3.5L2.75 4.875", "M8.375 3.5L7 4.875"]
explore("blockquote", [("bar beside lines", line_svg([QUOTE_BAR] + QUOTE_LINES)),
                       ("quote marks over lines", line_svg(
                           [f"M2 {f(ROWS[1])}L16 {f(ROWS[1])}", f"M2 {f(ROWS[2])}L12.5 {f(ROWS[2])}"] + ["M11.5 2.375L10.125 3.75", "M15.375 2.375L14 3.75"],
                           dots=[(11.5, 4.25, DISC_R), (15.375, 4.25, DISC_R)]))], picked=0)
out("blockquote", line_svg([QUOTE_BAR] + QUOTE_LINES))

NUM_LINES = [f"M9.25 {f(ROWS[0])}L16 {f(ROWS[0])}", f"M9.25 {f(ROWS[2])}L16 {f(ROWS[2])}"]
NUM_1 = "M2.25 1.75L3.75 1.75L3.75 5.75"
NUM_C = (3.75, 11.25)
NUM_2 = arc(NUM_C, 2, 225, 360) + L((2.25, 14.75), (2.25, 16.25), (5.75, 16.25))
out("ordered-list", line_svg([NUM_1, NUM_2] + NUM_LINES))


def tick(y, vx=3.25, s=1.5, l=3):
    vy = y + l / 2
    return poly((vx - s, vy - s), (vx, vy), (vx + l, vy - l), closed=False)


ITEMS = (ROWS[0], ROWS[2])
TASK_LINES = [f"M9.5 {f(y)}L{f(LINE_X1)} {f(y)}" for y in ITEMS]
TASKS = line_svg([tick(ITEMS[0])] + TASK_LINES, dots=[(3.25, ITEMS[1], DISC_R)])
TASKS_DONE = line_svg([tick(y) for y in ITEMS] + TASK_LINES)
TASKS_THREE = line_svg([tick(ROWS[0]), tick(ROWS[2], s=1.125, l=2.25)] + [f"M9.5 {f(y)}L{f(LINE_X1)} {f(y)}" for y in ROWS],
                       dots=[(3.25, ROWS[1], DISC_R)])
TASKS_NOTES = line_svg([tick(5.25)] + ["M9.5 3.5L16 3.5", "M9.5 7L13.5 7", "M9.5 11L16 11", "M9.5 14.5L13.5 14.5"],
                       dots=[(3.25, 12.75, DISC_R)])
explore("check-list", [("two tasks on the outer rows", TASKS),
                       ("three rows, check, open, check", TASKS_THREE),
                       ("two tasks with notes", TASKS_NOTES)], picked=0)
out("check-list", TASKS, opened=TASKS_DONE)

CHECK_IN_BOX = "M5.5 9L7.75 11.25L12.5 6.5"
out("checkbox-checked", line_svg([SQUARE, CHECK_IN_BOX]),
    duo=duo_svg([silhouette(SQUARE)], fg_lines=[CHECK_IN_BOX]))

# ---------- code ----------
out("code", line_svg(["M7 4.25L2.25 9L7 13.75", "M11 4.25L15.75 9L11 13.75"]))

CODE2_BAR = ["M5.25 5.75L2 9L5.25 12.25", "M12.75 5.75L16 9L12.75 12.25", "M9 3.75L9 14.25"]
CODE2_OPEN = ["M5 5.25L1.75 8.5L5 11.75", "M13 5.25L16.25 8.5L13 11.75", "M9 3.25L9 15.25"]
CODE2_BOX = [BOX, "M7.25 7L5.25 9L7.25 11", "M10.75 7L12.75 9L10.75 11"]
explore("code-2", [("chevrons around a bar", line_svg(CODE2_BAR)),
                   ("chevrons in a block", line_svg(CODE2_BOX))], picked=0)
out("code-2", line_svg(CODE2_BAR), opened=line_svg(CODE2_OPEN))

BRACE_L = "M6.25 2A2 2 0 0 0 4.25 4L4.25 7L2.25 9L4.25 11L4.25 14A2 2 0 0 0 6.25 16"
BRACE_R = "M11.75 2A2 2 0 0 1 13.75 4L13.75 7L15.75 9L13.75 11L13.75 14A2 2 0 0 1 11.75 16"
out("brackets-curly", line_svg([BRACE_L, BRACE_R]))

PROMPT = "M5.25 6.25L8 9L5.25 11.75"
UNDERSCORE = "M10.25 11.75L12.75 11.75"
CURSOR = "M11.5 6.25L11.5 11.75"
BOX_SIL = silhouette(BOX)
out("terminal", line_svg([BOX, PROMPT, UNDERSCORE]),
    duo=duo_svg([BOX_SIL], fg_lines=[PROMPT, UNDERSCORE]),
    opened=line_svg([BOX, PROMPT, CURSOR]),
    duo_opened=duo_svg([BOX_SIL], fg_lines=[PROMPT, CURSOR]))


def zero(x0, y0, x1, y1):
    return rect(x0, y0, x1, y1, r=(x1 - x0) / 2)


BIN = ["M3 1.75L4.75 1.75L4.75 7.25", zero(11.25, 1.75, 15.25, 7.25),
       zero(2.75, 10.75, 6.75, 16.25), "M11.5 10.75L13.25 10.75L13.25 16.25"]
out("binary", line_svg(BIN))

HASH = ["M6.25 2.25L6.25 15.75", "M11.75 2.25L11.75 15.75", "M2.25 6.25L15.75 6.25", "M2.25 11.75L15.75 11.75"]
HASH_OPEN = ["M5.25 1.75L5.25 16.25", "M12.75 1.75L12.75 16.25", "M1.75 5.25L16.25 5.25", "M1.75 12.75L16.25 12.75"]
out("hashtag", line_svg(HASH), opened=line_svg(HASH_OPEN))

KEY_FIELD = rect(1.75, 4.5, 16.25, 13.5)
KEY_DOTS = [(5.25, 9, DISC_R), (9, 9, DISC_R), (12.75, 9, DISC_R)]
KEY_CURSOR = "M12.75 6.75L12.75 11.25"
explore("input-password-edit", [("two masked dots and a caret", line_svg([KEY_FIELD, KEY_CURSOR], [(5.25, 9, DISC_R), (9.25, 9, DISC_R)])),
                                ("three masked dots", line_svg([KEY_FIELD], KEY_DOTS))], picked=1)
out("input-password-edit", line_svg([KEY_FIELD], KEY_DOTS),
    duo=duo_svg([silhouette(KEY_FIELD)], fg_dots=[(x, y, 1.5) for x, y, _ in KEY_DOTS]))

SEC_LABEL = "M1.75 2.5L7.25 2.5"
SEC_BOX = rect(1.75, 6, 16.25, 16.25)
SEC_IN = rect(1.75, 1.75, 16.25, 16.25)
explore("section", [("label over a frame", line_svg([SEC_LABEL, SEC_BOX])),
                    ("label inside a frame", line_svg([SEC_IN, "M5 5.25L10.5 5.25"]))], picked=0)
out("section", line_svg([SEC_LABEL, SEC_BOX]))

TTI_T = ["M1.75 2.375L7.75 2.375", "M4.75 2.375L4.75 9.75"]
TTI_BOX = rect(8.25, 8.25, 16.25, 16.25)
TTI_PEAK = "M8.25 14.25L10.5 12L14.75 16.25"
out("text-to-image", line_svg(TTI_T + [TTI_BOX, TTI_PEAK]),
    duo=duo_svg([silhouette(TTI_BOX)], fg=[poly((9.5, 15), (9.5, 13), (10.5, 12), (13.5, 15))], fg_lines=TTI_T))

# ---------- tools: 45° bodies, tip bottom left ----------
PEN_BODY = poly((2, 16), (2, 13), (12.875, 2.125), (15.875, 5.125), (5, 16))
PEN_TIP = "M2 13L5 16"
PEN_BAND = "M10.375 4.625L13.375 7.625"
PEN_LINE = "M10 16L16.25 16"
out("pencil", line_svg([PEN_BODY, PEN_TIP, PEN_BAND]),
    duo=duo_svg([silhouette(PEN_BODY)], fg_lines=[PEN_TIP, PEN_BAND]),
    opened=line_svg([PEN_BODY, PEN_TIP, PEN_BAND, PEN_LINE]),
    duo_opened=duo_svg([silhouette(PEN_BODY)], fg_lines=[PEN_TIP, PEN_BAND, PEN_LINE]))


def shift(ps, dx, dy): return [(x + dx, y + dy) for x, y in ps]


HL = shift([(3.25, 11.25), (4, 12), (2.625, 13.375), (5.125, 15.875), (6.5, 14.5), (7.25, 15.25), (15.5, 7), (11.5, 3)], 0, -0.375)
HL_BODY = poly(*HL)
HL_CAP = poly(*shift([(9, 5.5), (13, 9.5)], 0, -0.375), closed=False)
HL_NIB = poly(*shift([(4, 12), (6.5, 14.5)], 0, -0.375), closed=False)
HL_MARK = "M9.5 16L16.25 16"
explore("highlighter", [("flat nib, cap band", line_svg([HL_BODY, HL_NIB, HL_CAP])),
                        ("with a highlight mark", line_svg([HL_BODY, HL_NIB, HL_CAP, HL_MARK]))], picked=0)
out("highlighter", line_svg([HL_BODY, HL_NIB, HL_CAP]),
    duo=duo_svg([silhouette(HL_BODY)], fg_lines=[HL_NIB, HL_CAP]))

ER_BODY = poly((2.25, 12.5), (11.5, 3.25), (15.5, 7.25), (7.75, 15), (4.75, 15))
ER_SPLIT = "M7.25 7.5L11.25 11.5"
ER_BASE = "M7.75 15L16.25 15"
out("eraser", line_svg([ER_BODY, ER_SPLIT, ER_BASE]),
    duo=duo_svg([silhouette(ER_BODY)], fg_lines=[ER_SPLIT, ER_BASE]))


def flat_brush(p, v, r, ferrule, end):
    """A flat brush on the 45° axis: a 90° bristle tip at p, sides curving into a ferrule, a line handle to end."""
    def m(q): return (p[0] + (p[1] - q[1]), p[1] - (q[0] - p[0]))
    c1 = (p[0] + r, p[1] - v)
    f1 = P(c1, r, 225)
    f2 = m(f1)
    t1, t2 = (f1[0] + ferrule, f1[1] - ferrule), (f2[0] + ferrule, f2[1] - ferrule)
    body = (f"M{pt(p)}L{f(p[0])} {f(p[1] - v)}" + arc(c1, r, 180, 225, False) + L(t1, t2, f2)
            + arc(m(c1), r, 45, 90, False) + "Z")
    mid = ((t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2)
    return [body, f"M{pt(f1)}L{pt(f2)}", f"M{pt(mid)}L{pt(end)}"]


def blob(c, r):
    tip = (c[0] - r, c[1] + r)
    return f"M{pt(tip)}L{f(c[0] - r)} {f(c[1])}" + arc(c, r, 180, 450, False) + "Z"


BRUSH = flat_brush((2, 16), 2.5, 2.5, 3, (15.75, 2.25))
BRUSH_LONG = flat_brush((2, 16), 4, 1.5, 2.5, (15.75, 2.25))
def round_brush(c, r, ferrule, reach):
    """A round brush on the 45° axis: a 90° bristle tip rounding into a ferrule band, with a line handle reach out."""
    f1, f2 = P(c, r, 270), P(c, r, 360)
    t1, t2 = (f1[0] + ferrule, f1[1] - ferrule), (f2[0] + ferrule, f2[1] - ferrule)
    tip = (c[0] - r, c[1] + r)
    body = (f"M{pt(tip)}L{f(c[0] - r)} {f(c[1])}" + arc(c, r, 180, 270, False) + L(t1, t2, f2)
            + arc(c, r, 0, 90, False) + "Z")
    mid = ((t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2)
    return [body, f"M{pt(f1)}L{pt(f2)}", f"M{pt(mid)}L{pt((mid[0] + reach, mid[1] - reach))}"]


ROUND = round_brush((5.5, 12.5), 2.75, 2.5, 6.375)
ROUND_OPEN = round_brush((6.75, 10), 2.25, 2.5, 4.625) + ["M2.25 15.75L15.75 15.75"]
explore("paintbrush", [("flat brush, curved bristles, ferrule", line_svg(BRUSH)),
                       ("long bristles, short ferrule", line_svg(BRUSH_LONG)),
                       ("round bristles in a ferrule", line_svg(ROUND))], picked=2)
out("paintbrush", line_svg(ROUND), opened=line_svg(ROUND_OPEN))


def drop(c, r):
    """A drop: a circle drawn up into a 90° tip."""
    tip = (c[0], c[1] - r * SQ)
    return f"M{pt(tip)}L{pt(P(c, r, 225))}" + arc(c, r, 225, -45, False) + "Z"


BUCKET = poly((8, 3), (13.5, 8.5), (8, 14), (2.5, 8.5))
LEVEL = "M2.5 8.5L13.5 8.5"
DROP = drop((14.75, 14.5), 1.5)
SWATCH_FILL = "M2.375 9.75L15.625 9.75L15.625 14.75A0.875 0.875 0 0 1 14.75 15.625L3.25 15.625A0.875 0.875 0 0 1 2.375 14.75Z"
explore("fill", [("bucket and a drop", line_svg([BUCKET, LEVEL, DROP])),
                 ("half-filled swatch", svg([SQUARE], fills=[SWATCH_FILL]))], picked=0)
out("fill", line_svg([BUCKET, LEVEL, DROP]), duo=duo_svg([silhouette(BUCKET)], fg=[DROP], fg_lines=[LEVEL]))

# ---------- lines ----------
out("line-straight", line_svg(["M2.5 15.5L15.5 2.5"]))
out("line-elbow", line_svg(["M2.5 15.5L9 15.5L9 2.5L15.5 2.5"]))
out("line-curved", line_svg([arc((2.5, 9), 6.5, 90, 0) + arc((15.5, 9), 6.5, 180, 270, False)]))

WEIGHT_LINE = "M2.75 3.125L15.25 3.125"
WEIGHT_BARS = [sq(2.75, 7.25, 15.25, 9.25), sq(2.75, 12.75, 15.25, 15.75)]
WEIGHT_PILLS = [rect(2.75, 6.5, 15.25, 9.5, r=1.5), rect(2.75, 12, 15.25, 16, r=2)]
explore("line-weight", [("thickening filled bars", svg([WEIGHT_LINE], fills=WEIGHT_BARS)),
                        ("outlined bars", line_svg([WEIGHT_LINE] + WEIGHT_PILLS))], picked=0)
out("line-weight", svg([WEIGHT_LINE], fills=WEIGHT_BARS))

VEC_ARC = arc((12.75, 12.75), 9.25, 180, 270)
VEC_SQ = [sq(1.75, 12.75, 5.25, 16.25), sq(12.75, 1.75, 16.25, 5.25)]
VEC_DISC_ARC = arc((15, 15), 12, 180, 270)
explore("vector", [("arc between square anchors", line_svg([VEC_ARC] + VEC_SQ)),
                   ("arc between disc anchors", line_svg([VEC_DISC_ARC], dots=[(3, 15, DISC_R), (15, 3, DISC_R)]))], picked=0)
out("vector", line_svg([VEC_ARC] + VEC_SQ))

# ---------- sparkle ----------
def spk(c, r, a, d):
    """A sparkle variant for the lab: legs a long, arc centres d out on the diagonals."""
    cx, cy = c
    s_ = f"M{pt((cx, cy - r))}"
    for sx, sy in ((1, -1), (1, 1), (-1, 1), (-1, -1)):
        if sx * sy < 0: p0, p1, tip = (cx + sx * a, cy + sy * (r - a)), (cx + sx * (r - a), cy + sy * a), (cx + sx * r, cy)
        else: p0, p1, tip = (cx + sx * (r - a), cy + sy * a), (cx + sx * a, cy + sy * (r - a)), (cx, cy + sy * r)
        rho = math.dist(p0, (cx + sx * d, cy + sy * d))
        s_ += f"L{pt(p0)}A{f(rho)} {f(rho)} 0 0 0 {pt(p1)}" + (f"L{pt(tip)}" if (sx, sy) != (-1, -1) else "")
    return s_ + "Z"


SPARK_R = 6.75
SPARK = sparkle((9, 9), SPARK_R)
SPARK_OPEN = [sparkle((7.375, 10.625), 5.25)]
SPARK_OPEN_SMALL = sparkle((14, 4), 2.5)
explore("sparkle", [("quarter arcs on short 90° tips", line_svg([SPARK])),
                    ("deeper arcs, centres 0.85r out", line_svg([spk((9, 9), SPARK_R, 0.5, 5.75)])),
                    ("plump quarter arcs, longer tips", line_svg([spk((9, 9), SPARK_R, 1.75, 5)]))], picked=0)
out("sparkle", line_svg([SPARK]), opened=svg(SPARK_OPEN, fills=[SPARK_OPEN_SMALL]))
uses("sparkle", "sparkle")

WAND = "M2.25 15.75L9.5 8.5"
WAND_STAR = sparkle((13.25, 4.75), 3)
WAND_DOTS = [(5.25, 3.75, DISC_R), (15, 12.25, DISC_R)]
WAND_PLUS = ["M5.25 2.375L5.25 5.125M3.875 3.75L6.625 3.75", "M15 10.875L15 13.625M13.625 12.25L16.375 12.25"]
WAND_BODY = poly((2.25, 13.5), (9.5, 6.25), (11.75, 8.5), (4.5, 15.75))
explore("magic-wand", [("line wand, sparkle, two discs", svg([WAND], WAND_DOTS, [WAND_STAR])),
                       ("barred wand and sparkle", svg([WAND_BODY], fills=[WAND_STAR])),
                       ("line wand under an outline sparkle", line_svg([WAND, sparkle((12.875, 5.125), 3.125)]))], picked=0)
out("magic-wand", svg([WAND], WAND_DOTS, [WAND_STAR]), opened=svg([WAND] + WAND_PLUS, fills=[WAND_STAR]))

save_meta("text")
