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
  it("tops the icon and close against the title of a described toast", () => {
    const content = declarations(".content");
    expect(content).toContain("align-items: flex-start;");
    expect(content).toContain(
      "padding: var(--ds-space-lg) var(--ds-space-md) var(--ds-space-lg) var(--ds-space-lg);",
    );
  });

  it("centers a title-only toast in one row", () => {
    const oneLine = declarations(
      "&:not(:has(.description, .progress, .meta))",
    );
    expect(oneLine).toContain("align-items: center;");
    expect(oneLine).toContain("padding-block: var(--ds-space-md);");
  });

  it("keeps the close button in normal flow", () => {
    const close = declarations(".close");
    expect(close).not.toContain("position: absolute;");
    expect(close).not.toContain("inset-block-start:");
    expect(close).not.toContain("translate:");
  });
});

describe("toast stacking", () => {
  it("tucks older toasts behind the newest at its height", () => {
    const root = declarations(".root");

    expect(root).toContain("position: absolute;");
    expect(root).toContain(
      "--y: calc(var(--toast-index) * var(--toast-peek) * -1);",
    );
    expect(root).toContain(
      "height: var(--toast-frontmost-height, var(--toast-height));",
    );
  });

  it("fans toasts out at their own heights when you hover or focus the stack", () => {
    const expanded = declarations("&[data-expanded]");

    expect(expanded).toContain("var(--toast-offset-y) * -1");
    expect(expanded).toContain("height: var(--toast-height);");
  });
});
