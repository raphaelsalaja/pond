// Decides which icon Pond shows for the selected color in the current macOS icon style.
import type { AppIconStyle } from "../../shared/app-icons";

/**
 * - `builtin`: Pond.app's own Icon Composer icon, which macOS draws natively in every icon style.
 * - `image`: a static image of the selected color.
 */
export type AppIconSource =
  | { kind: "builtin" }
  | { kind: "image"; path: string };

export function chooseAppIconSource(input: {
  platform: NodeJS.Platform;
  /** The packaged app carries its own icon; a development build's bundle icon is Electron's. */
  packaged: boolean;
  /** The built-in icon is the Icon Composer catalog, so it adapts to the icon style. */
  adaptiveBuiltin: boolean;
  isDefault: boolean;
  /** Null where macOS has no icon styles. */
  style: AppIconStyle | null;
  lightImage: string;
  darkImage: string | null;
}): AppIconSource {
  if (input.platform !== "darwin")
    return { kind: "image", path: input.lightImage };
  if (input.packaged && input.isDefault) return { kind: "builtin" };
  // Clear and Tinted drop the color, so every color looks like the built-in icon.
  if (input.adaptiveBuiltin && input.style === "monochrome")
    return { kind: "builtin" };
  if (input.style === "dark" && input.darkImage)
    return { kind: "image", path: input.darkImage };
  return { kind: "image", path: input.lightImage };
}
