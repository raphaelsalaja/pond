/** The funnel host, drawn whole above and left of the badge hole; the stem slants so its foot clears the hole. */
export default ({ poly }, s) => {
  const [x0, top] = [s.keylines.square[0], 2.875];
  const x1 = 12.875;
  const [left, right, neck] = [6.25, 9, 7.875];
  return poly(
    [
      [x0, top],
      [x1, top],
      [right, neck],
      [right, 9.5],
      [left, 11.125],
      [left, neck],
    ],
    { closed: true, corners: { 0: 1, 1: 1, 2: s.ease, 3: 0.5, 4: 0.5, 5: s.ease } },
  );
};
