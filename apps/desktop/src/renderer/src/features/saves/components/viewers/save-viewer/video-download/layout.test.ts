import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));

function declarations(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

it("places the undownloaded video notice above the in-flow zoom pill", () => {
  const source = readFileSync(resolve(directory, "index.tsx"), "utf8");
  const css = readFileSync(resolve(directory, "styles.module.css"), "utf8");
  const controls = readFileSync(
    resolve(directory, "../../image-inspector/controls/styles.module.css"),
    "utf8",
  );
  const chrome = readFileSync(
    resolve(directory, "../../media-viewer/chrome/styles.module.css"),
    "utf8",
  );

  expect(source).toContain('ChromePortal slot="bottom"');
  expect(source).toContain('data-placement="above-chrome"');
  expect(source).not.toContain('anchor="bottom-center"');

  const notice = declarations(css, ".notice");
  expect(notice).toContain("position: absolute;");
  expect(notice).toContain("bottom: calc(100% + 8px);");
  expect(notice).toContain("left: 50%;");
  expect(notice).toContain("transform: translateX(-50%);");

  const zoom = declarations(controls, ".zoom");
  expect(zoom).toContain("margin-inline: auto;");
  expect(zoom).not.toContain("position: absolute;");

  const bottom = declarations(chrome, ".bottom");
  expect(bottom).not.toContain("overflow:");
});
