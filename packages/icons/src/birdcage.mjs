const dome = "M 4 14 V 8.5 A 5 5 0 0 1 14 8.5 V 14";
const base = "M 2.75 14 H 15.25";
const hook = "M 9 3.5 V 2.375";

export default () => [
  dome,
  base,
  hook,
  "M 7.25 14 V 3.875",
  "M 10.75 14 V 3.875",
];

export const open = () => [
  dome,
  base,
  hook,
  "M 7.25 14 V 10.75 A 1.75 1.75 0 0 1 10.75 10.75 V 14",
];
