/** Checks live Source sites for the markers Pond's harvesters read, without signing in. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HARVEST = fileURLToPath(
  new URL("../src/main/core/refresh/harvest/", import.meta.url),
);
const TIKTOK_VIDEO =
  "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const YOUTUBE_VIDEO = "fOT0BUpITw8";
const YOUTUBE_PLAYLIST = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI";
const PINTEREST_FEED = "https://www.pinterest.com/pinterest/feed.rss";
/** Cosmos validates a query against its schema before it checks auth, so only an auth error means the fields still exist. */
const COSMOS_AUTH_CODES = new Set(["AUTHENTICATION", "UNAUTHENTICATED"]);

const source = (path) => readFile(`${HARVEST}${path}`, "utf8");

function match(text, pattern, label) {
  const found = pattern.exec(text)?.[1];
  if (!found) throw new Error(`Couldn't find ${label} in Pond's source`);
  return found;
}

async function userAgent(path, name) {
  const declaration = match(
    await source(path),
    new RegExp(`const ${name} =\\s*((?:"[^"]*"\\s*\\+?\\s*)+);`),
    name,
  );
  return [...declaration.matchAll(/"([^"]*)"/g)]
    .map((part) => part[1])
    .join("");
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** Reads the JSON object that starts right after `marker`, honoring strings so braces inside them don't count. */
function jsonAfter(text, marker) {
  const start = text.indexOf("{", text.indexOf(marker) + marker.length);
  if (text.indexOf(marker) < 0 || start < 0) return null;
  let depth = 0;
  let quoted = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\\") {
        index += 1;
      } else if (character === '"') {
        quoted = false;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}" && --depth === 0) {
      return JSON.parse(text.slice(start, index + 1));
    }
  }
  return null;
}

function scriptJson(html, id) {
  const body = new RegExp(
    `<script[^>]*\\sid=["']${id}["'][^>]*>([\\s\\S]*?)</script>`,
  ).exec(html)?.[1];
  return body ? JSON.parse(body) : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cosmosSchema() {
  const api = await source("cosmos/api.ts");
  const queries = {
    PondViewer: match(
      api,
      /const VIEWER_QUERY = `([\s\S]*?)`;/,
      "VIEWER_QUERY",
    ),
    PondLibrary: match(
      api,
      /const LIBRARY_QUERY = `([\s\S]*?)`;/,
      "LIBRARY_QUERY",
    ),
  };
  const url = match(api, /const GRAPHQL_URL = "([^"]+)"/, "GRAPHQL_URL");
  for (const [operationName, query] of Object.entries(queries)) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://www.cosmos.so",
        referer: "https://www.cosmos.so/",
      },
      body: JSON.stringify({
        operationName,
        query,
        variables: { userId: "0", pageSize: 1 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const errors = (await response.json()).errors ?? [];
    const drift = errors.filter(
      (error) => !COSMOS_AUTH_CODES.has(error.extensions?.code),
    );
    assert(
      drift.length === 0,
      `${operationName}: ${drift.map((error) => error.message).join("; ")}`,
    );
  }
  return "PondViewer and PondLibrary validate against the schema";
}

async function metaAppId(path, page) {
  const id = match(await source(path), /"x-ig-app-id": "(\d+)"/, "x-ig-app-id");
  const html = await fetchText(page, {
    headers: { "user-agent": await userAgent("tiktok/api.ts", "CHROME_UA") },
  });
  assert(
    html.includes(`"X-IG-App-ID":"${id}"`),
    `${page} no longer serves X-IG-App-ID ${id}`,
  );
  return `X-IG-App-ID ${id}`;
}

async function pinterestPin() {
  const feed = await fetchText(PINTEREST_FEED);
  const pinId = match(feed, /pinterest\.com\/pin\/(\d+)/, "a pin in the feed");
  const html = await fetchText(`https://www.pinterest.com/pin/${pinId}/`, {
    headers: {
      "user-agent": await userAgent("pinterest/api.ts", "USER_AGENT"),
      "accept-language": "en-US,en;q=0.9",
    },
  });
  assert(
    html.includes("__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("),
    "Pin pages no longer register Relay requests",
  );
  assert(
    html.includes('"v3GetPinQueryv2"'),
    "Pin pages no longer include v3GetPinQueryv2",
  );
  return `pin ${pinId} carries v3GetPinQueryv2`;
}

async function tiktokVideo() {
  const html = await fetchText(TIKTOK_VIDEO, {
    headers: { "user-agent": await userAgent("tiktok/api.ts", "CHROME_UA") },
  });
  const item = scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__")
    ?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  assert(item, "webapp.video-detail.itemInfo.itemStruct is missing");
  assert(item.author?.uniqueId, "itemStruct.author.uniqueId is missing");
  assert(item.video?.cover, "itemStruct.video.cover is missing");
  const integers = { createTime: item.createTime, ...item.stats };
  for (const [key, value] of Object.entries(integers)) {
    assert(/^\d+$/.test(String(value)), `${key} is ${JSON.stringify(value)}`);
  }
  return "itemStruct has author, cover, createTime, and stats as integers";
}

async function youtubeWatch() {
  const html = await fetchText(
    `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO}`,
    { headers: { "accept-language": "en-US,en;q=0.9" } },
  );
  const player = jsonAfter(html, "var ytInitialPlayerResponse = ");
  assert(player, "ytInitialPlayerResponse is missing");
  const details = player.videoDetails ?? {};
  assert(details.videoId === YOUTUBE_VIDEO, "videoDetails.videoId is missing");
  assert(
    /^\d+$/.test(details.viewCount ?? ""),
    "videoDetails.viewCount is missing",
  );
  assert(
    /^\d+$/.test(details.lengthSeconds ?? ""),
    "videoDetails.lengthSeconds is missing",
  );
  assert(
    player.microformat?.playerMicroformatRenderer?.publishDate,
    "microformat.playerMicroformatRenderer.publishDate is missing",
  );
  return "player response has views, length, and publish date";
}

async function youtubePlaylist() {
  const html = await fetchText(
    `https://www.youtube.com/playlist?list=${YOUTUBE_PLAYLIST}`,
    { headers: { "accept-language": "en-US,en;q=0.9" } },
  );
  const renderers = ["lockupViewModel", "playlistVideoRenderer"].filter(
    (renderer) => html.includes(`"${renderer}"`),
  );
  assert(renderers.length > 0, "Playlist items use an unknown renderer");
  return `items render as ${renderers.join(" and ")}`;
}

const checks = {
  "Cosmos GraphQL": cosmosSchema,
  "Instagram app ID": () =>
    metaAppId("instagram/item.ts", "https://www.instagram.com/"),
  "Threads app ID": () =>
    metaAppId("threads/item.ts", "https://www.threads.com/"),
  "Pinterest pin page": pinterestPin,
  "TikTok video hydration": tiktokVideo,
  "YouTube player response": youtubeWatch,
  "YouTube playlist items": youtubePlaylist,
};

let failed = 0;
for (const [name, check] of Object.entries(checks)) {
  try {
    console.log(`ok    ${name}: ${await check()}`);
  } catch (error) {
    failed += 1;
    console.log(
      `FAIL  ${name}: ${error instanceof Error ? error.message : error}`,
    );
  }
}
process.exitCode = failed > 0 ? 1 : 0;
