import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type LibraryHealthCheck,
  LibraryHealthCheckSchema,
} from "../../../shared/library-health-contracts";
import { renameWithRetry } from "../../lib/rename-retry";

const StoredCheckSchema = z.object({
  version: z.literal(1),
  check: LibraryHealthCheckSchema,
});

/** Results are derived and per Library, so they live beside the index instead of inside the Library. */
export function createLibraryHealthStore(directory: () => string) {
  function file(libraryId: string): string {
    return join(directory(), `${encodeURIComponent(libraryId)}.json`);
  }

  async function read(libraryId: string): Promise<LibraryHealthCheck | null> {
    let text: string;
    try {
      text = await readFile(file(libraryId), "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = StoredCheckSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.check : null;
    } catch {
      return null;
    }
  }

  async function write(
    libraryId: string,
    check: LibraryHealthCheck,
  ): Promise<void> {
    await mkdir(directory(), { recursive: true });
    const target = file(libraryId);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, check }), "utf8");
    await renameWithRetry(temporary, target);
  }

  return { read, write };
}
