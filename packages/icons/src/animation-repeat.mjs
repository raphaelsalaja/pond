/** Two arrows chase each other round a loop. */
export default ({ poly }, s) => {
  const [lo, hi] = [3, 15];
  const [top, bottom] = [5.25, 12.75];
  const turn = 3;
  const arm = 2.25;
  return [
    poly(
      [
        [lo, 9.75],
        [lo, top],
        [hi, top],
      ],
      { corners: { 1: turn } },
    ),
    poly(
      [
        [hi - arm, top - arm],
        [hi, top],
        [hi - arm, top + arm],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [hi, 8.25],
        [hi, bottom],
        [lo, bottom],
      ],
      { corners: { 1: turn } },
    ),
    poly(
      [
        [lo + arm, bottom - arm],
        [lo, bottom],
        [lo + arm, bottom + arm],
      ],
      { radius: s.ease },
    ),
  ];
};
