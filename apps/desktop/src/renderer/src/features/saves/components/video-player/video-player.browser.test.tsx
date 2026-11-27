/// <reference types="@vitest/browser-playwright" />
import { PrefsSchema } from "@pond/schema";
import "@pond/theme/motion.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cdp } from "vitest/browser";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import { bridge } from "@/shared/test/pond-bridge";
import { VideoPlayer } from "./";

/** Real WebM fixture; the frame callback fires only after Chromium presents decoded media. */
const VIDEO_SRC =
  "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH4EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEcTbuMU6uEHFO7a1OsggHi7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjAuMy4xMDBXQYxMYXZmNjAuMy4xMDBEiYhAn0AAAAAAABZUrmvBrgEAAAAAAAA414EBc8WIeBffPJ49PYGcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4Q7msoA4ImwgQK6gQKagQISVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjAuMy4xMDBzc9ZjwItjxYh4F988nj09gWfIoEWjh0VOQ09ERVJEh5NMYXZjNjAuMy4xMDAgbGlidnB4Z8iiRaOIRFVSQVRJT05Eh5QwMDowMDowMi4wMDAwMDAwMDAAAB9DtnXB54EAo6KBAACAEAIAnQEqAgACAAvHCIWFiJmEiD+CAAwNYAD+5rUAo5iBA+gAsQEALxH8ABgAMD/0DAAAAP7mtQAcU7trkbuPs4EAt4r3gQHxggGc8IED";
const POSTER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

let host: HTMLDivElement;
let root: Root;

function list(value: string) {
  return value.split(",").map((part) => part.trim());
}

beforeEach(() => {
  bridge.use({
    query: {
      "settings.getPrefs": () =>
        PrefsSchema.parse({ viewer: { videoMuted: true } }),
    },
  });
  host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "600px";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.documentElement.removeAttribute("data-reduce-motion");
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  host.remove();
});

it("reveals the first frame over its poster with restrained motion", async () => {
  await act(async () => {
    root.render(
      <ViewerChrome enabled={false}>
        <VideoPlayer src={VIDEO_SRC} poster={POSTER_SRC} active />
      </ViewerChrome>,
    );
  });
  const video = host.querySelector("video");
  const poster = host.querySelector('img[aria-hidden="true"]');
  if (!video || !poster) {
    throw new Error("Missing video reveal media");
  }

  const videoStyle = getComputedStyle(video);
  expect(list(videoStyle.transitionProperty)).toEqual(["opacity", "transform"]);
  expect(list(videoStyle.transitionDuration)).toEqual(["0.08s", "0.2s"]);
  const standard = getComputedStyle(document.documentElement)
    .getPropertyValue("--ds-easing-standard")
    .replaceAll(" ", "");
  expect(standard).not.toBe("");
  expect(
    videoStyle.transitionTimingFunction
      .replaceAll(" ", "")
      .startsWith(standard),
  ).toBe(true);

  await vi.waitFor(
    () => {
      if (!poster.hasAttribute("data-covered")) {
        throw new Error("Waiting for the first video frame");
      }
    },
    { timeout: 5000 },
  );

  expect(video.hasAttribute("data-pending")).toBe(false);
  const posterStyle = getComputedStyle(poster);
  expect(posterStyle.transitionProperty).toBe("visibility");
  expect(posterStyle.transitionDuration).toBe("0s");
  expect(posterStyle.transitionDelay).toBe("0.08s");

  document.documentElement.dataset.reduceMotion = "true";
  expect(getComputedStyle(poster).transitionDelay).toBe("0s");
  delete document.documentElement.dataset.reduceMotion;

  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  expect(getComputedStyle(poster).transitionDelay).toBe("0s");
});
