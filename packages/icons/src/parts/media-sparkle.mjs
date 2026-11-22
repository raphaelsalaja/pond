import { snap } from "../../helpers.mjs";

/** A small sparkle with the concave sides of `sparkle.mjs`, placed bottom right on badged hosts. */
export default (cx = 13.125, cy = 13.125, r = 2.625) => {
  const k = Math.max(0.25, snap(r * 0.125));
  return `M ${cx} ${cy - r} Q ${cx + k} ${cy - k} ${cx + r} ${cy} Q ${cx + k} ${cy + k} ${cx} ${cy + r} Q ${cx - k} ${cy + k} ${cx - r} ${cy} Q ${cx - k} ${cy - k} ${cx} ${cy - r} Z`;
};
