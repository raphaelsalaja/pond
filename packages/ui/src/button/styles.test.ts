import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

it("fills primary buttons with the accent", () => {
  const start = css.indexOf(
    '&:where([data-variant="primary"], [data-variant="accent"]) {',
  );
  expect(start).toBeGreaterThanOrEqual(0);

  const primary = css.slice(start, css.indexOf("}", start));
  expect(primary).toContain("background-color: var(--ds-accent);");
  expect(primary).not.toContain("var(--ds-background-inverse)");
});

it("never scales on press, so popups anchored to a trigger stay put", () => {
  expect(css).not.toMatch(/\bscale:/);
});
