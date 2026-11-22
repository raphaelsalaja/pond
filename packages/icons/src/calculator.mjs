import dot from "./parts/dot.mjs";

const keys = (h, s, y0) => [y0, y0 + 3.25].flatMap((y) => [6.75, 11.25].map((x) => dot(h, s, x, y)));

export default (h, s) => [h.rect(3.375, 2.375, 11.25, 13.25, s.box), "M 6.75 5.75 H 11.25", keys(h, s, 9.25)];

export const open = (h, s) => [h.rect(3.375, 5.125, 11.25, 10.5, s.box), "M 3.375 2.375 H 14.625", keys(h, s, 8.75)];
