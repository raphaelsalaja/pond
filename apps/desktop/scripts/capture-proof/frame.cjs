/** Composites raw window captures onto a wallpaper canvas framed like a macOS window. */
const { spawn, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const sharp = require("sharp");

const VIDEO = { width: 1120, height: 700 };
const STILL = { width: 2240, height: 1400 };
const FPS = 60;
const DEFAULT_WALLPAPER = "/System/Library/Desktop Pictures/Sonoma.heic";

/** Measured from the DiaTweaks previews: 7% side margins, window top at 11.3%. */
const AREA = { x: 0.07, y: 0.113, width: 0.86 };

const LIGHTS = [
  { fill: "#ff5f57", rim: "#e2463f" },
  { fill: "#febc2e", rim: "#e1a116" },
  { fill: "#28c840", rim: "#14ae2b" },
];

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  for (const candidate of ["/opt/homebrew/bin/ffmpeg", "ffmpeg"]) {
    if (spawnSync(candidate, ["-version"]).status === 0) return candidate;
  }
  return require("ffmpeg-static");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

/** Sharp's prebuilt libvips can't decode HEVC HEIC, so macOS wallpapers go through sips once. */
async function wallpaperSource(path) {
  const file = path || DEFAULT_WALLPAPER;
  if (!existsSync(file)) {
    if (path) throw new Error(`Wallpaper not found: ${path}`);
    return null;
  }
  if (!/\.heic$/i.test(file)) return file;
  const key = createHash("sha256")
    .update(`${file}:${statSync(file).mtimeMs}`)
    .digest("hex")
    .slice(0, 16);
  const png = join(tmpdir(), `pond-proof-wallpaper-${key}.png`);
  if (!existsSync(png)) {
    await run("sips", ["-s", "format", "png", file, "--out", png]);
  }
  return png;
}

/** Window content size in DIP, optional crop in the same units, canvas in pixels. */
function layout(canvas, content, crop, radius) {
  const area = {
    x: Math.round(canvas.width * AREA.x),
    y: Math.round(canvas.height * AREA.y),
    width: canvas.width - 2 * Math.round(canvas.width * AREA.x),
  };
  const view = crop ?? { x: 0, y: 0, width: content.width };
  const scale = area.width / view.width;
  const rect = {
    x: area.x - view.x * scale,
    y: area.y - view.y * scale,
    width: content.width * scale,
    height: content.height * scale,
  };
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const right = Math.min(canvas.width, Math.round(rect.x + rect.width));
  const bottom = Math.min(canvas.height, Math.round(rect.y + rect.height));
  if (right <= left || bottom <= top) {
    throw new Error("Crop leaves no part of the window on the canvas");
  }
  const visible = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  const source = {
    x: (visible.x - rect.x) / scale,
    y: (visible.y - rect.y) / scale,
    width: visible.width / scale,
    height: visible.height / scale,
  };
  return {
    canvas,
    content,
    rect,
    visible,
    source,
    scale,
    radius: radius * scale,
  };
}

function roundedRect(rect, radius, attrs) {
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${radius}" ry="${radius}" ${attrs}/>`;
}

function svg(canvas, body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${body}</svg>`,
  );
}

/** Static layers: the wallpaper with the window's shadow, and the cover drawn above the window. */
async function layers(frame, options) {
  const { canvas, rect, radius } = frame;
  const unit = canvas.width / VIDEO.width;
  const source = await wallpaperSource(options.wallpaper);
  const wallpaper = source
    ? sharp(source).resize(canvas.width, canvas.height, { fit: "cover" })
    : sharp(
        svg(
          canvas,
          '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9cc4e8"/><stop offset="1" stop-color="#2f6fb8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>',
        ),
      );
  const softened = await wallpaper
    .blur(Math.max(0.3, 1.5 * unit))
    .removeAlpha()
    .toBuffer();
  const shadow = (dy, blur, opacity, id) => {
    const silhouette = roundedRect(
      { ...rect, y: rect.y + dy * unit },
      radius,
      `fill="#000" fill-opacity="${opacity}" filter="url(#${id})"`,
    );
    return `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${canvas.width}" height="${canvas.height}"><feGaussianBlur stdDeviation="${blur * unit}"/></filter>${silhouette}`;
  };
  const background = await sharp(softened)
    .composite([
      {
        input: svg(
          canvas,
          shadow(0.5, 2, 0.28, "near") + shadow(10, 20, 0.3, "far"),
        ),
      },
    ])
    .png()
    .toBuffer();

  const outside = svg(
    canvas,
    `<path fill-rule="evenodd" fill="#fff" d="M0 0H${canvas.width}V${canvas.height}H0Z ${roundedPath(rect, radius)}"/>`,
  );
  const edge =
    options.theme === "dark"
      ? roundedRect(
          inset(rect, -unit / 2),
          radius + unit / 2,
          `fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="${unit}"`,
        ) +
        roundedRect(
          inset(rect, unit / 2),
          radius - unit / 2,
          `fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="${unit}"`,
        )
      : roundedRect(
          rect,
          radius,
          `fill="none" stroke="#000" stroke-opacity="0.26" stroke-width="${unit}"`,
        );
  const lights = options.lights
    ? LIGHTS.map((light, index) => {
        const s = frame.scale;
        const cx = rect.x + (options.lights.x + 7 + index * 20) * s;
        const cy = rect.y + (options.lights.y + 7) * s;
        return `<circle cx="${cx}" cy="${cy}" r="${5.75 * s}" fill="${light.fill}" stroke="${light.rim}" stroke-width="${0.5 * s}"/>`;
      }).join("")
    : "";
  const cover = await sharp(background)
    .ensureAlpha()
    .composite([
      { input: outside, blend: "dest-in" },
      { input: svg(canvas, edge + lights) },
    ])
    .png()
    .toBuffer();
  return { background, cover };
}

function inset(rect, by) {
  return {
    x: rect.x + by,
    y: rect.y + by,
    width: rect.width - 2 * by,
    height: rect.height - 2 * by,
  };
}

function roundedPath(rect, radius) {
  const { x, y, width: w, height: h } = rect;
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Device-pixel crop of a capture for a layout, clamped to the image. */
function sourcePixels(frame, image) {
  const size = image.getSize();
  const ratio = size.width / frame.content.width;
  const x = Math.max(0, Math.round(frame.source.x * ratio));
  const y = Math.max(0, Math.round(frame.source.y * ratio));
  return {
    x,
    y,
    width: Math.min(size.width - x, Math.round(frame.source.width * ratio)),
    height: Math.min(size.height - y, Math.round(frame.source.height * ratio)),
  };
}

async function still(image, frame, options) {
  const { background, cover } = await layers(frame, options);
  const pixels = sourcePixels(frame, image);
  const window = await sharp(image.crop(pixels).toPNG())
    .resize(frame.visible.width, frame.visible.height, {
      fit: "fill",
      kernel: "lanczos3",
    })
    .toBuffer();
  return sharp(background)
    .composite([
      { input: window, left: frame.visible.x, top: frame.visible.y },
      { input: cover },
    ])
    .png()
    .toBuffer();
}

async function sideBySide(left, right) {
  const meta = await sharp(left).metadata();
  return sharp({
    create: {
      width: meta.width * 2,
      height: meta.height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: meta.width, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Writes lossless window frames at a constant rate while capturing, then composites and encodes. */
function recorder(frame, scratch, fps) {
  const ffmpeg = ffmpegPath();
  const raw = join(scratch, `raw-${Date.now()}.mkv`);
  const child = spawn(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "bgra",
      "-s",
      `${frame.visible.width}x${frame.visible.height}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264rgb",
      "-preset",
      "ultrafast",
      "-qp",
      "0",
      raw,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`)),
    );
  });
  return {
    bitmap(image) {
      return image
        .crop(sourcePixels(frame, image))
        .resize({
          width: frame.visible.width,
          height: frame.visible.height,
          quality: "good",
        })
        .toBitmap();
    },
    async write(bitmap) {
      if (!child.stdin.write(bitmap)) {
        await new Promise((resolve) => child.stdin.once("drain", resolve));
      }
    },
    async finish(out, options) {
      child.stdin.end();
      await closed;
      const { background, cover } = await layers(frame, options);
      const backgroundPath = join(scratch, "background.png");
      const coverPath = join(scratch, "cover.png");
      await sharp(background).toFile(backgroundPath);
      await sharp(cover).toFile(coverPath);
      await run(ffmpeg, [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        String(fps),
        "-loop",
        "1",
        "-i",
        backgroundPath,
        "-i",
        raw,
        "-framerate",
        String(fps),
        "-loop",
        "1",
        "-i",
        coverPath,
        "-filter_complex",
        `[1:v]setpts=N/${fps}/TB[w];[0:v][w]overlay=${frame.visible.x}:${frame.visible.y}:shortest=1[a];[a][2:v]overlay=0:0:shortest=1,fps=${FPS}[v]`,
        "-map",
        "[v]",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryslow",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
      ]);
    },
  };
}

module.exports = {
  AREA,
  FPS,
  STILL,
  VIDEO,
  layout,
  recorder,
  sideBySide,
  still,
};
