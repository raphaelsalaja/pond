const { app } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const sandbox = mkdtempSync(join(tmpdir(), "pond-cleanup-smoke-"));
const imagePath = join(sandbox, "preview.png");
writeFileSync(
  imagePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
process.env.POND_SANDBOX = sandbox;
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // Windows keeps the Library's open files locked until this process ends.
    // Throwing here would raise a modal error dialog that blocks exit, so the
    // temporary sandbox is left for the OS to clean up instead.
  }
});
let complete = false;
let resolvePreview;
const previewReady = new Promise((resolve) => {
  resolvePreview = resolve;
});
const timer = setTimeout(() => {
  console.error("SMOKE_FAILED: renderer did not become ready");
  app.exit(1);
}, 30000);
app.on("web-contents-created", (_, contents) => {
  contents.on("did-fail-load", (_, code, description) =>
    console.error("LOAD_FAILED", code, description),
  );
  contents.on("did-finish-load", async () => {
    if (contents.getURL().includes("preview.html")) {
      try {
        await contents.executeJavaScript(`new Promise((resolve, reject) => {
          const started = Date.now();
          const poll = () => {
            const image = document.querySelector("#image");
            if (image?.complete && image.currentSrc) resolve();
            else if (Date.now() - started > 10000) reject(new Error("Preview image did not load"));
            else setTimeout(poll, 50);
          };
          poll();
        })`);
        resolvePreview();
      } catch (error) {
        clearTimeout(timer);
        console.error("SMOKE_FAILED", error);
        app.exit(1);
      }
      return;
    }
    if (!contents.getURL().includes("index.html") || complete) return;
    try {
      const state = await contents.executeJavaScript(`(async () => {
        await new Promise((resolve, reject) => {
          const started = Date.now();
          const poll = () => {
            if (document.querySelector('[data-slot="window"]') && document.body.innerText.trim()) resolve();
            else if (Date.now() - started > 15000) reject(new Error("React did not render visible content"));
            else setTimeout(poll, 50);
          };
          poll();
        });
        const info = await window.pond.query("library.info");
        const page = await window.pond.query("saves.listPage", { limit: 1 });
        const tags = await window.pond.query("tags.list");
        const created = await window.pond.query("saves.createManual", {
          title: "Preview smoke",
          filePaths: [${JSON.stringify(imagePath)}],
        });
        if (!created.ok || !created.id) throw new Error("Preview fixture was not created");
        const preview = await window.pond.openPreviewWindow({
          saveId: created.id,
          fileIndex: 0,
          kind: "detached",
        });
        return { info, page, tags, preview, root: Boolean(document.getElementById("root")), text: document.body.innerText.slice(0, 160) };
      })()`);
      assert.equal(state.root, true);
      assert.ok(state.text.trim());
      assert.ok(state.info.path.startsWith(sandbox));
      assert.ok(Array.isArray(state.page.rows));
      assert.ok(Array.isArray(state.tags));
      assert.ok(state.preview.windowId > 0);
      await Promise.race([
        previewReady,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Preview window did not become ready")),
            10000,
          ),
        ),
      ]);
      await contents.executeJavaScript(
        `window.pond.closePreviewWindow(${state.preview.windowId})`,
      );
      complete = true;
      clearTimeout(timer);
      console.log(
        "SMOKE_PASSED",
        JSON.stringify({
          render: state.text,
          saves: state.page.rows.length,
          tags: state.tags.length,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      app.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("SMOKE_FAILED", error);
      app.exit(1);
    }
  });
});
import("../out/main/index.js").catch((error) => {
  clearTimeout(timer);
  console.error("SMOKE_FAILED", error);
  app.exit(1);
});
