import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { rememberCardThumbnail } from "@/features/saves/state/card-thumbnails";
import {
  IMAGE_INSPECTOR_SAVE,
  setupImageInspectorTest,
} from "./image-inspector-test-harness";

const inspector = setupImageInspectorTest();
const ORIGINAL = "pond://test/placeholder.jpg";
const THUMBNAIL = `${ORIGINAL}?tw=512`;

/** jsdom has no image decoding, so each test settles `decode()` explicitly. */
let decodes: Array<{ resolve: () => void; reject: () => void }> = [];

beforeEach(() => {
  decodes = [];
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () =>
      new Promise<void>((resolve, reject) => {
        decodes.push({ resolve, reject: () => reject(new Error("decode")) });
      }),
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

const original = () =>
  inspector.host.querySelector<HTMLImageElement>(`img[src="${ORIGINAL}"]`);
const covered = () =>
  inspector.host
    .querySelector(`img[src="${THUMBNAIL}"]`)
    ?.closest("[data-covered]") != null;

it("paints the card thumbnail until the original has decoded", async () => {
  rememberCardThumbnail(ORIGINAL, THUMBNAIL);
  await inspector.render(undefined, ORIGINAL);

  expect(covered()).toBe(false);
  expect(original()?.hasAttribute("data-pending")).toBe(true);

  await act(async () => decodes[0]?.resolve());

  expect(covered()).toBe(true);
  expect(original()?.hasAttribute("data-pending")).toBe(false);
});

it("reveals the original on load when decoding fails early", async () => {
  rememberCardThumbnail(ORIGINAL, THUMBNAIL);
  await inspector.render(undefined, ORIGINAL);

  await act(async () => decodes[0]?.reject());

  expect(covered()).toBe(false);
  expect(original()?.hasAttribute("data-pending")).toBe(true);

  await act(async () => original()?.dispatchEvent(new Event("load")));

  expect(covered()).toBe(true);
  expect(original()?.hasAttribute("data-pending")).toBe(false);
});

it("paints the save's blurhash only under the file the card shows", async () => {
  const file = (path: string) => ({
    kind: "image",
    path,
    sha256: path,
    size: 1,
    mimeType: "image/jpeg",
  });
  const save = {
    ...IMAGE_INSPECTOR_SAVE,
    blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    files: [file("media-1.jpg"), file("media-2.jpg")],
  };
  const hash = () => inspector.host.querySelector("canvas");

  await inspector.render(save, "pond://test/media-2.jpg", 1);
  expect(hash()).toBeNull();

  await inspector.render(save, "pond://test/media-1.jpg", 0);
  expect(hash()).not.toBeNull();
});

it("keeps the card's original under the viewer image until it fades in", async () => {
  rememberCardThumbnail(ORIGINAL, ORIGINAL);
  await inspector.render(undefined, ORIGINAL);
  const placeholder = () =>
    inspector.host.querySelector(`[data-covered] img[src="${ORIGINAL}"]`);

  expect(
    inspector.host.querySelectorAll(`img[src="${ORIGINAL}"]`),
  ).toHaveLength(2);
  expect(placeholder()).toBeNull();

  await act(async () => decodes[0]?.resolve());

  expect(placeholder()).not.toBeNull();
});
