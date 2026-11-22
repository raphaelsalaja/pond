"""Writes the Neutral seed set into packages/icons/seed/."""
import neutral
from neutral import *

SEED = os.path.join(ICONS, "seed")
neutral.OUT = SEED

write("plus", line_svg(["M9 2.5L9 15.5M2.5 9L15.5 9"]))
write("xmark", line_svg(["M3.375 3.375L14.625 14.625M14.625 3.375L3.375 14.625"]))
write("check", line_svg(["M2.5 9.25L6.75 13.5L15.5 4.75"]))
write("chevron-down", line_svg(["M3.75 6.125L9 11.375L14.25 6.125"]))
write("dots", line_svg([], dots=[(3.375, 9, 1.375), (9, 9, 1.375), (14.625, 9, 1.375)]))
write("arrow-right", line_svg(["M2 9L15.125 9M11.625 12.5L15.125 9L11.625 5.5"]))
write("arrow-up-right", line_svg(["M4.375 13.625L13.5 4.5M8 4.5L13.5 4.5L13.5 10"]))

write("magnifier",
      line_svg([circle_d((8, 8), 5.75), "M12.125 12.125L15.75 15.75"]),
      duo_svg([circle_d((8, 8), 5.75 + O)], fg_lines=["M12.508 12.508L15.75 15.75"]))

CHECK_IN = "M5.75 8.875L7.875 11L12.25 6.625"
write("circle-check", line_svg([ring(), CHECK_IN]), duo_svg([silhouette(ring())], fg_lines=[CHECK_IN]))

HANDS = "M9 4.875L9 9L11.875 11.875"
write("clock", line_svg([ring(), HANDS]), duo_svg([silhouette(ring())], fg_lines=[HANDS]))

write("folder", line_svg([FOLDER]))
write("folder-plus", *with_badge([FOLDER], "badge-plus"))

write("file", line_svg([FILE, FOLD]), duo_svg([silhouette(FILE)], fg=[FILE_FOLD_FILL]))

PEAKS = "M1.75 12.75L6.5 8L10.5 12L13 9.5L16.25 12.75"
write("image",
      line_svg([BOX, PEAKS], dots=[(12.25, 6, 1.375)]),
      duo_svg([silhouette(BOX)], fg=[poly((3, 14.25), (3, 11.5), (6.5, 8), (10.5, 12), (13, 9.5), (15, 11.5), (15, 14.25))],
              fg_dots=[(12.25, 6, 1.5)]))

LID = "M1.625 4.75L16.375 4.75"
HANDLE = "M6.625 4.75L6.625 3.25A1.5 1.5 0 0 1 8.125 1.75L9.875 1.75A1.5 1.5 0 0 1 11.375 3.25L11.375 4.75"
BODY = "M3.75 4.75L3.75 14.75A1.5 1.5 0 0 0 5.25 16.25L12.75 16.25A1.5 1.5 0 0 0 14.25 14.75L14.25 4.75"
SLATS = "M7.25 8.25L7.25 12.75M10.75 8.25L10.75 12.75"
BODY_SIL = (f"M3.125 6.5L14.875 6.5L14.875 14.75A{f(RO)} {f(RO)} 0 0 1 12.75 16.875L5.25 16.875"
            f"A{f(RO)} {f(RO)} 0 0 1 3.125 14.75Z")
write("trash", line_svg([BODY, SLATS, LID, HANDLE]), duo_svg([BODY_SIL], fg_lines=[SLATS, LID, HANDLE]))

write("tag", line_svg([TAG]))
write("tag-slash", *with_slash([TAG]))

HEART = "M9 6.375A3.5 3.5 0 1 0 3.025 8.85L9 14.825L14.975 8.85A3.5 3.5 0 1 0 9 6.375Z"
write("heart", line_svg([HEART]))

os.makedirs(os.path.join(SEED, "parts"), exist_ok=True)
for name, paths in PART_PATHS.items():
    open(os.path.join(SEED, "parts", f"{name}.svg"), "w").write(line_svg(paths))

USES = {
    "circle-check": ["ring"], "clock": ["ring"], "file": ["file"], "folder": ["folder"],
    "folder-plus": ["folder", "badge-plus"], "tag": ["tag"], "tag-slash": ["tag", "slash"],
}
rows = [f'  "{name}": {{ "parts": {json.dumps(parts)} }}' for name, parts in sorted(USES.items())]
open(os.path.join(SEED, "manifest.json"), "w").write("{\n" + ",\n".join(rows) + "\n}\n")
