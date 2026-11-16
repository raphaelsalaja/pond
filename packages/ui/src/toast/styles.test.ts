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

describe("toast alignment", () => {
  it("keeps the message and controls in one centered row", () => {
    const content = declarations(".content");
    expect(content).toContain("align-items: center;");
    expect(content).toContain(
      "padding: var(--ds-space-md) var(--ds-space-md) var(--ds-space-md) var(--ds-space-lg);",
    );
  });

  it("keeps the close button in normal flow", () => {
    const close = declarations(".close");
    expect(close).not.toContain("position: absolute;");
    expect(close).not.toContain("inset-block-start:");
    expect(close).not.toContain("translate:");
  });
});

describe("toast stacking", () => {
  it("keeps active toasts in separate rows", () => {
    const viewport = declarations(".viewport");
    const root = declarations(".root");

    expect(viewport).toContain("display: flex;");
    expect(viewport).toContain("flex-direction: column-reverse;");
    expect(viewport).toContain("gap: var(--toast-gap);");
    expect(root).toContain("position: relative;");
    expect(root).not.toContain("--toast-offset-y");
  });
});
