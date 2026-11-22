import { aligned, lengths } from "./parts/text-lines.mjs";

export default () => aligned("left", [lengths.full, lengths.short, lengths.medium]);
