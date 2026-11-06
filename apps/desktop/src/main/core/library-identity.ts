import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

export async function readLibraryIdentity(
  root: string,
): Promise<LibraryIdentity> {
  try {
    const parsed = StoredMetadataSchema.safeParse(
      JSON.parse(await readFile(join(root, "metadata.json"), "utf8")),
    );
    return identityFromMetadata(root, parsed.success ? parsed.data : {});
  } catch {
    return identityFromMetadata(root, {});
  }
}

function identityFromMetadata(
  root: string,
  metadata: z.infer<typeof StoredMetadataSchema>,
): LibraryIdentity {
  const icon = metadata.icon ?? null;
  return {
    name: metadata.name ?? libraryNameFromPath(root),
    icon,
    mark: icon ? (metadata.mark ?? null) : null,
    accent: metadata.accent ?? null,
  };
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
  return identityFromMetadata(root, parsed);
}
