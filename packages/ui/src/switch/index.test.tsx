import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from ".";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

describe("Switch", () => {
  it("dims a disabled switch through the attribute on its span root", () => {
    const markup = renderToStaticMarkup(<Switch.Root checked disabled />);

    expect(markup).toMatch(/^<span [^>]*data-disabled=""/);
    expect(css).not.toContain(":disabled");
    expect(css).toMatch(
      /&\[data-disabled\] \{\s*cursor: not-allowed;\s*opacity: var\(--ds-opacity-disabled\);/,
    );
  });

  it("ignores hover while disabled", () => {
    expect(css).toContain(":hover");
    expect(css).not.toMatch(/:hover(?!:not\(\[data-disabled\]\))/);
  });
});
