import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextPickerIndex, PickerPanel } from ".";

function read(path: string) {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), path),
    "utf8",
  );
}

const css = read("styles.module.css");
const itemCss = read("item/styles.module.css");

function declarations(selector: string, occurrence = 0) {
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    start = css.indexOf(`${selector} {`, start + 1);
  }
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

describe("PickerPanel", () => {
  it("moves a logical cursor through lists and grids", () => {
    expect(nextPickerIndex(0, 5, "ArrowDown", 1)).toBe(1);
    expect(nextPickerIndex(4, 5, "ArrowDown", 1)).toBe(0);
    expect(nextPickerIndex(1, 6, "ArrowDown", 2)).toBe(3);
    expect(nextPickerIndex(1, 6, "ArrowUp", 2)).toBe(5);
    expect(nextPickerIndex(0, 6, "ArrowLeft", 2)).toBe(5);
    expect(nextPickerIndex(5, 6, "ArrowRight", 2)).toBe(0);
  });

  it("renders a structured collection with truncating labels", () => {
    const markup = renderToStaticMarkup(
      <PickerPanel.Surface>
        <PickerPanel.Collection id="tags">
          <PickerPanel.Item id="tag-long" active selected="mixed">
            <PickerPanel.ItemLabel title="A very long tag name">
              A very long tag name
            </PickerPanel.ItemLabel>
          </PickerPanel.Item>
        </PickerPanel.Collection>
      </PickerPanel.Surface>,
    );

    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('data-highlighted=""');
    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('data-selection="mixed"');
    expect(markup).toContain('data-slot="picker-label"');
  });

  it("marks checked options selected and lets callers override it", () => {
    const checked = renderToStaticMarkup(
      <PickerPanel.Item selected="checked">Design</PickerPanel.Item>,
    );
    const overridden = renderToStaticMarkup(
      <PickerPanel.Item selected="mixed" aria-selected>
        Design
      </PickerPanel.Item>,
    );
    const action = renderToStaticMarkup(
      <PickerPanel.Item role="menuitem" selected="checked">
        Rename
      </PickerPanel.Item>,
    );

    expect(checked).toContain('aria-selected="true"');
    expect(overridden).toContain('aria-selected="true"');
    expect(action).not.toContain("aria-selected");
  });

  it("names the search field", () => {
    const markup = renderToStaticMarkup(
      <PickerPanel.Search aria-label="Search Tags" placeholder="Search…" />,
    );

    expect(markup).toContain('aria-label="Search Tags"');
  });

  it("can limit the row fill to the active row", () => {
    const markup = renderToStaticMarkup(
      <PickerPanel.Item highlight="active">Open</PickerPanel.Item>,
    );

    expect(markup).toContain('data-highlight="active"');
    expect(itemCss).toContain(
      '.item:not([data-highlight="active"]):hover::before',
    );
  });

  it("keeps static and collapsible section headers on the same type scale", () => {
    const sharedHeaders = declarations(".group-label,\n.section-button");
    const sectionButton = declarations(".section-button", 1);

    expect(sharedHeaders).toContain("font-family: inherit;");
    expect(sharedHeaders).toContain("font-size: var(--ds-text-small);");
    expect(sharedHeaders).toContain("font-weight: var(--ds-weight-medium);");
    expect(sectionButton).not.toContain("font: inherit;");
  });
});
