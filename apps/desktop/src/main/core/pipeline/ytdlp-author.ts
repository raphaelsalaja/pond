import type { Capture, CaptureAuthor, RawYtdlp } from "@pond/schema/raw";

export function authorFromYtdlp(
  info: RawYtdlp | undefined,
): CaptureAuthor | undefined {
  if (!info) return undefined;
  const author: CaptureAuthor = {};
  const name = info.uploader?.trim() || info.channel?.trim();
  if (name) author.name = name;
  const handle = info.uploader_id?.trim().replace(/^@/, "");
  if (handle) author.handle = handle;
  const profileUrl = info.uploader_url ?? info.channel_url;
  if (profileUrl) author.profileUrl = profileUrl;
  return author.name || author.handle ? author : undefined;
}

export function withYtdlpAuthor(
  capture: Capture,
  info: RawYtdlp | undefined,
): Capture {
  if (capture.author?.name || capture.author?.handle) return capture;
  const fallback = authorFromYtdlp(info);
  if (!fallback) return capture;
  return { ...capture, author: { ...capture.author, ...fallback } };
}

export function saveAuthorFrom(capture: Capture): string | null {
  return capture.author?.name ?? capture.author?.handle ?? null;
}
