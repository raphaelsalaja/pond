import file from "./parts/file.mjs";

/** The zipper runs down from the top edge to its pull. */
export default (h, s) => {
  const [, y0] = s.keylines.tall;
  const x = 7.5;
  const pull = 8.75;
  return [file(h, s), `M ${x} ${y0} V ${pull}`, h.rect(x - 1.25, pull, 2.5, 3.5, s.ease)];
};
