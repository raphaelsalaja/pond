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

describe("SearchChrome.Field", () => {
  it("renders the Library search pill in place without a window toolbar", () => {
    const markup = renderToStaticMarkup(
      <SearchChrome.Root actions={<button type="button">Act</button>}>
        <SearchChrome.Field aria-label="Search" />
      </SearchChrome.Root>,
    );

    expect(markup).toContain(styles.bar);
    expect(markup).toContain(styles.shell);
    expect(markup).toContain(styles.actions);
    expect(markup).toContain('data-variant="borderless"');
    expect(markup).toContain('placeholder="Search…"');
    expect(markup).toContain("<svg");
  });
});

describe("SearchChrome.Input", () => {
  it("renders a bare field with no lens", () => {
    const markup = renderToStaticMarkup(
      <SearchChrome.Input aria-label="Search" />,
    );

    expect(markup).toContain(styles.input);
    expect(markup).toContain(styles.field);
    expect(markup).toContain('data-variant="borderless"');
    expect(markup).toContain('data-appearance="bare"');
    expect(markup).not.toContain("<svg");
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
