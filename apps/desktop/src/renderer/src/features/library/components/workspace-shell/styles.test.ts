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

describe("desktop shell edge motion", () => {
  it("gives back the entire sidebar column when closed", () => {
    expect(declarations(".shell")).toContain("--window-left-min: 0px;");
  });

  it("animates the sidebar surface without animating the content track", () => {
    const left = declarations(
      '.shell[data-slot="window"] [data-slot="left"] > div',
    );
    expect(left).toContain("opacity: 1;");
    expect(left).toContain(
      "calc(var(--window-left-width) - var(--window-left-track))",
    );
    expect(left).toContain("transition: transform");
    expect(declarations('.shell[data-slot="window"]')).toContain(
      "transition-property: --window-right-width;",
    );
    expect(
      declarations('.shell[data-slot="window"] [data-slot="left"]'),
    ).toContain("overflow: visible;");
  });
});
