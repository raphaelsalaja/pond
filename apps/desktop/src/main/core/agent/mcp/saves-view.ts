export const SAVES_VIEW_URI = "ui://pond/saves.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** Self-contained so it runs under the host's default MCP Apps CSP, which allows inline script and `data:` images only. */
export const SAVES_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pond</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: var(--color-background-primary, Canvas);
    --fg: var(--color-text-primary, CanvasText);
    --muted: var(--color-text-secondary, color-mix(in srgb, CanvasText 60%, transparent));
    --tile: var(--color-background-secondary, color-mix(in srgb, CanvasText 6%, transparent));
    --line: var(--color-border-primary, color-mix(in srgb, CanvasText 12%, transparent));
    --radius: var(--border-radius-md, 8px);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif);
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; background: transparent; color: var(--fg); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .card {
    all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 6px; min-width: 0;
    border-radius: var(--radius);
  }
  .card:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
  .thumb {
    aspect-ratio: 1; width: 100%; border-radius: var(--radius); background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; display: grid; place-items: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb span { color: var(--muted); font-size: 11px; text-transform: capitalize; }
  .title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { color: var(--muted); margin: 0 0 12px; }
  .status:empty { display: none; }
  .empty { color: var(--muted); text-align: center; padding: 24px 0; }
  @media (hover: hover) { .card:hover .thumb { box-shadow: inset 0 0 0 1px var(--fg); } }
</style>
</head>
<body>
<p class="status" id="status" role="status"></p>
<div class="grid" id="grid"></div>
<script>
(function () {
  var nextId = 1;
  var pending = new Map();
  var grid = document.getElementById("grid");
  var status = document.getElementById("status");

  function send(message) { window.parent.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params });
    return new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params }); }

  function applyContext(context) {
    if (!context) return;
    if (context.theme) document.documentElement.style.colorScheme = context.theme;
    var variables = context.styles && context.styles.variables;
    if (variables) {
      Object.keys(variables).forEach(function (key) {
        if (variables[key]) document.documentElement.style.setProperty(key, variables[key]);
      });
    }
  }

  function callTool(name, args) {
    return request("tools/call", { name: name, arguments: args });
  }

  function errorText(result) {
    var block = result && result.content && result.content[0];
    if (!block || block.type !== "text") return "Pond couldn't do that.";
    try { var parsed = JSON.parse(block.text); if (parsed && parsed.error) return parsed.error; } catch (e) {}
    return block.text;
  }

  var queue = [];
  var active = 0;
  function loadNext() {
    if (active >= 4 || queue.length === 0) return;
    var job = queue.shift();
    active++;
    callTool("preview_save", { id: job.id }).then(function (result) {
      var url = result && result.structuredContent && result.structuredContent.dataUrl;
      if (url) {
        var img = document.createElement("img");
        img.alt = "";
        img.src = url;
        job.thumb.replaceChildren(img);
      }
    }).catch(function () {}).finally(function () { active--; loadNext(); });
    loadNext();
  }

  function render(saves) {
    grid.replaceChildren();
    if (!saves || saves.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No saves to show";
      grid.appendChild(empty);
      return;
    }
    saves.forEach(function (save) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.title = "Open in Pond";
      var thumb = document.createElement("div");
      thumb.className = "thumb";
      var kind = document.createElement("span");
      kind.textContent = save.mediaType || save.source;
      thumb.appendChild(kind);
      var title = document.createElement("div");
      title.className = "title";
      title.textContent = save.title || save.url;
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [save.source, save.author].filter(Boolean).join(" · ");
      card.append(thumb, title, meta);
      card.addEventListener("click", function () {
        status.textContent = "";
        callTool("open_save", { id: save.id }).then(function (result) {
          if (result && result.isError) status.textContent = errorText(result);
        }).catch(function () { status.textContent = "Pond couldn't open this save."; });
      });
      card.addEventListener("contextmenu", function (event) {
        if (!save.url) return;
        event.preventDefault();
        request("ui/open-link", { url: save.url }).catch(function () {});
      });
      grid.appendChild(card);
      queue.push({ id: save.id, thumb: thumb });
    });
    loadNext();
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method === undefined && pending.has(message.id)) {
      var entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(message.error); else entry.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result") {
      var content = message.params && message.params.structuredContent;
      render(content && content.saves);
    } else if (message.method === "ui/notifications/host-context-changed") {
      applyContext(message.params);
    } else if (message.id !== undefined && message.method) {
      send({ jsonrpc: "2.0", id: message.id, result: {} });
    }
  });

  new ResizeObserver(function () {
    var root = document.documentElement;
    notify("ui/notifications/size-changed", { width: root.scrollWidth, height: root.scrollHeight });
  }).observe(document.body);

  request("ui/initialize", {
    appInfo: { name: "Pond", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
    protocolVersion: "2026-01-26"
  }).then(function (result) {
    applyContext(result && result.hostContext);
    notify("ui/notifications/initialized", {});
  });
})();
</script>
</body>
</html>
`;
