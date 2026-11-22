import turn from "./parts/opens-turn.mjs";

/** Two open links on the square keyline's width, joined by a bar shorter than the gap. */
export default () => [
  "M 7.5 5.5 H 6 A 3.5 3.5 0 0 0 6 12.5 H 7.5",
  "M 10.5 5.5 H 12 A 3.5 3.5 0 0 1 12 12.5 H 10.5",
  "M 6.5 9 H 11.5",
];

/** The bar drops out and each link turns 20° about its own arc, splaying the chain open. */
export const open = () => [
  turn("M 7.5 5.5 H 6 A 3.5 3.5 0 0 0 6 12.5 H 7.5", 6, 9, -20),
  turn("M 10.5 5.5 H 12 A 3.5 3.5 0 0 1 12 12.5 H 10.5", 12, 9, -20),
];
