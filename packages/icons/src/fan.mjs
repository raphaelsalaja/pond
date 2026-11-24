/** A folding fan on one pivot: a quarter spread closed, a half disc open; ribs start clear of the pivot. */
const fan = ({ arc, snap }, pivot, r, span, ribs) => {
  const [px, py] = pivot;
  const p = (a, d) =>
    [
      snap(px + d * Math.cos((a * Math.PI) / 180)),
      snap(py + d * Math.sin((a * Math.PI) / 180)),
    ].join(" ");
  const [a0, a1] = [-90 - span, -90 + span];
  return [
    `M ${p(a0, r)} ${arc(px, py, r, a0, a1).replace(/^M [^A]+/, "")} L ${px} ${py} Z`,
    ribs.map((a) => `M ${p(a, 3.5)} L ${p(a, r)}`),
    `M ${px} ${py} V 15.625`,
  ];
};

export default (h) => fan(h, [9, 12.5], 10, 30, [-100, -80]);

export const open = (h) => fan(h, [9, 12.375], 7, 70, [-125, -90, -55]);
