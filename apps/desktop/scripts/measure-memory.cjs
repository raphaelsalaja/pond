const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const IDLE_MS = 15000;
const SETTLE_MS = 15000;
const SAMPLE_COUNT = 3;
const SAMPLE_GAP_MS = 1000;
const SEED_SAVES = 50;
const SEED_SIZE = 256;
const CATEGORIES = {
  Browser: "browser",
  GPU: "gpu",
  Tab: "renderer",
  Utility: "utility",
};

const budgets = JSON.parse(
  readFileSync(join(__dirname, "memory-budgets.json"), "utf8"),
);
const reportPath =
  process.env.POND_MEMORY_REPORT || join(tmpdir(), "pond-memory-report.json");
const sandbox = mkdtempSync(join(tmpdir(), "pond-memory-smoke-"));
process.env.POND_SANDBOX = sandbox;
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /** Windows keeps the Library's files locked until exit; a throw here opens a modal that blocks it. */
  }
});

const timer = setTimeout(() => fail(new Error("timed out")), 180000);
const rendererReady = new Promise((resolve) => {
  ipcMain.once("pond:renderer-ready", (event) => resolve(event.sender));
});

function fail(error) {
  clearTimeout(timer);
  console.error("MEMORY_FAILED", error);
  app.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Electron reports process memory in kilobytes. */
const toMB = (kilobytes) => Math.round((kilobytes / 1024) * 10) / 10;

function snapshot() {
  const totals = {
    browser: 0,
    gpu: 0,
    renderer: 0,
    utility: 0,
    other: 0,
    total: 0,
  };
  const processes = app.getAppMetrics().map((metric) => {
    const kilobytes = metric.memory.workingSetSize;
    totals[CATEGORIES[metric.type] ?? "other"] += kilobytes;
    totals.total += kilobytes;
    return {
      pid: metric.pid,
      type: metric.type,
      name: metric.serviceName || metric.name,
      workingSetMB: toMB(kilobytes),
      privateMB:
        metric.memory.privateBytes === undefined
          ? undefined
          : toMB(metric.memory.privateBytes),
    };
  });
  return { totals, processes };
}

async function sample() {
  const samples = [];
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    if (index > 0) await sleep(SAMPLE_GAP_MS);
    samples.push(snapshot());
  }
  const totalsMB = {};
  for (const category of Object.keys(samples[0].totals)) {
    const values = samples
      .map((entry) => entry.totals[category])
      .sort((a, b) => a - b);
    totalsMB[category] = toMB(values[Math.floor(values.length / 2)]);
  }
  const info = await process.getProcessMemoryInfo();
  return {
    totalsMB,
    browserMemoryInfoMB: Object.fromEntries(
      Object.entries(info).map(([key, value]) => [key, toMB(value)]),
    ),
    processes: samples.at(-1).processes,
  };
}

function writeSeedImages() {
  const directory = join(sandbox, "seed");
  mkdirSync(directory);
  return Array.from({ length: SEED_SAVES }, (_, index) => {
    const bitmap = Buffer.alloc(SEED_SIZE * SEED_SIZE * 4);
    for (let pixel = 0; pixel < SEED_SIZE * SEED_SIZE; pixel++) {
      const offset = pixel * 4;
      bitmap[offset] = ((pixel % SEED_SIZE) + index * 5) & 255;
      bitmap[offset + 1] = Math.floor(pixel / SEED_SIZE) & 255;
      bitmap[offset + 2] = (index * 41) & 255;
      bitmap[offset + 3] = 255;
    }
    const path = join(directory, `seed-${index}.png`);
    writeFileSync(
      path,
      nativeImage
        .createFromBitmap(bitmap, { width: SEED_SIZE, height: SEED_SIZE })
        .toPNG(),
    );
    return path;
  });
}

async function measure() {
  const contents = await rendererReady;
  const window = BrowserWindow.fromWebContents(contents);
  if (!window) throw new Error("Library window is missing");
  const info = await contents.executeJavaScript(
    'window.pond.query("library.info")',
  );
  if (!info.path.startsWith(sandbox))
    throw new Error("Library is not isolated");
  const scenarios = {};

  await sleep(IDLE_MS);
  scenarios["idle-window-open"] = await sample();

  const created = await contents.executeJavaScript(`(async () => {
    let created = 0;
    for (const [index, path] of ${JSON.stringify(writeSeedImages())}.entries()) {
      const result = await window.pond.query("saves.createManual", { title: "Memory seed " + index, filePaths: [path] });
      if (result.ok && result.id) created++;
    }
    return created;
  })()`);
  if (created !== SEED_SAVES)
    throw new Error(`Seeded ${created} of ${SEED_SAVES} Saves`);
  await sleep(SETTLE_MS);
  scenarios["seeded-window-open"] = await sample();

  /** Windows and Linux quit on last close unless a tray keeps Pond resident, which this scenario models. */
  if (process.platform !== "darwin") {
    app.removeAllListeners("window-all-closed");
    app.on("window-all-closed", () => {});
  }
  await new Promise((resolve) => {
    window.once("closed", resolve);
    window.close();
  });
  await sleep(SETTLE_MS);
  scenarios["window-closed"] = await sample();
  return scenarios;
}

function checkBudgets(scenarios) {
  const failures = [];
  for (const [scenario, limits] of Object.entries(budgets)) {
    const totals = scenarios[scenario]?.totalsMB;
    if (!totals) throw new Error(`No measurement for budget ${scenario}`);
    for (const [category, budgetMB] of Object.entries(limits)) {
      if (totals[category] > budgetMB)
        failures.push({
          scenario,
          category,
          measuredMB: totals[category],
          budgetMB,
        });
    }
  }
  return failures;
}

function report(scenarios) {
  clearTimeout(timer);
  const failures = checkBudgets(scenarios);
  const json = JSON.stringify(
    {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      measuredAt: new Date().toISOString(),
      seedSaves: SEED_SAVES,
      budgets,
      scenarios,
      failures,
    },
    null,
    2,
  );
  writeFileSync(reportPath, json);
  console.log(json);
  for (const failure of failures) {
    const message = `Memory budget exceeded: ${failure.scenario} ${failure.category} ${failure.measuredMB} MB > ${failure.budgetMB} MB`;
    console.error(process.env.GITHUB_ACTIONS ? `::error::${message}` : message);
  }
  console.log(failures.length ? "MEMORY_FAILED" : "MEMORY_PASSED", reportPath);
  app.exit(failures.length ? 1 : 0);
}

measure().then(report).catch(fail);
import("../out/main/index.js").catch(fail);
