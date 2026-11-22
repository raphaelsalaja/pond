"""Draws the media family in Neutral into packages/icons/next/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neutral import *


# ---------- helpers ----------
def rad(a): return math.radians(a)

def ang(dx, dy): return math.degrees(math.atan2(dy, dx))

def arc(c, r, a0, a1):
    """An open arc path, angles in degrees, screen coords."""
    return path([Arc(c, r, rad(a0), rad(a1))])

def plen(d):
    return sum((math.dist(s.a, s.b) if isinstance(s, Line) else abs(s.a1 - s.a0) * s.r)
               for segs, _ in parse(d) for s in segs)

def fill_el(d):
    return f'<path d="{d}" fill="currentColor" stroke="none"/>'

def _samples(svg, step=0.125):
    """Stroked centre lines as points: (point, tangent, open end, component), plus neighbour links and dots."""
    nodes, links = [], []
    for tag in re.findall(r"<path[^>]*>", svg):
        if 'fill="currentColor"' in tag: continue
        d = re.search(r'\sd="([^"]+)"', tag).group(1)
        for segs, closed in parse(d):
            comp = len(nodes); first = len(nodes)
            for si, s in enumerate(segs):
                ln = math.dist(s.a, s.b) if isinstance(s, Line) else abs(s.a1 - s.a0) * s.r
                n = max(2, math.ceil(ln / step))
                for k in range(0 if si == 0 else 1, n + 1):
                    t = k / n
                    nodes.append((s.at(t), s.tan(t), False, comp))
                    if len(nodes) - 1 > first: links.append((len(nodes) - 2, len(nodes) - 1))
            last = len(nodes) - 1
            if closed: links.append((last, first))
            else:
                nodes[first] = nodes[first][:2] + (True, comp); nodes[last] = nodes[last][:2] + (True, comp)
    dots = [(float(x), float(y)) for x, y in re.findall(r'<circle cx="([^"]+)" cy="([^"]+)"', svg)]
    return nodes, links, dots

def in_badge_sq(p): return p[0] >= 10.875 - 1e-6 and p[1] >= 10.875 - 1e-6

def gaps(name, svg, clear=3.4, badge=False):
    """Prints places where two strokes run closer than `clear` without meeting, or a dot sits too near ink."""
    import heapq
    nodes, links, dots = _samples(svg)
    adj = [[] for _ in nodes]
    cell = {}
    for i, (p, *_) in enumerate(nodes): cell.setdefault((int(p[0] // clear), int(p[1] // clear)), []).append(i)
    def near(p, r):
        cx, cy = int(p[0] // clear), int(p[1] // clear)
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for j in cell.get((gx, gy), ()):
                    if math.dist(p, nodes[j][0]) < r: yield j
    for a, b in links:
        w = math.dist(nodes[a][0], nodes[b][0]); adj[a].append((b, w)); adj[b].append((a, w))
    for i, (p, *_) in enumerate(nodes):
        for j in near(p, 0.2):
            if j != i: adj[i].append((j, math.dist(p, nodes[j][0])))
    found = {}
    for i, (p, tp, endp, _) in enumerate(nodes):
        lim = 3 * clear; dist = {i: 0.0}; q = [(0.0, i)]
        while q:
            dcur, u = heapq.heappop(q)
            if dcur > dist.get(u, 1e9) or dcur > lim: continue
            for v, w in adj[u]:
                nd = dcur + w
                if nd < dist.get(v, 1e9) and nd <= lim: dist[v] = nd; heapq.heappush(q, (nd, v))
        for j in near(p, clear - 1e-6):
            e = math.dist(p, nodes[j][0])
            if e < 0.2 or dist.get(j, 1e9) <= 2 * e + 0.3: continue
            if badge and (in_badge_sq(p) or in_badge_sq(nodes[j][0])): continue
            tq = nodes[j][1]
            far = j not in dist
            parallel = abs(tp[0] * tq[1] - tp[1] * tq[0]) < 0.5
            u = ((nodes[j][0][0] - p[0]) / e, (nodes[j][0][1] - p[1]) / e)
            facing = endp and abs(tp[0] * u[0] + tp[1] * u[1]) > 0.866
            if far or parallel or facing:
                key = (round(min(p, nodes[j][0])[0]), round(min(p, nodes[j][0])[1]))
                if key not in found or e < found[key][0]: found[key] = (e, p, nodes[j][0])
    for k, (dx, dy) in enumerate(dots):
        for p, *_ in nodes:
            e = math.dist((dx, dy), p)
            if e < clear - 1e-6:
                key = ("dot", dx, dy)
                if key not in found or e < found[key][0]: found[key] = (e, (dx, dy), p)
        for ex, ey in dots[k + 1:]:
            if math.dist((dx, dy), (ex, ey)) < clear - 1e-6: found[("dots", dx, dy)] = (math.dist((dx, dy), (ex, ey)), (dx, dy), (ex, ey))
    out = sorted(found.values())
    for e, p, q in out: print(f"  {name}: gap {e:.2f} between {pt(p)} and {pt(q)}")
    return out

def fill_gaps(name, svg, fills, badge=False, clear=2.125):
    """Prints places where a filled detail's edge comes nearer a stroke centre than a 3.4-spaced dot's edge does."""
    nodes, _, _ = _samples(svg)
    for d in fills:
        edge = [p for p, *_ in _samples(line_svg([d]))[0]]
        worst = min(((math.dist(p, q[0]), p) for p in edge for q in nodes
                     if not (badge and (in_badge_sq(p) or in_badge_sq(q[0])))), default=None)
        if worst and worst[0] < clear - 1e-6: print(f"  {name}: fill edge {worst[0]:.2f} from a stroke at {pt(worst[1])}")

def line(name, paths, dots=(), fills=(), badge=False):
    svg = line_svg(paths, dots)
    lint(name, svg)
    gaps(name, svg, badge=badge)
    fill_gaps(name, svg, fills, badge=badge)
    if fills: svg = svg.replace("</svg>\n", "".join(fill_el(d) for d in fills) + "</svg>\n")
    return svg

def circ(c, r): return circle_d(c, r)

def att(paths, dots=(), fills=()):
    """An attempt for the lab: an outline without the review prints."""
    svg = line_svg(paths, dots)
    if fills: svg = svg.replace("</svg>\n", "".join(fill_el(d) for d in fills) + "</svg>\n")
    return svg

def flare_mouth(x0, y0, R, closed_end=None):
    """A horn: 45° flares from (x0, y0) and (x0, 18 - y0) out to an arc mouth centred on y 9 that meets them at 90°."""
    cx = x0 + y0 - 9
    h = R / math.sqrt(2); P = (cx + h, 9 - h); Q = (cx + h, 9 + h)
    return [Line((x0, y0), P), Arc((cx, 9), R, rad(-45), rad(45)), Line(Q, (x0, 18 - y0))]


# ---------- image (seed) ----------
PEAKS = "M1.75 12.75L6.5 8L10.5 12L13 9.5L16.25 12.75"
SUN = (12.25, 6, 1.375)
IMAGE = [BOX, PEAKS]
IMAGE_FG = poly((3, 14.25), (3, 11.5), (6.5, 8), (10.5, 12), (13, 9.5), (15, 11.5), (15, 14.25))
IMAGE_FG_CUT = poly((3, 14.25), (3, 11.5), (6.5, 8), (9.875, 11.375), (9.875, 14.25))
IMAGE_BG = [silhouette(BOX)]

IMG_TRAY = "M1.75 8.25L1.75 14.75A1.5 1.5 0 0 0 3.25 16.25L14.75 16.25A1.5 1.5 0 0 0 16.25 14.75L16.25 8.25"
IMG_CARD = rect(5.25, 1.75, 12.75, 12.75)
IMG_CARD_PEAK = "M5.25 10.5L7.25 8.5L11.5 12.75"
IMG_CARD_SUN = (9.25, 5.25, 1.375)
img_open = [IMG_TRAY, IMG_CARD, IMG_CARD_PEAK], [IMG_CARD_SUN]
write("image",
      line("image", IMAGE, [SUN]),
      duo_svg(IMAGE_BG, fg=[IMAGE_FG], fg_dots=[(12.25, 6, 1.5)]),
      opened=line("image-open", *img_open),
      duo_opened=duo_svg([silhouette(IMG_CARD)], fg=[poly((5.875, 12.125), (5.875, 9.875), (7.25, 8.5), (10.875, 12.125))],
                         fg_lines=[IMG_TRAY], fg_dots=[(9.25, 5.25, 1.5)]))
explore("image", [
    ("open: photo lifted out of a tray", att(*img_open)),
    ("open: photo with the old two peaks", att([IMG_TRAY, IMG_CARD, "M5.25 10.5L7.75 8L10.25 10.5L11.25 9.5L12.75 11"], [(10, 4.875, 1.375)])),
    ("open: stacked photos", att(["M5.25 5.25L5.25 3.25A1.5 1.5 0 0 1 6.75 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25L16.25 11.25A1.5 1.5 0 0 1 14.75 12.75L12.75 12.75",
                                  rect(1.75, 5.25, 12.75, 16.25), "M1.75 13.5L4.5 10.75L10 16.25"], [(8.5, 9, 1.375)])),
], picked=0)


# ---------- image modifiers ----------
IMAGE_DUO = dict(bg=IMAGE_BG, fg=[IMAGE_FG_CUT], fg_dots=[(12.25, 6, 1.5)])

def image_badge(name, badge):
    outline, duo = with_badge(IMAGE, badge, dots=[SUN], **IMAGE_DUO)
    lint(name, outline); gaps(name, outline, badge=True)
    write(name, outline, duo)
    uses(name, badge)
    return outline

image_badge("image-plus", "badge-plus")
image_badge("image-minus", "badge-minus")

ib = image_badge("image-binary", "badge-refresh")
explore("image-binary", [
    ("refresh badge", ib),
    ("arrow badge", with_badge(IMAGE, "badge-arrow-right", dots=[SUN])[0]),
    ("code brackets", att(trim_badge(IMAGE) + ["M12.625 12.125L10.875 13.875L12.625 15.625M15.125 12.125L16.875 13.875L15.125 15.625"], [SUN])),
], picked=0)

iu = image_badge("image-upscale", "badge-arrow-up-right")
explore("image-upscale", [
    ("arrow up-right badge", iu),
    ("plus badge", with_badge(IMAGE, "badge-plus", dots=[SUN])[0]),
], picked=0)

def image_with(name, mod_fills=()):
    lines = trim_badge(IMAGE)
    outline = line(name, lines, [SUN], fills=mod_fills, badge=True)
    duo = duo_svg(clip_badge(IMAGE_BG), fg=[IMAGE_FG_CUT] + list(mod_fills), fg_dots=[(12.25, 6, 1.5)])
    write(name, outline, duo)

OLD_LOCAL_SPARK = "M13.875 10.875A3 3 0 0 0 16.875 13.875A3 3 0 0 0 13.875 16.875A3 3 0 0 0 10.875 13.875A3 3 0 0 0 13.875 10.875Z"
BADGE_SPARK = sparkle((13.875, 13.875), 3)
image_with("image-sparkle", mod_fills=[BADGE_SPARK])
explore("image-sparkle", [
    ("shared sparkle, filled at badge size", att(trim_badge(IMAGE), [SUN], fills=[BADGE_SPARK])),
    ("shared sparkle, stroked inside the badge square", att(trim_badge(IMAGE) + [sparkle((13.875, 13.875), 2.125)], [SUN])),
    ("rejected: old local sparkle of four tangent arcs", att(trim_badge(IMAGE), [SUN], fills=[OLD_LOCAL_SPARK])),
], picked=0)


# ---------- scan-image ----------
def brackets(a=1.75, b=16.25, arm=4):
    k = a + arm; m = b - arm; r = 1.5
    return [f"M{f(a)} {f(k)}L{f(a)} {f(a + r)}A1.5 1.5 0 0 1 {f(a + r)} {f(a)}L{f(k)} {f(a)}",
            f"M{f(m)} {f(a)}L{f(b - r)} {f(a)}A1.5 1.5 0 0 1 {f(b)} {f(a + r)}L{f(b)} {f(k)}",
            f"M{f(b)} {f(m)}L{f(b)} {f(b - r)}A1.5 1.5 0 0 1 {f(b - r)} {f(b)}L{f(m)} {f(b)}",
            f"M{f(k)} {f(b)}L{f(a + r)} {f(b)}A1.5 1.5 0 0 1 {f(a)} {f(b - r)}L{f(a)} {f(m)}"]

SCAN = brackets()
scan_peak = SCAN + ["M5.25 12.25L8.75 8.75L12.25 12.25"], [(11.75, 5.75, 1.375)]
scan_t = SCAN + ["M5.25 6.25L12.75 6.25M9 6.25L9 12.5"], []
scan_lines = SCAN + ["M5.25 7.25L12.75 7.25", "M5.25 10.75L10.75 10.75"], []
write("scan-image", line("scan-image", *scan_peak))
explore("scan-image", [
    ("frame around a peak and sun", att(*scan_peak)),
    ("frame around a letter T", att(*scan_t)),
    ("frame around two text lines", att(*scan_lines)),
], picked=0)


# ---------- media-library ----------
ML_CIRCLE = circ((4.5, 4.5), 2.75)
ML_SQUARE = rect(10.75, 1.75, 16.25, 7.25)
ML_HOUSE = shape([(1.75, 13.5), (4.5, 10.75), (7.25, 13.5), (7.25, 16.25), (1.75, 16.25)], [0, 0, 0, 1.5, 1.5])
ML_DIAMOND = poly((13.5, 10.75), (16.25, 13.5), (13.5, 16.25), (10.75, 13.5))
ML_SHAPES = [ML_CIRCLE, ML_SQUARE, ML_HOUSE, ML_DIAMOND]
ML_BACK = ("M5.25 5.25L5.25 3.25A1.5 1.5 0 0 1 6.75 1.75L14.75 1.75A1.5 1.5 0 0 1 16.25 3.25"
           "L16.25 11.25A1.5 1.5 0 0 1 14.75 12.75L12.75 12.75")
ML_FRONT = rect(1.75, 5.25, 12.75, 16.25)
ml_stack = [ML_BACK, ML_FRONT, "M1.75 13.5L4.5 10.75L10 16.25"], [(8.5, 9, 1.375)]
ml_three = [circ((4.5, 9), 2.75), rect(10.75, 6.25, 16.25, 11.75)], []
write("media-library", line("media-library", ML_SHAPES))
explore("media-library", [
    ("four shapes, house for the triangle", att(ML_SHAPES)),
    ("image stack", att(*ml_stack)),
    ("circle and square", att(*ml_three)),
], picked=0)


# ---------- camera ----------
CAMERA = ("M1.75 6A1.5 1.5 0 0 1 3.25 4.5L5.25 4.5L7.25 2.5L10.75 2.5L12.75 4.5L14.75 4.5A1.5 1.5 0 0 1 16.25 6"
          "L16.25 14A1.5 1.5 0 0 1 14.75 15.5L3.25 15.5A1.5 1.5 0 0 1 1.75 14Z")
LENS = circ((9, 9.5), 2.5)
CAMERA_BG = [silhouette(CAMERA)]
CAM_O_LENS = circ((7.5, 9.5), 2)
CAM_O_FLASH = (12.75, 8, 1.375)
write("camera", line("camera", [CAMERA, LENS]), duo_svg(CAMERA_BG, fg_lines=[LENS]),
      opened=line("camera-open", [CAMERA, CAM_O_LENS], [CAM_O_FLASH]),
      duo_opened=duo_svg(CAMERA_BG, fg_lines=[CAM_O_LENS], fg_dots=[(12.75, 8, 1.5)]))
explore("camera", [
    ("lens centred under the hump", att([CAMERA, LENS])),
    ("lens and flash dot", att([CAMERA, CAM_O_LENS], [CAM_O_FLASH])),
], picked=0)

CAM_S_LENS = circ((7.5, 9.5), 2)
CAM_S = trim_badge([CAMERA, CAM_S_LENS])
cs = line("camera-sparkle", CAM_S, fills=[BADGE_SPARK], badge=True)
write("camera-sparkle", cs, duo_svg(clip_badge(CAMERA_BG), fg=[BADGE_SPARK], fg_lines=[CAM_S_LENS]))
explore("camera-sparkle", [
    ("lens kept, shared sparkle in the badge square", cs),
    ("shared sparkle for the lens, stroked", att([CAMERA, sparkle((9, 10), 2.5)])),
    ("rejected: old local sparkle filled in place of the lens", att([CAMERA], fills=["M9 7A3 3 0 0 0 12 10A3 3 0 0 0 9 13A3 3 0 0 0 6 10A3 3 0 0 0 9 7Z"])),
], picked=0)


# ---------- polaroid ----------
POL_BODY = rect(1.75, 1.75, 16.25, 16.25)
POL_LENS = circ((9, 7.25), 2)
POL_SLOT = "M5.25 12.75L12.75 12.75"
POL_O_BODY = rect(1.75, 1.75, 16.25, 12.75)
POL_PHOTO = "M4.75 12.75L4.75 14.75A1.5 1.5 0 0 0 6.25 16.25L11.75 16.25A1.5 1.5 0 0 0 13.25 14.75L13.25 12.75"
write("polaroid", line("polaroid", [POL_BODY, POL_LENS, POL_SLOT]),
      duo_svg([silhouette(POL_BODY)], fg_lines=[POL_LENS, POL_SLOT]),
      opened=line("polaroid-open", [POL_O_BODY, POL_LENS, POL_PHOTO]),
      duo_opened=duo_svg([silhouette(POL_O_BODY)], fg_lines=[POL_LENS, POL_PHOTO]))
explore("polaroid", [
    ("lens and photo slot", att([POL_BODY, POL_LENS, POL_SLOT])),
    ("lens only", att([POL_BODY, circ((9, 9), 2.75)])),
    ("photo ejected", att([POL_O_BODY, POL_LENS, POL_PHOTO])),
], picked=0)


# ---------- video ----------
VID_BODY = rect(1.75, 3.75, 12, 14.25)
VID_LENS = path(flare_mouth(12, 5.25, 8))
VID_SIDE_LENS = path(flare_mouth(12, 7, 6.25))
VID_BOX_LENS = "M12 6.25L14.75 6.25A1.5 1.5 0 0 1 16.25 7.75L16.25 10.25A1.5 1.5 0 0 1 14.75 11.75L12 11.75"
write("video", line("video", [VID_BODY, VID_LENS]),
      opened=line("video-open", [VID_BODY, VID_LENS], [(6.875, 9, 1.375)]))
explore("video", [
    ("lens flaring from the body corners", att([VID_BODY, VID_LENS])),
    ("lens flaring from the body side", att([VID_BODY, VID_SIDE_LENS])),
    ("body and boxed lens", att([VID_BODY, VID_BOX_LENS])),
], picked=0)


# ---------- movie ----------
CLAP = rect(1.75, 2.5, 16.25, 15.5)
CLAP_BAND = "M1.75 6L16.25 6"
CLAP_STRIPES = "M4.5 6L8 2.5M9.5 6L13 2.5"
CLAP_O_ARM = rect(1.75, 1.75, 16.25, 5.25)
CLAP_O_STRIPES = "M4.5 5.25L8 1.75M9.5 5.25L13 1.75"
CLAP_O_BODY = rect(1.75, 8.75, 16.25, 16.25)
write("movie", line("movie", [CLAP, CLAP_BAND, CLAP_STRIPES]),
      duo_svg([silhouette(CLAP)], fg_lines=[CLAP_BAND, CLAP_STRIPES]),
      opened=line("movie-open", [CLAP_O_ARM, CLAP_O_STRIPES, CLAP_O_BODY]),
      duo_opened=duo_svg([silhouette(CLAP_O_ARM), silhouette(CLAP_O_BODY)], fg_lines=[CLAP_O_STRIPES]))
explore("movie", [
    ("clapperboard", att([CLAP, CLAP_BAND, CLAP_STRIPES])),
    ("film strip rails", att([CLAP, "M5.25 2.5L5.25 15.5", "M12.75 2.5L12.75 15.5"])),
    ("play chevron in a frame", att([BOX, "M7.5 6L10.5 9L7.5 12"])),
], picked=0)


# ---------- tv ----------
TV_BODY = rect(1.75, 4.25, 16.25, 15.5)
TV_ANT = "M6.5 1.75L9 4.25L11.5 1.75"
TV_WAVE = arc((9, 11.75), 3.5, 225, 315)
TV_DOT = (9, 11.75, 1.375)
write("tv", line("tv", [TV_BODY, TV_ANT]), duo_svg([silhouette(TV_BODY)], fg_lines=[TV_ANT]),
      opened=line("tv-open", [TV_BODY, TV_ANT, TV_WAVE], [TV_DOT]),
      duo_opened=duo_svg([silhouette(TV_BODY)], fg_lines=[TV_ANT, TV_WAVE], fg_dots=[(9, 11.75, 1.5)]))
explore("tv", [
    ("antenna V on the set", att([TV_BODY, TV_ANT])),
    ("set on a stand", att([rect(1.75, 1.75, 16.25, 12.5), "M5.75 16.25L12.25 16.25"])),
    ("broadcast wave", att([TV_BODY, TV_ANT, TV_WAVE], [TV_DOT])),
], picked=0)


# ---------- microphone ----------
MIC = "M6.25 4.5A2.75 2.75 0 0 1 11.75 4.5L11.75 7.5A2.75 2.75 0 0 1 6.25 7.5Z"
CRADLE = "M2.75 6L2.75 7.5A6.25 6.25 0 0 0 15.25 7.5L15.25 6"
STEM = "M9 13.75L9 16.25"
MIC_O = "M6.25 5.5A2.75 2.75 0 0 1 11.75 5.5L11.75 8.5A2.75 2.75 0 0 1 6.25 8.5Z"
MIC_O_STEM = "M9 11.25L9 16.25"
MIC_O_WAVES = [path([Arc((9, 5.5), 6.25, rad(ang(-5, -3.75) + 360), rad(180)), Line((2.75, 5.5), (2.75, 8.5)), Arc((9, 8.5), 6.25, rad(180), rad(ang(-5, 3.75)))]),
               path([Arc((9, 5.5), 6.25, rad(ang(5, -3.75)), rad(0)), Line((15.25, 5.5), (15.25, 8.5)), Arc((9, 8.5), 6.25, rad(0), rad(ang(5, 3.75)))])]
write("microphone", line("microphone", [MIC, CRADLE, STEM]),
      duo_svg([silhouette(MIC)], fg_lines=[CRADLE, STEM]),
      opened=line("microphone-open", [MIC_O, MIC_O_STEM] + MIC_O_WAVES),
      duo_opened=duo_svg([silhouette(MIC_O)], fg_lines=[MIC_O_STEM] + MIC_O_WAVES))
explore("microphone", [
    ("capsule in a cradle", att([MIC, CRADLE, STEM])),
    ("capsule on a stand", att([MIC, "M9 10.25L9 16.25M5.5 16.25L12.5 16.25"])),
], picked=0)


# ---------- music-note ----------
def note(cx, cy, r, top=2, flag=3.75):
    sx = cx + r
    return [f"M{f(sx)} {f(cy)}L{f(sx)} {f(top)}A{f(flag)} {f(flag)} 0 0 1 {f(sx + flag)} {f(top + flag)}L{f(sx + flag)} {f(top + flag + 2)}"]

NOTE_RING = note(6.5, 13.25, 2.5) + [circ((6.5, 13.25), 2.5)]
NOTE_DISC = note(6.75, 13.5, 2)
NOTE_O = note(4.25, 13.25, 2.5) + [circ((4.25, 13.25), 2.5)]
NOTE_O_WAVE = arc((8.75, 9), 7.5, ang(6, -4.5), ang(6, 4.5))
write("music-note", line("music-note", NOTE_RING),
      opened=line("music-note-open", NOTE_O + [NOTE_O_WAVE]))
explore("music-note", [
    ("ring head", att(NOTE_RING)),
    ("disc head", att(NOTE_DISC, [(6.75, 13.5, 2)])),
], picked=0)


# ---------- vinyl ----------
SLEEVE = rect(1.75, 5.875, 12.125, 16.25)
RECORD = path([Arc((12.125, 5.875), 4.125, rad(180), rad(450))])
SLEEVE_O = rect(1.75, 10.5, 11, 16.25)
REC_O_A0 = math.atan2(10.5 - 7, -math.sqrt(5.25 ** 2 - 3.5 ** 2))
RECORD_O = path([Arc((11, 7), 5.25, REC_O_A0, rad(450))])
write("vinyl", line("vinyl", [SLEEVE, RECORD]),
      opened=line("vinyl-open", [SLEEVE_O, RECORD_O], [(11, 7, 1.375)]))
explore("vinyl", [
    ("record behind its sleeve, centred on the corner", att([SLEEVE, RECORD])),
    ("record with a spindle dot", att([ring()], [(9, 9, 1.375)])),
    ("record pulled out", att([SLEEVE_O, RECORD_O], [(11, 7, 1.375)])),
], picked=0)


# ---------- headphones ----------
BAND = "M1.75 10.5L1.75 9A7.25 7.25 0 0 1 16.25 9L16.25 10.5"
CUP_L = shape([(1.75, 10.5), (5.25, 10.5), (5.25, 16.25), (1.75, 16.25)], [0, 1.5, 1.5, 1.5])
CUP_R = shape([(12.75, 10.5), (16.25, 10.5), (16.25, 16.25), (12.75, 16.25)], [1.5, 0, 1.5, 1.5])
HP_INNER = arc((9, 9), 3.75, ang(-3, -2.25) + 360, ang(3, -2.25) + 360)
write("headphones", line("headphones", [BAND, CUP_L, CUP_R]),
      opened=line("headphones-open", [BAND, CUP_L, CUP_R, HP_INNER]))
explore("headphones", [
    ("band and cups", att([BAND, CUP_L, CUP_R])),
    ("band with round cups", att(["M2.25 12L2.25 9A6.75 6.75 0 0 1 15.75 9L15.75 12", circ((3.75, 13), 2), circ((14.25, 13), 2)])),
], picked=0)


# ---------- speaker ----------
SPK_BOX = rect(3.5, 1.75, 14.5, 16.25)
SPK_WOOF = circ((9, 10.75), 2)
SPK_TWEET = (9, 5.25, 1.375)
SPK_O_BOX = rect(3.5, 5.25, 14.5, 16.25)
SPK_O_LID = "M3.5 1.75L14.5 1.75"
write("speaker", line("speaker", [SPK_BOX, SPK_WOOF], [SPK_TWEET]),
      duo_svg([silhouette(SPK_BOX)], fg_lines=[SPK_WOOF], fg_dots=[(9, 5.25, 1.5)]),
      opened=line("speaker-open", [SPK_O_LID, SPK_O_BOX, SPK_WOOF]),
      duo_opened=duo_svg([silhouette(SPK_O_BOX)], fg_lines=[SPK_O_LID, SPK_WOOF]))
explore("speaker", [
    ("tweeter and woofer", att([SPK_BOX, SPK_WOOF], [SPK_TWEET])),
    ("woofer with a dust cap", att([rect(1.75, 1.75, 16.25, 16.25), circ((9, 9), 3.5)], [(9, 9, 1.375)])),
], picked=0)


# ---------- volume ----------
SPK_CONE = flare_mouth(5.25, 6.75, 6.25)
SPEAKER = path([Arc((3.25, 8.25), 1.5, rad(180), rad(270)), Line((3.25, 6.75), (5.25, 6.75))] + SPK_CONE
               + [Line((5.25, 11.25), (3.25, 11.25)), Arc((3.25, 9.75), 1.5, rad(90), rad(180)), Line((1.75, 9.75), (1.75, 8.25))], True)
WAVES = [arc((3, 9), 9.75, ang(9, -3.75), ang(9, 3.75)), arc((3, 9), 13.25, ang(11.25, -7), ang(11.25, 7))]
write("volume", line("volume", [SPEAKER] + WAVES), duo_svg([silhouette(SPEAKER)], fg_lines=WAVES))
explore("volume", [
    ("cone with an arc mouth, two waves", att([SPEAKER] + WAVES)),
    ("one wave", att([SPEAKER, WAVES[0]])),
], picked=0)

vo = with_badge([SPEAKER], "badge-xmark")
lint("volume-off", vo[0]); gaps("volume-off", vo[0], badge=True)
write("volume-off", *vo)
uses("volume-off", "badge-xmark")


# ---------- computer ----------
SCREEN = rect(1.75, 1.75, 16.25, 12.5)
STAND = "M9 12.5L9 16.25M5.75 16.25L12.25 16.25"
WINDOW = rect(5.25, 5.25, 12.75, 9)
write("computer", line("computer", [SCREEN, STAND]), duo_svg([silhouette(SCREEN)], fg_lines=[STAND]),
      opened=line("computer-open", [SCREEN, STAND, WINDOW]),
      duo_opened=duo_svg([silhouette(SCREEN)], fg_lines=[STAND, WINDOW]))
explore("computer", [
    ("screen on a stand", att([SCREEN, STAND])),
    ("screen with chin", att([rect(1.75, 1.75, 16.25, 13), "M1.75 9.5L16.25 9.5", "M6.5 16.25L11.5 16.25"])),
], picked=0)


# ---------- laptop ----------
LAP_BASE_C = "M1.75 11L16.25 11"
LAP_LID_C = "M3.25 11L3.25 8.5A1.5 1.5 0 0 1 4.75 7L13.25 7A1.5 1.5 0 0 1 14.75 8.5L14.75 11"
LAP_BASE_O = "M1.75 14.5L16.25 14.5"
LAP_LID_O = "M3.25 14.5L3.25 4.5A1.5 1.5 0 0 1 4.75 3L13.25 3A1.5 1.5 0 0 1 14.75 4.5L14.75 14.5"
write("laptop", line("laptop", [LAP_LID_C, LAP_BASE_C]),
      opened=line("laptop-open", [LAP_LID_O, LAP_BASE_O]))
explore("laptop", [
    ("lid shut on the base", att([LAP_LID_C, LAP_BASE_C])),
    ("lid shut, deck below", att(["M3.25 10.5L3.25 8.5A1.5 1.5 0 0 1 4.75 7L13.25 7A1.5 1.5 0 0 1 14.75 8.5L14.75 10.5Z", rect(1.75, 10.5, 16.25, 14)])),
], picked=0)


# ---------- phone ----------
PHONE = rect(4.25, 1.75, 13.75, 16.25)
HOME = "M7.75 12.75L10.25 12.75"
PHONE_O = rect(1.75, 1.75, 11.25, 16.25)
HOME_O = "M5.25 12.75L7.75 12.75"
RING_O = arc((11.25, 6), 5, ang(4, -3), ang(4, 3))
write("phone", line("phone", [PHONE, HOME]), duo_svg([silhouette(PHONE)], fg_lines=[HOME]),
      opened=line("phone-open", [PHONE_O, HOME_O, RING_O]),
      duo_opened=duo_svg([silhouette(PHONE_O)], fg_lines=[HOME_O, RING_O]))
explore("phone", [
    ("home bar", att([PHONE, HOME])),
    ("notch", att([PHONE, "M7.75 5.25L10.25 5.25"])),
], picked=0)


# ---------- keyboard ----------
KB = rect(1.75, 3.5, 16.25, 14.5)
KB_DOTS = [(5.25, 7, 1.375), (9, 7, 1.375), (12.75, 7, 1.375)]
KB_BAR = "M5.25 11L12.75 11"
write("keyboard", line("keyboard", [KB, KB_BAR], KB_DOTS),
      duo_svg([silhouette(KB)], fg_lines=[KB_BAR], fg_dots=[(x, y, 1.5) for x, y, _ in KB_DOTS]))
explore("keyboard", [
    ("keys and space bar", att([KB, KB_BAR], KB_DOTS)),
    ("two rows of lines", att([KB, "M5.25 7L12.75 7", "M5.25 11L12.75 11"])),
], picked=0)


# ---------- chip ----------
CHIP = rect(3.75, 3.75, 14.25, 14.25)
PINS = ("M7.25 1.75L7.25 3.75M10.75 1.75L10.75 3.75M7.25 14.25L7.25 16.25M10.75 14.25L10.75 16.25"
        "M1.75 7.25L3.75 7.25M1.75 10.75L3.75 10.75M14.25 7.25L16.25 7.25M14.25 10.75L16.25 10.75")
CORE = rect(7.25, 7.25, 10.75, 10.75)
CHIP_DIE_SPARK = sparkle((9, 9), 2.75)
write("chip", line("chip", [CHIP, PINS, CORE]), duo_svg([silhouette(CHIP)], fg_lines=[PINS, CORE]),
      opened=line("chip-open", [CHIP, PINS], fills=[CHIP_DIE_SPARK]),
      duo_opened=duo_svg([silhouette(CHIP)], fg=[CHIP_DIE_SPARK], fg_lines=[PINS]))
explore("chip", [
    ("die and two pins a side", att([CHIP, PINS, CORE])),
    ("pins only", att([CHIP, PINS])),
    ("die dot", att([CHIP, PINS], [(9, 9, 1.375)])),
    ("open: shared sparkle filled on the die", att([CHIP, PINS], fills=[CHIP_DIE_SPARK])),
    ("open: chip cut for a badge-size sparkle", att(trim_badge([CHIP, PINS]), fills=[BADGE_SPARK])),
    ("open, rejected: old local sparkle", att([CHIP, PINS], fills=["M9 6.5A2.5 2.5 0 0 0 11.5 9A2.5 2.5 0 0 0 9 11.5A2.5 2.5 0 0 0 6.5 9A2.5 2.5 0 0 0 9 6.5Z"])),
], picked=0)


# ---------- server ----------
SRV = rect(1.75, 1.75, 16.25, 16.25)
SRV_DIV = "M1.75 9L16.25 9"
SRV_DOTS = [(5.25, 5.375, 1.375), (5.25, 12.625, 1.375)]
SRV_TOP_O = shape([(3.75, 1.75), (16.25, 1.75), (16.25, 9), (3.75, 9)], [1.5, 1.5, 1.5, 0])
SRV_BOT_O = shape([(1.75, 9), (14.25, 9), (14.25, 16.25), (1.75, 16.25)], [1.5, 0, 1.5, 1.5])
SRV_DOTS_O = [(7.25, 5.375, 1.375), (5.25, 12.625, 1.375)]
write("server", line("server", [SRV, SRV_DIV], SRV_DOTS),
      duo_svg([silhouette(SRV)], fg_lines=[SRV_DIV], fg_dots=[(x, y, 1.5) for x, y, _ in SRV_DOTS]),
      opened=line("server-open", [SRV_TOP_O, SRV_BOT_O], SRV_DOTS_O),
      duo_opened=duo_svg([silhouette(SRV_TOP_O), silhouette(SRV_BOT_O)], fg_lines=["M3.75 9L14.25 9"], fg_dots=[(x, y, 1.5) for x, y, _ in SRV_DOTS_O]))
explore("server", [
    ("two units, one box", att([SRV, SRV_DIV], SRV_DOTS)),
    ("two units with slot lines", att([SRV, SRV_DIV, "M8.75 5.375L12.75 5.375", "M8.75 12.625L12.75 12.625"], SRV_DOTS)),
], picked=0)


# ---------- battery ----------
BAT = path([Arc((3.25, 5.75), 1.5, rad(180), rad(270)), Line((3.25, 4.25), (13, 4.25)),
            Arc((13, 5.75), 1.5, rad(270), rad(360)), Line((14.5, 5.75), (14.5, 7.25)),
            Arc((14.5, 9), 1.75, rad(270), rad(450)), Line((14.5, 10.75), (14.5, 12.25)),
            Arc((13, 12.25), 1.5, rad(0), rad(90)), Line((13, 13.75), (3.25, 13.75)),
            Arc((3.25, 12.25), 1.5, rad(90), rad(180)), Line((1.75, 12.25), (1.75, 5.75))], True)
BAT_LEVEL = "M5.25 9L9.25 9"
BAT_BIG_TAB = [rect(1.75, 4.5, 12.75, 13.5), "M12.75 7.25L16.25 7.25L16.25 10.75L12.75 10.75"]
write("battery", line("battery", [BAT]),
      opened=line("battery-open", [BAT, BAT_LEVEL]))
explore("battery", [
    ("one outline with a round terminal", att([BAT])),
    ("body and square terminal", att(BAT_BIG_TAB)),
], picked=0)


# ---------- gamepad ----------
def gamepad(top=2.5, hy=13, hr=2.5, r=1.5):
    xl, xr = 1.75, 16.25
    return path([Arc((xl + r, top + r), r, rad(180), rad(270)), Line((xl + r, top), (xr - r, top)),
                 Arc((xr - r, top + r), r, rad(-90), rad(0)), Line((xr, top + r), (xr, hy)),
                 Arc((xr - hr, hy), hr, rad(0), rad(180)), Line((xr - 2 * hr, hy), (xl + 2 * hr, hy)),
                 Arc((xl + hr, hy), hr, rad(0), rad(180)), Line((xl, hy), (xl, top + r))], True)

def pad_half(x0, x1, top=2.5, hy=13, hr=2.5, r=1.5, left=True):
    if left:
        return path([Arc((x0 + r, top + r), r, rad(180), rad(270)), Line((x0 + r, top), (x1 - r, top)),
                     Arc((x1 - r, top + r), r, rad(-90), rad(0)), Line((x1, top + r), (x1, hy)),
                     Arc((x0 + hr, hy), hr, rad(0), rad(180)), Line((x0, hy), (x0, top + r))], True)
    return path([Arc((x0 + r, top + r), r, rad(180), rad(270)), Line((x0 + r, top), (x1 - r, top)),
                 Arc((x1 - r, top + r), r, rad(-90), rad(0)), Line((x1, top + r), (x1, hy)),
                 Arc((x1 - hr, hy), hr, rad(0), rad(180)), Line((x0, hy), (x0, top + r))], True)

PAD = gamepad()
PAD_PLUS = "M6.75 6L6.75 9M5.25 7.5L8.25 7.5"
PAD_DOTS = [(11.75, 7.5, 1.375)]
PAD_L = pad_half(1.75, 6.75)
PAD_R = pad_half(11.25, 16.25, left=False)
PAD_PLUS_O = "M6.75 6.25L6.75 9.25M5.25 7.75L8.25 7.75"
PAD_DOTS_O = [(11.25, 6, 1.375), (12.75, 9.25, 1.375)]
write("gamepad", line("gamepad", [PAD, PAD_PLUS], PAD_DOTS),
      duo_svg([silhouette(PAD)], fg_lines=[PAD_PLUS], fg_dots=[(11.75, 7.5, 1.5)]),
      opened=line("gamepad-open", [PAD, PAD_PLUS_O], PAD_DOTS_O),
      duo_opened=duo_svg([silhouette(PAD)], fg_lines=[PAD_PLUS_O], fg_dots=[(x, y, 1.5) for x, y, _ in PAD_DOTS_O]))
explore("gamepad", [
    ("d-pad and one button", att([PAD, PAD_PLUS], PAD_DOTS)),
    ("d-pad and two buttons", att([PAD, PAD_PLUS_O], PAD_DOTS_O)),
    ("split into two halves", att([PAD_L, PAD_R])),
], picked=0)


# ---------- calculator ----------
CALC = rect(3.25, 1.75, 14.75, 16.25)
CALC_DISPLAY = "M6.75 5.25L11.25 5.25"
CALC_KEYS = [(6.75, 9, 1.375), (11.25, 9, 1.375), (6.75, 12.75, 1.375), (11.25, 12.75, 1.375)]
CALC_O_LID = "M3.25 1.75L14.75 1.75"
CALC_O_BODY = rect(3.25, 5.25, 14.75, 16.25)
CALC_O_KEYS = [(6.75, 8.75, 1.375), (11.25, 8.75, 1.375), (6.75, 12.25, 1.375), (11.25, 12.25, 1.375)]
write("calculator", line("calculator", [CALC, CALC_DISPLAY], CALC_KEYS),
      duo_svg([silhouette(CALC)], fg_lines=[CALC_DISPLAY], fg_dots=[(x, y, 1.5) for x, y, _ in CALC_KEYS]),
      opened=line("calculator-open", [CALC_O_LID, CALC_O_BODY], CALC_O_KEYS),
      duo_opened=duo_svg([silhouette(CALC_O_BODY)], fg_lines=[CALC_O_LID], fg_dots=[(x, y, 1.5) for x, y, _ in CALC_O_KEYS]))
explore("calculator", [
    ("display line and four keys", att([CALC, CALC_DISPLAY], CALC_KEYS)),
    ("cover lifted off the keys", att([CALC_O_LID, CALC_O_BODY], CALC_O_KEYS)),
    ("display box and two keys", att([CALC, rect(6.75, 5.25, 11.25, 8.75)], [(6.75, 12.25, 1.375), (11.25, 12.25, 1.375)])),
], picked=0)


# ---------- gif ----------
GIF = ["M6.75 4.5L3.25 4.5A1.5 1.5 0 0 0 1.75 6L1.75 12A1.5 1.5 0 0 0 3.25 13.5L5.25 13.5A1.5 1.5 0 0 0 6.75 12L6.75 9.25L5.25 9.25",
       "M10.25 4.5L10.25 13.5",
       "M16.25 4.5L15.25 4.5A1.5 1.5 0 0 0 13.75 6L13.75 13.5M13.75 9L15.75 9"]
write("gif", line("gif", GIF))
explore("gif", [
    ("letters alone", att(GIF)),
    ("letters in a box", att([BOX, "M8.5 7L6.25 7A1 1 0 0 0 5.25 8L5.25 10A1 1 0 0 0 6.25 11L7.5 11L8.5 11L8.5 9.25", "M10.75 7L10.75 11", "M14 7L12.75 7L12.75 11M12.75 9L13.75 9"])),
], picked=0)


# ---------- flashlight ----------
def fl(o, S, T): return (o[0] + S + T, o[1] - S + T)

def flashlight(o, A, F, S1, S2):
    B = A + F
    pts = [(0, A), (0, -A), (S1, -A), (S1 + F, -B), (S2, -B), (S2, B), (S1 + F, B), (S1, A)]
    return poly(*[fl(o, s, t) for s, t in pts])

FLASH = flashlight((3.25, 14.75), 1.25, 1.25, 6.375, 10.125)
FL_O = ((3, 15), 1.25, 1.25, 2.5, 5.5)
FLASH_O = flashlight(*FL_O)
def fl_rays(o, S2, B):
    top = fl(o, S2, -B); side = fl(o, S2, B)
    return [f"M{pt(fl(o, S2 + 2.5, 0))}L{pt(fl(o, S2 + 3.75, 0))}",
            f"M{pt((top[0], top[1] - 3.5))}L{pt((top[0], top[1] - 5.25))}",
            f"M{pt((side[0] + 3.5, side[1]))}L{pt((side[0] + 5.25, side[1]))}"]
FL_RAYS = fl_rays(FL_O[0], FL_O[4], FL_O[1] + FL_O[2])
write("flashlight", line("flashlight", [FLASH]),
      opened=line("flashlight-open", [FLASH_O] + FL_RAYS))
explore("flashlight", [
    ("torch on the diagonal", att([FLASH])),
    ("upright torch", att([poly((7.25, 16.25), (7.25, 8.75), (4.75, 6.25), (4.75, 1.75), (13.25, 1.75), (13.25, 6.25), (10.75, 8.75), (10.75, 16.25))])),
], picked=0)


# ---------- lightbulb ----------
def bulb(c, r, neck):
    P = (c[0] - r * math.cos(rad(45)), c[1] + r * math.sin(rad(45)))
    Q = (c[0] + r * math.cos(rad(45)), c[1] + r * math.sin(rad(45)))
    nl, nr = c[0] - neck / 2, c[0] + neck / 2
    dl = nl - P[0]
    yl = P[1] + dl
    return path([Arc(c, r, rad(135), rad(405)), Line(Q, (nr, yl)), Line((nr, yl), (nr, yl + 1.5)),
                 Line((nr, yl + 1.5), (nl, yl + 1.5)), Line((nl, yl + 1.5), (nl, yl)), Line((nl, yl), P)], True), yl + 1.5

BULB, BULB_BOTTOM = bulb((9, 6.5), 4.75, 4)
BULB_BASE = "M7 16.25L11 16.25"
write("lightbulb", line("lightbulb", [BULB, BULB_BASE]), duo_svg([silhouette(BULB)], fg_lines=[BULB_BASE]),
      opened=line("lightbulb-open", [BULB, BULB_BASE], [(9, 6.5, 1.375)]),
      duo_opened=duo_svg([silhouette(BULB)], fg_lines=[BULB_BASE], fg_dots=[(9, 6.5, 1.5)]))
explore("lightbulb", [
    ("round bulb, neck, base line", att([BULB, BULB_BASE])),
    ("bulb without base", att([bulb((9, 7.5), 5.25, 4.5)[0]])),
], picked=0)


# ---------- lamp ----------
def dome(cx, base, r):
    return path([Arc((cx, base), r, rad(180), rad(360)), Line((cx + r, base), (cx - r, base))], True)

SHADE = dome(9, 7.5, 5.75)
LAMP_STEM = "M9 7.5L9 16.25M5.5 16.25L12.5 16.25"
LAMP_RAYS = ["M4.5 11L2.75 12.75", "M13.5 11L15.25 12.75"]
SHADE_BOX = rect(3.75, 1.75, 14.25, 6.75)
write("lamp", line("lamp", [SHADE, LAMP_STEM]), duo_svg([silhouette(SHADE)], fg_lines=[LAMP_STEM]),
      opened=line("lamp-open", [SHADE, LAMP_STEM] + LAMP_RAYS),
      duo_opened=duo_svg([silhouette(SHADE)], fg_lines=[LAMP_STEM] + LAMP_RAYS))
explore("lamp", [
    ("dome shade, stem, foot", att([SHADE, LAMP_STEM])),
    ("box shade", att([SHADE_BOX, "M9 6.75L9 16.25M5.5 16.25L12.5 16.25"])),
    ("small dome", att([dome(9, 6.5, 4.75), "M9 6.5L9 16.25M5.5 16.25L12.5 16.25"])),
], picked=0)


save_meta("media")
