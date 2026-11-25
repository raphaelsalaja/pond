/** Runs a PR proof scenario against the built desktop app in a throwaway Library and writes framed stills and clips. */
const { app } = require("electron");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const {
  AREA,
  FPS,
  STILL,
  VIDEO,
  composePair,
  composeStill,
  frameLayout,
  startRecorder,
} = require("./capture-proof/frame.cjs");
const {
  createSandbox,
  driver,
  evalIn,
  frameSettled,
  isFunction,
  keepOffscreen,
  keepPainting,
  openLibrary,
  seedLibrary,
  track,
  within,
} = require("./harness/driver.cjs");

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
  !path.isAbsolute(scenarioPath) ||
  !path.isAbsolute(out) ||
  !["light", "dark"].includes(theme) ||
  !(width > 0 && height > 0)
) {
  console.error(
    "Usage: electron scripts/capture-proof.cjs --scenario=<abs .cjs> --out=<abs dir> [--theme=light|dark] [--size=1440x1000] [--crop=x,y,width] [--wallpaper=<path>] [--radius=22] [--timeout=180000]",
  );
  process.exit(1);
}
const entry = path.join(__dirname, "../out/main/index.js");
if (!existsSync(entry)) {
  console.error(
    "capture-proof: out/main/index.js is missing. Run `pnpm --filter @pond/desktop build` first.",
  );
  process.exit(1);
}

const sandbox = createSandbox("pond-proof-");
const scratch = path.join(sandbox, "scratch");
mkdirSync(scratch, { recursive: true });
mkdirSync(out, { recursive: true });

app.commandLine.appendSwitch("force-device-scale-factor", "2");
app.commandLine.appendSwitch("force-color-profile", "srgb");
keepPainting();

let step = "launch";
const onStep = (name) => {
  step = name;
};
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

app.on("browser-window-created", (_, win) => keepOffscreen(win));

function clamp(value, max) {
  return Math.min(Math.max(0, value), max);
}

async function cropFor(win, crop) {
  if (!crop?.selector) {
    return crop ?? defaultCrop;
  }
  const r = await evalIn(
    win,
    `(() => {
        const el = document.querySelector(${JSON.stringify(crop.selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      })()`,
  );
  if (!r) {
    throw new Error(`No element matches ${crop.selector}`);
  }
  const pad = crop.padding ?? 48;
  const [contentWidth, contentHeight] = win.getContentSize();
  const aspect = (AREA.width * 16) / ((1 - AREA.y) * 10);
  const cropWidth = Math.min(
    contentWidth,
    Math.max(r.width + 2 * pad, (r.height + 2 * pad) * aspect),
  );
  const cropHeight = cropWidth / aspect;
  return {
    x: clamp(r.x + r.width / 2 - cropWidth / 2, contentWidth - cropWidth),
    y: clamp(
      r.y + r.height / 2 - cropHeight / 2,
      Math.max(0, contentHeight - cropHeight),
    ),
    width: cropWidth,
  };
}

function contentSize(win) {
  const [w, h] = win.getContentSize();
  return { width: w, height: h };
}

function record(entry) {
  manifest.push(entry);
  console.log(`capture-proof: wrote ${entry.file}`);
}

function context(main) {
  const base = driver(main, { sandbox, onStep });
  const resolveWindow = base.windowFor;

  /** `bare` is for transparent windows: no window shadow, edge or traffic lights. */
  const chrome = (win, bare = false) => ({
    theme,
    wallpaper,
    bare,
    lights:
      !bare && win.getWindowButtonPosition
        ? win.getWindowButtonPosition()
        : null,
  });

  const stills = new Map();

  const ctx = {
    ...base,
    out,
    theme,
    async shot(name, options = {}) {
      const win = resolveWindow(options.window);
      await frameSettled(win);
      const image = await within(
        10_000,
        win.webContents.capturePage(),
        "capturePage",
      );
      const file = path.join(out, `${name}.png`);
      if (options.frame === false) {
        writeFileSync(file, image.toPNG());
        const size = image.getSize();
        record({ kind: "still", name, file: path.basename(file), ...size });
        return file;
      }
      const layout = frameLayout(
        STILL,
        contentSize(win),
        await cropFor(win, options.crop),
        radius,
      );
      const png = await composeStill(image, layout, chrome(win, options.bare));
      writeFileSync(file, png);
      stills.set(name, png);
      record({ kind: "still", name, file: path.basename(file), ...STILL });
      if (options.pair) {
        const before = stills.get(options.pair);
        if (!before) throw new Error(`No earlier shot named ${options.pair}`);
        const pairName = `${options.pair}-vs-${name}`;
        writeFileSync(
          path.join(out, `${pairName}.png`),
          await composePair(before, png),
        );
        record({
          kind: "pair",
          name: pairName,
          file: `${pairName}.png`,
          width: STILL.width * 2,
          height: STILL.height,
          before: `${options.pair}.png`,
          after: `${name}.png`,
        });
      }
      return file;
    },
    async record(name, action, options = {}) {
      const win = resolveWindow(options.window);
      const fps = options.fps ?? FPS;
      const layout = frameLayout(
        VIDEO,
        contentSize(win),
        await cropFor(win, options.crop),
        radius,
      );
      const recorder = startRecorder(layout, scratch, fps, options.bare);
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
        within(10_000, win.webContents.capturePage(), "capturePage");
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
      const file = path.join(out, `${name}.mp4`);
      await recorder.finish(file, chrome(win, options.bare));
      record({
        kind: "video",
        name,
        file: path.basename(file),
        ...VIDEO,
        fps: FPS,
        durationMs: Math.round((written / fps) * 1000),
      });
      return file;
    },
  };

  track(ctx, onStep, ["shot", "record"]);
  return ctx;
}

async function main() {
  const win = await openLibrary(sandbox, {
    prefs: { preferences: { appearance: theme } },
    size: { width, height },
    onStep,
  });
  const ctx = context(win);
  step = "seed";
  await seedLibrary(ctx);
  step = "load scenario";
  const scenario = require(scenarioPath);
  if (!isFunction(scenario.run)) {
    throw new Error(`${scenarioPath} must export async function run(ctx)`);
  }
  step = "scenario";
  await scenario.run(ctx);
  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify(
      {
        scenario: path.basename(scenarioPath),
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
