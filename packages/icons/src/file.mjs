import file from "./parts/file.mjs";

export default (h, s) => file(h, s);

export const open = (h, s) => [
  file(h, s),
  "M 6.25 9.75 H 11.75",
  "M 6.25 12.5 H 9.75",
];
