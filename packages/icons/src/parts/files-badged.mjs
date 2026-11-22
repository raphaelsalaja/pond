import badge, { edge } from "./badge.mjs";
import { fold } from "./file.mjs";
import { tab } from "./folder.mjs";

/** The folder and file outlines opened at the badge hole, with the same measurements as their closed parts. */
export const folder = ({ poly }, s, name) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [
    poly(
      [
        [edge(y1), y1],
        [x0, y1],
        [x0, y0],
        [tab.end, y0],
        [tab.end + tab.drop, y0 + tab.drop],
        [x1, y0 + tab.drop],
        [x1, edge(x1)],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.ease, 4: s.ease, 5: s.box } },
    ),
    badge(name),
  ];
};

export const file = ({ poly }, s, name) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  const corner = poly(
    [
      [x1 - fold, y0],
      [x1 - fold, y0 + fold],
      [x1, y0 + fold],
    ],
    { radius: s.ease },
  );
  return [
    poly(
      [
        [edge(y1), y1],
        [x0, y1],
        [x0, y0],
        [x1 - fold, y0],
        [x1, y0 + fold],
        [x1, edge(x1)],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.ease / 2, 4: s.ease / 2 } },
    ),
    { d: `${corner} Z`, fill: true },
    badge(name),
  ];
};
