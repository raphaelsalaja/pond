import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SaveCardOverlayModel } from "@/features/saves/components/card/model";
import { Card } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const emptyOverlay: SaveCardOverlayModel = {
  type: null,
  source: null,
  fileCount: null,
};

describe("Save card selection circle", () => {
  function renderCard(checked: boolean, calls: string[]) {
    act(() => {
      root?.render(
        <div
          role="listbox"
          aria-label="Test Saves"
          tabIndex={0}
          onKeyDown={() => calls.push("list keydown")}
          onPointerDown={() => calls.push("list pointerdown")}
          onMouseDown={() => calls.push("list mousedown")}
          onClick={() => calls.push("list click")}
          onDoubleClick={() => calls.push("list double click")}
        >
          <Card.Root>
            <Card.Select onClick={() => calls.push("open")}>Save</Card.Select>
            <Card.Pick checked={checked} onClick={() => calls.push("pick")} />
          </Card.Root>
        </div>,
      );
    });
    const pick = container?.querySelector<HTMLElement>('[role="checkbox"]');
    if (!pick) throw new Error("Missing selection circle");
    return pick;
  }

  it("toggles selection without opening the Save, dragging, or reaching the card", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const calls: string[] = [];
    const pick = renderCard(false, calls);

    expect(pick.getAttribute("tabindex")).toBe("-1");
    expect(pick.getAttribute("aria-checked")).toBe("false");

    let pressAllowed = true;
    act(() => {
      pick.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      pressAllowed = pick.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      pick.click();
      pick.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(pressAllowed).toBe(false);
    expect(calls).toEqual(["pick"]);
  });

  it("shows the checked state from the selection", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const pick = renderCard(true, []);

    expect(pick.getAttribute("aria-checked")).toBe("true");
    expect(pick.hasAttribute("data-checked")).toBe(true);
  });
});

describe("Save card source badge", () => {
  it("omits a source badge when the model has none", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<Card.Overlay model={emptyOverlay} />);
    });

    expect(container.querySelector('[aria-label^="Saved from"]')).toBeNull();
  });

  it("renders source details from the presentation model", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <Card.Overlay
          model={{
            ...emptyOverlay,
            source: { label: "Web", logo: null, icon: null },
          }}
        />,
      );
    });

    expect(
      container.querySelector('[aria-label="Saved from Web"]'),
    ).not.toBeNull();
  });
});
