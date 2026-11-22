"""Merges each family's parts from next/.meta into next/manifest.json, and reports what a family left out."""
import glob, json, os

ICONS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(ICONS, "next")
families = json.load(open(os.path.join(ICONS, "draw", "families.json")))
shipped = json.load(open(os.path.join(ICONS, "svg", "manifest.json")))

uses = {}
for path in sorted(glob.glob(os.path.join(NEXT, ".meta", "*.json"))):
    for name, entry in json.load(open(path)).items():
        if entry.get("parts"): uses[name] = entry["parts"]

rows = [f'  "{name}": {{ "parts": {json.dumps(parts)} }}' for name, parts in sorted(uses.items())]
open(os.path.join(NEXT, "manifest.json"), "w").write("{\n" + ",\n".join(rows) + "\n}\n")

FILES = {"outline": "outline-18.svg", "fill": "fill-18.svg", "duo": "duo-18.svg"}
for family, names in families.items():
    gaps = []
    for name in names:
        for v in shipped[name]["variants"]:
            file = FILES[v["style"]] if "state" not in v else FILES[v["style"]].replace("-18", "-18-open")
            if not os.path.exists(os.path.join(NEXT, name, file)): gaps.append(f"{name}/{file}")
    print(f"{family}: {len(names)} icons, {len(gaps)} missing" + (f": {', '.join(gaps)}" if gaps else ""))
print(f"{len(uses)} icons declare parts")
