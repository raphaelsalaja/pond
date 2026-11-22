"""Runs lint and gaps over every shipped outline in next/, so all families meet one bar."""
import glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from neutral import NEXT, gaps, lint

found = 0
files = sorted(glob.glob(os.path.join(NEXT, "*", "outline-18*.svg")))
for file in files:
    name = os.path.basename(os.path.dirname(file)) + ("" if file.endswith("outline-18.svg") else " open")
    svg = open(file).read()
    found += len(lint(name, svg)) + len(gaps(name, svg))
print(f"{len(files)} outlines, {found} findings")
