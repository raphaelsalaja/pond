import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { loadPrefs } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
import { HoverVideo } from "./";

let host: HTMLDivElement;
let root: Root;
let posterUrl: string;

beforeEach(() => {
  bridge.use({
    machinePace: async () => ({ thermal: "nominal", onBattery: false }),
    query: {
      "settings.getPrefs": () =>
        PrefsSchema.parse({
          viewer: { hoverVideo: true, thumbnailBehavior: "scrub" },
        }),
    },
  });
  const poster = document.createElement("canvas");
  poster.width = 4;
  poster.height = 3;
  posterUrl = poster.toDataURL("image/png");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    await cdp().send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1200,
      y: 700,
    });
  });
  await act(async () => root.unmount());
  host.remove();
  delete document.body.dataset.saveDragging;
});

function scene(clip: string | null) {
  return (
    <div style={{ position: "relative", width: 160, height: 100 }}>
      {clip ? (
        <HoverVideo
          key={clip}
          saveId="clip"
          src={`pond://clip/${clip}.mp4`}
          unit={{
            key: `${clip}.mp4`,
            url: `pond://clip/${clip}.mp4`,
            isVideo: true,
          }}
          posterUrl={posterUrl}
          label="Clip"
          onBroken={() => {}}
        />
      ) : (
        <div aria-label="Pointer target" style={{ width: 160, height: 100 }} />
      )}
    </div>
  );
}

async function renderClip(clip: string | null): Promise<void> {
  await loadPrefs();
  await act(async () => {
    root.render(scene(clip));
  });
}

function video(): HTMLVideoElement {
  const el = host.querySelector("video");
  if (!el) throw new Error("Missing hover video");
  return el;
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

async function hover(el: Element): Promise<void> {
  await act(async () => {
    await userEvent.hover(el);
  });
}

async function expectSrc(src: string): Promise<void> {
  await wait(500);
  expect(video().getAttribute("src")).toBe(src);
}

it("arms when the video mounts under a stationary pointer", async () => {
  await renderClip(null);
  const target = host.querySelector<HTMLElement>(
    '[aria-label="Pointer target"]',
  );
  if (!target) {
    throw new Error("Missing pointer target");
  }
  await hover(target);

  await renderClip("one");

  expect(video().hasAttribute("src")).toBe(false);
  await expectSrc("pond://clip/one.mp4");
});

it("re-arms when the video is replaced under a stationary pointer", async () => {
  await renderClip("one");
  const first = video();
  await hover(first);
  await expectSrc("pond://clip/one.mp4");

  await renderClip("two");

  const replacement = video();
  expect(replacement).not.toBe(first);
  expect(replacement.hasAttribute("src")).toBe(false);
  await expectSrc("pond://clip/two.mp4");
});

it("re-arms a stationary hover after a drag veto ends", async () => {
  await renderClip("drag");
  await hover(video());
  document.body.dataset.saveDragging = "1";
  await wait(600);
  expect(video().hasAttribute("src")).toBe(false);

  delete document.body.dataset.saveDragging;

  await expectSrc("pond://clip/drag.mp4");
});
