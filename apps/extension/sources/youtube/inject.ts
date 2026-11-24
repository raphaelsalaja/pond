import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { asText, at, isRecord, parseJsonValue } from "@/utils/json";
import type { JsonValue } from "@/utils/json";

const YOUTUBEI_RE = /\/youtubei\/v1\//i;
const PLAYLIST_EDIT_HINT_RE =
  /(edit_playlist|add_to_watch_later|playlist\/(add|create|edit)|share\/get_share_panel)/i;
const LIKE_RE = /\/youtubei\/v1\/like\/like\b/i;
const VIDEO_ID_RE = /^[\w-]{11}$/;

function collectAddedVideoIds(node: JsonValue, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectAddedVideoIds(child, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const id =
      key === "addedVideoId" || key === "videoId" ? asText(value) : undefined;
    if (id !== undefined && VIDEO_ID_RE.test(id)) {
      out.add(id);
    } else {
      collectAddedVideoIds(value, out);
    }
  }
}

function findPlaylistIds(node: JsonValue, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      findPlaylistIds(child, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const id = key === "playlistId" ? asText(value) : undefined;
    if (id) {
      out.add(id);
    } else {
      findPlaylistIds(value, out);
    }
  }
}

function anyStringMatches(
  node: JsonValue,
  predicate: (s: string) => boolean,
): boolean {
  const text = asText(node);
  if (text !== undefined) {
    return predicate(text);
  }
  if (Array.isArray(node)) {
    return node.some((child) => anyStringMatches(child, predicate));
  }
  if (isRecord(node)) {
    return Object.values(node).some((child) =>
      anyStringMatches(child, predicate),
    );
  }
  return false;
}

function collectEditedVideoIds(node: JsonValue, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectEditedVideoIds(child, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  const videoId = asText(
    at(node, "playlistEditVideoAddedResultData", "videoId"),
  );
  if (videoId !== undefined) {
    out.add(videoId);
  }
  for (const child of Object.values(node)) {
    collectEditedVideoIds(child, out);
  }
}

function extractLikeVideoId(body: string | null): string | null {
  const json = parseJsonValue(body);
  const id =
    at(json, "target", "videoId") ??
    at(json, "videoId") ??
    at(json, "params", "videoId");
  if (!id) {
    return null;
  }
  const videoId = String(id);
  return VIDEO_ID_RE.test(videoId) ? videoId : null;
}

function classifyYoutubeiPost(
  url: string,
  requestBody: string | null,
  responseBody: string | null,
): Set<string> {
  const requestJson = parseJsonValue(requestBody);
  const responseJson = parseJsonValue(responseBody);

  const reqVideoIds = new Set<string>();
  collectAddedVideoIds(requestJson, reqVideoIds);
  const reqPlaylistIds = new Set<string>();
  findPlaylistIds(requestJson, reqPlaylistIds);
  const hasAddVideoAction = anyStringMatches(
    requestJson,
    (s) => s === "ACTION_ADD_VIDEO" || s === "addToPlaylistCommand",
  );

  const resVideoIds = new Set<string>();
  collectEditedVideoIds(responseJson, resVideoIds);
  const looksLikePlaylistEdit = PLAYLIST_EDIT_HINT_RE.test(url);
  const allVideoIds = new Set<string>([...reqVideoIds, ...resVideoIds]);

  if (allVideoIds.size === 0) {
    return new Set();
  }
  if (resVideoIds.size > 0) {
    return resVideoIds;
  }
  if (hasAddVideoAction || looksLikePlaylistEdit) {
    return allVideoIds;
  }
  return new Set();
}

export function inject(): void {
  const emitted = new Set<string>();

  function emitSave(videoId: string, trigger = "youtube:save"): void {
    if (!videoId || emitted.has(videoId)) {
      return;
    }
    emitted.add(videoId);
    capture(`https://www.youtube.com/watch?v=${videoId}`, trigger);
  }

  function handleYoutubeiPost(
    url: string,
    requestBody: string | null,
    responseBody: string | null,
  ): void {
    for (const id of classifyYoutubeiPost(url, requestBody, responseBody)) {
      emitSave(id);
    }
  }

  installInterceptor({
    id: "youtube",
    match: (req: RequestLens) =>
      req.method === "POST" &&
      (LIKE_RE.test(req.url) || YOUTUBEI_RE.test(req.url)),
    async onResponse(req, res) {
      if (!res.ok) {
        return;
      }
      if (LIKE_RE.test(req.url)) {
        const id = extractLikeVideoId(await req.readBody());
        if (id) {
          emitSave(id, "youtube:like");
        }
        return;
      }
      if (YOUTUBEI_RE.test(req.url)) {
        handleYoutubeiPost(req.url, await req.readBody(), await res.readText());
      }
    },
    onBeacon(url, body) {
      if (YOUTUBEI_RE.test(url)) {
        handleYoutubeiPost(url, body, null);
      }
    },
  });
}
