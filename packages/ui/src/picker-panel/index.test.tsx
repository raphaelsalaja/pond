import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextPickerIndex, PickerPanel } from ".";

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
  });
});
