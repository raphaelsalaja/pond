import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

function declarations(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

describe("pane chrome", () => {
  it("keeps every pane header on one geometry and typography contract", () => {
    const root = declarations(".root");
    expect(root).toContain("height: var(--ds-title-bar-height);");
    expect(root).toContain("padding: var(--ds-space-md);");
    expect(root).toContain("border-bottom: var(--ds-border-width) solid var(--ds-border-subtle);");

    expect(declarations(".title")).toContain("font-size: var(--ds-text-body);");
    expect(declarations(".actions")).toContain("gap: var(--ds-space-xs);");
  });

  it("keeps pane content on one horizontal inset", () => {
    expect(declarations(".body")).toContain(
      "padding-inline: var(--ds-space-2xl);",
    );
  });
});
