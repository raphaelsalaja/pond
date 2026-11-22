import { digits, H } from "./text-letter.mjs";

/** An H on the left of the square keyline, the level's digit on the right. */
export const letter = { x0: 2.375, x1: 7.125 };
export const digit = { x0: 10.375, x1: 15.625 };

export default (level) => [H(letter.x0, letter.x1), digits[level](digit)];
