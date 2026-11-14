/** Runs a PR proof scenario against the built desktop app in a throwaway Library and writes framed stills and clips. */
const { app, BrowserWindow, screen } = require("electron");
const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } =
  require("node:fs");
const { tmpdir } = require("node:os");
const { basename, isAbsolute, join } = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const sharp = require("sharp");
const frames = require("./capture-proof/frame.cjs");

const arg = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;

const scenarioPath = arg("scenario", "");
const out = arg("out", "");
const theme = arg("theme", "light");
const [width, height] = arg("size", "1440x1000").split("x").map(Number);
const wallpaper = arg("wallpaper", "");
const radius = Number(arg("radius", "22"));
const timeout = Number(arg("timeout", "180000"));
const defaultCrop = parseCrop(arg("crop", ""));

function parseCrop(value) {
  if (!value) return undefined;
  const [x, y, cropWidth] = value.split(",").map(Number);
  if (![x, y, cropWidth].every(Number.isFinite) || cropWidth <= 0) {
    console.error("capture-proof: --crop is x,y,width in window points");
    process.exit(1);
  }
  return { x, y, width: cropWidth };
}

if (
  !isAbsolute(scenarioPath) ||
  !isAbsolute(out) ||
  !["light", "dark"].includes(theme) ||
  !(width > 0 && height > 0)
) {
  console.error(
    "Usage: electron scripts/capture-proof.cjs --scenario=<abs .cjs> --out=<abs dir> [--theme=light|dark] [--size=1440x1000] [--crop=x,y,width] [--wallpaper=<path>] [--radius=22] [--timeout=180000]",
  );
  process.exit(1);
}
const entry = join(__dirname, "../out/main/index.js");
if (!existsSync(entry)) {
  console.error(
    "capture-proof: out/main/index.js is missing. Run `pnpm --filter @pond/desktop build` first.",
  );
  process.exit(1);
}

const sandbox = mkdtempSync(join(tmpdir(), "pond-proof-"));
const scratch = join(sandbox, "scratch");
mkdirSync(scratch, { recursive: true });
mkdirSync(out, { recursive: true });
/** The app moves userData, sessionData, logs, home, the Library and the instance lock under this directory. */
process.env.POND_SANDBOX = sandbox;
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /** Windows keeps the Library's files locked until exit; leave the temp dir to the OS. */
  }
});

app.commandLine.appendSwitch("force-device-scale-factor", "2");
app.commandLine.appendSwitch("force-color-profile", "srgb");
/** Offscreen windows count as occluded; keep them painting and their timers running. */
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

let step = "launch";
const manifest = [];
const deadline = setTimeout(
  () => fail(new Error(`Timed out after ${timeout} ms`)),
  timeout,
);

function fail(error) {
  clearTimeout(deadline);
  console.error(`CAPTURE_FAILED at ${step}`);
  console.error(error?.stack ?? error);
  app.exit(1);
}

function within(ms, promise, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${what} timed out after ${ms} ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Shown windows go offscreen without focus so a capture never covers or steals from the desktop. */
function keepOffscreen(win) {
  const park = () => {
    if (win.isDestroyed()) return;
    const right = Math.max(
      ...screen.getAllDisplays().map((d) => d.bounds.x + d.bounds.width),
    );
    if (win.getPosition()[0] < right) win.setPosition(right + 400, 0);
  };
  win.webContents.setBackgroundThrottling(false);
  win.show = () => {
    park();
    win.showInactive();
  };
  win.focus = () => {};
  win.moveTop = () => {};
  win.on("move", park);
}

app.on("browser-window-created", (_, win) => keepOffscreen(win));

async function mainWindow() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("/index.html"),
    );
    if (win) return win;
    await sleep(50);
  }
  throw new Error("The Library window did not open");
}

function evalIn(win, js, ms = 15000) {
  return within(
    ms,
    win.webContents.executeJavaScript(js, true),
    "executeJavaScript",
  );
}

async function rendered(win) {
  await evalIn(
    win,
    `new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (document.querySelector('[data-slot="window"]') && document.body.innerText.trim()) resolve();
        else if (Date.now() - started > 20000) reject(new Error("React did not render visible content"));
        else setTimeout(poll, 50);
      };
      poll();
    })`,
    25000,
  );
}

function frameSettled(win) {
  return evalIn(
    win,
    "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))",
  );
}

function fixturePng(name, size, colors) {
  const [from, to] = colors;
  const file = join(sandbox, "fixtures", `${name}.png`);
  mkdirSync(join(sandbox, "fixtures"), { recursive: true });
  const r = Math.min(size.width, size.height) / 3;
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${size.width * 0.62}" cy="${size.height * 0.42}" r="${r}" fill="#fff" fill-opacity="0.18"/><circle cx="${size.width * 0.3}" cy="${size.height * 0.72}" r="${r * 0.55}" fill="#000" fill-opacity="0.12"/></svg>`,
    ),
  )
    .png()
    .toFile(file)
    .then(() => file);
}

const FIXTURES = [
  { title: "Tidepool", size: [1600, 1000], colors: ["#0f766e", "#99f6e4"] },
  { title: "Dune", size: [1000, 1400], colors: ["#b45309", "#fde68a"] },
  { title: "Nightfall", size: [1200, 1200], colors: ["#1e1b4b", "#818cf8"] },
  { title: "Coral", size: [1600, 900], colors: ["#be123c", "#fecdd3"] },
  { title: "Moss", size: [900, 1300], colors: ["#3f6212", "#d9f99d"] },
  { title: "Glacier", size: [1400, 1050], colors: ["#0c4a6e", "#e0f2fe"] },
];

const FOLDER_VIEW = {
  layout: "waterfall",
  sortKey: "savedAt",
  sortDir: "desc",
  zoom: 130,
  includeSubfolders: true,
  randomSeed: "pond",
  manualOrder: [],
  pinnedIds: [],
  coverSaveId: null,
};

function context(main) {
  const query = (name, input) =>
    evalIn(
      main,
      `window.pond.query(${JSON.stringify(name)}${input === undefined ? "" : `, ${JSON.stringify(input)}`})`,
      60000,
    );

  const resolveWindow = (target) => {
    if (!target) return main;
    if (target instanceof BrowserWindow) return target;
    if (target instanceof Function) {
      const found = BrowserWindow.getAllWindows().find(target);
      if (!found) throw new Error("No window matches the predicate");
      return found;
    }
    const found = BrowserWindow.fromId(Number(target));
    if (!found) throw new Error(`No window with id ${target}`);
    return found;
  };

  const center = async (win, selector) => {
    const point = await evalIn(
      win,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), draggable: Boolean(el.closest('[draggable="true"]')) };
      })()`,
    );
    if (!point) throw new Error(`No element matches ${selector}`);
    return point;
  };

  const waitFor = async (target, ms = 10000, options = {}) => {
    const win = resolveWindow(options.window);
    const started = Date.now();
    while (Date.now() - started < ms) {
      const value =
        target instanceof Function
          ? await target()
          : await evalIn(
              win,
              `Boolean(document.querySelector(${JSON.stringify(target)}))`,
            );
      if (value) return value;
      await sleep(50);
    }
    throw new Error(
      `waitFor ${target instanceof Function ? "predicate" : target} timed out after ${ms} ms`,
    );
  };

  const modifiersFor = (parts) =>
    parts.map((part) => {
      const name = part.toLowerCase();
      if (["mod", "cmdorctrl", "commandorcontrol"].includes(name)) {
        return process.platform === "darwin" ? "meta" : "control";
      }
      if (["cmd", "command", "meta", "super"].includes(name)) return "meta";
      if (["ctrl", "control"].includes(name)) return "control";
      if (["alt", "option"].includes(name)) return "alt";
      if (name === "shift") return "shift";
      throw new Error(`Unknown modifier ${part}`);
    });

  const send = (win, event) => win.webContents.sendInputEvent(event);

  const mouse = async (x, y, type = "move", options = {}) => {
    const win = resolveWindow(options.window);
    const button = options.button ?? "left";
    const base = { x, y, button, modifiers: options.modifiers ?? [] };
    if (type === "move") send(win, { ...base, type: "mouseMove" });
    else if (type === "down")
      send(win, { ...base, type: "mouseDown", clickCount: 1 });
    else if (type === "up")
      send(win, { ...base, type: "mouseUp", clickCount: 1 });
    else if (type === "click") {
      send(win, { ...base, type: "mouseMove" });
      send(win, { ...base, type: "mouseDown", clickCount: 1 });
      send(win, { ...base, type: "mouseUp", clickCount: 1 });
    } else throw new Error(`Unknown mouse event ${type}`);
    await sleep(16);
  };

  const cropFor = async (win, crop) => {
    if (!crop?.selector) return crop ?? defaultCrop;
    const r = await evalIn(
      win,
      `(() => {
        const el = document.querySelector(${JSON.stringify(crop.selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      })()`,
    );
    if (!r) throw new Error(`No element matches ${crop.selector}`);
    const pad = crop.padding ?? 48;
    const [contentWidth, contentHeight] = win.getContentSize();
    const aspect = (frames.AREA.width * 16) / ((1 - frames.AREA.y) * 10);
    const cropWidth = Math.min(
      contentWidth,
      Math.max(r.width + 2 * pad, (r.height + 2 * pad) * aspect),
    );
    const cropHeight = cropWidth / aspect;
    const clamp = (value, max) => Math.min(Math.max(0, value), max);
    return {
      x: clamp(r.x + r.width / 2 - cropWidth / 2, contentWidth - cropWidth),
      y: clamp(
        r.y + r.height / 2 - cropHeight / 2,
        Math.max(0, contentHeight - cropHeight),
      ),
      width: cropWidth,
    };
  };

  const chrome = (win) => ({
    theme,
    wallpaper,
    lights: win.getWindowButtonPosition ? win.getWindowButtonPosition() : null,
  });

  const contentSize = (win) => {
    const [w, h] = win.getContentSize();
    return { width: w, height: h };
  };

  const record = (entry) => {
    manifest.push(entry);
    console.log(`capture-proof: wrote ${entry.file}`);
  };

  const stills = new Map();

  const ctx = {
    main,
    sandbox,
    out,
    theme,
    eval: (js, options = {}) => evalIn(resolveWindow(options.window), js),
    query,
    windows: () =>
      BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()),
    wait: (ms) => sleep(ms),
    waitFor,
    async navigate(path) {
      main.webContents.send("pond:nav", path);
      await sleep(100);
      await frameSettled(main);
    },
    async click(selector, options = {}) {
      const win = resolveWindow(options.window);
      await waitFor(selector, options.timeout ?? 10000, options);
      const point = await center(win, selector);
      await mouse(point.x, point.y, "click", options);
    },
    mouse,
    async type(text, options = {}) {
      const win = resolveWindow(options.window);
      for (const char of text) {
        send(win, { type: "keyDown", keyCode: char });
        send(win, { type: "char", keyCode: char });
        send(win, { type: "keyUp", keyCode: char });
        await sleep(options.delay ?? 40);
      }
    },
    async key(accelerator, options = {}) {
      const win = resolveWindow(options.window);
      const parts = accelerator.split("+");
      const keyCode = parts.pop();
      const modifiers = modifiersFor(parts);
      send(win, { type: "keyDown", keyCode, modifiers });
      if (keyCode.length === 1 && !modifiers.some((m) => m !== "shift")) {
        send(win, { type: "char", keyCode, modifiers });
      }
      send(win, { type: "keyUp", keyCode, modifiers });
      await sleep(16);
    },
    async drag(from, to, options = {}) {
      const win = resolveWindow(options.window);
      await waitFor(from, options.timeout ?? 10000, options);
      await waitFor(to, options.timeout ?? 10000, options);
      const start = await center(win, from);
      const end = await center(win, to);
      const mode = options.mode ?? (start.draggable ? "html5" : "pointer");
      if (mode === "pointer") {
        const steps = options.steps ?? 16;
        await mouse(start.x, start.y, "move", options);
        await mouse(start.x, start.y, "down", options);
        for (let i = 1; i <= steps; i++) {
          await mouse(
            Math.round(start.x + ((end.x - start.x) * i) / steps),
            Math.round(start.y + ((end.y - start.y) * i) / steps),
            "move",
            { ...options, modifiers: ["leftButtonDown"] },
          );
        }
        await mouse(end.x, end.y, "up", options);
        return true;
      }
      return evalIn(
        win,
        `(async () => {
          const source = document.querySelector(${JSON.stringify(from)});
          const target = document.querySelector(${JSON.stringify(to)});
          const data = new DataTransfer();
          for (const [type, value] of Object.entries(${JSON.stringify(options.data ?? {})})) data.setData(type, value);
          const point = (el) => {
            const r = el.getBoundingClientRect();
            return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
          };
          const fire = (el, type, at) =>
            el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: data, ...at }));
          const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
          fire(source, "dragstart", point(source));
          await frame();
          fire(target, "dragenter", point(target));
          fire(target, "dragover", point(target));
          await frame();
          const accepted = !fire(target, "drop", point(target));
          fire(source, "dragend", point(target));
          return accepted;
        })()`,
      );
    },
    async shot(name, options = {}) {
      const win = resolveWindow(options.window);
      await frameSettled(win);
      const image = await within(
        10000,
        win.webContents.capturePage(),
        "capturePage",
      );
      const file = join(out, `${name}.png`);
      if (options.frame === false) {
        writeFileSync(file, image.toPNG());
        const size = image.getSize();
        record({ kind: "still", name, file: basename(file), ...size });
        return file;
      }
      const layout = frames.layout(
        frames.STILL,
        contentSize(win),
        await cropFor(win, options.crop),
        radius,
      );
      const png = await frames.still(image, layout, chrome(win));
      writeFileSync(file, png);
      stills.set(name, png);
      record({ kind: "still", name, file: basename(file), ...frames.STILL });
      if (options.pair) {
        const before = stills.get(options.pair);
        if (!before) throw new Error(`No earlier shot named ${options.pair}`);
        const pairName = `${options.pair}-vs-${name}`;
        writeFileSync(
          join(out, `${pairName}.png`),
          await frames.sideBySide(before, png),
        );
        record({
          kind: "pair",
          name: pairName,
          file: `${pairName}.png`,
          width: frames.STILL.width * 2,
          height: frames.STILL.height,
          before: `${options.pair}.png`,
          after: `${name}.png`,
        });
      }
      return file;
    },
    async record(name, action, options = {}) {
      const win = resolveWindow(options.window);
      const fps = options.fps ?? frames.FPS;
      const layout = frames.layout(
        frames.VIDEO,
        contentSize(win),
        await cropFor(win, options.crop),
        radius,
      );
      const recorder = frames.recorder(layout, scratch, fps);
      let written = 0;
      let unique = 0;
      let previous = null;
      const deliver = async (index, image) => {
        const bitmap = recorder.bitmap(image);
        unique++;
        while (written < index) {
          await recorder.write(previous ?? bitmap);
          written++;
        }
        await recorder.write(bitmap);
        written++;
        previous = bitmap;
      };
      const started = performance.now();
      const slot = () =>
        Math.floor(((performance.now() - started) / 1000) * fps);
      let done = false;
      const running = Promise.resolve()
        .then(action)
        .finally(() => {
          done = true;
        });
      const capture = () =>
        within(10000, win.webContents.capturePage(), "capturePage");
      /** beginFrameSubscription caps at 30fps in Electron; capturePage resolves once per vsync if the next request is already queued. */
      let next = capture();
      for (;;) {
        const image = await next;
        const index = slot();
        const finished = done;
        if (!finished) next = capture();
        if (index >= written) await deliver(index, image);
        if (finished) break;
      }
      const end = slot();
      while (previous && written <= end) {
        await recorder.write(previous);
        written++;
      }
      await running;
      console.log(
        `capture-proof: ${name} captured ${unique} of ${written} frames`,
      );
      const file = join(out, `${name}.mp4`);
      await recorder.finish(file, chrome(win));
      record({
        kind: "video",
        name,
        file: basename(file),
        ...frames.VIDEO,
        fps: frames.FPS,
        durationMs: Math.round((written / fps) * 1000),
      });
      return file;
    },
  };

  ctx.seed = {
    saves: [],
    folders: [],
    async image(options = {}) {
      const index = ctx.seed.saves.length;
      const title = options.title ?? `Fixture ${index + 1}`;
      const [w, h] = options.size ?? [1400, 1000];
      const file = await fixturePng(
        `${index}-${title.replace(/\W+/g, "-")}`,
        { width: w, height: h },
        options.colors ?? ["#334155", "#cbd5e1"],
      );
      const created = await query("saves.createManual", {
        title,
        filePaths: [file],
      });
      if (!created.ok || !created.id) {
        throw new Error(`saves.createManual failed for ${title}`);
      }
      ctx.seed.saves.push(created.id);
      return created.id;
    },
    async folder(name, options = {}) {
      const folder = await query("folders.create", {
        name,
        parentId: options.parentId ?? null,
        color: options.color ?? null,
      });
      if (options.saveIds?.length) {
        await query("folders.addSaves", {
          folderId: folder.id,
          saveIds: options.saveIds,
        });
      }
      if (options.quickAccess) await ctx.seed.quickAccess([folder.id]);
      ctx.seed.folders.push(folder);
      return folder;
    },
    assign: (saveIds, folderIds) =>
      query("folders.assign", { saveIds, addIds: folderIds, removeIds: [] }),
    async quickAccess(folderIds) {
      const prefs = await query("settings.getPrefs");
      const views = { ...prefs.folderViews };
      let order = Object.values(views).filter((v) => v.quickAccess).length;
      for (const id of folderIds) {
        views[id] = {
          ...FOLDER_VIEW,
          ...views[id],
          quickAccess: true,
          quickAccessOrder: order++,
        };
      }
      await query("settings.setPrefs", { folderViews: views });
    },
  };

  function tracked(name, fn) {
    return async (...args) => {
      const shown = args
        .filter((a) => !(a instanceof Function))
        .map((a) => JSON.stringify(a) ?? String(a));
      step = `${name}(${shown.join(", ")})`;
      return fn(...args);
    };
  }
  for (const name of [
    "eval",
    "query",
    "wait",
    "waitFor",
    "navigate",
    "click",
    "mouse",
    "type",
    "key",
    "drag",
    "shot",
    "record",
  ]) {
    ctx[name] = tracked(name, ctx[name]);
  }
  for (const name of ["image", "folder", "assign", "quickAccess"]) {
    ctx.seed[name] = tracked(`seed.${name}`, ctx.seed[name]);
  }
  return ctx;
}

async function seedLibrary(ctx) {
  for (const fixture of FIXTURES) await ctx.seed.image(fixture);
  const [a, b, c, d, e, f] = ctx.seed.saves;
  await ctx.seed.folder("Moodboard", { saveIds: [a, b, c] });
  await ctx.seed.folder("References", { saveIds: [d, e] });
  await ctx.seed.folder("Archive", { saveIds: [f] });
  await ctx.seed.quickAccess(ctx.seed.folders.slice(0, 2).map((x) => x.id));
}

async function main() {
  await app.whenReady();
  step = "open window";
  const win = await mainWindow();
  win.setContentSize(width, height);
  step = "render";
  await rendered(win);
  const info = await evalIn(win, 'window.pond.query("library.info", {})');
  if (!info.path.startsWith(sandbox)) {
    throw new Error(`Library ${info.path} is outside the sandbox`);
  }
  step = "prefs";
  await evalIn(
    win,
    `window.pond.query("settings.setPrefs", ${JSON.stringify({
      setup: { version: 999 },
      preferences: { appearance: theme },
      quickCapture: { menuBarIcon: false },
    })})`,
  );
  win.webContents.reload();
  await sleep(500);
  await rendered(win);
  const ctx = context(win);
  step = "seed";
  await seedLibrary(ctx);
  step = "load scenario";
  const scenario = require(scenarioPath);
  if (!(scenario.run instanceof Function)) {
    throw new Error(`${scenarioPath} must export async function run(ctx)`);
  }
  step = "scenario";
  await scenario.run(ctx);
  writeFileSync(
    join(out, "manifest.json"),
    `${JSON.stringify(
      {
        scenario: basename(scenarioPath),
        theme,
        size: { width, height },
        files: manifest,
      },
      null,
      2,
    )}\n`,
  );
  clearTimeout(deadline);
  console.log(`CAPTURE_PASSED ${manifest.length} files in ${out}`);
  app.exit(0);
}

import("../out/main/index.js").catch(fail);
main().catch(fail);
