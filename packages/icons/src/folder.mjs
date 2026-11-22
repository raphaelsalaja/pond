import folder from "./parts/folder.mjs";
import folderOpen from "./parts/folder-open.mjs";

export default (h, s) => folder(h, s);

export const open = (h, s) => folderOpen(h, s);
