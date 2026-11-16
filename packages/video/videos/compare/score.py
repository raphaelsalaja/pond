"""Score for the comparison cut: D major, 100 BPM, one bar per table row. Times match timeline.ts."""

from pond_score import Harmony, Score, hz

DURATION = 35.8
FIRST_ROW = 5.4
ROW_STEP = 2.4
ROWS = 9
CELL_LEAD = 0.3
CELL_STEP = 0.14
POND_CELL = 1.2
VERDICT = 27.0
LOGO = 31.4

score = Score(duration=DURATION, seed=11)
harmony = Harmony(["D", "Bm", "G", "A"] * 4, bar=score.bar, grid=0.6)

score.pads(
    harmony,
    range(-1, 16),
    [(0, 0), (1.2, 0.55), (3.0, 0.75), (5.4, 0.85), (26.4, 0.9), (27.0, 1.1), (30.4, 0.9), (31.4, 1.15), (33.0, 0.9), (DURATION, 0)],
)
score.arpeggio(
    harmony,
    FIRST_ROW,
    VERDICT,
    [(0, 0), (FIRST_ROW, 0), (6.6, 0.55), (10.2, 0.8), (25.8, 0.8), (26.6, 0.4), (VERDICT, 0), (DURATION, 0)],
)
score.drums(10.2, 26.4, shaker_from=15.0)
score.bass(harmony, range(4, 11))

sfx = score.sfx

for index, (at, midi) in enumerate([(0.49, 74), (0.64, 78), (0.79, 81), (0.94, 86)]):
    sfx.add(at, score.pop(hz(midi), 0.7), pan=-0.3 + index * 0.2)
sfx.add(2.55, score.air(0.6, 2500, 600, rising=False, gain=0.8))
sfx.add(2.85, score.air(1.0, 300, 2400, rising=True, gain=1.0))

for index in range(4):
    sfx.add(3.30 + index * 0.15, score.tick(), gain=0.6, pan=-0.5 + index * 0.25)
sfx.add(4.20, score.bell(hz(86)), gain=0.8, pan=0.4)

POND_NOTES = [74, 76, 78, 81, 83, 86, 88, 90, 93]
for row in range(ROWS):
    at = FIRST_ROW + row * ROW_STEP
    for column in range(4):
        sfx.add(at + CELL_LEAD + column * CELL_STEP, score.tick(), gain=0.45, pan=-0.45 + column * 0.2)
    sfx.add(at + POND_CELL, score.click(0.8), pan=0.4)
    sfx.add(at + POND_CELL + 0.02, score.pop(hz(POND_NOTES[row])), pan=0.4)
    sfx.add(at + POND_CELL + 0.06, score.pluck(hz(POND_NOTES[row] + 12), 0.9, 1.5), gain=0.05, pan=0.4)

sfx.add(VERDICT + 0.2, score.bell(hz(86)), pan=-0.15)
sfx.add(VERDICT + 0.29, score.bell(hz(93)), gain=0.7, pan=0.15)
sfx.add(30.3, score.air(0.8, 2400, 500, rising=False, gain=0.7))
score.lockup(LOGO, slide=1.3)

score.master()
