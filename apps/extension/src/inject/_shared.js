// Loaded into MAIN world via individual inject scripts. Defines window.__pond
// helpers for hooking fetch/XHR and posting capture events back to the
// content script.
(function () {
  if (window.__pond) return;

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

  function hookFetch(matcher) {
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      const req =
        input instanceof Request ? input : new Request(input, init);
      const url = req.url;
      const method = (init && init.method) || req.method || "GET";
      let body = null;
      try {
        if (init && init.body && typeof init.body === "string") {
          body = init.body;
        } else if (input instanceof Request) {
          body = await input.clone().text();
        }
      } catch (_) {}

      const res = await orig.call(this, input, init);

      try {
        const cloned = res.clone();
        const detector = matcher({ url, method, body });
        if (detector) {
          const text = await cloned.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          detector({ status: res.status, text, json });
        }
      } catch (e) {
        log("warn", "fetch hook error", String(e));
      }

      return res;
    };
  }

  function hookXhr(matcher) {
    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR() {
      const xhr = new OrigXHR();
      let _url = "";
      let _method = "GET";
      let _body = null;
      const origOpen = xhr.open;
      const origSend = xhr.send;

      xhr.open = function (method, url) {
        _method = method;
        _url = url;
        return origOpen.apply(xhr, arguments);
      };

      xhr.send = function (body) {
        _body = typeof body === "string" ? body : null;
        xhr.addEventListener("load", function () {
          try {
            const detector = matcher({
              url: _url,
              method: _method,
              body: _body,
            });
            if (detector) {
              let json = null;
              try {
                json = JSON.parse(xhr.responseText);
              } catch (_) {}
              detector({
                status: xhr.status,
                text: xhr.responseText,
                json,
              });
            }
          } catch (e) {
            log("warn", "xhr hook error", String(e));
          }
        });
        return origSend.apply(xhr, arguments);
      };

      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;
  }

  window.__pond = { capture, log, hookFetch, hookXhr };
})();
