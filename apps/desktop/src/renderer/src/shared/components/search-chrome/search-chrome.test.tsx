import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchChrome } from ".";
import styles from "./styles.module.css";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

function declarations(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

describe("SearchChrome.Input", () => {
  it("uses the shared chrome's layout inset instead of input padding", () => {
    const markup = renderToStaticMarkup(
      <SearchChrome.Root>
        <SearchChrome.Input aria-label="Search" />
      </SearchChrome.Root>,
    );

    expect(markup).toContain(styles.input);
    expect(markup).toContain(styles.field);
    expect(markup).toContain('data-variant="borderless"');
    expect(markup).toContain('data-appearance="bare"');
    expect(markup).not.toContain("<svg");
    expect(declarations(".root")).toContain(
      "--search-chrome-inline-start: 20px;",
    );
    expect(declarations(".bar")).toContain("padding: var(--ds-space-md);");
    expect(declarations(".search")).toContain(
      "padding-left: var(--ds-space-md);",
    );
  });

  it("uses the primary field for Harvester", () => {
    const markup = renderToStaticMarkup(
      <SearchChrome.Input aria-label="Search" variant="primary" />,
    );
    expect(markup).toContain('data-variant="primary"');
    expect(markup).not.toContain('data-appearance="bare"');
  });

  it("matches the Library search placeholder emphasis", () => {
    expect(declarations("&::placeholder")).toContain(
      "color: var(--ds-foreground-tertiary);",
    );
  });
});
