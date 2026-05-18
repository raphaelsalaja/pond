export function inject() {
  if ((window as any).__pondYoutubeInjected) return;
  (window as any).__pondYoutubeInjected = true;

  const POND_EVENT = "pond:capture";
  const YOUTUBEI_RE = /\/youtubei\/v1\//i;
  const PLAYLIST_EDIT_HINT_RE =
    /(edit_playlist|add_to_watch_later|playlist\/(add|create|edit)|share\/get_share_panel)/i;
  const LIKE_RE = /\/youtubei\/v1\/like\/like\b/i;
  const VIDEO_ID_RE = /^[\w-]{11}$/;
  const _WATCH_LATER_PLAYLIST_ID = "WL";

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function readJson(text: string | null) {
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function readBody(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<string | null> {
    try {
      const b = init?.body;
      if (typeof b === "string") return b;
      if (b instanceof URLSearchParams) return b.toString();
      if (b instanceof Blob) return await b.text();
      if (b instanceof ArrayBuffer) return new TextDecoder().decode(b);
      if (ArrayBuffer.isView(b)) {
        return new TextDecoder().decode(b as Uint8Array);
      }
      if (b instanceof FormData) {
        const obj: Record<string, string> = {};
        b.forEach((v, k) => {
          obj[k] = typeof v === "string" ? v : "[file]";
        });
        return JSON.stringify(obj);
      }
      if (input instanceof Request) return await input.clone().text();
    } catch {
      /* unreadable */
    }
    return null;
  }

  function collectAddedVideoIds(node: unknown, out: Set<string>): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) collectAddedVideoIds(x, out);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (
        (k === "addedVideoId" || k === "videoId") &&
        typeof v === "string" &&
        VIDEO_ID_RE.test(v)
      ) {
        out.add(v);
      } else if (v && typeof v === "object") {
        collectAddedVideoIds(v, out);
      }
    }
  }

  function findPlaylistIds(node: unknown, out: Set<string>): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) findPlaylistIds(x, out);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (k === "playlistId" && typeof v === "string" && v.length > 0) {
        out.add(v);
      } else if (v && typeof v === "object") {
        findPlaylistIds(v, out);
      }
    }
  }

  function anyStringMatches(
    node: unknown,
    predicate: (s: string) => boolean,
  ): boolean {
    if (typeof node === "string") return predicate(node);
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) {
      for (const x of node) if (anyStringMatches(x, predicate)) return true;
      return false;
    }
    for (const v of Object.values(node)) {
      if (anyStringMatches(v, predicate)) return true;
    }
    return false;
  }

  function collectEditedVideoIds(node: unknown, out: Set<string>): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) collectEditedVideoIds(x, out);
      return;
    }
    const obj = node as Record<string, unknown>;
    const added = obj.playlistEditVideoAddedResultData as
      | Record<string, unknown>
      | undefined;
    if (added && typeof added.videoId === "string") {
      out.add(added.videoId);
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") collectEditedVideoIds(v, out);
    }
  }

  function extractLikeVideoId(body: string | null): string | null {
    const json = readJson(body);
    const id =
      json?.target?.videoId ?? json?.videoId ?? json?.params?.videoId ?? null;
    return id && VIDEO_ID_RE.test(String(id)) ? String(id) : null;
  }

  function classifyYoutubeiPost(
    url: string,
    requestBody: string | null,
    responseBody: string | null,
  ): Set<string> {
    const reqJson = readJson(requestBody);
    const resJson = readJson(responseBody);

    const reqVideoIds = new Set<string>();
    collectAddedVideoIds(reqJson, reqVideoIds);
    const reqPlaylistIds = new Set<string>();
    findPlaylistIds(reqJson, reqPlaylistIds);
    const hasAddVideoAction = anyStringMatches(
      reqJson,
      (s) => s === "ACTION_ADD_VIDEO" || s === "addToPlaylistCommand",
    );

    const resVideoIds = new Set<string>();
    collectEditedVideoIds(resJson, resVideoIds);
    const _allPlaylistIds = new Set<string>([...reqPlaylistIds]);
    const looksLikePlaylistEdit = PLAYLIST_EDIT_HINT_RE.test(url);
    const allVideoIds = new Set<string>([...reqVideoIds, ...resVideoIds]);

    if (allVideoIds.size === 0) return new Set();
    if (resVideoIds.size > 0) return resVideoIds;
    if (hasAddVideoAction || looksLikePlaylistEdit) return allVideoIds;
    return new Set();
  }

  const emitted = new Set<string>();
  function emitSave(videoId: string) {
    if (!videoId || emitted.has(videoId)) return;
    emitted.add(videoId);
    send(`https://www.youtube.com/watch?v=${videoId}`, "youtube:save");
  }

  function handleLike(_url: string, body: string | null) {
    const id = extractLikeVideoId(body);
    if (id) emitSave(id);
  }

  function handleYoutubeiPost(
    url: string,
    requestBody: string | null,
    responseBody: string | null,
  ) {
    const ids = classifyYoutubeiPost(url, requestBody, responseBody);
    for (const id of ids) emitSave(id);
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input as Request)?.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const bodyPromise =
      method === "POST" && typeof url === "string"
        ? readBody(input, init)
        : Promise.resolve<string | null>(null);

    const res = await origFetch.call(this, input, init);
    try {
      if (typeof url === "string" && res.ok && method === "POST") {
        if (LIKE_RE.test(url)) {
          handleLike(url, await bodyPromise);
        } else if (YOUTUBEI_RE.test(url)) {
          let responseText: string | null = null;
          try {
            responseText = await res.clone().text();
          } catch {
            /* consumed */
          }
          handleYoutubeiPost(url, await bodyPromise, responseText);
        }
      }
    } catch (err) {
      log("warn", "youtube fetch hook", { err: String(err) });
    }
    return res;
  };

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (
      url: string | URL,
      data?: BodyInit | null,
    ): boolean => {
      const result = origBeacon(url, data);
      try {
        const u = typeof url === "string" ? url : url.toString();
        if (YOUTUBEI_RE.test(u)) {
          void (async () => {
            let body: string | null = null;
            try {
              if (typeof data === "string") body = data;
              else if (data instanceof Blob) body = await data.text();
              else if (data instanceof ArrayBuffer) {
                body = new TextDecoder().decode(data);
              } else if (data && ArrayBuffer.isView(data)) {
                body = new TextDecoder().decode(data as Uint8Array);
              } else if (data instanceof URLSearchParams) {
                body = data.toString();
              } else if (data instanceof FormData) {
                const obj: Record<string, string> = {};
                data.forEach((v, k) => {
                  obj[k] = typeof v === "string" ? v : "[file]";
                });
                body = JSON.stringify(obj);
              }
            } catch {
              /* unreadable */
            }
            handleYoutubeiPost(u, body, null);
          })();
        }
      } catch (err) {
        log("warn", "youtube beacon hook", { err: String(err) });
      }
      return result;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR(this: XMLHttpRequest) {
    const xhr = new OrigXHR();
    let _url = "";
    let _method = "GET";
    let _body: string | null = null;
    const origOpen = xhr.open;
    const origSend = xhr.send;
    xhr.open = function (method: string, url: string) {
      _method = String(method ?? "GET").toUpperCase();
      _url = String(url ?? "");
      return origOpen.apply(xhr, arguments as any);
    };
    xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      _body = typeof body === "string" ? body : null;
      xhr.addEventListener("load", () => {
        try {
          if (_method !== "POST") return;
          if (xhr.status < 200 || xhr.status >= 300) return;
          const responseText =
            xhr.responseType === "" || xhr.responseType === "text"
              ? xhr.responseText
              : null;
          if (LIKE_RE.test(_url)) handleLike(_url, _body);
          else if (YOUTUBEI_RE.test(_url)) {
            handleYoutubeiPost(_url, _body, responseText);
          }
        } catch (err) {
          log("warn", "youtube xhr hook", { err: String(err) });
        }
      });
      return origSend.apply(xhr, arguments as any);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;

  log("info", "youtube inject ready");
}
