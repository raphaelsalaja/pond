import { nativeImage } from "electron";
import type { NativeImage } from "electron";

/** Optical size of a Tahoe menu glyph; named images render much larger. */
const MENU_SYMBOL_PX = 16;

const cache = new Map<string, NativeImage | undefined>();

export function sym(
  name: string,
): { icon: NativeImage } | Record<string, never> {
  if (process.platform !== "darwin") {
    return {};
  }
  let img = cache.get(name);
  if (img === undefined && !cache.has(name)) {
    img = load(name);
    cache.set(name, img);
  }
  return img ? { icon: img } : {};
}

function load(name: string): NativeImage | undefined {
  try {
    const source = nativeImage.createFromNamedImage(name);
    if (source.isEmpty()) {
      return undefined;
    }
    const { width, height } = source.getSize();
    const long = Math.max(width, height, 1);
    const sized = source.resize({
      width: Math.max(1, Math.round((width / long) * MENU_SYMBOL_PX)),
      height: Math.max(1, Math.round((height / long) * MENU_SYMBOL_PX)),
      quality: "best",
    });
    if (sized.isEmpty()) {
      return undefined;
    }
    sized.setTemplateImage(true);
    return sized;
  } catch {
    return undefined;
  }
}
