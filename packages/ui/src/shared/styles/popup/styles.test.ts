import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

it("keeps portaled popups clickable when an ancestor disables pointer events", () => {
  const start = css.indexOf(".positioner {");
  expect(start).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  expect(block).toContain("pointer-events: auto;");
});

it("drops popup movement when reduced motion is requested", () => {
  const popup = css.indexOf(".popup {");
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)", popup);
  expect(start).toBeGreaterThan(popup);
  const block = css.slice(start, css.indexOf("&[data-instant]", start));
  expect(block).toContain("transform: none;");
  expect(block).not.toMatch(/transition:[^;]*transform/);
});
