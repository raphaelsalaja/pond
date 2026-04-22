import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync, watch as fsWatch } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outdir = path.join(root, "dist");
const watch = process.argv.includes("--watch");

const SITES = ["twitter", "instagram", "pinterest", "arena", "cosmos"] as const;

const entryPoints: Record<string, string> = {
  background: path.join(root, "src/background.ts"),
  popup: path.join(root, "src/popup/popup.ts"),
};
for (const site of SITES) {
  entryPoints[`content/${site}`] = path.join(root, `src/content/${site}.ts`);
}

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, "public"), outdir, { recursive: true });
  await cp(
    path.join(root, "src/inject"),
    path.join(outdir, "inject"),
    { recursive: true },
  );
}

async function main() {
  if (existsSync(outdir)) await rm(outdir, { recursive: true });
  await copyStatic();

  const options = {
    entryPoints,
    outdir,
    bundle: true,
    format: "iife" as const,
    target: "chrome120",
    sourcemap: !watch ? false : ("inline" as const),
    logLevel: "info" as const,
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("[pond-ext] watching for changes…");

    // esbuild only re-bundles entry points; static assets (manifest, popup
    // HTML/CSS, inject scripts) need their own watcher so edits show up
    // without a full restart.
    const staticDirs = [
      path.join(root, "public"),
      path.join(root, "src/inject"),
    ];
    let pending: NodeJS.Timeout | null = null;
    const recopy = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        copyStatic()
          .then(() => console.log("[pond-ext] static assets re-copied"))
          .catch((err) => console.error("[pond-ext] static copy failed", err));
      }, 50);
    };
    for (const dir of staticDirs) {
      fsWatch(dir, { recursive: true }, recopy);
    }
  } else {
    await build(options);
    console.log("[pond-ext] built to dist/");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
