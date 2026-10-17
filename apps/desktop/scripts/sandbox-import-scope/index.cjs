const { app, BrowserWindow, ipcMain, session } = require("electron");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { createConnection } = require("node:net");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { SIGN_IN, STEPS } = require("./steps.cjs");

const args = new Set(process.argv.slice(2));
const selfTest = args.has("--self-test");
const sandbox = selfTest
  ? mkdtempSync(join(tmpdir(), "pond-import-scope-self-test-"))
  : (process.env.POND_SANDBOX ?? join(tmpdir(), "pond-import-scope-sandbox"));
if (args.has("--fresh")) rmSync(sandbox, { recursive: true, force: true });
if (selfTest) {
  process.once("exit", () => rmSync(sandbox, { recursive: true, force: true }));
}
mkdirSync(sandbox, { recursive: true });
process.env.POND_SANDBOX = sandbox;

const resultsJson = join(sandbox, "import-scope-results.json");
const resultsMd = join(sandbox, "import-scope-results.md");
const results = existsSync(resultsJson)
  ? JSON.parse(readFileSync(resultsJson, "utf8"))
  : {};

let pondContents = null;
let guide = null;
const signInWindows = new Map();

function writeResults() {
  writeFileSync(resultsJson, JSON.stringify(results, null, 2));
  const lines = ["# Import scope sandbox results", ""];
  for (const step of STEPS) {
    const result = results[step.id];
    if (!step.source) continue;
    lines.push(`## ${step.title}`, "");
    lines.push(`Result: ${result?.verdict ?? "not run"}`);
    if (result?.note) lines.push("", result.note);
    for (const check of result?.checks ?? []) {
      const mark = check.ok === null ? "-" : check.ok ? "[x]" : "[ ]";
      lines.push(`- ${mark} ${check.label}`);
    }
    lines.push("");
  }
  writeFileSync(resultsMd, lines.join("\n"));
}

function pondQuery(expression) {
  if (!pondContents || pondContents.isDestroyed()) {
    throw new Error("Pond's window isn't open.");
  }
  return pondContents.executeJavaScript(expression);
}

async function accountFor(source) {
  const { accounts } = await pondQuery(
    `window.pond.query("accounts.list", {})`,
  );
  return accounts.find((account) => account.source === source) ?? null;
}

function indexDbPath() {
  const dir = join(sandbox, "app-data", "indexes");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function sinceStartMs(since) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since ?? "");
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ).getTime();
}

function readSaves(accountId, since) {
  const empty = {
    total: 0,
    complete: 0,
    skipped: 0,
    failed: 0,
    ingesting: 0,
    filtered: { media: 0, since: 0 },
    listKinds: { saved: 0, liked: 0, both: 0 },
    completeText: 0,
    completeBeforeSince: 0,
    folders: [],
    recent: [],
  };
  const file = indexDbPath();
  if (!accountId || !file) return empty;
  const Database = require("better-sqlite3");
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const live = "account_id = ? and deleted_at is null";
    const saves = { ...empty, filtered: { media: 0, since: 0 } };
    for (const row of db
      .prepare(
        `select status, json_extract(raw_json, '$.importFilter') as filter, count(*) as n
         from saves where ${live} group by 1, 2`,
      )
      .all(accountId)) {
      saves.total += row.n;
      if (row.status in saves) saves[row.status] += row.n;
      if (row.filter in saves.filtered) saves.filtered[row.filter] += row.n;
    }
    const listKinds = { saved: 0, liked: 0, both: 0 };
    for (const row of db
      .prepare(
        `select list_kinds as kinds, count(*) as n from saves
         where ${live} and status != 'skipped' group by 1`,
      )
      .all(accountId)) {
      const kinds = JSON.parse(row.kinds ?? "[]");
      if (kinds.includes("saved") && kinds.includes("liked")) {
        listKinds.both += row.n;
      } else if (kinds.includes("saved")) listKinds.saved += row.n;
      else if (kinds.includes("liked")) listKinds.liked += row.n;
    }
    saves.listKinds = listKinds;
    saves.completeText = db
      .prepare(
        `select count(*) as n from saves where ${live} and status = 'complete'
         and not exists (
           select 1 from json_each(raw_json, '$.capture.media') as m
           where json_extract(m.value, '$.type') in ('image', 'video')
         )`,
      )
      .get(accountId).n;
    const sinceMs = sinceStartMs(since);
    saves.completeBeforeSince =
      sinceMs === null
        ? 0
        : db
            .prepare(
              `select count(*) as n from saves where ${live}
               and status = 'complete' and published_at < ?`,
            )
            .get(accountId, sinceMs).n;
    saves.folders = db
      .prepare(
        `select coalesce(p.name || '/', '') || f.name as path, count(*) as count
         from save_folders sf
         join saves s on s.id = sf.save_id
         join folders f on f.id = sf.folder_id
         left join folders p on p.id = f.parent_id
         where s.account_id = ? and s.deleted_at is null
         group by f.id order by count desc`,
      )
      .all(accountId);
    saves.recent = db
      .prepare(
        `select title, url, status, json_extract(raw_json, '$.importFilter') as filter,
         list_kinds as listKinds, published_at as publishedAt
         from saves where ${live} order by rowid desc limit 12`,
      )
      .all(accountId);
    return saves;
  } finally {
    db.close();
  }
}

async function evidence(source) {
  const account = await accountFor(source);
  const scope = account?.sync.importScope ?? {};
  return {
    account: account && {
      id: account.id,
      handle: account.handle,
      scope,
      importPending: account.sync.importPending === true,
      syncing: account.syncing,
      lastError: account.sync.lastError,
      lastSyncedAt: account.sync.lastSyncedAt,
    },
    saves: readSaves(account?.id, scope.since),
  };
}

function nativeCall(message) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(sandbox, "native.sock"));
    const chunks = [];
    socket.on("connect", () => {
      const payload = Buffer.from(JSON.stringify(message), "utf8");
      const header = Buffer.alloc(4);
      header.writeUInt32LE(payload.length, 0);
      socket.write(Buffer.concat([header, payload]));
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length < 4) {
        reject(new Error("Pond closed the connection without answering."));
        return;
      }
      const length = buffer.readUInt32LE(0);
      resolve(JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
    });
  });
}

function signInPartition(source) {
  return `persist:pond-sandbox-signin-${source}`;
}

function openSignIn(source) {
  const target = SIGN_IN[source];
  const existing = signInWindows.get(source);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const jar = session.fromPartition(signInPartition(source));
  const userAgent = jar.getUserAgent().replace(/ (Electron|pond)\/\S+/gi, "");
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    title: `Sign In to ${target.label}`,
    webPreferences: {
      partition: signInPartition(source),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setUserAgent(userAgent);
  void win.loadURL(target.url, { userAgent });
  signInWindows.set(source, win);
}

async function importSession(source) {
  const host = SIGN_IN[source].domain;
  const all = await session
    .fromPartition(signInPartition(source))
    .cookies.get({});
  const cookies = all
    .filter((cookie) => {
      const domain = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();
      return domain === host || domain.endsWith(`.${host}`);
    })
    .slice(0, 500)
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path ?? "/",
      secure: cookie.secure ?? false,
      httpOnly: cookie.httpOnly ?? false,
      sameSite: cookie.sameSite ?? "unspecified",
      expirationDate: cookie.expirationDate ?? null,
      hostOnly: cookie.hostOnly,
    }));
  if (cookies.length === 0) {
    return { ok: false, message: "No cookies yet. Finish signing in first." };
  }
  const response = await nativeCall({
    type: "session.import",
    source,
    cookies,
  });
  if (!response.ok) return { ok: false, message: response.error };
  const data = response.data;
  if (!data.connected) {
    return {
      ok: false,
      message: `Pond didn't accept the session (${data.reason ?? "unknown"}).`,
    };
  }
  signInWindows.get(source)?.close();
  return { ok: true, message: `Connected as Account ${data.accountId}.` };
}

function registerGuideIpc() {
  ipcMain.handle("guide:state", () => ({
    sandbox,
    resultsFile: resultsMd,
    results,
    steps: STEPS.map((step) => ({
      id: step.id,
      title: step.title,
      source: step.source ?? null,
      sourceLabel: step.source ? SIGN_IN[step.source].label : null,
      sync: step.sync === true,
      steps: step.steps,
    })),
  }));
  ipcMain.handle("guide:sign-in", (_, source) => openSignIn(source));
  ipcMain.handle("guide:import-session", (_, source) => importSession(source));
  ipcMain.handle("guide:sync-now", async (_, source) => {
    const account = await accountFor(source);
    if (!account) return { ok: false, message: "Connect the Account first." };
    await pondQuery(`window.pond.syncRunNow(${JSON.stringify(account.id)})`);
    return { ok: true, message: "Sync started." };
  });
  ipcMain.handle("guide:check", async (_, stepId) => {
    const step = STEPS.find((candidate) => candidate.id === stepId);
    const found = await evidence(step.source);
    const checks = step.checks ? step.checks(found, results) : [];
    results[stepId] = { ...results[stepId], evidence: found, checks };
    writeResults();
    return { evidence: found, checks };
  });
  ipcMain.handle("guide:record", (_, stepId, verdict, note) => {
    results[stepId] = { ...results[stepId], verdict, note };
    writeResults();
    return results[stepId];
  });
}

function openGuide() {
  guide = new BrowserWindow({
    width: 460,
    height: 820,
    x: 40,
    y: 40,
    title: "Import Scope Sandbox",
    alwaysOnTop: !selfTest,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  void guide.loadFile(join(__dirname, "guide.html"));
  return guide;
}

async function runSelfTest() {
  await new Promise((resolve) =>
    guide.webContents.once("did-finish-load", resolve),
  );
  const rendered = await guide.webContents.executeJavaScript(
    `new Promise((resolve) => setTimeout(() => resolve(document.querySelectorAll("[data-step]").length), 500))`,
  );
  if (rendered !== STEPS.length) {
    throw new Error(`Guide rendered ${rendered} of ${STEPS.length} steps`);
  }
  await guide.webContents.executeJavaScript(
    `document.querySelector('[data-step="x-folders"]').click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  const shot = join(tmpdir(), "pond-import-scope-guide.png");
  writeFileSync(shot, (await guide.webContents.capturePage()).toPNG());
  const hello = await nativeCall({ type: "hello" });
  if (!hello.ok) throw new Error("Sandbox socket didn't answer");
  const found = await evidence("twitter");
  if (found.account !== null || found.saves.total !== 0) {
    throw new Error("A fresh sandbox should have no X Account");
  }
  console.log(
    "SANDBOX_SELF_TEST_PASSED",
    JSON.stringify({ steps: rendered, screenshot: shot }),
  );
}

registerGuideIpc();
let started = false;
app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", () => {
    if (started || !contents.getURL().includes("index.html")) return;
    if (guide && contents === guide.webContents) return;
    started = true;
    pondContents = contents;
    openGuide();
    console.log(`Import scope sandbox: ${sandbox}`);
    console.log(`Results: ${resultsMd}`);
    if (!selfTest) return;
    const timer = setTimeout(() => {
      console.error("SANDBOX_SELF_TEST_FAILED: timed out");
      app.exit(1);
    }, 30000);
    runSelfTest().then(
      () => {
        clearTimeout(timer);
        app.exit(0);
      },
      (error) => {
        clearTimeout(timer);
        console.error("SANDBOX_SELF_TEST_FAILED", error);
        app.exit(1);
      },
    );
  });
});

import("../../out/main/index.js").catch((error) => {
  console.error("SANDBOX_FAILED", error);
  app.exit(1);
});
