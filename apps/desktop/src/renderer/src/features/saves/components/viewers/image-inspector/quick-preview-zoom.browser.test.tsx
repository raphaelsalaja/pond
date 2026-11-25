import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import { pool } from "@/features/saves/state/pool";
import { bridge } from "@/shared/test/pond-bridge";
import { ImageInspector } from "./";
import { IMAGE_INSPECTOR_SAVE } from "./image-inspector-test-harness";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function renderQuickPreview(src: string) {
  const save = { ...IMAGE_INSPECTOR_SAVE, rotate: 0, flipX: false, crop: null };
  pool.upsert(save);
  await act(async () =>
    root.render(
      <ViewerChrome enabled={false}>
        <ImageInspector
          save={save}
          src={src}
          active
          onRatio={() => {}}
          onError={() => {}}
        />
      </ViewerChrome>,
    ),
  );
  const frame = host.querySelector<HTMLElement>("[data-background]");
  const position = host.querySelector("img")?.parentElement?.parentElement;
  if (!frame || !position) {
    throw new Error("Missing image inspection frame");
  }
  Object.assign(frame.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "400px",
    height: "400px",
  });
  Object.defineProperties(frame, {
    setPointerCapture: { value: () => {} },
    hasPointerCapture: { value: () => false },
  });
  await nextFrame();
  return { frame, position };
}

function nextFrame() {
  return act(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
}

const click = (target: Element, x = 200, y = 200) =>
  act(async () => {
    target.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }),
    );
  });

it("keeps a fitted image still when scrolling", async () => {
  const { frame, position } = await renderQuickPreview("pond://test/still.jpg");
  expect(frame.dataset.clickZoom).toBe("in");
  await act(async () => {
    frame.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 12,
        deltaY: 24,
      }),
    );
  });
  await nextFrame();
  expect(position.style.transform).toBe("translate(0px, 0px) scale(1)");
});

it("zooms in with a click, pans while zoomed, and zooms out with another click", async () => {
  const { frame, position } = await renderQuickPreview("pond://test/zoom.jpg");
  await click(frame);
  expect(position.style.transform).toBe("translate(0px, 0px) scale(2)");
  expect(frame.dataset.clickZoom).toBe("out");
  await act(async () => {
    frame.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 12,
        deltaY: 24,
      }),
    );
  });
  await nextFrame();
  expect(position.style.transform).toBe("translate(-12px, -24px) scale(2)");
  await click(frame);
  expect(position.style.transform).toBe("translate(0px, 0px) scale(1)");
  expect(frame.dataset.clickZoom).toBe("in");
});

it("ignores a click that ends a drag", async () => {
  const { frame, position } = await renderQuickPreview("pond://test/drag.jpg");
  await act(async () => {
    frame.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    frame.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 160, clientY: 100 }),
    );
  });
  expect(position.style.transform).toBe("translate(0px, 0px) scale(1)");
});
