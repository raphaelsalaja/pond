import { aligned, lengths } from "./parts/text-lines.mjs";

export default () =>
  aligned("right", [lengths.full, lengths.short, lengths.medium]);
