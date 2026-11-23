import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchChrome } from ".";
import styles from "./styles.module.css";

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
  });

  it("uses the primary field for Harvester", () => {
    const markup = renderToStaticMarkup(
      <SearchChrome.Input aria-label="Search" variant="primary" />,
    );
    expect(markup).toContain('data-variant="primary"');
    expect(markup).not.toContain('data-appearance="bare"');
  });
});
