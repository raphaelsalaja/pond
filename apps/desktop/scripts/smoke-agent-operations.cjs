const { app } = require("electron");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const sandbox = mkdtempSync(join(tmpdir(), "pond-agent-operations-"));
const userData = join(sandbox, "app");
const library = join(sandbox, "Test.pond");
mkdirSync(userData);
mkdirSync(library);
app.setPath("userData", userData);
app.setAppLogsPath(join(sandbox, "logs"));
writeFileSync(
  join(userData, "library-location.json"),
  JSON.stringify({ path: library }),
);
const cache = resolve(__dirname, "../node_modules/.cache");
mkdirSync(cache, { recursive: true });
const bundleDirectory = mkdtempSync(join(cache, "pond-agent-operations-"));
app.on("quit", () => {
  rmSync(sandbox, { recursive: true, force: true });
  rmSync(bundleDirectory, { recursive: true, force: true });
});
const timeout = setTimeout(() => {
  console.error("AGENT_OPERATIONS_FAILED: timed out");
  app.exit(1);
}, 45000);

app.whenReady().then(async () => {
  try {
    const { build } = await import("vite");
    const main = resolve(__dirname, "../src/main");
    const entry = join(bundleDirectory, "entry.js");
    writeFileSync(
      entry,
      `
          import assert from "node:assert/strict";
          import { pondOperations } from ${JSON.stringify(`${main}/ipc/queries/index.ts`)};
          import { registerPondOperations, applyPondOperation } from ${JSON.stringify(`${main}/core/agent/operations.ts`)};
          import { libraryContext } from ${JSON.stringify(`${main}/core/agent/context.ts`)};
          import { fishThread, appendMessage } from ${JSON.stringify(`${main}/core/agent/persist.ts`)};
          import { reviewChanges } from ${JSON.stringify(`${main}/core/agent/review.ts`)};
          import { listFolders } from ${JSON.stringify(`${main}/core/folders.ts`)};
          import { currentLibraryId } from ${JSON.stringify(`${main}/core/prefs-scope.ts`)};
          import { closeDb } from ${JSON.stringify(`${main}/db.ts`)};
          import { libraryRoot } from ${JSON.stringify(`${main}/paths.ts`)};
          export async function run(expectedLibrary) {
            assert.equal(libraryRoot(), expectedLibrary);
            const operations = pondOperations();
            registerPondOperations({ operations, libraryId: currentLibraryId });
            const context = libraryContext({ scope: {}, signal: new AbortController().signal, onActivity() {}, onSources() {} });
            const run = context.tools.find((entry) => entry.name === "runPondOperation");
            assert.ok(run);
            const prepared = await run.execute({ operation: "folders.create", arguments: { name: "Agent Smoke Folder" }, reason: "Create the test Folder" });
            assert.equal(prepared.status, "pending-review");
            assert.equal((await listFolders()).length, 0);
            const chat = await fishThread();
            const messageId = await appendMessage({ chatId: chat.id, role: "assistant", content: "Ready for review.", metadata: { changes: context.changes() } });
            const review = { messageId, changeIds: [prepared.changeId], action: "apply" };
            const applied = await reviewChanges(review);
            assert.equal(applied.changes[0].status, "applied");
            assert.ok(applied.changes[0].payload.result.id);
            assert.equal((await listFolders())[0].name, "Agent Smoke Folder");
            await reviewChanges(review);
            assert.equal((await listFolders()).length, 1);
            const undone = await applyPondOperation({ operation: "history.undo", arguments: {}, libraryId: currentLibraryId() });
            assert.equal(undone.ok, true);
            assert.equal((await listFolders()).length, 0);
            await closeDb();
            return { operations: operations.length, review: "applied", replay: "ignored", undo: "passed" };
          }
`,
    );
    await build({
      configFile: false,
      logLevel: "error",
      ssr: { noExternal: ["@pond/schema"] },
      build: {
        ssr: entry,
        outDir: bundleDirectory,
        emptyOutDir: false,
        rollupOptions: { output: { entryFileNames: "smoke.mjs" } },
      },
    });
    const fixture = await import(
      pathToFileURL(join(bundleDirectory, "smoke.mjs")).href
    );
    console.log(
      "AGENT_OPERATIONS_PASSED",
      JSON.stringify(await fixture.run(library)),
    );
    clearTimeout(timeout);
    app.quit();
  } catch (error) {
    clearTimeout(timeout);
    console.error("AGENT_OPERATIONS_FAILED", error);
    app.exit(1);
  }
});
