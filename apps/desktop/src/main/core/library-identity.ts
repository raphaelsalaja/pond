import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  type LibraryMarkSource,
  LibraryMarkSourceSchema,
} from "../../shared/library-mark";
import { libraryNameFromPath } from "../lib/library-id";
import { renameSyncWithRetry } from "../lib/rename-retry";

const AccentSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((value) => value.toUpperCase());

const IconSchema = z
  .string()
  .max(1_000_000)
  .refine((value) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(value));

const StoredMetadataSchema = z.looseObject({
  name: z.string().trim().min(1).optional(),
  icon: IconSchema.optional(),
  mark: LibraryMarkSourceSchema.optional().catch(undefined),
  accent: AccentSchema.optional(),
});

export interface LibraryIdentity {
  name: string;
  icon: string | null;
  mark: LibraryMarkSource | null;
  accent: string | null;
}

export interface LibraryIdentityPatch {
  name?: string;
  icon?: string | null;
  mark?: LibraryMarkSource | null;
  accent?: string | null;
}

export function readLibraryIdentity(root: string): LibraryIdentity {
  const fallback = libraryNameFromPath(root);
  const empty = { name: fallback, icon: null, mark: null, accent: null };
  try {
    const parsed = StoredMetadataSchema.safeParse(
      JSON.parse(readFileSync(join(root, "metadata.json"), "utf8")),
    );
    if (!parsed.success) return empty;
    const icon = parsed.data.icon ?? null;
    return {
      name: parsed.data.name ?? fallback,
      icon,
      mark: icon ? (parsed.data.mark ?? null) : null,
      accent: parsed.data.accent ?? null,
    };
  } catch {
    return empty;
  }
}

export function updateLibraryIdentity(
  root: string,
  patch: LibraryIdentityPatch,
): LibraryIdentity {
  const file = join(root, "metadata.json");
  if (!existsSync(file)) throw new Error("Library metadata is missing.");
  const current = JSON.parse(readFileSync(file, "utf8"));
  /** A mark describes the stored icon, so a new icon without one drops the stale mark. */
  const mark =
    patch.mark !== undefined
      ? patch.mark
      : patch.icon !== undefined
        ? null
        : current.mark;
  const parsed = StoredMetadataSchema.parse({
    ...current,
    ...patch,
    icon: patch.icon === null ? undefined : (patch.icon ?? current.icon),
    mark: mark ?? undefined,
    accent:
      patch.accent === null ? undefined : (patch.accent ?? current.accent),
  });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(parsed, null, 2));
  renameSyncWithRetry(temporary, file);
  return readLibraryIdentity(root);
}
