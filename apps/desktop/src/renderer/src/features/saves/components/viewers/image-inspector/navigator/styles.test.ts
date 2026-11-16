import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

describe("image navigator", () => {
  it("keeps the shadow outside the clipped map", () => {
    const root = css.match(/\.root\s*\{(?<rules>[^}]*)\}/)?.groups?.rules;
    const map = css.match(/\.map\s*\{(?<rules>[^}]*)\}/)?.groups?.rules;
    const viewport = css.match(/\.viewport\s*\{(?<rules>[^}]*)\}/)?.groups
      ?.rules;
    expect(root).toContain("var(--ds-shadow-overlay)");
    expect(root).not.toContain("overflow: hidden");
    expect(map).toContain("overflow: hidden");
    expect(map).toContain("border-radius: inherit");
    expect(viewport).toContain("border-radius: inherit");
    expect(viewport).toContain("inset 0 0 0 1px var(--ds-accent-border)");
  });
});
