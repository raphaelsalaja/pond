const handle = ({ poly }, s, foot) =>
  poly(
    [
      [6.375, foot],
      [6.375, foot - 2.625],
      [11.625, foot - 2.625],
      [11.625, foot],
    ],
    { radius: s.ease },
  );

export default (h, s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const top = 6.25;
  return [h.rect(x0, top, x1 - x0, y1 - top, s.box), handle(h, s, top), `M ${x0} 9.5 H ${x1}`];
};

/** The top tray lifts out of the box. */
export const open = (h, s) => {
  const [x0, , x1, y1] = s.keylines.wide;
  const [tray, body] = [5.75, 11];
  return [h.rect(x0, tray, x1 - x0, 2.75, s.ease), handle(h, s, tray), h.rect(x0, body, x1 - x0, y1 - body, s.ease)];
};
