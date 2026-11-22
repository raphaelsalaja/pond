import { aligned, lengths } from "./parts/text-lines.mjs";

export default () => aligned("center", [lengths.full, lengths.short, lengths.medium]);
