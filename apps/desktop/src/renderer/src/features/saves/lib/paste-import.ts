import { z } from "zod";
import {
  importToast,
  UNSUPPORTED_DROP,
} from "@/features/saves/lib/import-feedback";
import { asUrlList, filePathsFromText } from "@/features/saves/lib/url-list";
import { importFilesWithDuplicateReview } from "@/features/saves/state/duplicate-import-review";
import { notify } from "@/shared/lib/toast";

export type PasteImport =
  | { kind: "files"; paths: string[] }
  | { kind: "urls"; urls: string[] }
  | { kind: "clipboard" };

const ImportReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    reason: z.string().optional().catch(undefined),
    id: z.string().optional().catch(undefined),
    ids: z.array(z.string()).optional().catch(undefined),
    failedPaths: z.array(z.string()).optional().catch(undefined),
  })
  .catch({ ok: false });

interface PasteImportTarget {
  id: string;
  name: string;
}

interface FolderInput {
  folderId?: string;
}

interface PlanResult {
  ids: string[];
  failed: number;
}

function replyResult(
  reply: z.infer<typeof ImportReplySchema>,
  attempted: number,
): PlanResult {
  if (!reply.ok) {
    return { ids: [], failed: reply.reason === "cancelled" ? 0 : attempted };
  }
  return { ids: reply.ids ?? [], failed: reply.failedPaths?.length ?? 0 };
}

function filePaths(data: DataTransfer): string[] {
  return Array.from(data.files ?? [])
    .map((file) => {
      try {
        return window.pond.pathForFile(file);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

/** Reads what a paste or drop would import, without importing it. */
export function pasteImportOf(data: DataTransfer): PasteImport | null {
  const paths = filePaths(data);
  if (paths.length) return { kind: "files", paths };
  const text = data.getData("text/uri-list") || data.getData("text/plain");
  const textPaths = filePathsFromText(text);
  if (textPaths.length) return { kind: "files", paths: textPaths };
  /** Browsers often advertise a `Files` type for copied links; prefer URL text before image import. */
  const urls = asUrlList(text);
  if (urls) return { kind: "urls", urls };
  const types = Array.from(data.types ?? []);
  /** Finder paste often exposes `Files` with an empty FileList; main reads the native pasteboard. */
  if (
    types.includes("Files") ||
    Array.from(data.files ?? []).some((file) =>
      file.type.startsWith("image/"),
    ) ||
    types.some((type) => type.startsWith("image/"))
  )
    return { kind: "clipboard" };
  return null;
}

interface FilesInput {
  paths: string[];
  folderIds?: string[];
}

function filesInput(paths: string[], folderId: string | undefined) {
  const input: FilesInput = { paths };
  if (folderId) input.folderIds = [folderId];
  return input;
}

async function importPlan(
  plan: PasteImport,
  folderId: string | undefined,
): Promise<PlanResult> {
  const into: FolderInput = {};
  if (folderId) into.folderId = folderId;
  switch (plan.kind) {
    case "files": {
      const reply = ImportReplySchema.parse(
        await importFilesWithDuplicateReview(filesInput(plan.paths, folderId)),
      );
      return replyResult(reply, plan.paths.length);
    }
    case "urls": {
      const result: PlanResult = { ids: [], failed: 0 };
      for (const url of plan.urls) {
        const reply = ImportReplySchema.parse(
          await window.pond.query("saves.quickAdd", { ...into, url }),
        );
        if (reply.ok && reply.id) result.ids.push(reply.id);
        else result.failed += 1;
      }
      return result;
    }
    case "clipboard": {
      const reply = ImportReplySchema.parse(
        await window.pond.query("saves.importClipboard", into),
      );
      return replyResult(reply, 1);
    }
  }
}

/** Imports the pasted or dropped files, links, or clipboard image as Saves, optionally into a folder, and returns their IDs. */
export async function runPasteImport(
  plan: PasteImport,
  target?: PasteImportTarget,
): Promise<string[]> {
  const { ids, failed } = await importPlan(plan, target?.id);
  const toast = importToast({
    kind: plan.kind,
    imported: ids.length,
    failed,
    folderName: target?.name,
  });
  if (toast) notify({ id: "paste-import", ...toast });
  return ids;
}

export function notifyUnsupportedDrop(): void {
  notify({ id: "paste-import", ...UNSUPPORTED_DROP });
}
