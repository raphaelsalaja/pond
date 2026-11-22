/** The arrowhead points to the top left, symmetric about the diagonal, its notch aimed back at the tip. */
export default ({ poly }, s) => {
  const tip = 3.125;
  const wing = [15.125, 7.875];
  const notch = 9.125;
  return poly(
    [
      [tip, tip],
      wing,
      [notch, notch],
      [wing[1], wing[0]],
    ],
    { closed: true, corners: { 0: 0.75, 1: s.ease, 2: s.ease / 2, 3: s.ease } },
  );
};
