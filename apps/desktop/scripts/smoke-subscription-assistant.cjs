const { app } = require("electron");
const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

// Opt-in live check. Uses the CLI's saved plan sign-in and an isolated Library.
const provider = process.env.POND_SMOKE_PROVIDER || "codex";
assert.ok(["codex", "claude-code"].includes(provider));
const sandbox = mkdtempSync(path.join(tmpdir(), "pond-subscription-smoke-"));
mkdirSync(path.join(sandbox, "app-data"));
// The sandbox disables the loopback service. Its fixture token avoids opening
// the OS keychain while a CI desktop is locked; no user credentials are copied.
writeFileSync(
  path.join(sandbox, "app-data/secrets.json"),
  JSON.stringify({
    "so.pond.desktop:ingest-token": `raw:${Buffer.from("isolated-smoke-token").toString("base64")}`,
  }),
  { mode: 0o600 },
);
const output = path.resolve(
  process.env.POND_SMOKE_OUTPUT || path.join(sandbox, "results"),
);
mkdirSync(output, { recursive: true });
process.env.POND_SANDBOX = sandbox;
let started = false;
let complete = false;
app.on("before-quit", (event) => {
  if (!complete) {
    event.preventDefault();
  }
});
const timeout = setTimeout(() => {
  console.error("SUBSCRIPTION_SMOKE_FAILED: timed out");
  app.exit(1);
}, 180_000);

app.on("web-contents-created", (_, contents) => {
  contents.setBackgroundThrottling(false);
  contents.on("console-message", (event) => {
    if (event.message?.startsWith("SUBSCRIPTION_STAGE")) {
      console.log(event.message);
    }
  });
  contents.on("did-finish-load", () => {
    void (async () => {
      if (started || !contents.getURL().includes("index.html")) {
        return;
      }
      started = true;
      try {
        const result = await contents.executeJavaScript(`(async () => {
        const waitUntil = async (predicate) => {
          const deadline = Date.now() + 15_000;
          while (!predicate()) {
            if (Date.now() > deadline) throw new Error("App did not render");
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        };
        await waitUntil(() => document.querySelector('[data-slot="window"]'));
        console.log("SUBSCRIPTION_STAGE rendered");
        const provider = ${JSON.stringify(provider)};
        const connection = await window.pond.query("agent.saveKey", {provider, key: ""});
        if (!connection.ok) throw new Error(connection.error);
        console.log("SUBSCRIPTION_STAGE connected");
        const models = await window.pond.query("agent.listModels", {provider});
        if (!models.ok || !models.models.some(model => model.id === "default")) throw new Error("Default model missing");
        const chat = await window.pond.query("agent.newChat");
        const send = async (content, requestId) => {
          const reply = await window.pond.query("agent.send", {
            chatId: chat.id, requestId, provider, modelId: "default", content,
            scope: {kind: "library"}, attachmentIds: [], fileAttachmentIds: [],
          });
          if (reply.error || !reply.accepted) throw new Error(reply.error || "Request was not accepted");
          const messages = await window.pond.query("agent.messages", {chatId: chat.id});
          const message = messages.at(-1);
          if (message.role !== "assistant" || message.metadata?.error) throw new Error("Reply did not persist");
          return message;
        };
        const overview = await send("Use libraryOverview to check how many Saves are in this Library, then tell me the number.", "overview");
        console.log("SUBSCRIPTION_STAGE overview");
        const proposal = await send("Propose creating a folder named Subscription Smoke using proposeChanges with folderCreate. Leave it pending for my review. Do not apply it.", "proposal");
        const pending = proposal.metadata?.changes?.filter(change => change.status === "pending") || [];
        console.log("SUBSCRIPTION_STAGE proposed");
        const foldersBefore = await window.pond.query("folders.list");
        const review = pending.length ? await window.pond.query("agent.review", {
          messageId: proposal.id, changeIds: pending.map(change => change.id), action: "apply",
        }) : null;
        const foldersAfter = await window.pond.query("folders.list");
        return {
          provider, connection: connection.ok, model: models.models[0].id,
          overviewText: overview.content,
          completedTools: (overview.metadata?.steps || []).filter(step => step.status === "complete").length,
          pendingReviews: pending.length, foldersBefore: foldersBefore.length,
          foldersAfter: foldersAfter.length, appliedFolder: foldersAfter.some(folder => folder.name === "Subscription Smoke"),
          reviewSucceeded: Boolean(review?.changes?.every(change => change.status === "applied")),
          libraryIsolated: (await window.pond.query("library.info")).path.startsWith(${JSON.stringify(sandbox)}),
        };
      })()`);
        assert.equal(result.connection, true);
        assert.equal(result.libraryIsolated, true);
        assert.ok(result.overviewText.trim());
        assert.ok(result.completedTools > 0);
        assert.ok(result.pendingReviews > 0);
        assert.equal(result.foldersBefore, 0);
        assert.equal(result.reviewSucceeded, true);
        assert.equal(result.appliedFolder, true);
        await contents.executeJavaScript(
          `window.pond.query("settings.setPrefs", {agent: {addedProviders: ["codex", "claude-code"]}})`,
        );
        contents.send("pond:nav", "/settings/models");
        const settings = await contents.executeJavaScript(`(async () => {
        const deadline = Date.now() + 15_000;
        while (!document.querySelector('[aria-label="Subscriptions"] [aria-label="Claude Code"]')) {
          if (Date.now() > deadline) throw new Error("Subscription settings did not render");
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const section = document.querySelector('[aria-label="Subscriptions"]');
        return {
          hasCodex: section.textContent.includes("Codex"),
          hasClaudeLogin: section.textContent.includes("claude auth login"),
          hasApiKeyField: Boolean(section.querySelector('[aria-label="API Key"]')),
        };
      })()`);
        assert.equal(settings.hasCodex, true);
        assert.equal(settings.hasClaudeLogin, true);
        assert.equal(settings.hasApiKeyField, false);
        result.settings = settings;
        const screenshot = await contents.capturePage();
        writeFileSync(path.join(output, `${provider}.png`), screenshot.toPNG());
        writeFileSync(
          path.join(output, `${provider}.json`),
          JSON.stringify({ status: "passed", ...result }, null, 2),
        );
        clearTimeout(timeout);
        complete = true;
        console.log("SUBSCRIPTION_SMOKE_PASSED", JSON.stringify(result));
        if (!output.startsWith(sandbox)) {
          rmSync(sandbox, { recursive: true, force: true });
        }
        app.exit(0);
      } catch (error) {
        clearTimeout(timeout);
        writeFileSync(
          path.join(output, `${provider}.json`),
          JSON.stringify({ status: "failed", error: error.message }, null, 2),
        );
        console.error("SUBSCRIPTION_SMOKE_FAILED", error);
        app.exit(1);
      }
    })();
  });
});

function fail(error) {
  clearTimeout(timeout);
  console.error("SUBSCRIPTION_SMOKE_FAILED", error);
  app.exit(1);
}

import("../out/main/index.js").catch(fail);
