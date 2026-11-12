import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

function declarations(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

it("keeps a long parent folder name on one truncated line", () => {
  const crumb = declarations(".crumb");
  expect(crumb).toContain("max-width: 80px");
  expect(crumb).toContain("overflow: hidden");
  expect(crumb).toContain("text-overflow: ellipsis");
  // Ellipsis only applies to a single line. Without nowrap the parent wraps,
  // and the reset's `* { text-wrap: pretty }` overrides the label's nowrap.
  expect(crumb).toContain("white-space: nowrap");

  const label = declarations(".label");
  expect(label).toContain("display: inline-flex");
  expect(label).toContain("align-items: baseline");
  expect(label).toContain("white-space: nowrap");
  expect(declarations(".name")).toContain("white-space: nowrap");
});
