import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostRenderer } from "../src/index";
import type {
  PostBySource,
  PostRenderer,
  RenderOptions,
  RenderSource,
} from "../src/index";
import { BLUESKY_POST, THREADS_POST, X_POST } from "./fixtures";

/** The packaged `render/` folder: `Pond.app/Contents/Resources/render`. */
const RENDER_DIR = process.env.POND_RENDER_DIR ?? "";
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const DPR = 2;

interface Case<S extends RenderSource> {
  source: S;
  post: PostBySource[S];
  options: RenderOptions;
}

/** The sizes and surfaces `apps/desktop/src/main/core/render-post` asks for. */
const CASES = [
  {
    source: "twitter",
    post: X_POST,
    options: { surface: "web-detail", width: 550, dpr: DPR },
  } satisfies Case<"twitter">,
  {
    source: "threads",
    post: THREADS_POST,
    options: { width: 640, dpr: DPR },
  } satisfies Case<"threads">,
  {
    source: "bluesky",
    post: BLUESKY_POST,
    options: { width: 550, dpr: DPR },
  } satisfies Case<"bluesky">,
];

let renderer: PostRenderer;
let cacheDir: string;

beforeAll(async () => {
  if (!existsSync(join(RENDER_DIR, "pond-render.wasm"))) {
    throw new Error(
      `No pond-render.wasm in POND_RENDER_DIR (${RENDER_DIR || "unset"}). ` +
        "Point it at a packaged Pond.app/Contents/Resources/render.",
    );
  }
  cacheDir = mkdtempSync(join(tmpdir(), "pond-render-smoke-"));
  renderer = await createPostRenderer({
    wasmPath: join(RENDER_DIR, "pond-render.wasm"),
    fontsDir: join(RENDER_DIR, "fonts"),
    cacheDir,
  });
});

afterAll(() => {
  renderer?.dispose();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
});

describe("packaged post renderer", () => {
  for (const { source, post, options } of CASES) {
    for (const theme of ["light", "dark"] as const) {
      it(`draws a ${source} post in ${theme}`, async () => {
        const rendered = await renderer.render(source, post, {
          ...options,
          theme,
        });
        const png = rendered.png;
        expect(png.subarray(0, 8), `${source} output is not a PNG`).toEqual(
          PNG_SIGNATURE,
        );
        expect(rendered.width, `${source} layout width`).toBe(options.width);
        expect(png.readUInt32BE(16), `${source} PNG width`).toBe(
          rendered.width * DPR,
        );
        expect(png.readUInt32BE(20), `${source} PNG height`).toBe(
          rendered.height * DPR,
        );
        expect(rendered.height, `${source} post height`).toBeGreaterThan(100);
        expect(rendered.warnings, `${source} render warnings`).toEqual([]);
      });
    }
  }
});
