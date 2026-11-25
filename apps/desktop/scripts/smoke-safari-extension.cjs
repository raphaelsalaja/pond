/**
 * End-to-end check for the Safari row in the Browser Extension dialog.
 *
 * Boots the real main process, preload, and renderer, then drives the app the way a
 * person would: dismiss setup, open the workspace menu, choose Browser Extension, and
 * read the dialog. The status it asserts is the one `extension.safariStatus` reports,
 * derived from `pluginkit` plus whether an `.appex` sits in `Contents/PlugIns`.
 *
 * Run with: pnpm --filter @pond/desktop exec electron scripts/smoke-safari-extension.cjs
 */
const { app } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const sandbox = mkdtempSync(path.join(tmpdir(), "pond-safari-smoke-"));
process.env.POND_SANDBOX = sandbox;
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // Windows keeps the Library's files open until the process ends.
  }
});

let phase = 0;
let finished = false;
const timer = setTimeout(() => {
  console.error("SMOKE_FAILED: renderer did not finish");
  app.exit(1);
}, 120_000);

/** Waits for React to paint, then runs one renderer phase. */
const READY = `(() => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => {
    if (document.querySelector('[data-slot="window"]') && document.body.innerText.trim()) resolve();
    else if (Date.now() - started > 30000) reject(new Error("React did not render"));
    else setTimeout(poll, 50);
  };
  poll();
}))()`;

const PRESS = `const press = (el) => {
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
  el.click();
};`;

app.on("web-contents-created", (_, contents) => {
  contents.on("did-fail-load", (_, code, description) =>
    console.error("LOAD_FAILED", code, description),
  );
  contents.on("did-finish-load", () => {
    void (async () => {
      if (!contents.getURL().includes("index.html") || finished) {
        return;
      }
      const current = phase;
      phase += 1;
      try {
        if (current === 0) {
          // A brand new library opens on the setup screen, which has no workspace menu.
          await contents.executeJavaScript(`(async () => {
          await ${READY};
          await window.pond.query("settings.setOnboarded", {});
          return true;
        })()`);
          contents.reload();
          return;
        }

        const result = await contents.executeJavaScript(`(async () => {
        await ${READY};
        ${PRESS}
        const waitFor = (select, timeout = 15000) => new Promise((resolve, reject) => {
          const started = Date.now();
          const poll = () => {
            const found = document.querySelector(select);
            if (found) resolve(found);
            else if (Date.now() - started > timeout) reject(new Error("missing " + select));
            else setTimeout(poll, 50);
          };
          poll();
        });

        const status = await window.pond.query("extension.safariStatus", {});

        const trigger = await waitFor('[aria-haspopup="menu"]');
        press(trigger);
        const menu = await waitFor('[role="menu"]');
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const target = items.find((item) => (item.textContent || "").includes("Browser Extension"));
        if (!target) throw new Error("no Browser Extension item among " + items.length);

        press(target);
        await new Promise((resolve) => setTimeout(resolve, 800));

        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        const dialog = dialogs.find((d) => (d.textContent || "").includes("Browser Extension"));
        if (!dialog) throw new Error("extension dialog did not open (dialogs: " + dialogs.length + ")");

        return {
          status,
          platform: navigator.platform,
          text: dialog.textContent || "",
          buttons: [...dialog.querySelectorAll("button")].map((b) => (b.textContent || "").trim()),
        };
      })()`);

        finished = true;
        /** Normalized in Node: a `\s` escape inside the template literal above would collapse to `s`. */
        result.text = String(result.text).replaceAll(/\s+/g, " ").trim();
        console.log(
          "DIALOG_DEBUG",
          JSON.stringify({
            platform: result.platform,
            status: result.status,
            buttons: result.buttons,
            text: result.text,
          }),
        );

        assert.ok(
          ["enabled", "disabled", "not_registered", "not_bundled"].includes(
            result.status.state,
          ),
          `unexpected state: ${result.status.state}`,
        );
        assert.ok(
          ["developer-id", "ad-hoc", "unknown"].includes(
            result.status.signature,
          ),
          `unexpected signature: ${result.status.signature}`,
        );
        if (process.platform === "darwin") {
          assert.ok(
            result.platform.toLowerCase().includes("mac"),
            `expected macOS, got ${result.platform}`,
          );
          assert.ok(
            result.text.includes("Safari"),
            "dialog should name Safari",
          );
          if (result.status.state === "enabled") {
            assert.ok(
              result.text.includes("Enabled"),
              "enabled should show a badge",
            );
            assert.ok(
              !result.buttons.includes("Open Safari Settings"),
              "enabled should not offer to open Safari settings",
            );
          } else if (
            result.status.state === "disabled" ||
            result.status.state === "not_registered"
          ) {
            assert.ok(
              result.buttons.includes("Open Safari Settings"),
              "off state should offer to open Safari settings",
            );
            assert.ok(
              result.text.includes("Turn on Pond."),
              "off state should explain how",
            );
          } else {
            assert.ok(
              result.text.includes("Not included in this build"),
              "missing appex should say so",
            );
            assert.ok(!result.buttons.includes("Open Safari Settings"));
          }
        }

        clearTimeout(timer);
        console.log(
          "SMOKE_PASSED",
          JSON.stringify({
            state: result.status.state,
            bundleId: result.status.bundleId,
            buttons: result.buttons,
          }),
        );
        setTimeout(() => app.exit(0), 500);
      } catch (error) {
        finished = true;
        clearTimeout(timer);
        console.error("SMOKE_FAILED", error);
        app.exit(1);
      }
    })();
  });
});

function fail(error) {
  clearTimeout(timer);
  console.error("SMOKE_FAILED", error);
  app.exit(1);
}

import("../out/main/index.js").catch(fail);
