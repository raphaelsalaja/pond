import {
  type AppIconAppearance,
  appIconLabel,
  appIconTint,
  pickIconGeneration,
  sortAppIconIds,
} from "@shared/app-icons";
import { z } from "zod";

const previews = import.meta.glob(
  "../../../generated/app-icon-previews/*.png",
  {
    eager: true,
    import: "default",
  },
);

/** Preview images for one Icon Composer design generation. */
interface PreviewSet {
  light?: string;
  dark?: string;
}

export interface AppIconPreview {
  id: string;
  label: string;
  tint?: string;
  /** The macOS 26 images at the tint's root. */
  base: PreviewSet;
  /** Sets from the tint's `macos-NN/` folders, by generation. */
  generations: Map<number, PreviewSet>;
}

/** `grape.png`, `grape.dark.png`, `grape.27.png`, `grape.27.dark.png`. */
function parsePreviewPath(
  path: string,
): { id: string; generation: number | null; dark: boolean } | null {
  const match = path.match(/([^/.]+)(?:\.(\d+))?(\.dark)?\.png$/);
  if (!match?.[1]) return null;
  return {
    id: match[1],
    generation: match[2] ? Number(match[2]) : null,
    dark: Boolean(match[3]),
  };
}

const PreviewUrlSchema = z.string();

const previewsById = new Map<
  string,
  { base: PreviewSet; generations: Map<number, PreviewSet> }
>();
for (const [path, url] of Object.entries(previews)) {
  const parsed = PreviewUrlSchema.safeParse(url);
  if (!parsed.success) continue;
  const preview = parsePreviewPath(path);
  if (!preview) continue;
  const entry = previewsById.get(preview.id) ?? {
    base: {},
    generations: new Map<number, PreviewSet>(),
  };
  const set =
    preview.generation === null
      ? entry.base
      : (entry.generations.get(preview.generation) ?? {});
  set[preview.dark ? "dark" : "light"] = parsed.data;
  if (preview.generation !== null)
    entry.generations.set(preview.generation, set);
  previewsById.set(preview.id, entry);
}

export function listAppIconPreviews(): AppIconPreview[] {
  const ids = [...previewsById].flatMap(([id, entry]) =>
    entry.base.light ? [id] : [],
  );
  return sortAppIconIds(ids).map((id) => ({
    id,
    label: appIconLabel(id),
    tint: appIconTint(id),
    base: previewsById.get(id)?.base ?? {},
    generations: previewsById.get(id)?.generations ?? new Map(),
  }));
}

/** The swatch that matches the Dock: the design generation the running macOS uses, and Dark only in the Dark style. */
export function appIconSwatch(
  icon: AppIconPreview,
  appearance: AppIconAppearance | undefined,
): string {
  const generation = pickIconGeneration(
    icon.generations.keys(),
    appearance?.macosMajor ?? null,
  );
  const set =
    generation === null
      ? icon.base
      : (icon.generations.get(generation) ?? icon.base);
  if (appearance?.style === "dark" && set.dark) return set.dark;
  return set.light ?? icon.base.light ?? "";
}
