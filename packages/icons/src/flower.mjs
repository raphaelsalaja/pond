import dot from "./parts/dot.mjs";

export default ({ poly }, s) => {
  const crown = poly(
    [
      [5, 6.5],
      [5, 2.75],
      [7, 4.5],
      [9, 2.375],
      [11, 4.5],
      [13, 2.75],
      [13, 6.5],
    ],
    { corners: { 2: s.ease / 2, 3: s.ease / 2, 4: s.ease / 2 } },
  );
  return [`${crown} A 4 4 0 0 1 5 6.5`, "M 9 10.5 V 15.625"];
};

/** Five petals as arcs between valley points, each reaching the circle keyline. */
export const open = (h, s) => {
  const [cx, cy, R] = s.keylines.circle;
  const valley = 3.25;
  const petals = 5;
  const half = Math.PI / petals;
  const p = (k) => {
    const a = -Math.PI / 2 + half + 2 * half * k;
    return [
      h.snap(cx + valley * Math.cos(a)),
      h.snap(cy + valley * Math.sin(a)),
    ];
  };
  const c = valley * Math.sin(half);
  const sag = R - 0.125 - valley * Math.cos(half);
  const rho = h.snap((c * c + sag * sag) / (2 * sag));
  const start = p(petals - 1);
  const d = [
    `M ${start.join(" ")}`,
    ...Array.from(
      { length: petals },
      (_, k) => `A ${rho} ${rho} 0 1 1 ${p(k).join(" ")}`,
    ),
    "Z",
  ].join(" ");
  return [d, dot(h, s, cx, cy)];
};
