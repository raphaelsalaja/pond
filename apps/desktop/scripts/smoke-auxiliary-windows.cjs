const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const ffmpeg = require("ffmpeg-static");

const sandbox = mkdtempSync(join(tmpdir(), "pond-auxiliary-smoke-"));
const imagePath = join(sandbox, "reference.png");
const videoPath = join(sandbox, "reference.webm");
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
writeFileSync(
  imagePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
execFileSync(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=160x90:r=12",
  "-t",
  "3",
  "-c:v",
  "libvpx-vp9",
  videoPath,
]);

let started = false;
const deadline = setTimeout(
  () => fail(new Error("Auxiliary window smoke timed out")),
  60000,
);
function fail(error) {
  clearTimeout(deadline);
  console.error("AUXILIARY_SMOKE_FAILED", error);
  app.exit(1);
}

async function waitFor(check, description) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > 10000) throw new Error(description);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function checkPreview(window, mediaType) {
  await waitFor(
    () =>
      window.webContents.executeJavaScript(`(() => {
      const media = document.querySelector(${JSON.stringify(`#${mediaType}`)});
      return document.body.dataset.mediaType === ${JSON.stringify(mediaType)} &&
        !media.hidden && ${mediaType === "video" ? "media.readyState >= 2" : "media.complete && media.naturalWidth > 0"};
    })()`),
    `${mediaType} preview did not load`,
  );
}

app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", () => {
    if (started || !contents.getURL().includes("index.html")) return;
    started = true;
    void run(contents).catch(fail);
  });
});

async function run(contents) {
  await waitFor(
    () =>
      contents.executeJavaScript(
        "Boolean(document.querySelector('[data-slot=window]'))",
      ),
    "Library did not render",
  );
  const fixture = await contents.executeJavaScript(`(async () => {
    const library = await window.pond.query("library.info");
    const image = await window.pond.query("saves.createManual", { title: "Image reference", filePaths: [${JSON.stringify(imagePath)}] });
    const video = await window.pond.query("saves.createManual", { title: "Video reference", filePaths: [${JSON.stringify(videoPath)}] });
    if (!image.ok || !video.ok) throw new Error("Could not import preview fixtures");
    const imageWindow = await window.pond.openPreviewWindow({ saveId: image.id, fileIndex: 0, kind: "detached" });
    const videoWindow = await window.pond.openPreviewWindow({ saveId: video.id, fileIndex: 0, kind: "detached" });
    const savedVideo = await window.pond.query("saves.get", { id: video.id });
    return { library, imageId: image.id, videoId: video.id, videoFile: savedVideo.files[0].path, imageWindow, videoWindow };
  })()`);
  assert.ok(fixture.library.path.startsWith(sandbox));
  const image = BrowserWindow.fromId(fixture.imageWindow.windowId);
  const video = BrowserWindow.fromId(fixture.videoWindow.windowId);
  assert.ok(image && video && image.id !== video.id);
  await Promise.all([
    checkPreview(image, "image"),
    checkPreview(video, "video"),
  ]);
  assert.equal(image.isAlwaysOnTop(), true);
  assert.equal(video.isAlwaysOnTop(), true);

  await contents.executeJavaScript(
    `window.pond.query("settings.setPrefs", { preferences: { reduceMotion: "always" }, window: { interfaceZoom: 110 } })`,
  );
  await waitFor(
    () =>
      video.webContents.executeJavaScript(
        'document.body.dataset.reduceMotion === "always"',
      ),
    "Preview preferences did not update",
  );
  assert.equal(video.webContents.getZoomFactor(), 1.1);
  assert.equal(
    await video.webContents.executeJavaScript(
      'document.querySelector("#close").textContent',
    ),
    "Close",
  );

  const playback = await video.webContents.executeJavaScript(
    `(async () => {
    const video = document.querySelector("#video");
    video.muted = true;
    video.volume = 0.35;
    video.currentTime = 0.5;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return { playing: !video.paused, time: video.currentTime, volume: video.volume, controls: video.controls,
      imageControlsHidden: [...document.querySelectorAll("[data-image-control]")].every((control) => control.hidden),
      isolated: window.pond === undefined && Boolean(window.pondPreview) };
  })()`,
    true,
  );
  assert.equal(playback.playing, true);
  assert.ok(playback.time >= 0.5);
  assert.equal(playback.volume, 0.35);
  assert.equal(playback.controls, true);
  assert.equal(playback.imageControlsHidden, true);
  assert.equal(playback.isolated, true);
  await video.webContents.executeJavaScript(
    `window.pondPreview.configure({ windowId: ${video.id}, alwaysOnTop: false, fullscreen: true })`,
  );
  await waitFor(() => video.isFullScreen(), "Video did not enter fullscreen");
  assert.equal(video.isAlwaysOnTop(), false);
  await video.webContents.executeJavaScript(
    `window.pondPreview.configure({ windowId: ${video.id}, fullscreen: false })`,
  );
  await waitFor(() => !video.isFullScreen(), "Video did not leave fullscreen");

  await contents.executeJavaScript(
    `window.pond.navigatePreviewWindow({ windowId: ${video.id}, saveId: ${JSON.stringify(fixture.imageId)}, fileIndex: 0 })`,
  );
  await checkPreview(video, "image");
  const released = await video.webContents.executeJavaScript(`(() => {
    const video = document.querySelector("#video");
    return { paused: video.paused, unloaded: !video.hasAttribute("src"), imageControlsVisible: [...document.querySelectorAll("[data-image-control]")].every((control) => !control.hidden) };
  })()`);
  assert.deepEqual(released, {
    paused: true,
    unloaded: true,
    imageControlsVisible: true,
  });

  rmSync(
    join(
      fixture.library.path,
      "items",
      `${fixture.videoId}.info`,
      fixture.videoFile,
    ),
  );
  const count = BrowserWindow.getAllWindows().length;
  const missing = await contents.executeJavaScript(
    `window.pond.openPreviewWindow({ saveId: ${JSON.stringify(fixture.videoId)}, fileIndex: 0, kind: "detached" }).then(() => false, () => true)`,
  );
  assert.equal(missing, true);
  assert.equal(BrowserWindow.getAllWindows().length, count);
  await contents.executeJavaScript(
    `Promise.all([window.pond.closePreviewWindow(${image.id}), window.pond.closePreviewWindow(${video.id})])`,
  );
  await waitFor(
    () => image.isDestroyed() && video.isDestroyed(),
    "Reference windows did not close",
  );
  clearTimeout(deadline);
  console.log(
    "AUXILIARY_SMOKE_PASSED: independent image/video references, playback, seeking, volume, fullscreen, pinning, navigation cleanup, missing files, and close",
  );
  app.exit(0);
}

import("../out/main/index.js").catch(fail);
