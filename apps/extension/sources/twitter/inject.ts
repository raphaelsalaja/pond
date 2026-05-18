export function inject() {
  const POND_EVENT = "pond:capture";

  function emit(message: unknown) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function send(url: string, trigger: string) {
    emit({ kind: "capture", payload: { url, trigger } });
  }
  function log(level: string, message: string, data?: unknown) {
    emit({ kind: "log", level, message, data });
  }

  function isCapturedEndpoint(url: string) {
    return (
      /\/graphql\/[^/]+\/CreateBookmark(?:$|\?|\/)/.test(url) ||
      /\/graphql\/[^/]+\/FavoriteTweet(?:$|\?|\/)/.test(url) ||
      /\/CreateBookmark(?:$|\?|\/)/.test(url) ||
      /\/FavoriteTweet(?:$|\?|\/)/.test(url)
    );
  }

  function extractTweetIdFromBody(body: string | null) {
    if (!body) return null;
    try {
      const json = JSON.parse(body);
      const id =
        json?.variables?.tweet_id ??
        json?.variables?.tweetId ??
        json?.variables?.id;
      return id ? String(id) : null;
    } catch {
      const m = body.match(/"tweet_?[Ii]d"\s*:\s*"?(\d+)"?/);
      return m?.[1] ?? null;
    }
  }

  function emitTweet(id: string, trigger: string) {
    if (!id) return;
    send(`https://x.com/i/web/status/${id}`, trigger);
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input as Request)?.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const body = init?.body && typeof init.body === "string" ? init.body : null;

    const res = await origFetch.call(this, input, init);

    try {
      if (
        method === "POST" &&
        typeof url === "string" &&
        isCapturedEndpoint(url) &&
        res.ok
      ) {
        const id = extractTweetIdFromBody(body);
        if (id) emitTweet(id, "twitter:bookmark");
      }
    } catch (e) {
      log("warn", "twitter fetch hook error", String(e));
    }

    return res;
  };

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
          if (!isCapturedEndpoint(_url)) return;
          if (xhr.status < 200 || xhr.status >= 300) return;
          const id = extractTweetIdFromBody(_body);
          if (id) emitTweet(id, "twitter:bookmark");
        } catch (e) {
          log("warn", "twitter xhr hook error", String(e));
        }
      });
      return origSend.apply(xhr, arguments as any);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  (window as any).XMLHttpRequest = PatchedXHR;

  log("info", "twitter inject ready");
}
