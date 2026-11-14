import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA_TYPES } from "@pond/schema/db";
import { z } from "zod";
import type { ManualSaveInput } from "../../core/manual-import";
import {
  NullableStringParam,
  OptionalNumberParam,
  StringListParam,
  StringParam,
} from "./params";

export const CreateManualParamsSchema = z.object({
  title: NullableStringParam,
  url: NullableStringParam,
  note: NullableStringParam,
  tags: StringListParam,
  filePaths: StringListParam,
  sourceId: NullableStringParam,
  mediaType: z.enum(MEDIA_TYPES).nullable().optional(),
  width: OptionalNumberParam,
  height: OptionalNumberParam,
});

export function normalizeManualSaveInput(
  params: z.infer<typeof CreateManualParamsSchema>,
): ManualSaveInput {
  const input: ManualSaveInput = {
    title: params.title,
    url: params.url,
    note: params.note,
    tags: params.tags,
    filePaths: params.filePaths,
    sourceId: params.sourceId,
    mediaType: params.mediaType,
  };
  if (params.width != null && Number.isFinite(params.width)) {
    input.width = params.width;
  }
  if (params.height != null && Number.isFinite(params.height)) {
    input.height = params.height;
  }
  return input;
}

export const QuickAddParamsSchema = z.object({
  url: StringParam,
  note: NullableStringParam,
  tags: StringListParam,
  folderId: NullableStringParam,
});

export interface QuickAddInput {
  url: string;
  note: string | null;
  tags: string[];
}

export interface QuickAddRequest extends QuickAddInput {
  folderId: string | null;
}

export function normalizeQuickAddInput(
  params: z.infer<typeof QuickAddParamsSchema>,
): QuickAddRequest {
  return {
    url: params.url.trim(),
    note: params.note?.trim() || null,
    tags: params.tags,
    folderId: params.folderId?.trim() || null,
  };
}

export function normalizeClipboardFilePaths(
  uriList: string | null,
  plainText: string | null,
): string[] {
  const paths: string[] = [];
  const pushFileUrl = (raw: string) => {
    const token = raw.trim();
    if (!token.startsWith("file:")) return;
    try {
      paths.push(fileURLToPath(token));
    } catch {}
  };

  if (uriList != null) {
    for (const part of uriList.split(/\r?\n/)) {
      if (!part.startsWith("#")) pushFileUrl(part);
    }
  }

  if (plainText != null) {
    for (const part of plainText.split(/\s+/).filter(Boolean)) {
      if (part.startsWith("file:")) pushFileUrl(part);
      else if (isAbsolute(part)) paths.push(part);
    }
  }

  return [...new Set(paths)];
}
