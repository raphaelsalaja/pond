"""Renders a family's drawings from next/ into a PNG contact sheet: python3 draw/sheet.py <family> [names...]."""
import json, os, subprocess, sys

ICONS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(ICONS, "next")
CHROME = os.path.expanduser("~/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/"
                            "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
FILES = ["outline-18.svg", "duo-18.svg", "outline-18-open.svg", "duo-18-open.svg", "fill-18.svg"]

family = sys.argv[1]
names = sys.argv[2:] or json.load(open(os.path.join(ICONS, "draw", "families.json")))[family]
meta_path = os.path.join(NEXT, ".meta", f"{family}.json")
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}

def svg_at(svg, px):
    return svg.replace("<svg ", f'<svg width="{px}" height="{px}" ', 1)

rows = []
for name in names:
    cells = []
    for file in FILES:
        p = os.path.join(NEXT, name, file)
        if not os.path.exists(p): continue
        svg = open(p).read()
        cells.append(f'<div class="c"><div class="big">{svg_at(svg, 72)}</div>'
                     f'<div class="sm">{svg_at(svg, 18)}{svg_at(svg, 12)}</div><span>{file[:-4]}</span></div>')
    for a in meta.get(name, {}).get("attempts", []):
        mark = " picked" if a["picked"] else ""
        cells.append(f'<div class="c alt{mark}"><div class="big">{svg_at(a["svg"], 72)}</div>'
                     f'<div class="sm">{svg_at(a["svg"], 18)}{svg_at(a["svg"], 12)}</div><span>{a["note"][:40]}</span></div>')
    rows.append(f'<div class="r"><h3>{name}</h3>{"".join(cells) or "<em>missing</em>"}</div>')

html = f"""<!doctype html><meta charset=utf-8><style>
body{{margin:16px;font:11px -apple-system,sans-serif;background:#fff;color:#111;width:1400px}}
.r{{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eee}}
h3{{width:150px;margin:0;font-size:12px;flex:none}}
.c{{display:flex;flex-direction:column;align-items:center;gap:4px;width:100px}}
.big{{background:repeating-linear-gradient(0deg,#f3f3f3 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,#f3f3f3 0 1px,transparent 1px 4px);outline:1px solid #ddd}}
.sm{{display:flex;gap:8px;align-items:center}}
.alt span{{color:#888}} .picked{{outline:2px solid #3b82f6;outline-offset:2px}}
span{{text-align:center;font-size:10px}}
</style>{''.join(rows)}"""
out_dir = os.path.join("/tmp", "neutral-sheets"); os.makedirs(out_dir, exist_ok=True)
tag = family if not sys.argv[2:] else family + "-" + "-".join(sys.argv[2:])[:40]
html_path = os.path.join(out_dir, f"{tag}.html"); png = os.path.join(out_dir, f"{tag}.png")
open(html_path, "w").write(html)
height = 40 + 150 * len(names)
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size=1440,{height}",
                f"--screenshot={png}", f"file://{html_path}"], capture_output=True, timeout=120)
print(png)
