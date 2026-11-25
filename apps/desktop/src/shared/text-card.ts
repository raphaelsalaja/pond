import type { RawJson } from "@pond/schema/raw";
import { z } from "zod";

export const TextCardDataSchema = z.object({ text: z.string() });

export type TextCardData = z.infer<typeof TextCardDataSchema>;

export const RENDER_TEXT_COVER_VERSION = 2;

export function textBodyFromFields(
  description: string | null | undefined,
  title: string | null | undefined,
): string {
  const body = description?.trim() ?? "";
  if (body) return body;
  return title?.trim() ?? "";
}

const BlockClassSchema = z.object({ blockClass: z.string() });

export function arenaBlockClassFromRawJson(
  rawJson: RawJson | null | undefined,
): string | null {
  const parsed = BlockClassSchema.safeParse(rawJson?.capture?.extras);
  return parsed.success ? parsed.data.blockClass.toLowerCase() : null;
}

export function textCoverVersionFromRawJson(
  rawJson: RawJson | null | undefined,
): number {
  const version = rawJson?.renderTextCoverVersion;
  return version !== undefined && Number.isFinite(version) ? version : 0;
}

export function buildTextCardData(
  text: string | null | undefined,
): TextCardData | null {
  const body = text?.trim() ?? "";
  if (!body) return null;
  return { text: body };
}
