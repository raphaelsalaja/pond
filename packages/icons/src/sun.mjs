const rays = ({ pt }, cx, cy, angles, r0, r1) =>
  angles
    .map((a) => {
      const [c, s] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
      return `M ${pt([cx + r0 * c, cy + r0 * s])} L ${pt([cx + r1 * c, cy + r1 * s])}`;
    })
    .join(" ");

export default (h) => [h.circle(9, 9, 2.375), rays(h, 9, 9, [0, 45, 90, 135, 180, 225, 270, 315], 5.125, 6.875)];

/** The sun rises over the horizon. */
export const open = (h, s) => {
  const [x0, , x1] = s.keylines.square;
  const horizon = 13;
  return [`M ${x0} ${horizon} H ${x1}`, `M 5.5 ${horizon} A 3.5 3.5 0 0 1 12.5 ${horizon}`, rays(h, 9, horizon, [225, 270, 315], 6.25, 8)];
};
