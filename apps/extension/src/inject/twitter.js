// Hooks Twitter/X CreateBookmark + FavoriteTweet GraphQL POSTs.
// Enrichment (title, image, author, etc.) is done server-side via FxTwitter
// to avoid flaky cross-origin calls and large-int precision bugs in the
// browser-side syndication token.
(function () {
  const POND_EVENT = "pond:capture";

  function emit(message) {
    window.postMessage({ type: POND_EVENT, message }, "*");
  }
  function capture(payload) {
    emit({ kind: "capture", payload });
  }
  function log(level, message, data) {
    emit({ kind: "log", level, message, data });
  }

  function isCapturedEndpoint(url) {
    return (
      /\/graphql\/[^/]+\/CreateBookmark(?:$|\?|\/)/.test(url) ||
      /\/graphql\/[^/]+\/FavoriteTweet(?:$|\?|\/)/.test(url) ||
      /\/CreateBookmark(?:$|\?|\/)/.test(url) ||
      /\/FavoriteTweet(?:$|\?|\/)/.test(url)
    );
  }

  function isInterestingGraphql(url) {
    return /\/i\/api\/graphql\//.test(url);
  }

  function extractTweetIdFromBody(body) {
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

  function emitTweet(id, kind) {
    if (!id) return;
    capture({
      source: "twitter",
      sourceId: String(id),
      url: `https://x.com/i/web/status/${id}`,
      raw: { kind, capturedAt: new Date().toISOString() },
    });
  }

  // --- fetch hook ---
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const body = init?.body && typeof init.body === "string" ? init.body : null;

    const res = await origFetch.call(this, input, init);

    try {
      if (method === "POST" && typeof url === "string") {
        if (isCapturedEndpoint(url)) {
          log("info", "twitter capture matched (fetch)", {
            url,
            status: res.status,
          });
          if (res.ok) {
            const id = extractTweetIdFromBody(body);
            if (id) emitTweet(id, "fetch");
            else log("warn", "no tweet id in fetch body", { body });
          }
        } else if (isInterestingGraphql(url)) {
          log("info", "twitter graphql POST (no match)", {
            url,
            status: res.status,
          });
        }
      }
    } catch (e) {
      log("warn", "twitter fetch hook error", String(e));
    }

    return res;
  };

  // --- XHR hook ---
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let _url = "";
    let _method = "GET";
    let _body = null;
    const origOpen = xhr.open;
    const origSend = xhr.send;
    xhr.open = function (method, url) {
      _method = String(method ?? "GET").toUpperCase();
      _url = String(url ?? "");
      return origOpen.apply(xhr, arguments);
    };
    xhr.send = function (body) {
      _body = typeof body === "string" ? body : null;
      xhr.addEventListener("load", function () {
        try {
          if (_method === "POST") {
            if (isCapturedEndpoint(_url)) {
              log("info", "twitter capture matched (xhr)", {
                url: _url,
                status: xhr.status,
              });
              if (xhr.status >= 200 && xhr.status < 300) {
                const id = extractTweetIdFromBody(_body);
                if (id) emitTweet(id, "xhr");
                else log("warn", "no tweet id in xhr body", { body: _body });
              }
            } else if (isInterestingGraphql(_url)) {
              log("info", "twitter graphql POST xhr (no match)", {
                url: _url,
                status: xhr.status,
              });
            }
          }
        } catch (e) {
          log("warn", "twitter xhr hook error", String(e));
        }
      });
      return origSend.apply(xhr, arguments);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  log("info", "twitter inject ready");
})();
