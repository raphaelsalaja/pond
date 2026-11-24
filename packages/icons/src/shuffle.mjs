import { arrow } from "./parts/arrows-head.mjs";

export default (_h, s) => {
  const [a, b] = [3.5, 14.5];
  return [
    arrow(s, [a, b], [b, a], true),
    `M ${a} ${a} L 7.25 7.25`,
    arrow(s, [10.75, 10.75], [b, b], true),
  ];
};
