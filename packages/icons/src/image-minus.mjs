import badge from "./parts/badge.mjs";
import image from "./parts/media-image.mjs";

export default (h, s) => [image(h, s), badge("minus")];
