import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = import.meta.dirname;
const theme = resolve(directory, "../../../../../packages/theme/src");
const cards = resolve(directory, "features/captures/components");
const CARD_DIRS = ["tweet", "threads", "text-card"];

function cssFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

function importedThemeCss(path: string): string {
  const css = readFileSync(path, "utf8");
  return css.replaceAll(/@import "\.\/([^"]+)";/g, (_, file: string) =>
    importedThemeCss(join(dirname(path), file)),
  );
}

describe("card capture page", () => {
  it("loads every theme token the card styles use", () => {
    const entry = readFileSync(resolve(directory, "capture.tsx"), "utf8");
    const exports: Record<string, string> = JSON.parse(
      readFileSync(join(theme, "../package.json"), "utf8"),
    ).exports;
    const loaded = [...entry.matchAll(/import "@pond\/theme\/([^"]+)";/g)]
      .map((m) => exports[`./${m[1]}`])
      .map((file) => importedThemeCss(join(theme, "..", file ?? "")))
      .join("\n");
    const used = new Set(
      CARD_DIRS.flatMap((dir) => cssFiles(join(cards, dir)))
        .map((file) => readFileSync(file, "utf8"))
        .flatMap((css) => [...css.matchAll(/var\((--ds-[\w-]+)/g)])
        .map((m) => m[1]),
    );

    const missing = [...used].filter((token) => !loaded.includes(`${token}:`));

    expect(missing).toEqual([]);
  });
});
