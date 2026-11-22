"""Draws the documents family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *
import math, re

R2 = 1 / SQ


def put(name, outline, duo=None, opened=None, duo_opened=None):
    for tag, svg in ((name, outline), (name + " open", opened)):
        if svg: lint(tag, svg); gaps(tag, svg)
    write(name, outline, duo, opened, duo_opened)


def _samples(segs):
    pts = []
    for s in segs:
        n = max(4, math.ceil((s.r * abs(s.a1 - s.a0) if isinstance(s, Arc) else math.dist(s.a, s.b)) / 0.2))
        pts += [s.at(k / n) for k in range(n + 1)]
    return pts


def gaps(name, svg):
    """Prints details closer than 3.4 that do not touch: separate strokes, discs, fills, and two runs of one open stroke.

    @remarks Badges are drawn in neutral.py, so only their distance to the host is skipped here, never checked inside."""
    parts = []
    for tag in re.findall(r"<path[^>]*>", svg):
        for segs, closed in parse(re.search(r'\sd="([^"]+)"', tag).group(1)):
            parts.append((_samples(segs), closed, 'stroke="none"' in tag, 0.0))
    parts += [([(float(x), float(y))], True, False, float(r)) for x, y, r in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', svg)]
    badge = lambda pts: all(p[0] > 10.5 and p[1] > 10.5 for p in pts)
    for i, (a, _, fa, ra) in enumerate(parts):
        for b, _, fb, rb in parts[i + 1:]:
            if badge(a) or badge(b): continue
            d, p, q = min((math.dist(p, q), p, q) for p in a for q in b)
            if (ra or W / 2) + (rb or W / 2) < d < 3.4 - W / 2 * (fa + fb) - 1e-6: print(f"  {name}: gap {d:.3f} between {pt(p)} and {pt(q)}")
    for pts, closed, _, _ in parts:
        if closed or len(pts) < 2 or badge(pts): continue
        run = [0.0]
        for p, q in zip(pts, pts[1:]): run.append(run[-1] + math.dist(p, q))
        hits = [(math.dist(pts[i], pts[j]), i, j) for i in range(len(pts)) for j in range(i + 1, len(pts))
                if run[j] - run[i] > 2 * math.dist(pts[i], pts[j]) + 0.5 and math.dist(pts[i], pts[j]) < 3.4 - 1e-6]
        if hits:
            d, i, j = min(hits); print(f"  {name}: stroke folds back {d:.3f} between {pt(pts[i])} and {pt(pts[j])}")


def filled(svg, *ds):
    """An outline svg with flat filled shapes added, for accents larger than a disc."""
    return svg.replace("</svg>", "".join(f'<path d="{d}" fill="currentColor" stroke="none"/>' for d in ds) + "</svg>")


def sil(verts, radii):
    """The Duo base of a union outline given as a polygon."""
    return silhouette(shape(verts, radii))


def with_glyph(paths, glyph, glyph_dots=(), bg=None, fg=(), fg_lines=()):
    """A host with an unregistered modifier in the badge square: (outline svg, duo svg)."""
    line = line_svg(trim_badge(paths) + list(glyph), list(glyph_dots))
    base = bg if bg is not None else [silhouette(p) for p in paths if silhouette(p)]
    duo = duo_svg(clip_badge(base), fg=fg, fg_lines=trim_badge(list(fg_lines)) + list(glyph),
                  fg_dots=[(x, y, 1.5) for x, y, r in glyph_dots])
    return line, duo


def arc(c, r, a0, a1):
    """An arc path from angle a0 to a1 in degrees (screen coordinates)."""
    p0 = (c[0] + r * math.cos(math.radians(a0)), c[1] + r * math.sin(math.radians(a0)))
    p1 = (c[0] + r * math.cos(math.radians(a1)), c[1] + r * math.sin(math.radians(a1)))
    large = 1 if abs(a1 - a0) > 180 else 0
    sweep = 1 if a1 > a0 else 0
    return f"M{pt(p0)}A{f(r)} {f(r)} 0 {large} {sweep} {pt(p1)}"


# ---------- badge glyphs, drawn inside 10.875 to 16.875 ----------
BC = 13.875
GEAR_R = 1.625
GLYPH_GEAR = [circle_d((BC, BC), GEAR_R)] + [
    f"M{pt((BC + GEAR_R * math.cos(math.radians(a)), BC + GEAR_R * math.sin(math.radians(a))))}"
    f"L{pt((BC + 3 * math.cos(math.radians(a)), BC + 3 * math.sin(math.radians(a))))}" for a in range(0, 360, 45)]

# ---------- folder ----------
uses("folder", "folder")

FOLDER_BACK = shape([(1.75, 2.5), (6.75, 2.5), (8.75, 4.5), (13.25, 4.5), (13.25, 8.5), (16.25, 11.5), (16.25, 15.5), (1.75, 15.5)],
                    [R, 0, 0, R, 0, 0, R, R])
FOLDER_FRONT = "M1.75 8.5L13.25 8.5"
folder_open = line_svg([FOLDER_BACK, FOLDER_FRONT])
explore("folder", [
    ("open: front widens on 45°", folder_open),
    ("open: front chamfered at left", line_svg([FOLDER, "M1.75 12L5.25 8.5L16.25 8.5"])),
    ("open: front lowered, stepped", line_svg([shape([(1.75, 2.5), (6.75, 2.5), (8.75, 4.5), (13.25, 4.5), (13.25, 8.5), (16.25, 8.5), (16.25, 15.5), (1.75, 15.5)],
                                                     [R, 0, 0, R, 0, R, R, R]), FOLDER_FRONT])),
], picked=0)
put("folder", line_svg([FOLDER]), opened=folder_open)

put("folder-plus", *with_badge([FOLDER], "badge-plus"))
uses("folder-plus", "folder", "badge-plus")
put("folder-send", *with_badge([FOLDER], "badge-arrow-right"))
uses("folder-send", "folder", "badge-arrow-right")
put("folder-xmark", *with_badge([FOLDER], "badge-xmark"))
uses("folder-xmark", "folder", "badge-xmark")
put("folder-import", *with_badge([FOLDER], "badge-arrow-down"))
uses("folder-import", "folder", "badge-arrow-down")

for mod in ("ban", "bolt", "pen", "refresh", "search"):
    put(f"folder-{mod}", *with_badge([FOLDER], f"badge-{mod}"))
    uses(f"folder-{mod}", "folder", f"badge-{mod}")

FOLDER_DOTS = [(5.25, 10, 1.375), (9, 10, 1.375), (12.75, 10, 1.375)]
put("folder-dots", line_svg([FOLDER], FOLDER_DOTS),
  duo_svg([silhouette(FOLDER)], fg_dots=[(x, y, 1.5) for x, y, r in FOLDER_DOTS]))
uses("folder-dots", "folder")

ORG = [rect(5.5, 1.75, 12.5, 5.5), "M9 5.5L9 9", "M4.5 12.5L4.5 9L13.5 9L13.5 12.5",
       rect(1.75, 12.5, 7.25, 16.25), rect(10.75, 12.5, 16.25, 16.25)]
PILLS = [rect(1.75, 1.75, 7.75, 4.75), rect(9.75, 6.75, 16.25, 9.75), rect(9.75, 13.25, 16.25, 16.25),
         "M4.75 4.75L4.75 14.75L9.75 14.75", "M4.75 8.25L9.75 8.25"]
explore("folder-tree", [("indented rows, pills", line_svg(PILLS)), ("org chart, boxes", line_svg(ORG))], picked=0)
put("folder-tree", line_svg(PILLS))

# ---------- file ----------
FILE_LINES = "M6.625 11.375L11.375 11.375"
file_open = line_svg([FILE, FOLD, FILE_LINES])
file_duo_open = duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL], fg_lines=[FILE_LINES])
explore("file", [("open: one line of text, clear of the fold", file_open),
                 ("open: two lines, too tight under the fold", line_svg([FILE, FOLD, "M6.5 9.75L11.5 9.75M6.5 13L9.5 13"]))], picked=0)
put("file", line_svg([FILE, FOLD]), duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL]), file_open, file_duo_open)
uses("file", "file")

put("file-export", *with_badge([FILE, FOLD], "badge-arrow-right", fg=[FILE_FOLD_FILL]))
uses("file-export", "file", "badge-arrow-right")

CRACK = "M3.125 11.75L5.5 11.75L7.25 10L9 11.75L10.75 10L12.5 11.75L14.875 11.75"
alert_crack = line_svg([FILE, FOLD, CRACK])
alert_x = with_badge([FILE, FOLD], "badge-xmark", fg=[FILE_FOLD_FILL])
alert_bang = line_svg(trim_badge([FILE, FOLD]) + ["M13.875 10.875L13.875 12.875"], [(13.875, 15.5, 1.375)])
explore("file-alert", [("crack across the page", alert_crack), ("cross badge", alert_x[0]),
                       ("exclamation in the badge square", alert_bang)], picked=0)
put("file-alert", alert_crack, duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL], fg_lines=[CRACK]))
uses("file-alert", "file")
SLIDERS = "M6.625 16.25L6.625 6.25M11.375 16.25L11.375 10"
SLIDER_KNOBS = [(6.625, 9.5, 1.375), (11.375, 12.75, 1.375)]
explore("file-settings", [("two sliders standing on the page", line_svg([FILE, FOLD, SLIDERS], SLIDER_KNOBS)),
                          ("gear in the badge square", with_glyph([FILE, FOLD], GLYPH_GEAR, fg=[FILE_FOLD_FILL])[0]),
                          ("two sliders lying across the page", line_svg([FILE, FOLD, "M3.125 10L14.875 10M3.125 13.5L14.875 13.5"], [(10.5, 10, 1.375), (7.5, 13.5, 1.375)]))],
        picked=0)
put("file-settings", line_svg([FILE, FOLD, SLIDERS], SLIDER_KNOBS),
    duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL], fg_lines=[SLIDERS], fg_dots=[(x, y, 1.5) for x, y, _ in SLIDER_KNOBS]))
uses("file-settings", "file")

ZIP_TRACK = "M6.625 1.75L6.625 8.5"
ZIP_PULL = rect(5.375, 8.5, 7.875, 13, 1.25)
zip_a = filled(line_svg([FILE, FOLD, ZIP_TRACK]), ZIP_PULL)
zip_b = line_svg([FILE, FOLD, "M6.625 1.75L6.625 9.5"], dots=[(6.625, 11, 1.375)])
explore("file-zip", [("track and disc pull", zip_b), ("track and filled pull, too close to the side", zip_a)], picked=0)
put("file-zip", zip_b, duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL], fg_lines=["M6.625 1.75L6.625 9.5"], fg_dots=[(6.625, 11, 1.5)]))
uses("file-zip", "file")

BARS = "M7.25 16.25L7.25 12.75M10.75 16.25L10.75 10"
BARS_B = "M7.25 16.25L7.25 10M10.75 16.25L10.75 12.75"
explore("report-file", [("rising bars standing on the page edge", line_svg([FILE, FOLD, BARS])),
                        ("falling bars standing on the page edge", line_svg([FILE, FOLD, BARS_B])),
                        ("floating bars", line_svg([FILE, FOLD, "M7.25 13.5L7.25 11M10.75 13.5L10.75 9.875"]))], picked=0)
put("report-file", line_svg([FILE, FOLD, BARS]), duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL], fg_lines=[BARS]))
uses("report-file", "file")

PAGE = rect(3.125, 1.75, 14.875, 16.25)
DOC_LINES = "M6.625 5.375L11.375 5.375M6.625 9L11.375 9M6.625 12.625L9.5 12.625"
explore("document", [("three lines, last short", line_svg([PAGE, DOC_LINES])),
                     ("two lines", line_svg([PAGE, "M6.625 7.25L11.375 7.25M6.625 10.75L9.5 10.75"]))], picked=0)
put("document", line_svg([PAGE, DOC_LINES]), duo_svg([silhouette(PAGE)], fg_lines=[DOC_LINES]))

# ---------- archive ----------
LID = rect(1.75, 2.5, 16.25, 6.25)
CRATE = "M3.25 6.25L3.25 14A1.5 1.5 0 0 0 4.75 15.5L13.25 15.5A1.5 1.5 0 0 0 14.75 14L14.75 6.25"
ARCHIVE = [LID, CRATE]
ARCHIVE_BG = [sil([(1.75, 2.5), (16.25, 2.5), (16.25, 6.25), (14.75, 6.25), (14.75, 15.5), (3.25, 15.5), (3.25, 6.25), (1.75, 6.25)],
                  [R, R, R, 0, R, R, 0, R])]
SLOT = "M7.25 9.75L10.75 9.75"
LID_UP = rect(1.75, 1.75, 16.25, 5.5)
CRATE_OPEN = rect(3.25, 9, 14.75, 16.25)
SLOT_OPEN = "M7.25 12.625L10.75 12.625"
archive_open = line_svg([LID_UP, CRATE_OPEN, SLOT_OPEN])
explore("archive", [("open: lid lifted, rim drawn", archive_open),
                    ("open: lid lifted, crate open", line_svg([LID_UP, "M3.25 9L3.25 14.75A1.5 1.5 0 0 0 4.75 16.25L13.25 16.25A1.5 1.5 0 0 0 14.75 14.75L14.75 9", SLOT_OPEN]))],
        picked=0)
LID_SEAM = "M3.25 6.25L14.75 6.25"
put("archive", line_svg(ARCHIVE + [SLOT]), duo_svg(ARCHIVE_BG, fg_lines=[LID_SEAM, SLOT]), archive_open,
  duo_svg([silhouette(LID_UP), silhouette(CRATE_OPEN)], fg_lines=[SLOT_OPEN]))
ARROW_DOWN_IN = "M9 6.25L9 12M7.25 10.25L9 12L10.75 10.25"
ARROW_UP_IN = "M9 15.5L9 9.75M7.25 11.5L9 9.75L10.75 11.5"
explore("archive-download", [("arrow hangs from the lid", line_svg(ARCHIVE + [ARROW_DOWN_IN])),
                             ("short arrow floating in the crate", line_svg(ARCHIVE + ["M9 9.75L9 12M7.25 10.25L9 12L10.75 10.25"]))], picked=0)
explore("archive-export", [("arrow rises from the crate floor", line_svg(ARCHIVE + [ARROW_UP_IN])),
                           ("short arrow floating in the crate", line_svg(ARCHIVE + ["M9 12L9 9.75M7.25 11.5L9 9.75L10.75 11.5"]))], picked=0)
put("archive-download", line_svg(ARCHIVE + [ARROW_DOWN_IN]), duo_svg(ARCHIVE_BG, fg_lines=[LID_SEAM, ARROW_DOWN_IN]))
put("archive-export", line_svg(ARCHIVE + [ARROW_UP_IN]), duo_svg(ARCHIVE_BG, fg_lines=[LID_SEAM, ARROW_UP_IN]))

# ---------- filing cabinet ----------
CABINET = rect(3.5, 1.75, 14.5, 16.25)
DRAWERS = "M3.5 9L14.5 9M7.25 5.375L10.75 5.375M7.25 12.625L10.75 12.625"
CAB_BACK = ("M3.5 5.25L3.5 3.25A1.5 1.5 0 0 1 5 1.75L13 1.75A1.5 1.5 0 0 1 14.5 3.25L14.5 14.75"
            "A1.5 1.5 0 0 1 13 16.25L5 16.25A1.5 1.5 0 0 1 3.5 14.75L3.5 9")
DRAWER_OUT = shape([(1.75, 5.25), (11, 5.25), (11, 9), (1.75, 9)], [R, R, 0, R])
CAB_OPEN_LINES = "M11 9L14.5 9M7.25 12.625L10.75 12.625"
cab_open = line_svg([CAB_BACK, DRAWER_OUT, CAB_OPEN_LINES])
explore("filing-cabinet", [("two drawers, handles", line_svg([CABINET, DRAWERS])),
                           ("three drawers, no handles", line_svg([CABINET, "M3.5 6.5L14.5 6.5M3.5 11.5L14.5 11.5"]))], picked=0)
put("filing-cabinet", line_svg([CABINET, DRAWERS]), duo_svg([silhouette(CABINET)], fg_lines=[DRAWERS]), cab_open,
  duo_svg([sil([(3.5, 1.75), (14.5, 1.75), (14.5, 16.25), (3.5, 16.25), (3.5, 9), (1.75, 9), (1.75, 5.25), (3.5, 5.25)],
               [R, R, R, R, 0, R, R, 0])],
          fg_lines=["M1.75 9L14.5 9M11 9L11 5.25M3.5 5.25L11 5.25", "M7.25 12.625L10.75 12.625"]))

# ---------- inbox ----------
def tray(y):
    """The inbox tray line at height y, dipping 1.75 on 45°."""
    return f"M1.75 {f(y)}L5.25 {f(y)}L7 {f(y + 1.75)}L11 {f(y + 1.75)}L12.75 {f(y)}L16.25 {f(y)}"

TRAY = tray(10.25)
INBOX = [BOX, TRAY]
TRAY_FRONT = shape([(1.75, 10.25), (5.25, 10.25), (7, 12), (11, 12), (12.75, 10.25), (16.25, 10.25), (16.25, 15.5), (1.75, 15.5)],
                   [R, 0, 0, 0, 0, R, R, R])
SHEET = "M5.25 10.25L5.25 4A1.5 1.5 0 0 1 6.75 2.5L11.25 2.5A1.5 1.5 0 0 1 12.75 4L12.75 10.25"
inbox_open = line_svg([TRAY_FRONT, SHEET])
explore("inbox", [("tray dips on 45°", line_svg(INBOX)),
                  ("tray drops square", line_svg([BOX, "M1.75 10.25L5.25 10.25L5.25 12.25L12.75 12.25L12.75 10.25L16.25 10.25"]))], picked=0)
put("inbox", line_svg(INBOX), duo_svg([silhouette(BOX)], fg_lines=[TRAY]), inbox_open,
  duo_svg([sil([(1.75, 10.25), (5.25, 10.25), (5.25, 2.5), (12.75, 2.5), (12.75, 10.25), (16.25, 10.25), (16.25, 15.5), (1.75, 15.5)],
               [R, 0, R, R, 0, R, R, R])], fg_lines=["M5.25 10.25L7 12L11 12L12.75 10.25"]))
minus = with_badge(INBOX, "badge-minus", bg=[silhouette(BOX)], fg_lines=[TRAY])
minus_high = with_badge([BOX, tray(8.125)], "badge-minus", bg=[silhouette(BOX)], fg_lines=[tray(8.125)])
explore("inbox-minus", [("inbox as drawn, cut by the badge", minus[0]), ("tray raised clear of the badge", minus_high[0])], picked=0)
put("inbox-minus", *minus)
uses("inbox-minus", "badge-minus")

# ---------- clipboard ----------
BOARD = ("M6.25 3.25L4.625 3.25A1.5 1.5 0 0 0 3.125 4.75L3.125 14.75A1.5 1.5 0 0 0 4.625 16.25L13.375 16.25"
         "A1.5 1.5 0 0 0 14.875 14.75L14.875 4.75A1.5 1.5 0 0 0 13.375 3.25L11.75 3.25")
CLIP = rect(6.25, 1.75, 11.75, 4.75)
CLIPBOARD = [BOARD, CLIP]
CLIPBOARD_BG = [silhouette("M4.625 3.25L6.25 3.25A1.5 1.5 0 0 1 7.75 1.75L10.25 1.75A1.5 1.5 0 0 1 11.75 3.25L13.375 3.25"
                           "A1.5 1.5 0 0 1 14.875 4.75L14.875 14.75A1.5 1.5 0 0 1 13.375 16.25L4.625 16.25"
                           "A1.5 1.5 0 0 1 3.125 14.75L3.125 4.75A1.5 1.5 0 0 1 4.625 3.25Z")]
CLIP_LINES = "M6.625 8.5L11.375 8.5M6.625 12L9.5 12"
explore("clipboard", [("pill clip across the edge", line_svg(CLIPBOARD)),
                      ("clip box above the edge", line_svg([rect(3.125, 3.25, 14.875, 16.25), rect(6.25, 1.75, 11.75, 5.25)]))], picked=0)
put("clipboard", line_svg(CLIPBOARD), duo_svg(CLIPBOARD_BG, fg_lines=[CLIP]), line_svg(CLIPBOARD + [CLIP_LINES]),
  duo_svg(CLIPBOARD_BG, fg_lines=[CLIP, CLIP_LINES]))
ARROW_LEFT_IN = "M11.375 10.5L6.625 10.5M8.375 8.75L6.625 10.5L8.375 12.25"
ARROW_UP_BOARD = "M9 13.5L9 7.75M7.25 9.5L9 7.75L10.75 9.5"
explore("clipboard-arrow-in", [("arrow left, out of the board", line_svg(CLIPBOARD + [ARROW_LEFT_IN])),
                               ("arrow up", line_svg(CLIPBOARD + [ARROW_UP_BOARD]))], picked=0)
put("clipboard-arrow-in", line_svg(CLIPBOARD + [ARROW_LEFT_IN]), duo_svg(CLIPBOARD_BG, fg_lines=[CLIP, ARROW_LEFT_IN]))

# ---------- note ----------
def note(k):
    """A square note, its bottom right corner folded over at x + y = k."""
    c = k - 16.25
    body = (f"M3.25 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 {f(c)}L{f(c)} 16.25L3.25 16.25"
            "A1.5 1.5 0 0 1 1.75 14.75L1.75 3.25A1.5 1.5 0 0 1 3.25 1.75Z")
    fold = f"M{f(c)} 15.625L{f(c)} {f(c)}L15.625 {f(c)}"
    fill = poly((c + 0.25, c + 0.25), (k + 0.875 - c - 0.25, c + 0.25), (c + 0.25, k + 0.875 - c - 0.25))
    return body, fold, fill

NOTE_BODY, NOTE_FOLD, NOTE_FILL = note(27.5)
NOTE_OPEN_BODY, NOTE_OPEN_FOLD, NOTE_OPEN_FILL = note(25)
note_open = line_svg([NOTE_OPEN_BODY, NOTE_OPEN_FOLD])
explore("note", [("open: corner peeled further", note_open),
                 ("open: text lines appear", line_svg([NOTE_BODY, NOTE_FOLD, "M5.25 5.5L12.75 5.5M5.25 9L9.5 9"]))], picked=0)
put("note", line_svg([NOTE_BODY, NOTE_FOLD]), duo_svg([silhouette(NOTE_BODY)], fg=[NOTE_FILL]), note_open,
  duo_svg([silhouette(NOTE_OPEN_BODY)], fg=[NOTE_OPEN_FILL]))
put("note-edit", *with_badge([NOTE_BODY, NOTE_FOLD], "badge-pen"))
uses("note-edit", "badge-pen")

# ---------- notepad, notebook ----------
PAD = rect(3.125, 3.25, 14.875, 16.25)
RINGS = "M5.5 1.75L5.5 4.75M9 1.75L9 4.75M12.5 1.75L12.5 4.75"
PAD_LINES = "M6.625 8.5L11.375 8.5M6.625 12L9.5 12"
explore("notepad", [("rings over the top edge", line_svg([PAD, RINGS, PAD_LINES])),
                    ("binding strip", line_svg([PAGE, "M3.125 5.25L14.875 5.25", "M6.5 9L11.5 9M6.5 12.5L9.5 12.5"]))], picked=0)
put("notepad", line_svg([PAD, RINGS, PAD_LINES]), duo_svg([silhouette(PAD)], fg_lines=[RINGS, PAD_LINES]))

COVER = rect(3.875, 1.75, 15.625, 16.25)
BINDING = "M1.875 5.5L5.875 5.5M1.875 9L5.875 9M1.875 12.5L5.875 12.5"
LABEL = "M9.5 5.5L12.125 5.5"
SPREAD = rect(1.75, 1.75, 16.25, 16.25)
SPREAD_RINGS = "M9 1.75L9 16.25M7.25 5.375L10.75 5.375M7.25 9L10.75 9M7.25 12.625L10.75 12.625"
explore("notebook", [("binding ticks and a label", line_svg([COVER, BINDING, LABEL])),
                     ("binding ticks only", line_svg([COVER, BINDING]))], picked=0)
put("notebook", line_svg([COVER, BINDING, LABEL]), duo_svg([silhouette(COVER)], fg_lines=[BINDING, LABEL]),
  line_svg([SPREAD, SPREAD_RINGS]), duo_svg([silhouette(SPREAD)], fg_lines=[SPREAD_RINGS]))

# ---------- receipt ----------
TEETH = "L14.5 14.875L13.125 16.25L11.75 14.875L10.375 16.25L9 14.875L7.625 16.25L6.25 14.875L4.875 16.25L3.5 14.875"
RECEIPT = "M3.5 3.25A1.5 1.5 0 0 1 5 1.75L13 1.75A1.5 1.5 0 0 1 14.5 3.25" + TEETH + "Z"
RECEIPT_LINES = "M7 6.5L11 6.5M7 10L11 10"
ROLL = rect(1.75, 1.75, 16.25, 4.75)
PAPER = "M14.5 4.75" + TEETH + "L3.5 4.75"
ROLL_LINES = "M7 9.75L11 9.75"
explore("receipt", [("open: paper unrolls from a roll, one line", line_svg([ROLL, PAPER, ROLL_LINES])),
                    ("open: paper unrolls, two lines too tight", line_svg([ROLL, PAPER, "M7 8.125L11 8.125M7 11.5L11 11.5"])),
                    ("open: paper unrolls, blank", line_svg([ROLL, PAPER]))], picked=0)
put("receipt", line_svg([RECEIPT, RECEIPT_LINES]), duo_svg([silhouette(RECEIPT)], fg_lines=[RECEIPT_LINES]),
  line_svg([ROLL, PAPER, ROLL_LINES]),
  duo_svg([silhouette(ROLL), silhouette("M14.5 5.375" + TEETH + "L3.5 5.375Z")], fg_lines=[ROLL_LINES]))

# ---------- newspaper ----------
PAPER_OUT = ("M5.25 7L3.25 7A1.5 1.5 0 0 0 1.75 8.5L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L14.75 16.25"
             "A1.5 1.5 0 0 0 16.25 14.75L16.25 3.25A1.5 1.5 0 0 0 14.75 1.75L6.75 1.75A1.5 1.5 0 0 0 5.25 3.25Z")
PAPER_SPINE = "M5.25 7L5.25 16.25"
NEWS_LINES = "M8.75 5.25L12.75 5.25M8.75 8.75L12.75 8.75M8.75 12.25L10.75 12.25"
NEWS_SPREAD = "M9 2.5L9 15.5"
NEWS_PAGE_LINES = "M5.25 5.25L12.75 5.25M5.25 8.75L12.75 8.75M5.25 12.25L9.5 12.25"
explore("newspaper", [("open: the flap unfolds into one page", line_svg([SPREAD, NEWS_PAGE_LINES])),
                      ("open: spread on a spine, blank", line_svg([BOX, NEWS_SPREAD])),
                      ("open: spread with columns, too tight", line_svg([BOX, NEWS_SPREAD, "M4 6.25L6.75 6.25M4 9.75L6.75 9.75M11.25 6.25L14 6.25M11.25 9.75L14 9.75"]))],
        picked=0)
put("newspaper", line_svg([PAPER_OUT, PAPER_SPINE, NEWS_LINES]), duo_svg([silhouette(PAPER_OUT)], fg_lines=[PAPER_SPINE, NEWS_LINES]),
  line_svg([SPREAD, NEWS_PAGE_LINES]), duo_svg([silhouette(SPREAD)], fg_lines=[NEWS_PAGE_LINES]))

# ---------- scroll ----------
SCROLL = [rect(1.75, 1.75, 14.25, 4.75), rect(3.75, 13.25, 16.25, 16.25), "M5.25 4.75L5.25 13.25M12.75 4.75L12.75 13.25"]
SCROLL_BG = [shape([(4.625, 4.75), (13.375, 4.75), (13.375, 13.25), (4.625, 13.25)], [0] * 4)]
SCROLL_OPEN = [rect(1.75, 1.75, 16.25, 4.75), rect(1.75, 13.25, 16.25, 16.25), "M3.25 4.75L3.25 13.25M14.75 4.75L14.75 13.25",
               "M6.75 9L11.25 9"]
SCROLL_OPEN_BG = [shape([(2.625, 4.75), (15.375, 4.75), (15.375, 13.25), (2.625, 13.25)], [0] * 4)]
CAPSULE = shape([(1.75, 12.75), (12.75, 1.75), (16.25, 5.25), (5.25, 16.25)], [R] * 4)
explore("scroll", [("sheet between two offset rolls", line_svg(SCROLL)),
                   ("rolled tube tied with a band", line_svg([CAPSULE, "M7.25 7.25L10.75 10.75"])),
                   ("both rolls stacked", line_svg([rect(1.75, 4.25, 16.25, 7.25), rect(1.75, 10.75, 16.25, 13.75), "M3.25 7.25L3.25 10.75M14.75 7.25L14.75 10.75"]))],
        picked=0)
put("scroll", line_svg(SCROLL), duo_svg(SCROLL_BG, fg_lines=SCROLL[:2]), line_svg(SCROLL_OPEN),
    duo_svg(SCROLL_OPEN_BG, fg_lines=SCROLL_OPEN[:2] + SCROLL_OPEN[3:]))

# ---------- passport ----------
GLOBE = [circle_d((9, 9), 2.375), "M6.625 9L11.375 9M9 6.625L9 11.375"]
PHOTO_LINE = "M6.625 5.25L11.375 5.25"
PHOTO_BUST = "M6.75 16.25A2.25 2.25 0 0 1 11.25 16.25"
PHOTO_HEAD = [(9, 10.5, 1.375)]
explore("passport", [("cover with a gridded globe", line_svg([PAGE] + GLOBE)),
                     ("cover with an equator globe", line_svg([PAGE, circle_d((9, 9), 2.375), "M6.625 9L11.375 9"])),
                     ("cover with a meridian globe and a line", line_svg([PAGE, circle_d((9, 7.25), 3), "M9 4.25A3.75 3.75 0 0 1 9 10.25A3.75 3.75 0 0 1 9 4.25Z", "M7.25 13.25L10.75 13.25"]))],
        picked=0)
put("passport", line_svg([PAGE] + GLOBE), duo_svg([silhouette(PAGE)], fg_lines=GLOBE),
  line_svg([PAGE, PHOTO_LINE, PHOTO_BUST], PHOTO_HEAD),
  duo_svg([silhouette(PAGE)], fg_lines=[PHOTO_LINE, PHOTO_BUST], fg_dots=[(9, 10.5, 1.5)]))

# ---------- envelope ----------
ENVELOPE = rect(1.75, 3.25, 16.25, 14.75)
FLAP = f"M{pt((3.25 - 1.5 * R2, 4.75 - 1.5 * R2))}L9 10.5L{pt((14.75 + 1.5 * R2, 4.75 - 1.5 * R2))}"
ENV_OPEN = "M1.75 9.25L9 2L16.25 9.25L16.25 14.75A1.5 1.5 0 0 1 14.75 16.25L3.25 16.25A1.5 1.5 0 0 1 1.75 14.75Z"
SEAM = f"M{pt((3.25 - 1.5 * R2, 14.75 + 1.5 * R2))}L9 9L{pt((14.75 + 1.5 * R2, 14.75 + 1.5 * R2))}"
POCKET = "M1.75 12.75L16.25 12.75"
env_open = line_svg([ENV_OPEN, SEAM])
explore("envelope", [("open: flap up, bottom seam from the corners", env_open),
                     ("open: flap up, straight pocket line", line_svg([ENV_OPEN, POCKET])),
                     ("open: letter rising from the pocket", line_svg([rect(1.75, 7.25, 16.25, 15.5), "M4.25 7.25L4.25 4A1.5 1.5 0 0 1 5.75 2.5L12.25 2.5A1.5 1.5 0 0 1 13.75 4L13.75 7.25"]))],
        picked=0)
put("envelope", line_svg([ENVELOPE, FLAP]), duo_svg([silhouette(ENVELOPE)], fg_lines=[FLAP]), env_open,
  duo_svg([silhouette(ENV_OPEN)], fg_lines=[SEAM]))

# ---------- mailbox ----------
MAILBOX = "M5.25 5.25L14.75 5.25A1.5 1.5 0 0 1 16.25 6.75L16.25 10.75A1.5 1.5 0 0 1 14.75 12.25L5.25 12.25A3.5 3.5 0 0 1 5.25 5.25Z"
DOOR = "M5.25 5.25L5.25 12.25"
POST = "M12.5 12.25L12.5 16.875"
FLAG_DOWN = "M8.75 8.75L12.75 8.75"
FLAG_UP = "M10.25 1.75L13.75 1.75L13.75 5.25"
explore("mailbox", [("open: flag raised", line_svg([MAILBOX, DOOR, POST, FLAG_UP])),
                    ("open: door gone, flag raised", line_svg([MAILBOX, POST, FLAG_UP]))], picked=0)
put("mailbox", line_svg([MAILBOX, DOOR, POST, FLAG_DOWN]), duo_svg([silhouette(MAILBOX)], fg_lines=[DOOR, POST, FLAG_DOWN]),
  line_svg([MAILBOX, DOOR, POST, FLAG_UP]), duo_svg([silhouette(MAILBOX)], fg_lines=[DOOR, POST, FLAG_UP]))

# ---------- book ----------
BOOK = PAGE
PAGES = "M14.875 12.75L8.125 12.75A1.5 1.5 0 0 0 6.625 14.25L6.625 16.25"
BOOK_OPEN = shape([(1.75, 2.5), (7, 2.5), (9, 4.5), (11, 2.5), (16.25, 2.5), (16.25, 13.5), (11, 13.5), (9, 15.5), (7, 13.5), (1.75, 13.5)],
                  [R, 0, 0, 0, R, R, 0, 0, 0, R])
BOOK_SPINE = "M9 4.5L9 15.5"
explore("book", [("page block under the cover", line_svg([BOOK, PAGES])),
                 ("spine line", line_svg([BOOK, "M6.625 1.75L6.625 16.25"])),
                 ("page strip", line_svg([BOOK, "M3.125 12.75L14.875 12.75"]))], picked=0)
put("book", line_svg([BOOK, PAGES]), duo_svg([silhouette(BOOK)], fg_lines=[PAGES]),
  line_svg([BOOK_OPEN, BOOK_SPINE]), duo_svg([silhouette(BOOK_OPEN)], fg_lines=[BOOK_SPINE]))

# ---------- library ----------
def shelf(verts, radii, spines):
    """Books standing on a shelf: one outline of their stepped tops, and the spines between them."""
    body = shape(verts, radii)
    return [body, spines], duo_svg([silhouette(body)], fg_lines=[spines])

LIBRARY, LIBRARY_DUO = shelf([(1.75, 1.75), (5.375, 1.75), (5.375, 4.25), (9, 4.25), (9, 2.75), (12.625, 2.75), (12.625, 5.25),
                              (16.25, 5.25), (16.25, 16.25), (1.75, 16.25)], [R, R, 0, 0, R, R, 0, R, R, R],
                             "M5.375 4.25L5.375 16.25M9 4.25L9 16.25M12.625 5.25L12.625 16.25")
THREE_BOOKS, _ = shelf([(1.75, 1.75), (6.5, 1.75), (6.5, 4.25), (11.25, 4.25), (11.25, 2.75), (16.25, 2.75), (16.25, 16.25), (1.75, 16.25)],
                       [R, R, 0, 0, R, R, R, R], "M6.5 4.25L6.5 16.25M11.25 4.25L11.25 16.25")
LYING_BOOK, _ = shelf([(1.75, 1.75), (5.375, 1.75), (5.375, 3.75), (9, 3.75), (9, 12.625), (16.25, 12.625), (16.25, 16.25), (1.75, 16.25)],
                      [R, R, 0, R, 0, R, R, R], "M5.375 3.75L5.375 16.25M9 12.625L9 16.25")
explore("library", [("four books of stepped heights", line_svg(LIBRARY)), ("three wider books", line_svg(THREE_BOOKS)),
                    ("two books standing, one lying flat", line_svg(LYING_BOOK))], picked=0)
put("library", line_svg(LIBRARY), LIBRARY_DUO)

# ---------- bookmark ----------
def ribbon(bottom):
    return shape([(4.125, 1.75), (13.875, 1.75), (13.875, bottom), (12.375, bottom), (9, bottom - 3.375), (5.625, bottom), (4.125, bottom)],
                 [R, R, R, 0, 0, 0, R])

BOOKMARK = ribbon(16.25)
bm_open = line_svg([ribbon(12.25), "M1.75 16.25L16.25 16.25"])
explore("bookmark", [("open: ribbon pulled up off the page", bm_open),
                     ("open: ribbon folded over the page edge", line_svg([BOOKMARK, "M1.75 5.25L4.125 5.25M13.875 5.25L16.25 5.25"]))], picked=0)
put("bookmark", line_svg([BOOKMARK]), opened=bm_open)

# ---------- album ----------
ALBUM_LABEL = "M6.25 6L11.75 6"
explore("album-2", [("cover with a label", line_svg([BOX, ALBUM_LABEL])),
                    ("cover with a label box", line_svg([BOX, rect(5.5, 5.75, 12.5, 9.5)]))], picked=0)
put("album-2", line_svg([BOX, ALBUM_LABEL]), duo_svg([silhouette(BOX)], fg_lines=[ALBUM_LABEL]),
  line_svg([BOX, NEWS_SPREAD]), duo_svg([silhouette(BOX)], fg_lines=[NEWS_SPREAD]))

# ---------- path ----------
PATH_S = "M3.75 14.25L11.625 14.25A2.625 2.625 0 0 0 11.625 9L6.375 9A2.625 2.625 0 0 1 6.375 3.75L14.25 3.75"
PATH_DOTS = [(3.75, 14.25, 1.375), (14.25, 3.75, 1.375)]
explore("path", [("S route between two discs", line_svg([PATH_S], PATH_DOTS)),
                 ("square route between two discs", line_svg(["M3.75 14.25L9 14.25L9 3.75L14.25 3.75"], PATH_DOTS))], picked=0)
put("path", line_svg([PATH_S], PATH_DOTS))

# ---------- package ----------
CARTON = SPREAD
TAPE = "M1.75 6.25L16.25 6.25M9 1.75L9 6.25"
CARTON_OPEN = shape([(1.75, 1.75), (7.25, 1.75), (7.25, 6.25), (10.75, 6.25), (10.75, 1.75), (16.25, 1.75), (16.25, 16.25), (1.75, 16.25)],
                    [R, R, 0, 0, R, R, R, R])
FLAPS = "M1.75 6.25L7.25 6.25M10.75 6.25L16.25 6.25"
explore("package", [("seam and centre tape", line_svg([CARTON, TAPE])),
                    ("seam only", line_svg([CARTON, "M1.75 6.25L16.25 6.25"]))], picked=0)
put("package", line_svg([CARTON, TAPE]), duo_svg([silhouette(CARTON)], fg_lines=[TAPE]),
  line_svg([CARTON_OPEN, FLAPS]), duo_svg([silhouette(CARTON_OPEN)], fg_lines=[FLAPS]))

# ---------- floppy disk ----------
FLOPPY = shape([(1.75, 1.75), (13.75, 1.75), (16.25, 4.25), (16.25, 16.25), (1.75, 16.25)], [R, 0, 0, R, R])
SHUTTER = "M5.25 1.75L5.25 4.25A1.5 1.5 0 0 0 6.75 5.75L8.75 5.75A1.5 1.5 0 0 0 10.25 4.25L10.25 1.75"
LABEL_D = "M5.25 16.25L5.25 12.75A1.5 1.5 0 0 1 6.75 11.25L11.25 11.25A1.5 1.5 0 0 1 12.75 12.75L12.75 16.25"
explore("floppy-disk", [("shutter and label", line_svg([FLOPPY, SHUTTER, LABEL_D])),
                        ("shutter only", line_svg([FLOPPY, SHUTTER]))], picked=0)
put("floppy-disk", line_svg([FLOPPY, SHUTTER, LABEL_D]), duo_svg([silhouette(FLOPPY)], fg_lines=[SHUTTER, LABEL_D]))

# ---------- print ----------
FEED = "M5.25 6.25L5.25 3.25A1.5 1.5 0 0 1 6.75 1.75L11.25 1.75A1.5 1.5 0 0 1 12.75 3.25L12.75 6.25"
PRINTER = ("M5.25 12.75L3.25 12.75A1.5 1.5 0 0 1 1.75 11.25L1.75 7.75A1.5 1.5 0 0 1 3.25 6.25L14.75 6.25"
           "A1.5 1.5 0 0 1 16.25 7.75L16.25 11.25A1.5 1.5 0 0 1 14.75 12.75L12.75 12.75")
SHEET_OUT = rect(5.25, 10.25, 12.75, 16.25)
PRINT_BG = [sil([(5.25, 1.75), (12.75, 1.75), (12.75, 6.25), (16.25, 6.25), (16.25, 12.75), (12.75, 12.75), (12.75, 16.25),
                 (5.25, 16.25), (5.25, 12.75), (1.75, 12.75), (1.75, 6.25), (5.25, 6.25)], [R, R, 0, R, R, 0, R, R, 0, R, R, 0])]
explore("print", [("paper in, paper out", line_svg([FEED, PRINTER, SHEET_OUT])),
                  ("paper out only", line_svg([rect(1.75, 3.25, 16.25, 12.75), SHEET_OUT]))], picked=0)
put("print", line_svg([FEED, PRINTER, SHEET_OUT]),
  duo_svg(PRINT_BG, fg_lines=["M5.25 6.25L12.75 6.25", "M5.25 12.75L5.25 11.75A1.5 1.5 0 0 1 6.75 10.25L11.25 10.25A1.5 1.5 0 0 1 12.75 11.75L12.75 12.75"]))

# ---------- copy, duplicate, copy id ----------
FRONT = rect(6.25, 6.25, 16.25, 16.25)
BACK = ("M11.75 6.25L11.75 3.25A1.5 1.5 0 0 0 10.25 1.75L3.25 1.75A1.5 1.5 0 0 0 1.75 3.25L1.75 10.25"
        "A1.5 1.5 0 0 0 3.25 11.75L6.25 11.75")
COPY = [FRONT, BACK]
COPY_BG = [sil([(1.75, 1.75), (11.75, 1.75), (11.75, 6.25), (16.25, 6.25), (16.25, 16.25), (6.25, 16.25), (6.25, 11.75), (1.75, 11.75)],
               [R, R, 0, R, R, R, 0, R])]
explore("copy", [("front box over a back corner", line_svg(COPY)),
                 ("two boxes, closer offset", line_svg([rect(5.25, 5.25, 16.25, 16.25), "M12.75 5.25L12.75 3.25A1.5 1.5 0 0 0 11.25 1.75L3.25 1.75A1.5 1.5 0 0 0 1.75 3.25L1.75 11.25A1.5 1.5 0 0 0 3.25 12.75L5.25 12.75"]))],
        picked=0)
put("copy", line_svg(COPY))
PLUS_IN = "M11.25 9.75L11.25 12.75M9.75 11.25L12.75 11.25"
put("duplicate", line_svg(COPY + [PLUS_IN]),
  duo_svg(COPY_BG, fg_lines=["M11.75 6.25L7.75 6.25A1.5 1.5 0 0 0 6.25 7.75L6.25 11.75", PLUS_IN]))

CARD = rect(1.75, 3.25, 16.25, 14.75)
BUST = "M3.75 14.75A2.25 2.25 0 0 1 8.25 14.75"
ID_LINES = "M10.125 7.25L12.75 7.25M10.125 10.75L12.75 10.75"
ID_DOTS = [(6, 9, 1.375)]
explore("copy-id", [("card, person on the card edge, two lines", line_svg([CARD, BUST, ID_LINES], ID_DOTS)),
                    ("card, person only", line_svg([CARD, "M6.75 14.75A2.25 2.25 0 0 1 11.25 14.75"], [(9, 9, 1.375)])),
                    ("card, floating person, two lines", line_svg([CARD, "M3.75 13A2.25 2.25 0 0 1 8.25 13Z", "M10.5 7.75L13.5 7.75M10.5 11.25L13.5 11.25"], [(6, 7.75, 1.375)]))],
        picked=0)
put("copy-id", line_svg([CARD, BUST, ID_LINES], ID_DOTS),
  duo_svg([silhouette(CARD)], fg_lines=[BUST, ID_LINES], fg_dots=[(6, 9, 1.5)]))

# ---------- paperclip ----------
def paperclip(opened=False, c1=(6.875, 9.875), k=4.7625, e1=0.75, e3=0.5, top=None):
    r1, r2 = 3.5, 1.75
    c2 = (c1[0] + r2 * R2 + k, c1[1] + r2 * R2 - k)
    u = lambda p: (p[0] - p[1]) / SQ
    v = lambda p: (p[0] + p[1]) / SQ
    xy = lambda uu, vv: ((uu + vv) / SQ, (vv - uu) / SQ)
    t1 = (c1[0] - r1 * R2, c1[1] - r1 * R2)
    t2 = (c1[0] + r1 * R2, c1[1] + r1 * R2)
    t3 = (c2[0] + r2 * R2, c2[1] + r2 * R2)
    t4 = (c2[0] - r2 * R2, c2[1] - r2 * R2)
    end1 = (t1[0], top) if opened else xy(u(c2) - e1, v(t1))
    end3 = xy(u(c1) + e3, v(t4))
    return (f"M{pt(end1)}L{pt(t1)}A{f(r1)} {f(r1)} 0 0 0 {pt(t2)}L{pt(t3)}A{f(r2)} {f(r2)} 0 0 0 {pt(t4)}L{pt(end3)}")

CLIP_D = paperclip()
CLIP_OPEN_D = paperclip(True, top=2.5)
explore("paperclip", [("open: outer leg straightened up", line_svg([CLIP_OPEN_D])),
                      ("open: outer leg longer, still 45°", line_svg([paperclip(e1=-1.5)]))], picked=0)
put("paperclip", line_svg([CLIP_D]), opened=line_svg([CLIP_OPEN_D]))

save_meta("documents")
