const { app } = require("electron");
const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const sandbox = mkdtempSync(join(tmpdir(), "pond-folder-tags-smoke-"));
process.env.POND_SANDBOX = sandbox;
const originalPaths = Array.from({ length: 50 }, (_, index) => {
  const path = join(sandbox, `original-${index}.txt`);
  writeFileSync(path, `File import recovery fixture ${index}.`);
  return path;
});
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
  console.error("FOLDER_TAGS_FAILED: timed out");
  app.exit(1);
}, 45000);
app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", async () => {
    if (!contents.getURL().includes("index.html") || started) return;
    started = true;
    try {
      const state = await contents.executeJavaScript(`(async () => {
        const q = (name,input={}) => window.pond.query(name,input);
        const roots = await q("folders.createBatch",{names:["Work","Personal"]});
        const work = roots.find((folder) => folder.name === "Work");
        const personal = roots.find((folder) => folder.name === "Personal");
        const child = await q("folders.create",{name:"Posters",parentId:work.id});
        await q("folders.rules.set",{id:work.id,tags:["Work"]});
        await q("folders.rules.set",{id:child.id,tags:["Print"]});
        await q("folders.rules.set",{id:personal.id,tags:["Personal"]});
        const created = await q("saves.createManual",{title:"Fixture",note:"Manual registry and inheritance",tags:["qa"]});
        await q("folders.assign",{saveIds:[created.id],addIds:[child.id],removeIds:[]});
        const assigned = await q("saves.get",{id:created.id});
        await q("folders.moveBatch",{ids:[child.id],parentId:personal.id});
        const moved = await q("saves.get",{id:created.id});
        const undoMove = await window.pond.undo();
        const afterUndoMove = await q("saves.get",{id:created.id});
        const treeAfterUndo = await q("folders.list");
        const undoAssign = await window.pond.undo();
        const afterUndoAssign = await q("saves.get",{id:created.id});
        const memberships = await q("folders.memberships");
        const registry = await q("tags.list");
        const rules = await q("folders.rules.get",{id:child.id});
        const imported = await q("saves.createManual",{sourceId:"recovery-fixture",filePaths:${JSON.stringify(originalPaths)}});
        const fileSave = await q("saves.get",{id:imported.id});
        const info = await q("library.info");
        return {assigned,moved,undoMove,afterUndoMove,treeAfterUndo,undoAssign,afterUndoAssign,memberships,registry,rules,work,child,fileSave,info};
      })()`);
      assert.deepEqual(state.assigned.tags, ["qa", "Print", "Work"]);
      assert.deepEqual(state.moved.tags, ["qa", "Print", "Work", "Personal"]);
      assert.equal(state.undoMove.ok, true);
      assert.deepEqual(state.afterUndoMove.tags, ["qa", "Print", "Work"]);
      assert.equal(
        state.treeAfterUndo.find((folder) => folder.id === state.child.id)
          .parentId,
        state.work.id,
      );
      assert.equal(state.undoAssign.ok, true);
      assert.deepEqual(state.afterUndoAssign.tags, ["qa"]);
      assert.equal(
        state.memberships.some((row) => row.saveId === state.assigned.id),
        false,
      );
      assert.ok(state.registry.some((tag) => tag.name === "qa"));
      assert.deepEqual(state.rules.inheritedTags, ["Work"]);
      assert.equal(state.fileSave.files.length, originalPaths.length);
      assert.ok(state.info.path.startsWith(sandbox));
      rmSync(
        join(
          state.info.path,
          "items",
          `${state.fileSave.id}.info`,
          state.fileSave.files[0].path,
        ),
      );
      const retried = await contents.executeJavaScript(`(async () => {
        const result = await window.pond.query("saves.createManual",{sourceId:"recovery-fixture",filePaths:${JSON.stringify(originalPaths)}});
        return {result,save:await window.pond.query("saves.get",{id:result.id})};
      })()`);
      assert.equal(retried.result.id, state.fileSave.id);
      assert.equal(retried.result.skipped, undefined);
      assert.equal(retried.save.files.length, originalPaths.length);
      const transferDirectory = join(app.getPath("userData"), "transfer-jobs");
      assert.ok(transferDirectory.startsWith(sandbox));
      mkdirSync(transferDirectory, { recursive: true });
      const exportDirectory = join(sandbox, "exports");
      mkdirSync(exportDirectory);
      const jobId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
      writeFileSync(
        join(transferDirectory, "jobs.json"),
        JSON.stringify([
          {
            id: jobId,
            request: {
              kind: "export_files",
              origin: state.info.path,
              destination: exportDirectory,
              ids: [state.fileSave.id],
            },
            status: "running",
            phase: "Interrupted copy",
            completed: 0,
            total: 1,
            bytes: 0,
            currentFile: null,
            error: null,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]),
      );
      const transfer = await contents.executeJavaScript(`(async () => {
        const q = (name,input={}) => window.pond.query(name,input);
        const before = await q("transferJobs.list");
        await q("transferJobs.retry",{id:${JSON.stringify(jobId)}});
        const cancelled = await q("transferJobs.cancel",{id:${JSON.stringify(jobId)}});
        async function settled() {
          for(let i=0;i<100;i++) {
            const job=(await q("transferJobs.list"))[0];
            if(job && !["running","cancelling"].includes(job.status)) return job;
            await new Promise((resolve) => setTimeout(resolve,25));
          }
          throw new Error("Transfer did not settle");
        }
        const stopped = await settled();
        await q("transferJobs.retry",{id:${JSON.stringify(jobId)}});
        const finished = await settled();
        const downloads = [...document.querySelectorAll("button")].find((button)=>button.textContent?.trim().startsWith("Downloads"));
        downloads?.click();
        for(let i=0;i<60 && !document.querySelector('[aria-label="Library transfers"]');i++) await new Promise((resolve)=>setTimeout(resolve,50));
        return {before,cancelled,stopped,finished,visible:document.querySelector('[aria-label="Library transfers"]')?.textContent ?? ""};
      })()`);
      console.log(
        "TRANSFER_SMOKE_STATES",
        JSON.stringify({
          before: transfer.before[0]?.status,
          cancelled: transfer.cancelled,
          stopped: transfer.stopped?.status,
          finished: transfer.finished?.status,
          visible: transfer.visible,
        }),
      );
      assert.equal(transfer.before[0].status, "interrupted");
      if (transfer.cancelled.ok) {
        assert.equal(transfer.stopped.status, "cancelled");
      } else {
        assert.equal(transfer.stopped.status, "completed");
      }
      assert.equal(transfer.finished.status, "completed");
      assert.ok(
        readdirSync(exportDirectory).some((name) => name.endsWith(".txt")),
      );
      assert.match(transfer.visible, /Export Files/);
      clearTimeout(timer);
      console.log(
        "FOLDER_TAGS_PASSED",
        JSON.stringify({
          registry: state.registry.length,
          inherited: state.rules.inheritedTags,
          undo: true,
          originalRecovered: true,
          transferCancelObserved: transfer.cancelled.ok,
          transferRetry: true,
          transferVisible: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      app.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("FOLDER_TAGS_FAILED", error);
      app.exit(1);
    }
  });
});
import("../out/main/index.js").catch((error) => {
  clearTimeout(timer);
  console.error("FOLDER_TAGS_FAILED", error);
  app.exit(1);
});
