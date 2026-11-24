/** Text rows on the bullet list's rhythm: three rows 4.5 apart across the square keyline. */
export const rows = [4.5, 9, 13.5];
export const left = 2.375;
export const right = 15.625;
export const indent = 6.625;
export const lengths = { full: right - left, short: 8.5, medium: 11 };

/** A numbered or checked list puts a 3.75-wide marker on the outer rows and starts its text later; digits are 5 tall, held inside the keyline. */
export const marker = { x0: left, x1: left + 3.75, tall: 5 };
export const text = 9.125;

export const line = (y, x0, x1) => `M ${x0} ${y} H ${x1}`;

/** One row per length, anchored to the left, the right or the centre. */
export const aligned = (anchor, spans) =>
  spans.map((w, i) => {
    const y = rows[i];
    if (anchor === "left") {
      return line(y, left, left + w);
    }
    if (anchor === "right") {
      return line(y, right - w, right);
    }
    return line(y, 9 - w / 2, 9 + w / 2);
  });

/** Two centred rows held to a bar at the top, the bottom or both. */
export const vertical = (place) => {
  const gap = 4.5;
  const spans = [9.5, 6.5];
  const ys =
    place === "top"
      ? [left + gap, left + 2 * gap]
      : place === "bottom"
        ? [right - 2 * gap, right - gap]
        : [9 - gap / 2, 9 + gap / 2];
  const bars =
    place === "top" ? [left] : place === "bottom" ? [right] : [left, right];
  return [
    ...bars.map((y) => line(y, left, right)),
    ...ys.map((y, i) => line(y, 9 - spans[i] / 2, 9 + spans[i] / 2)),
  ];
};
