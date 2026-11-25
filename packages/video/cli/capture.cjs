/** Electron main: loads a built stage offscreen, seeks it frame by frame, and pipes raw frames to ffmpeg. */
const { app, BrowserWindow, protocol, net } = require("electron");
const { spawn } = require("node:child_process");
const nodePath = require("node:path");
const { pathToFileURL } = require("node:url");
const { mkdirSync, writeFileSync } = require("node:fs");

const arg = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;

const WIDTH = 1920;
const HEIGHT = 1080;
const dist = arg("dist", "");
const out = arg("out", "");
const stills = arg("stills", "").split(",").filter(Boolean).map(Number);
const video = arg("video", nodePath.join(out, "picture.mp4"));
if (!dist || !out) {
  console.error("capture: --dist and --out are required");
  process.exit(1);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "stage",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("force-color-profile", "srgb");

const frame = (win) =>
  win.webContents.capturePage().then((image) => {
    const size = image.getSize();
    return size.width === WIDTH && size.height === HEIGHT
      ? image
      : image.resize({ width: WIDTH, height: HEIGHT, quality: "best" });
  });

async function capture() {
  mkdirSync(out, { recursive: true });
  protocol.handle("stage", (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = nodePath.normalize(
      nodePath.join(dist, path === "/" ? "index.html" : path),
    );
    if (!file.startsWith(dist)) {
      return new Response("no", { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on("console-message", (e) => {
    if (e.level === "error") errors.push(e.message);
  });
  const stage = (code) => win.webContents.executeJavaScript(code);
  await win.loadURL("stage://stage/index.html");
  await stage(
    "new Promise((r) => { const tick = () => (window.__stage ? r() : setTimeout(tick, 50)); tick(); })",
  );
  await stage("__stage.ready()");
  const meta = await stage(
    "({ duration: __stage.duration, fps: __stage.fps, poster: __stage.poster })",
  );
  writeFileSync(nodePath.join(out, "stage.json"), JSON.stringify(meta));
  const fps = Number(arg("fps", meta.fps));
  const duration = Number(arg("to", 0)) || meta.duration;
  const from = Number(arg("from", 0));

  const report = () => {
    if (errors.length) {
      console.log(
        `capture: ${errors.length} errors\n${errors.slice(0, 8).join("\n")}`,
      );
    }
  };

  if (stills.length) {
    for (const t of stills) {
      await stage(`__stage.seek(${t})`);
      writeFileSync(
        nodePath.join(out, `still-${String(t).padStart(5, "0")}.png`),
        (await frame(win)).toPNG(),
      );
    }
    report();
    app.quit();
    return;
  }

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "bgra",
      "-s",
      `${WIDTH}x${HEIGHT}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "14",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      video,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const step = 1000 / fps;
  const total = Math.round((duration - from) / step);
  const started = Date.now();
  for (let index = 0; index < total; index++) {
    await stage(`__stage.seek(${from + index * step})`);
    const bitmap = (await frame(win)).toBitmap();
    if (!ffmpeg.stdin.write(bitmap)) {
      await new Promise((r) => {
        ffmpeg.stdin.once("drain", r);
      });
    }
    if (index % 90 === 0) {
      const rate = (index + 1) / ((Date.now() - started) / 1000);
      console.log(`capture: frame ${index}/${total} (${rate.toFixed(1)} fps)`);
    }
  }
  ffmpeg.stdin.end();
  await new Promise((r) => {
    ffmpeg.on("close", r);
  });
  report();
  app.quit();
}

void app.whenReady().then(async () => {
  try {
    await capture();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});
