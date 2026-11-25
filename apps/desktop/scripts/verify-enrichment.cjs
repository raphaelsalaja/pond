const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(process.env.POND_VERIFY_ROOT);
const fixtures = JSON.parse(
  fs.readFileSync(process.env.POND_VERIFY_MANIFEST, "utf8"),
);
const mode = process.env.POND_VERIFY_MODE || "benchmark";
const fixtureHash = crypto.createHash("sha256");
for (const fixture of fixtures.files) {
  fixtureHash.update(fs.readFileSync(fixture.path));
}
const fixtureDigest = fixtureHash.digest("hex");
if (mode === "benchmark") assert.equal(fixtureDigest, fixtures.digest);
const main =
  process.env.POND_VERIFY_MAIN ||
  path.resolve(__dirname, "../out/main/index.js");
const expectedAi = {
  semanticSearch: true,
  enableClip: true,
  enableCaption: true,
  enableOcr: true,
  enableAutoTitle: true,
  enableSuggestedTags: true,
};
process.env.POND_SANDBOX = root;
fs.mkdirSync(root, { recursive: true });
const events = [];
let started = false;
const timer = setTimeout(
  () => finish(new Error("Enrichment verification timed out")),
  900_000,
);

function finish(error, result) {
  clearTimeout(timer);
  const body = error
    ? { ok: false, error: error.stack, events }
    : { ok: true, ...result, events };
  fs.writeFileSync(
    path.join(root, "result.json"),
    JSON.stringify(body, null, 2),
  );
  console.log(
    error ? "ENRICHMENT_FAILED" : "ENRICHMENT_PASSED",
    error
      ? error.message
      : JSON.stringify({ mode, saves: result.outputs?.length }),
  );
  app.exit(error ? 1 : 0);
}

app.on("web-contents-created", (_, contents) => {
  // Keep the finite comparison equivalent to a visible window while the user
  // works in another app. Both builds use exactly the same admission setting.
  contents.setBackgroundThrottling(false);
  contents.on("console-message", (details) => {
    const message = details.message || "";
    if (
      /\[(enrichment|inference|embedding-gemma|florence|whisper)\]/.test(
        message,
      )
    ) {
      events.push({ at: Date.now(), message });
      console.log("AI_EVENT", message);
    }
  });
  contents.on("did-finish-load", () => {
    void (async () => {
      if (started || !contents.getURL().includes("index.html")) {
        return;
      }
      started = true;
      try {
        const window = BrowserWindow.fromWebContents(contents);
        contents.setBackgroundThrottling(true);
        window?.hide();
        const state = await contents.executeJavaScript(`(async () => {
        const q = (name, input = {}) => window.pond.query(name, input);
        const info = await q("library.info");
        if (!info.path.startsWith(${JSON.stringify(root)})) throw new Error("Sandbox isolation failed");
        await q("settings.setPrefs", { ai: ${JSON.stringify(expectedAi)}, setup: { version: 1 } });
        for (const name of ["colour", "technology", "music"]) await q("tags.create", { name });
        const ids = [];
        for (const fixture of ${JSON.stringify(fixtures.files)}) {
          const created = await q("saves.createManual", { title: fixture.title, filePaths: [fixture.path] });
          if (!created.ok || !created.id) throw new Error("Fixture import failed");
          ids.push(created.id);
          if (/\\.mp4$/i.test(fixture.path)) await q("saves.regeneratePoster", { id: created.id });
        }
        return { ids, info, ai: (await q("settings.getPrefs")).ai };
      })()`);
        for (const [key, value] of Object.entries(expectedAi)) {
          assert.equal(state.ai[key], value);
        }
        contents.setBackgroundThrottling(false);
        window?.showInactive();
        console.log(
          "WORKLOAD_STARTED",
          JSON.stringify({ ids: state.ids.length, at: Date.now() }),
        );
        if (mode === "sampling") {
          const sampled = await contents.executeJavaScript(`(async () => {
          const q = (name, input = {}) => window.pond.query(name, input);
          const save = await q("saves.get", { id: ${JSON.stringify(state.ids[0])} });
          const file = save.files.find(file => /\\.mp4$/i.test(file.path));
          if (!file) throw new Error("Video fixture is missing");
          const result = await q("video.sampleFrames", { src: "pond://" + save.id + "/" + encodeURIComponent(file.path), maxFrames: 32, strategy: "embedding" });
          return { ok: result.ok, count: result.frames?.length, timestamps: result.frames?.map(frame => frame.timestamp), valid: result.frames?.every(frame => frame.bytes.length > 0) };
        })()`);
          assert.equal(sampled.ok, true);
          assert.equal(sampled.count, 32);
          assert.equal(sampled.valid, true);
          assert.deepEqual(
            sampled.timestamps,
            Array.from({ length: 32 }, (_, index) => index),
          );
          finish(null, { mode, sampled, ai: state.ai });
          return;
        }
        if (mode === "limits") {
          const bounds = await contents.executeJavaScript(`(async () => {
          const q = (name, input = {}) => window.pond.query(name, input);
          const save = await q("saves.get", { id: ${JSON.stringify(state.ids[0])} });
          const file = save.files.find(file => /\\.mp4$/i.test(file.path));
          if (!file) throw new Error("Video fixture is missing");
          const src = "pond://" + save.id + "/" + encodeURIComponent(file.path);
          const result = await q("media.decodeAudio", { src, maxSamples: 480000 });
          let externalRejected = false;
          try { await q("media.decodeAudio", { src: "https://example.invalid/secret", maxSamples: 480000 }); }
          catch { externalRejected = true; }
          return { ok: result.ok, samples: result.audio?.length, finite: result.audio?.every(Number.isFinite), externalRejected };
        })()`);
          assert.equal(bounds.ok, true);
          assert.ok(bounds.samples > 0 && bounds.samples <= 480_000);
          assert.equal(bounds.finite, true);
          assert.equal(bounds.externalRejected, true);
          finish(null, { mode, bounds, ai: state.ai });
          return;
        }
        const Database = require("better-sqlite3");
        const indexDir = path.join(root, "app-data/indexes");
        const dbPath = fs
          .readdirSync(indexDir)
          .find((file) => file.endsWith(".db"));
        assert.ok(dbPath, "Library index exists");
        const db = new Database(path.join(indexDir, dbPath), {
          readonly: true,
        });
        const statement = db.prepare(
          "SELECT id,media_type,title,caption,caption_model,ocr_text,ocr_model,embedding,embedding_model,clip_embedding,clip_model,suggested_tags_model FROM saves WHERE deleted_at IS NULL",
        );
        const assets = path.resolve(path.dirname(main), "../renderer/assets");
        const monitorFile = fs
          .readdirSync(assets)
          .find((name) => /^enrichment-monitor-.*\.js$/.test(name));
        assert.ok(monitorFile, "Production enrichment status module exists");
        const monitorUrl = pathToFileURL(path.join(assets, monitorFile)).href;
        const activity = () =>
          contents.executeJavaScript(`(async () => {
        const module = await import(${JSON.stringify(monitorUrl)});
        const monitor = Object.values(module).find(value => value && "snapshot" in Object(value));
        if (!monitor) throw new Error("Enrichment activity is unavailable");
        const state = monitor.snapshot();
        return { inflight: state.inflight, failed: state.failedKeys.size };
      })()`);
        let cancellation;
        if (mode === "cancel") {
          const deadline = Date.now() + 180_000;
          while (
            statement.all().filter((row) => row.clip_model).length === 0 &&
            Date.now() < deadline
          ) {
            await new Promise((resolve) => {
              setTimeout(resolve, 25);
            });
          }
          const before = statement.all().filter((row) => row.clip_model).length;
          assert.equal(
            before,
            1,
            "One visual job completed before cancellation",
          );
          await contents.executeJavaScript(
            'window.pond.query("settings.setPrefs", { ai: { enableClip: false } })',
          );
          const stoppedAt = Date.now();
          while (Date.now() - stoppedAt < 60_000) {
            assert.equal(
              statement.all().filter((row) => row.clip_model).length,
              before,
              "Disabled feature started a queued job",
            );
            await new Promise((resolve) => {
              setTimeout(resolve, 250);
            });
          }
          cancellation = {
            completedBefore: before,
            completedWhileDisabled: statement
              .all()
              .filter((row) => row.clip_model).length,
          };
          await contents.executeJavaScript(
            'window.pond.query("settings.setPrefs", { ai: { enableClip: true } })',
          );
        }
        const waitStarted = Date.now();
        let outputs;
        let settledAt = null;
        while (Date.now() - waitStarted < 840_000) {
          outputs = statement.all().filter((row) => state.ids.includes(row.id));
          if (
            outputs.length === state.ids.length &&
            outputs.every(
              (row) =>
                row.embedding_model &&
                row.clip_model &&
                row.caption_model &&
                row.ocr_model,
            )
          ) {
            const status = await activity();
            assert.equal(
              status.failed,
              0,
              "All enabled enrichments completed without failures",
            );
            if (status.inflight === 0) {
              settledAt ??= Date.now();
              if (Date.now() - settledAt >= 2000) {
                break;
              }
            } else {
              settledAt = null;
            }
          }
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });
        }
        assert.equal(outputs.length, state.ids.length);
        assert.equal(
          (await activity()).inflight,
          0,
          "Processing queue drained",
        );
        for (const output of outputs) {
          for (const field of ["embedding_model", "clip_model"]) {
            assert.ok(output[field], `${field} persisted`);
          }
          assert.ok(
            output.caption_model,
            "Image or video-poster caption persisted",
          );
          assert.ok(output.ocr_model, "Image or video-poster OCR persisted");
          for (const field of ["embedding", "clip_embedding"]) {
            const vector = JSON.parse(output[field]);
            assert.equal(vector.length, 768);
            assert.ok(vector.every(Number.isFinite));
            assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.001);
            output[field] = vector;
          }
        }
        const ai = await contents.executeJavaScript(
          'window.pond.query("settings.getPrefs").then(prefs => prefs.ai)',
        );
        for (const [key, value] of Object.entries(expectedAi)) {
          assert.equal(ai[key], value);
        }
        console.log(
          "WORKLOAD_COMPLETED",
          JSON.stringify({ at: Date.now(), saves: outputs.length }),
        );
        fs.writeFileSync(
          path.join(root, "complete.json"),
          JSON.stringify({ at: Date.now(), saves: outputs.length }),
        );
        await new Promise((resolve) => {
          setTimeout(resolve, 35_000);
        });
        fs.writeFileSync(
          path.join(root, "completed.png"),
          (await contents.capturePage()).toPNG(),
        );
        db.close();
        finish(null, {
          mode,
          outputs,
          ai,
          fixtureDigest,
          cancellation,
        });
      } catch (error) {
        finish(error);
      }
    })();
  });
});
import(pathToFileURL(main).href).catch(finish);
