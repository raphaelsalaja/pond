const { app } = require("electron");
const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const sandbox = mkdtempSync(join(tmpdir(), "pond-library-trust-"));
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
let started = false;
const timer = setTimeout(() => {
  console.error("LIBRARY_TRUST_SMOKE_FAILED: timed out");
  app.exit(1);
}, 45000);
app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", async () => {
    if (!contents.getURL().includes("index.html") || started) return;
    started = true;
    try {
      const backupPath = join(sandbox, "Proof Backup.pond");
      const eaglePath = join(sandbox, "Locked.library");
      mkdirSync(join(eaglePath, "images"), { recursive: true });
      writeFileSync(
        join(eaglePath, "metadata.json"),
        JSON.stringify({
          folders: [
            {
              id: "vault",
              name: "Vault",
              password: "x",
              children: [{ id: "inner", name: "Inner" }],
            },
          ],
          smartFolders: [],
          tagsGroups: [],
          quickAccess: [],
        }),
      );
      const result = await contents.executeJavaScript(`(async () => {
        const q = (name, input = {}) => window.pond.query(name, input);
        const backup = await q("library.backupTo", {
          path: ${JSON.stringify(backupPath)},
        });
        const eagle = await q("saves.importEagleLibrary", {
          path: ${JSON.stringify(eaglePath)},
          dryRun: true,
        });
        return { backup, eagle };
      })()`);
      assert.equal(result.backup.ok, true);
      const manifest = JSON.parse(
        readFileSync(join(backupPath, "pond-backup-manifest.json"), "utf8"),
      );
      assert.equal(manifest.version, 1);
      assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
      assert.ok(
        result.eagle.lockedFolders.some(
          (folder) => folder.id === "vault" && folder.reason === "password",
        ),
      );
      assert.ok(
        result.eagle.lockedFolders.some(
          (folder) =>
            folder.id === "inner" && folder.reason === "parent_locked",
        ),
      );
      clearTimeout(timer);
      console.log("LIBRARY_TRUST_SMOKE_OK", {
        copied: result.backup.copied,
        files: manifest.files.length,
        locked: result.eagle.lockedFolders,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      app.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("LIBRARY_TRUST_SMOKE_FAILED", error);
      app.exit(1);
    }
  });
});
import("../out/main/index.js").catch((error) => {
  clearTimeout(timer);
  console.error("LIBRARY_TRUST_SMOKE_FAILED", error);
  app.exit(1);
});
