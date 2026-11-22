import { act } from "react";
import { expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import {
  IMAGE_INSPECTOR_SAVE,
  setupImageInspectorTest,
} from "./image-inspector-test-harness";
import { actualScale } from "./use-image-viewport";

const inspector = setupImageInspectorTest();

it("uses the fitted portrait width to calculate actual size", () => {
  expect(actualScale({ naturalWidth: 1000, fittedWidth: 500 })).toBe(2);
});

it("uses decoded preview dimensions instead of original metadata at actual size", () => {
  expect(actualScale({ naturalWidth: 2048, fittedWidth: 1000 })).toBe(2.048);
});

it("shows persisted transforms and keeps a cancelled crop draft out of storage", async () => {
  await inspector.render();
  const image = inspector.host.querySelector("img");
  expect(image?.style.transform).toBe("rotate(90deg) scaleX(-1)");
  expect(image?.style.clipPath).toContain("inset(");
  const frame = image?.closest("[data-background]");
  expect(frame?.contains(inspector.button("Fit to Window"))).toBe(false);
  expect(
    inspector
      .button("Fit to Window")
      .closest("[data-slot]")
      ?.getAttribute("data-slot"),
  ).toBe("top");
  expect(
    inspector
      .button("Zoom In")
      .closest("[data-slot]")
      ?.getAttribute("data-slot"),
  ).toBe("top");
  await act(async () => inspector.button("Zoom In").click());
  expect(inspector.host.textContent).toContain("125%");
  await act(async () => inspector.button("Fit to Window").click());
  expect(inspector.host.textContent).toContain("100%");
  await act(async () => inspector.button("Crop").click());
  expect(inspector.button("Apply Crop").disabled).toBe(true);
  expect(inspector.host.querySelectorAll("[data-handle]")).toHaveLength(8);
  expect(image?.style.transform).toBe("none");
  if (!frame) throw new Error("Missing image inspection frame");
  expect(frame.getAttribute("data-mode")).toBe("crop");
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 400),
  );
  Object.defineProperties(frame, {
    setPointerCapture: { value: () => {} },
    hasPointerCapture: { value: () => false },
  });
  await act(async () => {
    frame.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 40,
      }),
    );
    frame.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 240,
        clientY: 240,
      }),
    );
    frame.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 240,
        clientY: 240,
      }),
    );
  });
  expect(inspector.button("Apply Crop").disabled).toBe(false);
  expect(inspector.tx).not.toHaveBeenCalled();
  await act(async () => inspector.button("Cancel").click());
  expect(image?.style.transform).toBe("rotate(90deg) scaleX(-1)");
  expect(inspector.tx).not.toHaveBeenCalled();
  expect(pool.get(IMAGE_INSPECTOR_SAVE.id)?.crop).toEqual(
    IMAGE_INSPECTOR_SAVE.crop,
  );
});

it("starts a crop outside the image and clamps its origin to the edge", async () => {
  await inspector.render({
    ...IMAGE_INSPECTOR_SAVE,
    width: 200,
    height: 400,
  });
  await act(async () => inspector.button("Crop").click());
  const frame = inspector.prepareFrame();

  await act(async () => {
    frame.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 100,
      }),
    );
    frame.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 200,
        clientY: 300,
      }),
    );
    frame.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 200,
        clientY: 300,
      }),
    );
  });

  const selection =
    inspector.host.querySelector<HTMLElement>('[data-cropping=""]');
  expect(selection?.style.left).toBe("0%");
  expect(selection?.style.top).toBe("25%");
  expect(selection?.style.width).toBe("50%");
  expect(selection?.style.height).toBe("50%");
});

it("pinches to zoom at the pointer", async () => {
  await inspector.render(IMAGE_INSPECTOR_SAVE, "pond://test/pinch.jpg");
  const frame = inspector.prepareFrame();
  expect(inspector.host.textContent).toContain("100%");
  await act(async () => {
    frame.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -40,
        deltaMode: 0,
        clientX: 200,
        clientY: 200,
      }),
    );
  });
  await inspector.flushPose();
  expect(inspector.host.textContent).toContain("149%");
});

it("pans at fit with two-finger drag", async () => {
  await inspector.render(IMAGE_INSPECTOR_SAVE, "pond://test/pan.jpg");
  const image = inspector.host.querySelector("img");
  const frame = image?.closest("[data-background]");
  const position = image?.parentElement?.parentElement;
  if (!frame || !position) throw new Error("Missing image inspection frame");
  expect(position.style.transform).toBe("translate(0px, 0px) scale(1)");
  await act(async () => {
    frame.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 12,
        deltaY: 24,
        deltaMode: 0,
        clientX: 200,
        clientY: 200,
      }),
    );
  });
  await inspector.flushPose();
  expect(inspector.host.textContent).toContain("100%");
  expect(position.style.transform).toBe("translate(-12px, -24px) scale(1)");
});
