/** `pnpm video <command> <slug>`: scaffold, preview, review, and render a video in `videos/<slug>`. */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build, createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "../..");
const electron = createRequire(import.meta.url)("electron");

const USAGE = `Usage: pnpm video <command> <slug>

  new <slug>               Copy videos/starter into videos/<slug>
  dev <slug>               Preview at /?t=<ms> or /?play
  stills <slug> <ms,...>   Capture frames and tile them 2x2 into review sheets
  music <slug>             Compose videos/<slug>/music.json with ElevenLabs into music.mp3 (reads ELEVENLABS_API_KEY or .env.local)
  render <slug>            Capture every frame, score, mux, pull the poster, and check the edges`;

const [command, slug, extra] = process.argv.slice(2);
if (!command || !slug) fail(USAGE);

const source = join(root, "videos", slug);
const out = join(root, "out", slug);
const dist = join(out, "dist");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`video: ${file} exited with ${result.status}`);
}

function config() {
  if (!existsSync(join(source, "index.tsx"))) {
    fail(`video: no videos/${slug}/index.tsx`);
  }
  return {
    configFile: false,
    root: join(root, "stage"),
    base: "/",
    publicDir: join(source, "public"),
    logLevel: "warn",
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "virtual:video": join(source, "index.tsx"),
        "@pond/video": join(root, "src/index.ts"),
        "@fonts": join(repo, "apps/desktop/src/renderer/src/assets/fonts"),
      },
    },
    build: {
      outDir: dist,
      emptyOutDir: true,
      target: "esnext",
      sourcemap: false,
      minify: false,
      modulePreload: { polyfill: false },
    },
  };
}

function capture(args) {
  run(electron, [
    join(root, "cli/capture.cjs"),
    `--dist=${dist}`,
    `--out=${out}`,
    ...args,
  ]);
}

/** Lowest luma in a downscaled frame; 255 is pure white. */
function luma(file, index) {
  const pixels = execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-i",
    file,
    "-vf",
    `select=eq(n\\,${index}),scale=64:36`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ]);
  return Math.min(...pixels);
}

function frames(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_packets",
      "-show_entries",
      "stream=nb_read_packets",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim(),
  );
}

function loudness(file) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-i",
    file,
    "-af",
    "ebur128",
    "-f",
    "null",
    "-",
  ]);
  return result.stderr
    .toString()
    .match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)?.[1];
}

const commands = {
  new() {
    if (existsSync(source)) fail(`video: videos/${slug} already exists`);
    cpSync(join(root, "videos/starter"), source, {
      recursive: true,
      filter: (path) => !path.includes("/public/"),
    });
    mkdirSync(join(source, "public/media"), { recursive: true });
    console.log(
      `video: created videos/${slug}. Preview with pnpm video dev ${slug}`,
    );
  },

  async dev() {
    const server = await createServer({ ...config(), logLevel: "info" });
    await server.listen();
    server.printUrls();
  },

  async build() {
    await build(config());
  },

  async stills() {
    const times = extra?.split(",").filter(Boolean) ?? [];
    if (!times.length) fail("video: pass times in ms, like 0,4100,9300");
    await build(config());
    const stills = join(out, "stills");
    rmSync(stills, { recursive: true, force: true });
    mkdirSync(stills, { recursive: true });
    for (const file of readdirSync(out).filter((name) =>
      name.startsWith("still-"),
    )) {
      rmSync(join(out, file));
    }
    capture([`--stills=${times.join(",")}`]);
    const captured = readdirSync(out)
      .filter((name) => name.startsWith("still-"))
      .sort();
    captured.forEach((name, index) => {
      run("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-i",
        join(out, name),
        "-vf",
        "scale=960:540",
        join(stills, `small-${String(index).padStart(2, "0")}.png`),
      ]);
    });
    for (let sheet = 0; sheet * 4 < captured.length; sheet++) {
      run("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-start_number",
        String(sheet * 4),
        "-i",
        join(stills, "small-%02d.png"),
        "-frames:v",
        "1",
        "-vf",
        "tile=2x2:padding=6:color=red",
        join(stills, `sheet-${sheet}.png`),
      ]);
    }
    for (const name of readdirSync(stills).filter((file) =>
      file.startsWith("small-"),
    )) {
      rmSync(join(stills, name));
    }
    console.log(
      `video: full frames in out/${slug}/still-*.png, sheets in out/${slug}/stills`,
    );
  },

  async music() {
    const plan = join(source, "music.json");
    if (!existsSync(plan)) fail(`video: no videos/${slug}/music.json`);
    const env = join(repo, ".env.local");
    if (!process.env.ELEVENLABS_API_KEY && existsSync(env)) {
      process.loadEnvFile(env);
    }
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) fail("video: set ELEVENLABS_API_KEY to compose music");
    const response = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key },
        body: readFileSync(plan, "utf8"),
      },
    );
    if (!response.ok) {
      fail(
        `video: ElevenLabs returned ${response.status}: ${await response.text()}`,
      );
    }
    const file = join(source, "music.mp3");
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    const song = response.headers.get("song-id");
    console.log(
      `video: wrote videos/${slug}/music.mp3${song ? ` (song ${song})` : ""}`,
    );
  },

  async render() {
    await build(config());
    const picture = join(out, "picture.mp4");
    capture([`--video=${picture}`]);
    const stage = JSON.parse(readFileSync(join(out, "stage.json"), "utf8"));
    const final = join(out, `${slug}.mp4`);
    const score = join(source, "score.py");
    if (existsSync(score)) {
      const wav = join(out, "score.wav");
      run("python3", [score, wav], {
        env: { ...process.env, PYTHONPATH: join(root, "audio") },
      });
      const music = join(source, "music.mp3");
      const seconds = stage.duration / 1000;
      const audio = existsSync(music)
        ? [
            "-i",
            music,
            "-filter_complex",
            `[2:a]aresample=48000,apad,atrim=0:${seconds},afade=t=out:st=${seconds - 0.3}:d=0.3,volume=0.45[bed];[1:a]volume=0.7,asplit[fx][key];[bed][key]sidechaincompress=threshold=0.03:ratio=3:attack=5:release=300[music];[fx][music]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`,
            "-map",
            "0:v",
            "-map",
            "[mix]",
          ]
        : [
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
          ];
      run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        picture,
        "-i",
        wav,
        ...audio,
        "-c:v",
        "copy",
        "-ar",
        "48000",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-shortest",
        "-movflags",
        "+faststart",
        final,
      ]);
    } else {
      cpSync(picture, final);
    }
    const posterFrame = Math.round((stage.poster / 1000) * stage.fps);
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      picture,
      "-vf",
      `select=eq(n\\,${posterFrame})`,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      join(out, `${slug}.jpg`),
    ]);

    const count = frames(final);
    const expected = Math.round((stage.duration / 1000) * stage.fps);
    const first = luma(final, 0);
    const last = luma(final, count - 1);
    const lufs = existsSync(score) ? loudness(final) : undefined;
    console.log(
      `video: out/${slug}/${slug}.mp4, ${count} frames (${(count / stage.fps).toFixed(2)}s)`,
    );
    console.log(`video: poster out/${slug}/${slug}.jpg at ${stage.poster}ms`);
    if (lufs) console.log(`video: ${lufs} LUFS integrated`);
    const problems = [
      count === expected ? "" : `expected ${expected} frames, got ${count}`,
      first >= 250 ? "" : `first frame is not white (min luma ${first})`,
      last >= 250 ? "" : `last frame is not white (min luma ${last})`,
    ].filter(Boolean);
    if (problems.length) fail(`video: ${problems.join("; ")}`);
    console.log("video: first and last frames are white");
  },
};

const action = commands[command];
if (!action) fail(USAGE);
await action();
