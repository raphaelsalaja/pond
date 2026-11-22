"""Draws the personal family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *
from neutral import _at

S2 = math.sqrt(2)

# ---------- helpers ----------
def box(x0, y0, x1, y1, tl=R, tr=R, br=R, bl=R):
    return shape([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], [tl, tr, br, bl])

def pl(*ps):
    return "M" + "L".join(pt(p) for p in ps)

def sil(*ds):
    return [silhouette(d) for d in ds]

def short_arc(c, r, p0, p1):
    """The shorter arc of the circle (c, r) from p0 to p1."""
    a = arc_pts(c, r, p0, p1, 1); b = arc_pts(c, r, p0, p1, 0)
    return a if abs(a.a1 - a.a0) < abs(b.a1 - b.a0) else b

def cut_round(d, c, rad):
    """A closed Duo base with the disc (c, rad) cut away, closed along that circle."""
    out = []
    for segs, closed in parse(d):
        n = len(segs)
        for u0, u1 in stretches(segs, closed, lambda s, t: math.dist(s.at(t), c) >= rad):
            s0, t0 = _at(segs, u0 % n if u0 >= n else u0); s1, t1 = _at(segs, u1 % n if u1 > n else u1)
            p0, p1 = s0.at(t0), s1.at(t1)
            out.append(walk_u(segs, u0, u1) + short_arc(c, rad, p1, p0).d(0, 1) + "Z")
    return out

def trim_round(paths, c, rad):
    """Strokes stopped where they come within rad of c."""
    return trim(paths, lambda s, t: math.dist(s.at(t), c) >= rad)

def ship(name, paths, dots=(), duo=None, op=None, op_dots=(), duo_op=None):
    o = line_svg(paths, dots); lint(name, o); gaps(name, o)
    oo = None
    if op is not None:
        oo = line_svg(op, op_dots); lint(name + " open", oo); gaps(name + " open", oo)
    write(name, o, duo, oo, duo_op)
    return o

def ship_pair(name, pair):
    lint(name, pair[0]); gaps(name, pair[0])
    if len(pair) > 2 and pair[2]: lint(name + " open", pair[2]); gaps(name + " open", pair[2])
    write(name, *pair)

# ---------- seeds ----------
HEART = "M9 6.375A3.5 3.5 0 1 0 3.025 8.85L9 14.825L14.975 8.85A3.5 3.5 0 1 0 9 6.375Z"

def heart_split(r=3.0, ny=6.75, t=1.5):
    """The heart cracked on 45° from the notch, its right lobe lifted off up and right."""
    q = r / S2
    N, TL, TR = (9, ny), (9 - r - q, ny + q), (9 + r + q, ny + q)
    B = (9, ny + r * (1 + S2)); u = (B[1] - ny) / 2; X = (9 + u, ny + u)
    lf = [(p[0] - t, p[1] + t) for p in (N, TL, B, X)]
    rt = [(p[0] + t, p[1] - t) for p in (N, TR, X)]
    left = f"M{pt(lf[0])}A{f(r)} {f(r)} 0 1 0 {pt(lf[1])}L{pt(lf[2])}L{pt(lf[3])}Z"
    right = f"M{pt(rt[0])}A{f(r)} {f(r)} 0 1 1 {pt(rt[1])}L{pt(rt[2])}Z"
    return [left, right]

ship("heart", [HEART], op=heart_split())

ship("tag", [TAG]); uses("tag", "tag")
ship_pair("tag-slash", with_slash([TAG])); uses("tag-slash", "tag", "slash")
ship_pair("tag-plus", with_badge([TAG], "badge-plus")); uses("tag-plus", "tag", "badge-plus")

# ---------- star ----------
def mirror_x(half):
    """A closed outline from its right half, listed clockwise from the top point to the bottom notch on x 9."""
    return poly(*half, *[(18 - x, y) for x, y in reversed(half[1:-1])])

def star_sq(top, a, tip, h, d, g, bottom, foot):
    """Five points that keep 90° tips: a 45° head, square arm ends, square feet."""
    arm = top + a + h; knee = (tip - d + g, arm + d + g)
    return mirror_x([(9, top), (9 + a, top + a), (tip, top + a), (tip, arm), (tip - d, arm + d), knee,
                     (knee[0], bottom), (foot, bottom), (9, bottom - (foot - 9))])

def star_rot(t, s):
    """Eight points: a square on its corner over an upright square."""
    u = t - s; ps = []
    for q in range(4):
        for x, y in [(0, -t), (u, -s), (s, -s), (s, -u)]:
            for _ in range(q): x, y = -y, x
            ps.append((9 + x, 9 + y))
    return poly(*ps)

STAR = star_sq(1.75, 2.5, 16.25, 1.5, 3, 1.25, 16.25, 12.5)
STAR_SMALL = star_sq(6.75, 2, 14.75, 1.25, 2.5, 1, 16.25, 11.5)
STAR_RAYS = "M9 1.75L9 3.25M3.375 4.125L4.5 5.25M14.625 4.125L13.5 5.25"
explore("star", [("five points with square arms and feet", line_svg([STAR])),
                 ("five points, narrow arms", line_svg([star_sq(1.75, 2.75, 15.25, 1.5, 2.5, 1.5, 16.25, 12.75)])),
                 ("eight points, two squares", line_svg([star_rot(7.25, 5.125)]))], picked=0)
ship("star", [STAR], op=[STAR_SMALL, STAR_RAYS])
ship_pair("star-plus", with_badge([STAR], "badge-plus")); uses("star-plus", "badge-plus")
ship_pair("star-minus", with_badge([STAR], "badge-minus")); uses("star-minus", "badge-minus")

# ---------- user ----------
HEAD = circle_d((9, 4.625), 2.875)
SHOULDERS = "M3.75 16.25A5.25 5.25 0 0 1 14.25 16.25Z"
_w = math.sqrt(5.75 ** 2 - 0.5 ** 2)
SHOULDERS_WIDE = f"M{f(9 - _w)} 16.25A5.75 5.75 0 1 1 {f(9 + _w)} 16.25Z"
ARM = pl((9 + 5.25 / S2, 16.25 - 5.25 / S2), (15.875, 16.25 - 5.25 / S2 - (15.875 - 9 - 5.25 / S2)))
explore("user", [("half-circle shoulders", line_svg([HEAD, SHOULDERS])),
                 ("wider shoulders, arc centre above the base", line_svg([circle_d((9, 4.625), 2.875), SHOULDERS_WIDE]))],
        picked=0)
ship("user", [HEAD, SHOULDERS], op=[HEAD, SHOULDERS, ARM])
ship_pair("user-plus", with_badge([HEAD, SHOULDERS], "badge-plus")); uses("user-plus", "badge-plus")

# ---------- calendar ----------
CAL_BOX = box(1.75, 3.25, 16.25, 16.25)
CAL_RINGS = "M5.5 1.75L5.5 4.5M12.5 1.75L12.5 4.5"
CAL_HEAD = "M1.75 7.75L16.25 7.75"
CALENDAR = [CAL_BOX, CAL_RINGS, CAL_HEAD]
CAL_BG = sil(CAL_BOX)
CAL_FG = [CAL_RINGS, CAL_HEAD]
CAL_OPEN_BOX = shape([(1.75, 3.25), (16.25, 3.25), (16.25, 12.25), (12.25, 16.25), (1.75, 16.25)], [R, R, 0, 0, R])
CAL_CURL = "M15.625 12.25L12.25 12.25L12.25 15.625"
explore("calendar", [("rings cross the top", line_svg(CALENDAR)),
                     ("tabs above the top only", line_svg([CAL_BOX, "M5.5 1.75L5.5 3.25M12.5 1.75L12.5 3.25", "M1.75 7.25L16.25 7.25"])),
                     ("no header line", line_svg([CAL_BOX, CAL_RINGS]))], picked=0)
ship("calendar", CALENDAR, duo=duo_svg(CAL_BG, fg_lines=CAL_FG),
     op=[CAL_OPEN_BOX, CAL_RINGS, CAL_HEAD, CAL_CURL],
     duo_op=duo_svg(sil(CAL_OPEN_BOX), fg_lines=CAL_FG + [CAL_CURL]))
ship_pair("calendar-plus", with_badge(CALENDAR, "badge-plus", bg=CAL_BG, fg_lines=CAL_FG)); uses("calendar-plus", "badge-plus")
for mod in ("check", "pen"):
    ship_pair(f"calendar-{mod}", with_badge(CALENDAR, f"badge-{mod}", bg=CAL_BG, fg_lines=CAL_FG)); uses(f"calendar-{mod}", f"badge-{mod}")
DAY = (5.75, 12, 1.375)
ship("calendar-date", CALENDAR, dots=[DAY], duo=duo_svg(CAL_BG, fg_lines=CAL_FG, fg_dots=[(DAY[0], DAY[1], 1.5)]))

# ---------- bags and cases ----------
BAG = box(2.75, 5.75, 15.25, 16.25)
BAG_HANDLE = "M6.25 8.25L6.25 4.5A2.75 2.75 0 0 1 11.75 4.5L11.75 8.25"
BAG_HANDLE_DOWN = "M6.25 5.75L6.25 7.25A2.75 2.75 0 0 0 11.75 7.25L11.75 5.75"
explore("bag-shopping", [("handle runs into the bag", line_svg([BAG, BAG_HANDLE])),
                         ("handle sits on the top edge", line_svg([BAG, "M6.25 5.75L6.25 4.5A2.75 2.75 0 0 1 11.75 4.5L11.75 5.75"]))],
        picked=0)
ship("bag-shopping", [BAG, BAG_HANDLE], duo=duo_svg(sil(BAG), fg_lines=[BAG_HANDLE]),
     op=[BAG, BAG_HANDLE_DOWN], duo_op=duo_svg(sil(BAG), fg_lines=[BAG_HANDLE_DOWN]))

CART_BASKET = poly((3.75, 4.75), (16.25, 4.75), (16.25, 6.25), (13.5, 9), (3.75, 9))
CART_FRAME = pl((1.75, 2.5), (3.75, 2.5), (3.75, 11.75), (14.25, 11.75))
CART_WHEELS = [(5.75, 15.25, 1.375), (12.25, 15.25, 1.375)]
CART_ITEM = "M7.25 4.75L7.25 3.25A1.5 1.5 0 0 1 8.75 1.75L11.75 1.75A1.5 1.5 0 0 1 13.25 3.25L13.25 4.75"
explore("cart", [("slanted front, rail and two wheels", line_svg([CART_BASKET, CART_FRAME], CART_WHEELS)),
                 ("wire basket", line_svg([CART_BASKET, CART_FRAME, "M7.75 4.75L7.75 9M11.25 4.75L11.25 9"], CART_WHEELS))],
        picked=0)
ship("cart", [CART_BASKET, CART_FRAME], CART_WHEELS,
     duo=duo_svg(sil(CART_BASKET), fg_lines=[CART_FRAME], fg_dots=[(x, y, 1.5) for x, y, _ in CART_WHEELS]),
     op=[CART_BASKET, CART_FRAME, CART_ITEM], op_dots=CART_WHEELS,
     duo_op=duo_svg(sil(CART_BASKET), fg_lines=[CART_FRAME, CART_ITEM], fg_dots=[(x, y, 1.5) for x, y, _ in CART_WHEELS]))

HANDBAG = shape([(5, 5.75), (13, 5.75), (16.25, 9), (16.25, 16.25), (1.75, 16.25), (1.75, 9)], [0, 0, 0, R, R, 0])
HANDBAG_HANDLE = "M5 5.75A4 4 0 0 1 13 5.75"
HANDBAG_OPEN = shape([(5, 5.75), (9, 9.75), (13, 5.75), (16.25, 9), (16.25, 16.25), (1.75, 16.25), (1.75, 9)], [0, 0, 0, 0, R, R, 0])
explore("handbag", [("45° shoulders, loop handle", line_svg([HANDBAG, HANDBAG_HANDLE])),
                    ("box body, loop handle", line_svg([box(1.75, 6.5, 16.25, 16.25), "M5 6.5A4 4 0 0 1 13 6.5"]))],
        picked=0)
ship("handbag", [HANDBAG, HANDBAG_HANDLE], duo=duo_svg(sil(HANDBAG), fg_lines=[HANDBAG_HANDLE]),
     op=[HANDBAG_OPEN, HANDBAG_HANDLE], duo_op=duo_svg(sil(HANDBAG_OPEN), fg_lines=[HANDBAG_HANDLE]))

PACK = box(3, 4.75, 15, 16.25)
PACK_HANDLE = "M6.75 4.75L6.75 4A2.25 2.25 0 0 1 11.25 4L11.25 4.75"
PACK_POCKET = "M6.5 16.25L6.5 12.25A1.5 1.5 0 0 1 8 10.75L10 10.75A1.5 1.5 0 0 1 11.5 12.25L11.5 16.25"
PACK_DOME = "M3 7.75A6 6 0 0 1 15 7.75L15 14.75A1.5 1.5 0 0 1 13.5 16.25L4.5 16.25A1.5 1.5 0 0 1 3 14.75Z"
PACK_OPEN = shape([(3, 7.25), (5.5, 4.75), (12.5, 4.75), (15, 7.25), (15, 16.25), (3, 16.25)], [0, 0, 0, 0, R, R])
PACK_LIP = "M3 7.25L15 7.25"
PACK_STRAPS = "M6.75 7.25L6.75 4A2.25 2.25 0 0 1 11.25 4L11.25 7.25"
explore("backpack", [("box body, loop handle, pocket", line_svg([PACK, PACK_HANDLE, PACK_POCKET])),
                     ("domed top, pocket", line_svg([PACK_DOME, PACK_POCKET]))], picked=0)
ship("backpack", [PACK, PACK_HANDLE, PACK_POCKET], duo=duo_svg(sil(PACK), fg_lines=[PACK_HANDLE, PACK_POCKET]),
     op=[PACK_OPEN, PACK_LIP, PACK_STRAPS, PACK_POCKET],
     duo_op=duo_svg(sil(PACK_OPEN), fg_lines=[PACK_LIP, PACK_STRAPS, PACK_POCKET]))

CASE = box(1.75, 5.5, 16.25, 15.5)
CASE_HANDLE = "M6.5 5.5L6.5 4A1.5 1.5 0 0 1 8 2.5L10 2.5A1.5 1.5 0 0 1 11.5 4L11.5 5.5"
CASE_SEAM = "M1.75 9.5L16.25 9.5"
CASE_TRAY = box(1.75, 11.5, 16.25, 16.25, 0, 0)
CASE_LID = box(1.75, 4.75, 16.25, 8, R, R, 0, 0)
CASE_LID_HANDLE = "M6.5 4.75L6.5 3.25A1.5 1.5 0 0 1 8 1.75L10 1.75A1.5 1.5 0 0 1 11.5 3.25L11.5 4.75"
explore("briefcase", [("belt seam", line_svg([CASE, CASE_HANDLE, CASE_SEAM])),
                      ("two straps", line_svg([CASE, CASE_HANDLE, "M5.25 5.5L5.25 15.5M12.75 5.5L12.75 15.5"]))], picked=0)
ship("briefcase", [CASE, CASE_HANDLE, CASE_SEAM], duo=duo_svg(sil(CASE), fg_lines=[CASE_HANDLE, CASE_SEAM]),
     op=[CASE_TRAY, CASE_LID, CASE_LID_HANDLE],
     duo_op=duo_svg(sil(CASE_TRAY) + sil(CASE_LID), fg_lines=[CASE_LID_HANDLE]))

TRUNK = box(3.75, 4.5, 14.25, 14.75)
TRUNK_HANDLE = "M7 4.5L7 3.25A1.5 1.5 0 0 1 8.5 1.75L9.5 1.75A1.5 1.5 0 0 1 11 3.25L11 4.5"
TRUNK_RIBS = "M7.25 7.75L7.25 11.5M10.75 7.75L10.75 11.5"
TRUNK_LEGS = "M6 14.75L6 16.25M12 14.75L12 16.25"
TRUNK_OPEN = box(3.75, 7.25, 14.25, 14.75)
TRUNK_POLE = "M7.25 7.25L7.25 3.5A1.75 1.75 0 0 1 10.75 3.5L10.75 7.25"
TRUNK_RIBS_OPEN = "M7.25 7.25L7.25 11.75M10.75 7.25L10.75 11.75"
explore("suitcase", [("upright, two ribs, legs", line_svg([TRUNK, TRUNK_HANDLE, TRUNK_RIBS, TRUNK_LEGS])),
                     ("lying wide, two ribs", line_svg([CASE, CASE_HANDLE, "M5.75 5.5L5.75 15.5M12.25 5.5L12.25 15.5"]))], picked=0)
ship("suitcase", [TRUNK, TRUNK_HANDLE, TRUNK_RIBS, TRUNK_LEGS],
     duo=duo_svg(sil(TRUNK), fg_lines=[TRUNK_HANDLE, TRUNK_RIBS, TRUNK_LEGS]),
     op=[TRUNK_OPEN, TRUNK_POLE, TRUNK_RIBS_OPEN, TRUNK_LEGS],
     duo_op=duo_svg(sil(TRUNK_OPEN), fg_lines=[TRUNK_POLE, TRUNK_RIBS_OPEN, TRUNK_LEGS]))

WALLET = BOX
WALLET_TAB = "M16.25 7.25L13.25 7.25A1.5 1.5 0 0 0 11.75 8.75L11.75 9.25A1.5 1.5 0 0 0 13.25 10.75L16.25 10.75"
WALLET_OPEN = box(1.75, 6, 16.25, 15.5)
WALLET_TAB_OPEN = "M16.25 9L13.25 9A1.5 1.5 0 0 0 11.75 10.5L11.75 11A1.5 1.5 0 0 0 13.25 12.5L16.25 12.5"
WALLET_CARD = "M4.25 6L4.25 4A1.5 1.5 0 0 1 5.75 2.5L11.25 2.5A1.5 1.5 0 0 1 12.75 4L12.75 6"
explore("wallet", [("clasp tab", line_svg([WALLET, WALLET_TAB])),
                   ("taller tab with a stud", line_svg([WALLET, "M16.25 6.75L13.25 6.75A1.5 1.5 0 0 0 11.75 8.25L11.75 9.75A1.5 1.5 0 0 0 13.25 11.25L16.25 11.25"], [(14.125, 9, 1.375)]))],
        picked=0)
ship("wallet", [WALLET, WALLET_TAB], duo=duo_svg(sil(WALLET), fg_lines=[WALLET_TAB]),
     op=[WALLET_OPEN, WALLET_TAB_OPEN, WALLET_CARD], duo_op=duo_svg(sil(WALLET_OPEN), fg_lines=[WALLET_TAB_OPEN, WALLET_CARD]))

CARD = box(1.75, 3.5, 16.25, 14.5)
CARD_STRIPE = "M1.75 7L16.25 7"
CARD_NUM = "M5 11L8.5 11"
CARD_FRONT = box(1.75, 6, 12.75, 15.5)
CARD_FRONT_STRIPE = "M1.75 9.5L12.75 9.5"
CARD_BACK = "M5.25 6L5.25 4A1.5 1.5 0 0 1 6.75 2.5L14.75 2.5A1.5 1.5 0 0 1 16.25 4L16.25 10.5A1.5 1.5 0 0 1 14.75 12L12.75 12"
explore("credit-card", [("stripe and number", line_svg([CARD, CARD_STRIPE, CARD_NUM])),
                        ("stripe only", line_svg([CARD, "M1.75 7.5L16.25 7.5"]))], picked=0)
ship("credit-card", [CARD, CARD_STRIPE, CARD_NUM], duo=duo_svg(sil(CARD), fg_lines=[CARD_STRIPE, CARD_NUM]),
     op=[CARD_FRONT, CARD_FRONT_STRIPE, CARD_BACK], duo_op=duo_svg(sil(CARD_FRONT), fg_lines=[CARD_FRONT_STRIPE, CARD_BACK]))

# ---------- money and tickets ----------
COIN_F, COIN_B, COIN_R = (6.75, 11.25), (11.25, 6.75), 5
COIN_FRONT = circle_d(COIN_F, COIN_R)
COIN_BACK = trim_round([circle_d(COIN_B, COIN_R)], COIN_F, COIN_R + 3.4)
COIN_SLOT = "M6.75 9.25L6.75 13.25"
COINS_OPEN = [circle_d((5.25, 12.75), 3.5), circle_d((12.75, 5.25), 3.5)]
COIN_FACES = [(5.25, 12.75, 1.375), (12.75, 5.25, 1.375)]
explore("coins", [("two coins, back one cut clear", line_svg([COIN_FRONT, *COIN_BACK, COIN_SLOT])),
                  ("one coin", line_svg([ring(), "M9 6L9 12"]))], picked=0)
ship("coins", [COIN_FRONT, *COIN_BACK, COIN_SLOT],
     duo=duo_svg([silhouette(COIN_FRONT)] + cut_round(silhouette(circle_d(COIN_B, COIN_R)), COIN_F, COIN_R + O + 1), fg_lines=[COIN_SLOT]),
     op=COINS_OPEN, op_dots=COIN_FACES,
     duo_op=duo_svg(sil(*COINS_OPEN), fg_dots=[(x, y, 1.5) for x, y, _ in COIN_FACES]))

def ticket(x0, x1, notch_l=True, notch_r=True, rl=R, rr=R, nr=1.5):
    a, b = 9 - nr, 9 + nr
    d = f"M{f(x0 + rl)} 3.5L{f(x1 - rr)} 3.5"
    d += f"A{f(rr)} {f(rr)} 0 0 1 {f(x1)} {f(3.5 + rr)}" if rr else ""
    d += f"L{f(x1)} {f(a)}A{f(nr)} {f(nr)} 0 0 0 {f(x1)} {f(b)}" if notch_r else ""
    d += f"L{f(x1)} {f(14.5 - rr)}" + (f"A{f(rr)} {f(rr)} 0 0 1 {f(x1 - rr)} 14.5" if rr else "")
    d += f"L{f(x0 + rl)} 14.5" + (f"A{f(rl)} {f(rl)} 0 0 1 {f(x0)} {f(14.5 - rl)}" if rl else "")
    d += f"L{f(x0)} {f(b)}A{f(nr)} {f(nr)} 0 0 0 {f(x0)} {f(a)}" if notch_l else ""
    d += f"L{f(x0)} {f(3.5 + rl)}" + (f"A{f(rl)} {f(rl)} 0 0 1 {f(x0 + rl)} 3.5" if rl else "")
    return d + "Z"

TICKET = ticket(1.75, 16.25)
TICKET_PERF = "M12.25 3.5L12.25 14.5"
TICKET_OPEN = [ticket(1.75, 8.75, rr=0, notch_r=False), ticket(12.25, 16.25, rl=0, notch_l=False)]
explore("ticket", [("side notches, full tear line", line_svg([TICKET, TICKET_PERF])),
                   ("side notches, two perforation dashes", line_svg([TICKET, "M12.25 5.75L12.25 7.25M12.25 10.75L12.25 12.25"])),
                   ("side notches, three short dashes", line_svg([TICKET, "M12.25 5.5L12.25 6.5M12.25 8.5L12.25 9.5M12.25 11.5L12.25 12.5"]))],
        picked=0)
ship("ticket", [TICKET, TICKET_PERF], duo=duo_svg(sil(TICKET), fg_lines=[TICKET_PERF]), op=TICKET_OPEN)

# ---------- jewelry and beauty ----------
_dome = (7.25 ** 2 + 4.5 ** 2) / 9
RBOX = (f"M1.75 8.75A{f(_dome)} {f(_dome)} 0 0 1 16.25 8.75L16.25 13.75A1.5 1.5 0 0 1 14.75 15.25"
        "L3.25 15.25A1.5 1.5 0 0 1 1.75 13.75Z")
RBOX_SEAM = "M1.75 8.75L16.25 8.75"
RBOX_OPEN = box(1.75, 1.75, 16.25, 16.25)
RBOX_FRONT = "M1.75 11.5L16.25 11.5"
RBOX_RING = ["M7 11A2.5 2.5 0 1 1 11 11"]
RBOX_GEM = (9, 5.75, 1.375)
explore("ring-box", [("domed lid, seam", line_svg([RBOX, RBOX_SEAM])),
                     ("flat lid, seam", line_svg([box(1.75, 4.75, 16.25, 15.25), "M1.75 8.25L16.25 8.25"])),
                     ("cube, lid seam", line_svg([box(2.5, 2.5, 15.5, 15.5), "M2.5 6.5L15.5 6.5"]))], picked=0)
ship("ring-box", [RBOX, RBOX_SEAM], duo=duo_svg(sil(RBOX), fg_lines=[RBOX_SEAM]),
     op=[RBOX_OPEN, RBOX_FRONT, *RBOX_RING], op_dots=[RBOX_GEM],
     duo_op=duo_svg(sil(RBOX_OPEN), fg_lines=[RBOX_FRONT, *RBOX_RING], fg_dots=[(9, 5.75, 1.5)]))

DIAMOND = poly((9, 2), (16, 9), (9, 16), (2, 9))
GEM = poly((5, 4.25), (13, 4.25), (16.25, 7.5), (9, 14.75), (1.75, 7.5))
explore("diamond", [("rhombus", line_svg([DIAMOND])),
                    ("cut gem with girdle", line_svg([GEM, "M1.75 7.5L16.25 7.5"]))], picked=0)
ship("diamond", [DIAMOND], op=[DIAMOND], op_dots=[(9, 9, 1.375)])

LIP = shape([(5.75, 1.75), (12.25, 1.75), (12.25, 10.25), (13.25, 10.25), (13.25, 16.25), (4.75, 16.25), (4.75, 10.25), (5.75, 10.25)],
            [R, R, 0, 0, R, R, 0, 0])
LIP_SEAM = "M4.75 10.25L13.25 10.25"
LIP_OPEN = shape([(6.25, 5.75), (10.25, 1.75), (11.75, 1.75), (11.75, 10.25), (13.25, 10.25), (13.25, 16.25), (4.75, 16.25),
                  (4.75, 10.25), (6.25, 10.25)], [0, 0, 0, 0, 0, R, R, 0, 0])
explore("lipstick", [("cap on a wider base", line_svg([LIP, LIP_SEAM])),
                     ("one tube with a seam", line_svg([box(5.25, 1.75, 12.75, 16.25), "M5.25 10.25L12.75 10.25"]))], picked=0)
ship("lipstick", [LIP, LIP_SEAM], duo=duo_svg(sil(LIP), fg_lines=[LIP_SEAM]),
     op=[LIP_OPEN, LIP_SEAM], duo_op=duo_svg(sil(LIP_OPEN), fg_lines=[LIP_SEAM]))

BOTTLE = box(2.75, 7.25, 15.25, 16.25)
BOTTLE_CAP = box(6.25, 1.75, 11.75, 4.75)
BOTTLE_NECK = "M7.25 4.75L7.25 7.25M10.75 4.75L10.75 7.25"
BOTTLE_O = box(1.75, 7.25, 12.25, 16.25)
BOTTLE_O_CAP = box(4.25, 1.75, 9.75, 4.75)
BOTTLE_O_NECK = "M5.25 4.75L5.25 7.25M8.75 4.75L8.75 7.25"
MIST = [(13.25, 2.625, 1.375), (15.375, 5.5, 1.375)]
explore("perfume", [("square bottle, neck, cap", line_svg([BOTTLE, BOTTLE_CAP, BOTTLE_NECK])),
                    ("square bottle, cap on the shoulder", line_svg([box(3.25, 6.75, 14.75, 16.25), "M6.25 6.75L6.25 3.25A1.5 1.5 0 0 1 7.75 1.75L10.25 1.75A1.5 1.5 0 0 1 11.75 3.25L11.75 6.75"])),
                    ("round bottle, cap", line_svg([circle_d((9, 10.75), 5.5), "M6.75 5.75L6.75 3.25A1.5 1.5 0 0 1 8.25 1.75L9.75 1.75A1.5 1.5 0 0 1 11.25 3.25L11.25 5.75"]))],
        picked=0)
ship("perfume", [BOTTLE, BOTTLE_CAP, BOTTLE_NECK], duo=duo_svg(sil(BOTTLE, BOTTLE_CAP), fg_lines=[BOTTLE_NECK]),
     op=[BOTTLE_O, BOTTLE_O_CAP, BOTTLE_O_NECK], op_dots=MIST,
     duo_op=duo_svg(sil(BOTTLE_O, BOTTLE_O_CAP), fg_lines=[BOTTLE_O_NECK], fg_dots=[(x, y, 1.5) for x, y, _ in MIST]))

def specs(cy, temples=False):
    lens = [circle_d((4.875, cy), 3), circle_d((13.125, cy), 3)]
    bridge = f"M7.875 {f(cy)}L10.125 {f(cy)}"
    arms = [f"M1.875 {f(cy)}L1.875 {f(cy - 6)}M16.125 {f(cy)}L16.125 {f(cy - 6)}"] if temples else []
    return lens, bridge, arms

GL_LENS, GL_BRIDGE, _ = specs(9.75)
GO_LENS, GO_BRIDGE, GO_ARMS = specs(11.75, True)
explore("glasses", [("round lenses, straight bridge", line_svg(GL_LENS + [GL_BRIDGE])),
                    ("square lenses, flat bridge", line_svg([box(1.75, 6.5, 7.75, 12.5), box(10.25, 6.5, 16.25, 12.5), "M7.75 8.25L10.25 8.25"]))],
        picked=0)
ship("glasses", GL_LENS + [GL_BRIDGE], duo=duo_svg(sil(*GL_LENS), fg_lines=[GL_BRIDGE]),
     op=GO_LENS + [GO_BRIDGE] + GO_ARMS, duo_op=duo_svg(sil(*GO_LENS), fg_lines=[GO_BRIDGE] + GO_ARMS))

# ---------- clothes ----------
def jacket(n):
    """Sloped shoulders and stepped cuffs around a V neck n wide on each side of x 9."""
    return shape([(9 - n, 1.75), (9, 1.75 + n), (9 + n, 1.75), (13, 1.75), (16.25, 5), (16.25, 14.25), (13.25, 14.25),
                  (13.25, 16.25), (4.75, 16.25), (4.75, 14.25), (1.75, 14.25), (1.75, 5), (5, 1.75)],
                 [0, 0, 0, 0, 0, R, 0, R, R, 0, R, 0, 0])

JACKET = jacket(1.75)
JACKET_FRONT = "M9 3.5L9 16.25"
JACKET_SEAMS = "M4.75 8.25L4.75 14.25M13.25 8.25L13.25 14.25"
JACKET_L = shape([(1.75, 5), (5, 1.75), (7.25, 1.75), (7.25, 16.25), (4.75, 16.25), (4.75, 14.25), (1.75, 14.25)],
                 [0, 0, 0, 0, R, 0, R])
JACKET_R = shape([(10.75, 1.75), (13, 1.75), (16.25, 5), (16.25, 14.25), (13.25, 14.25), (13.25, 16.25), (10.75, 16.25)],
                 [0, 0, 0, R, 0, R, 0])
explore("jacket", [("shallow V neck, front line, sleeve seams", line_svg([JACKET, JACKET_FRONT, JACKET_SEAMS])),
                   ("shallow V neck, sleeve seams, no front line", line_svg([JACKET, JACKET_SEAMS])),
                   ("shallow V neck, front line, no sleeve seams", line_svg([JACKET, JACKET_FRONT]))],
        picked=0)
ship("jacket", [JACKET, JACKET_FRONT, JACKET_SEAMS], duo=duo_svg(sil(JACKET), fg_lines=[JACKET_FRONT, JACKET_SEAMS]),
     op=[JACKET_L, JACKET_R])

SHOE = ("M1.75 3.75L6.25 3.75L11.25 8.75L13.75 8.75A2.5 2.5 0 0 1 16.25 11.25"
        "L16.25 14.75A1.5 1.5 0 0 1 14.75 16.25L3.25 16.25A1.5 1.5 0 0 1 1.75 14.75Z")
SHOE_SOLE = "M1.75 12.75L16.25 12.75"
SHOE_LACES = "M7.75 5.25L6.25 6.75M10.25 7.75L8.75 9.25"
SHOE_LOOSE = "M7.75 5.25L9.75 3.25M10.25 7.75L12.25 5.75"
explore("sneaker", [("sole line, two laces", line_svg([SHOE, SHOE_SOLE, SHOE_LACES])),
                    ("sole line only", line_svg([SHOE, SHOE_SOLE]))], picked=0)
ship("sneaker", [SHOE, SHOE_SOLE, SHOE_LACES], duo=duo_svg(sil(SHOE), fg_lines=[SHOE_SOLE, SHOE_LACES]),
     op=[SHOE, SHOE_SOLE, SHOE_LOOSE], duo_op=duo_svg(sil(SHOE), fg_lines=[SHOE_SOLE, SHOE_LOOSE]))

# ---------- weather, school, gym ----------
def canopy(cy, r):
    """A dome over a rim of three scallops, each a third of the rim wide and 1 deep."""
    w = 2 * r / 3; sr = (w * w / 4 + 1) / 2
    x0 = 9 - r
    rim = "".join(f"A{f(sr)} {f(sr)} 0 0 1 {f(x0 + w * (3 - k - 1))} {f(cy)}" for k in range(3))
    return f"M{f(x0)} {f(cy)}A{f(r)} {f(r)} 0 0 1 {f(9 + r)} {f(cy)}" + rim + "Z"

CANOPY = canopy(10, 6)
HOOK = "M9 11L9 14.5A1.75 1.75 0 0 1 5.5 14.5"
CANOPY_RAIN = canopy(10.625, 4.5)
HOOK_RAIN = "M9 11.625L9 15A1.25 1.25 0 0 1 6.5 15"
RAIN = [(5.5, 2.625, 1.375), (9, 2.625, 1.375), (12.5, 2.625, 1.375)]
RAIN_DUO = [(x, y, 1.5) for x, y, _ in RAIN]
FURLED = poly((14.75, 3.25), (14.75, 5.75), (9.25, 11.25), (6.75, 11.25), (6.75, 8.75), (12.25, 3.25))
HOOK_FURLED = "M6.75 11.25L4.75 13.25A1.768 1.768 0 0 0 7.25 15.75"
explore("umbrella", [("open canopy, hook handle", line_svg([CANOPY, HOOK])),
                     ("furled on 45°, tip, hook handle", line_svg([FURLED, "M14.75 3.25L16.25 1.75", HOOK_FURLED])),
                     ("wide furled on 45°, tip, hook handle",
                      line_svg([poly((14.25, 3.75), (14.25, 7), (10, 11.25), (6.75, 11.25), (6.75, 8), (11, 3.75)),
                                "M14.25 3.75L16.25 1.75", HOOK_FURLED]))], picked=0)
ship("umbrella", [CANOPY, HOOK], duo=duo_svg(sil(CANOPY), fg_lines=[HOOK]),
     op=[CANOPY_RAIN, HOOK_RAIN], op_dots=RAIN, duo_op=duo_svg(sil(CANOPY_RAIN), fg_lines=[HOOK_RAIN], fg_dots=RAIN_DUO))

def hexboard(y, d):
    return poly((1.75, y), (1.75 + d, y - d), (16.25 - d, y - d), (16.25, y), (16.25 - d, y + d), (1.75 + d, y + d))

MORTAR = hexboard(6.5, 2.25)
GRAD_CAP = "M5.25 8.75L5.25 11.25A4.0625 4.0625 0 0 0 12.75 11.25L12.75 8.75"
TASSEL = "M16.25 6.5L16.25 11"
MORTAR_UP = hexboard(4, 2.25)
GRAD_CAP_OPEN = "M5.25 9.75L12.75 9.75L12.75 12.25A4.0625 4.0625 0 0 1 5.25 12.25Z"
TASSEL_UP = "M16.25 4L16.25 8.5"
explore("graduation-cap", [("thin hexagon board on 45°, short rounded crown, tassel", line_svg([MORTAR, GRAD_CAP, TASSEL])),
                           ("thicker hexagon board, tall rounded crown, tassel",
                            line_svg([hexboard(5.75, 3), "M5.25 8.75L5.25 13.25A4.0625 4.0625 0 0 0 12.75 13.25L12.75 8.75", "M16.25 5.75L16.25 10.25"])),
                           ("board seen edge on, rounded crown",
                            line_svg([rect(1.75, 4.75, 16.25, 7.25, 0), "M5.25 7.25L5.25 11.75A4.0625 4.0625 0 0 0 12.75 11.75L12.75 7.25"]))],
        picked=0)
ship("graduation-cap", [MORTAR, GRAD_CAP, TASSEL], duo=duo_svg(sil(MORTAR), fg_lines=[GRAD_CAP, TASSEL]),
     op=[MORTAR_UP, GRAD_CAP_OPEN, TASSEL_UP], duo_op=duo_svg(sil(MORTAR_UP, GRAD_CAP_OPEN), fg_lines=[TASSEL_UP]))

PLATES = [box(3.75, 3.75, 7.25, 14.25), box(10.75, 3.75, 14.25, 14.25)]
BAR = "M7.25 9L10.75 9M1.75 9L3.75 9M14.25 9L16.25 9"

def plate45(p, a=1.25, b=3.75):
    x, y = p
    return shape([(x + a - b, y - a - b), (x + a + b, y - a + b), (x - a + b, y + a + b), (x - a - b, y + a - b)], [R] * 4)

PLATES_UP = [plate45((6.5, 11.5)), plate45((11.5, 6.5))]
BAR_UP = "M7.75 10.25L10.25 7.75M5.25 12.75L3.75 14.25M12.75 5.25L14.25 3.75"
explore("dumbbell", [("one plate a side, end stubs", line_svg(PLATES + [BAR])),
                     ("wide plates, no stubs", line_svg([box(1.75, 3.75, 5.25, 14.25), box(12.75, 3.75, 16.25, 14.25), "M5.25 9L12.75 9"]))],
        picked=0)
ship("dumbbell", PLATES + [BAR], duo=duo_svg(sil(*PLATES), fg_lines=[BAR]),
     op=PLATES_UP + [BAR_UP], duo_op=duo_svg(sil(*PLATES_UP), fg_lines=[BAR_UP]))

# ---------- talk ----------
def bubble(c, r, corner="bl"):
    x, y = c
    if corner == "bl":
        return f"M{f(x - r)} {f(y)}A{f(r)} {f(r)} 0 1 1 {f(x)} {f(y + r)}L{f(x - r)} {f(y + r)}Z"
    return f"M{f(x)} {f(y + r)}A{f(r)} {f(r)} 0 1 1 {f(x + r)} {f(y)}L{f(x + r)} {f(y + r)}Z"

BUBBLE = bubble((9, 9), 7.25)
BUBBLE_BOX = shape([(1.75, 2.5), (16.25, 2.5), (16.25, 13.25), (8.25, 13.25), (5.25, 16.25), (2.25, 13.25), (1.75, 13.25)],
                   [R, R, R, 0, 0, 0, 0])
FRONT_C, BACK_C, BR = (6.25, 11.75), (11.75, 6.25), 4.5
BUBBLES = [bubble(FRONT_C, BR), *trim_round([bubble(BACK_C, BR, "br")], FRONT_C, BR + 3.4)]
explore("chat-bubble", [("round, one square corner", line_svg([BUBBLE])),
                        ("box with a pointed tail", line_svg([BUBBLE_BOX]))], picked=0)
ship("chat-bubble", [BUBBLE], op=BUBBLES)

# ---------- places ----------
FLAG = "M2.5 16.25L2.5 2.5L16.25 2.5L16.25 4L13.5 6.75L16.25 9.5L16.25 11L2.5 11"
FLAG_CLOTH = poly((2.5, 2.5), (16.25, 2.5), (16.25, 4), (13.5, 6.75), (16.25, 9.5), (16.25, 11), (2.5, 11))
FLAG_POLE = "M2.5 2.5L2.5 16.25"

def wave(x0, y0, x1, y1):
    """An S of two equal arcs from (x0, y0) to (x1, y1), level at both ends."""
    hx, hy = (x1 - x0) / 2, (y1 - y0) / 2
    chord = math.hypot(hx, hy); r = chord * chord / (2 * abs(hy))
    s1, s2 = (0, 1) if y1 < y0 else (1, 0)
    return (f"A{f(r)} {f(r)} 0 0 {s1} {f(x0 + hx)} {f(y0 + hy)}"
            f"A{f(r)} {f(r)} 0 0 {s2} {f(x1)} {f(y1)}")

FLAG_WAVE = f"M2.5 16.25L2.5 4.75{wave(2.5, 4.75, 16.25, 1.75)}L16.25 9.75{wave(16.25, 9.75, 2.5, 12.75)}"
FLAG_WAVE_CLOTH = f"M2.5 4.75{wave(2.5, 4.75, 16.25, 1.75)}L16.25 9.75{wave(16.25, 9.75, 2.5, 12.75)}Z"
explore("flag", [("swallowtail notch", line_svg([FLAG])),
                 ("plain cloth", line_svg(["M2.5 16.25L2.5 2.5L14.75 2.5A1.5 1.5 0 0 1 16.25 4L16.25 9.5A1.5 1.5 0 0 1 14.75 11L2.5 11"]))],
        picked=0)
ship("flag", [FLAG], duo=duo_svg(sil(FLAG_CLOTH), fg_lines=[FLAG_POLE]),
     op=[FLAG_WAVE.replace("M2.5 16.25L", "M"), "M2.5 4.75L2.5 16.25"], duo_op=duo_svg(sil(FLAG_WAVE_CLOTH), fg_lines=["M2.5 4.75L2.5 16.25"]))

def pin(cx, cy, r):
    q = r / S2
    return f"M{f(cx + q)} {f(cy + q)}A{f(r)} {f(r)} 0 1 0 {f(cx - q)} {f(cy + q)}L{f(cx)} {f(cy + r * S2)}Z"

PIN = pin(9, 7.5, 5.75)
PIN_HOLE = circle_d((9, 7.5), 2.25)
PIN_DOT = (9, 7.5, 1.375)
PIN_O = pin(9, 6.25, 4.5)
PIN_O_DOT = (9, 6.25, 1.375)
GROUND = "M2.5 16.25L15.5 16.25"
explore("location", [("ring inside", line_svg([PIN, PIN_HOLE])),
                     ("dot inside", line_svg([PIN], [PIN_DOT]))], picked=0)
ship("location", [PIN, PIN_HOLE], duo=duo_svg(sil(PIN), fg_lines=[PIN_HOLE]),
     op=[PIN_O, GROUND], op_dots=[PIN_O_DOT],
     duo_op=duo_svg(sil(PIN_O), fg_lines=[GROUND], fg_dots=[(9, 6.25, 1.5)]))

TACK = shape([(6.25, 1.75), (11.75, 1.75), (11.75, 6), (14.25, 8.5), (14.25, 11), (3.75, 11), (3.75, 8.5), (6.25, 6)],
             [R, R, 0, 0, R, R, 0, 0])
NEEDLE = "M9 11L9 16.25"
explore("pin-tack", [("flared head, needle", line_svg([TACK, NEEDLE])),
                     ("straight head, flange, needle", line_svg([box(6.25, 1.75, 11.75, 9.5, R, R, 0, 0), "M3.75 9.5L14.25 9.5", NEEDLE.replace("11L", "9.5L")]))],
        picked=0)
ship("pin-tack", [TACK, NEEDLE], duo=duo_svg(sil(TACK), fg_lines=[NEEDLE]))

MAP = shape([(1.75, 2.5), (6.5, 2.5), (6.5, 3.75), (11.5, 3.75), (11.5, 2.5), (16.25, 2.5), (16.25, 14.25), (11.5, 14.25),
             (11.5, 15.5), (6.5, 15.5), (6.5, 14.25), (1.75, 14.25)], [R, 0, 0, 0, 0, R, R, 0, 0, 0, 0, R])
MAP_FOLDS = "M6.5 3.75L6.5 14.25M11.5 3.75L11.5 14.25"
MAP_PIN = pin(9, 8.5, 2.5)
explore("map", [("middle panel stepped down", line_svg([MAP, MAP_FOLDS])),
                ("flat with two creases", line_svg([BOX, "M6.5 2.5L6.5 15.5M11.5 2.5L11.5 15.5"]))], picked=0)
ship("map", [MAP, MAP_FOLDS], duo=duo_svg(sil(MAP), fg_lines=[MAP_FOLDS]),
     op=[BOX, MAP_PIN], duo_op=duo_svg(sil(BOX), fg_lines=[MAP_PIN]))

def hooks(k=1, q=2.5, e=3.625):
    """Two links on the 45° axis: each an open stadium round its far end, open toward the middle."""
    rho = q * S2; out = []
    for sx in (1, -1):
        E = (9 + sx * e, 9 - sx * e)
        p_in = (9 + sx * k + q, 9 - sx * k + q); p_out = (9 + sx * k - q, 9 - sx * k - q)
        e1 = (E[0] + q, E[1] + q); e2 = (E[0] - q, E[1] - q)
        if sx == 1:
            out.append(f"M{pt(p_in)}L{pt(e1)}A{f(rho)} {f(rho)} 0 0 0 {pt(e2)}L{pt(p_out)}")
        else:
            out.append(f"M{pt(p_out)}L{pt(e2)}A{f(rho)} {f(rho)} 0 0 0 {pt(e1)}L{pt(p_in)}")
    return out

def capsule(e0, e1, rho):
    """A closed stadium between end centres e0 (lower left) and e1 (upper right) on the 45° axis."""
    q = rho / S2
    a, b2 = (e0[0] - q, e0[1] - q), (e1[0] - q, e1[1] - q)
    c, d = (e1[0] + q, e1[1] + q), (e0[0] + q, e0[1] + q)
    return f"M{pt(a)}L{pt(b2)}A{f(rho)} {f(rho)} 0 0 1 {pt(c)}L{pt(d)}A{f(rho)} {f(rho)} 0 0 1 {pt(a)}Z"

LINK = hooks() + ["M5.5 12.5L12.5 5.5"]
explore("link-2", [("two wide hooks and a bar", line_svg(LINK)),
                   ("two closed links crossing", line_svg([capsule((4.5, 13.5), (9.5, 8.5), 2.5), capsule((8.5, 9.5), (13.5, 4.5), 2.5)]))],
        picked=0)
ship("link-2", LINK, op=hooks(k=2))

save_meta("personal")
