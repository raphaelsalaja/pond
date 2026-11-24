import { act, useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "../../../packages/ui/src/window";

function Fixture({
  onResize,
  onCollapse,
}: {
  onResize: (next: number) => void;
  onCollapse: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(300);
  const resize = useCallback(
    (next: number) => {
      onResize(next);
      setWidth(next);
    },
    [onResize],
  );
  const collapse = useCallback(() => {
    onCollapse();
    setOpen(false);
  }, [onCollapse]);
  const style: CSSProperties & { "--window-left-track": string } = {
    "--window-left-track": `${width}px`,
  };
  return (
    <Window.Root leftOpen={open} style={style}>
      <Window.Left
        aria-label="Sidebar"
        minWidth={220}
        maxWidth={420}
        width={width}
        onResize={resize}
        onCollapse={collapse}
      >
        Sidebar
      </Window.Left>
      <Window.Center>
        <button type="button" onClick={() => setOpen(true)}>
          Reopen
        </button>
      </Window.Center>
    </Window.Root>
  );
}

/** Pointer moves land on the next animation frame, so each event waits for one. */
async function pointer(target: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
    isPrimary: { value: true },
  });
  await act(async () => {
    target.dispatchEvent(event);
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  });
}

describe("sidebar resize handle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const resized = vi.fn();
  const collapsed = vi.fn();

  function element(selector: string) {
    const node = container.querySelector<HTMLElement>(selector);
    if (!node) {
      throw new Error(`Missing ${selector}`);
    }
    return node;
  }

  beforeEach(() => {
    resized.mockClear();
    collapsed.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const shell = this.closest<HTMLElement>('[data-slot="window"]');
        const width = Number.parseFloat(
          shell?.style.getPropertyValue("--window-left-track") ?? "300",
        );
        return new DOMRect(0, 0, width, 600);
      },
    );
    act(() => {
      root.render(<Fixture onResize={resized} onCollapse={collapsed} />);
    });
    Object.defineProperties(element('[data-slot="handle"]'), {
      setPointerCapture: { value: vi.fn(), configurable: true },
      releasePointerCapture: { value: vi.fn(), configurable: true },
      hasPointerCapture: { value: vi.fn(() => true), configurable: true },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resizes with the keyboard, reports current width and returns focus on collapse", async () => {
    const handle = element('[data-slot="handle"]');
    handle.focus();
    expect(document.activeElement).toBe(handle);
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-controls")).toBe(
      element('[data-slot="left"]').id,
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
    const key = async (key: string, shiftKey = false) => {
      await act(() =>
        handle.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    };
    await key("ArrowRight");
    expect(resized).toHaveBeenLastCalledWith(310);
    expect(handle.getAttribute("aria-valuenow")).toBe("310");
    await key("ArrowLeft", true);
    expect(resized).toHaveBeenLastCalledWith(270);
    await key("Home");
    expect(handle.getAttribute("aria-valuenow")).toBe("220");
    await key("ArrowLeft");
    expect(resized).toHaveBeenLastCalledWith(220);
    await key("End");
    expect(handle.getAttribute("aria-valuenow")).toBe("420");
    await key("Enter");
    expect(collapsed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(element('[data-slot="center"]'));
    act(() => {
      element("button").click();
    });
    expect(element('[data-slot="handle"]').getAttribute("aria-valuenow")).toBe(
      "420",
    );
  });

  it("commits a normal resize above the minimum", async () => {
    const handle = element('[data-slot="handle"]');
    await pointer(handle, "pointerdown", 300);
    await pointer(handle, "pointermove", 250);
    expect(resized).not.toHaveBeenCalled();
    expect(
      element('[data-slot="window"]').style.getPropertyValue(
        "--window-left-track",
      ),
    ).toBe("250px");
    await pointer(handle, "pointerup", 250);
    expect(resized).toHaveBeenCalledWith(250);
    expect(collapsed).not.toHaveBeenCalled();
  });

  it("holds at the minimum, closes past it before release, and reopens at the minimum width", async () => {
    const handle = element('[data-slot="handle"]');
    await pointer(handle, "pointerdown", 300);
    await pointer(handle, "pointermove", 221);
    await pointer(handle, "pointermove", 200);
    expect(collapsed).not.toHaveBeenCalled();
    expect(
      element('[data-slot="window"]').style.getPropertyValue(
        "--window-left-track",
      ),
    ).toBe("220px");
    await pointer(handle, "pointermove", 172);
    expect(collapsed).toHaveBeenCalledTimes(1);
    expect(element('[data-slot="window"]').hasAttribute("data-left-open")).toBe(
      false,
    );
    expect(resized).toHaveBeenCalledWith(220);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(element('[data-slot="window"]').hasAttribute("data-resizing")).toBe(
      false,
    );
    await pointer(handle, "pointermove", 100);
    await pointer(handle, "pointerup", 100);
    expect(collapsed).toHaveBeenCalledTimes(1);
    expect(resized).toHaveBeenCalledTimes(1);
    act(() => {
      element("button").click();
    });
    expect(element('[data-slot="window"]').hasAttribute("data-left-open")).toBe(
      true,
    );
    expect(
      element('[data-slot="window"]').style.getPropertyValue(
        "--window-left-track",
      ),
    ).toBe("220px");
    expect(element('[data-slot="handle"]').getAttribute("aria-valuenow")).toBe(
      "220",
    );
  });

  it.each(["pointercancel", "lostpointercapture"])(
    "cancels safely on %s",
    async (type) => {
      const handle = element('[data-slot="handle"]');
      await pointer(handle, "pointerdown", 300);
      await pointer(handle, "pointermove", 250);
      await pointer(handle, type, 250);
      expect(resized).not.toHaveBeenCalled();
      expect(collapsed).not.toHaveBeenCalled();
      expect(
        element('[data-slot="window"]').style.getPropertyValue(
          "--window-left-track",
        ),
      ).toBe("300px");
      expect(document.body.style.cursor).toBe("");
      expect(
        element('[data-slot="window"]').hasAttribute("data-resizing"),
      ).toBe(false);
    },
  );

  it("still collapses on a click without dragging", async () => {
    const handle = element('[data-slot="handle"]');
    await pointer(handle, "pointerdown", 300);
    await pointer(handle, "pointerup", 300);
    expect(collapsed).toHaveBeenCalledTimes(1);
    expect(resized).not.toHaveBeenCalled();
    act(() => {
      element("button").click();
    });
    expect(
      element('[data-slot="window"]').style.getPropertyValue(
        "--window-left-track",
      ),
    ).toBe("300px");
  });
});
