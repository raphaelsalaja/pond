import { type Prefs, PrefsSchema } from "@pond/schema";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  ViewerChrome,
} from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { loadPrefs } from "@/shared/state/prefs";
import { VideoPlayer } from "./";

const prefsListeners = new Set<(prefs: Prefs) => void>();
let savedPrefs = PrefsSchema.parse({});

function emitPrefs(next: Prefs): void {
  savedPrefs = next;
  const snapshot = structuredClone(savedPrefs);
  for (const listener of prefsListeners) listener(snapshot);
}

function seedViewer(patch: Partial<Prefs["viewer"]>): void {
  emitPrefs(
    PrefsSchema.parse({
      ...savedPrefs,
      viewer: { ...savedPrefs.viewer, ...patch },
    }),
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  savedPrefs = PrefsSchema.parse({});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    onPrefsChanged(listener: (prefs: Prefs) => void) {
      prefsListeners.add(listener);
      return () => prefsListeners.delete(listener);
    },
    query: async (name: string, params?: Partial<Prefs>) => {
      if (name === "saves.mediaTiming") return { frameRate: 24 };
      if (name === "settings.getPrefs") return structuredClone(savedPrefs);
      if (name === "settings.setPrefs") {
        savedPrefs = PrefsSchema.parse({
          ...savedPrefs,
          ...params,
          viewer: { ...savedPrefs.viewer, ...params?.viewer },
        });
        return { ok: true, prefs: structuredClone(savedPrefs) };
      }
      return structuredClone(savedPrefs);
    },
    tx: async () => ({ ok: true }),
  });
  if (prefsListeners.size === 0) await loadPrefs();
  else emitPrefs(savedPrefs);
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: () => {},
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function TestVideoPlayer(props: Partial<ComponentProps<typeof VideoPlayer>>) {
  return (
    <ViewerChrome>
      <VideoPlayer
        {...props}
        src="pond://test/clip.mp4"
        active
        renderToolbar={({ actions, edits }) => (
          <ChromePortal slot="top">
            <ViewerHud.Bar
              label="Video"
              end={<ViewerToolbarGroups actions={actions} edits={edits} />}
            />
          </ChromePortal>
        )}
      />
    </ViewerChrome>
  );
}

it("composes one top video toolbar and one bottom playback toolbar", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const rotate = [...host.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Rotate Video",
  );
  const loop = [...host.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Loop",
  );
  const actionToolbar = host.querySelector(
    '[role="toolbar"][aria-label="Video"]',
  );
  const playbackToolbar = host.querySelector(
    '[role="toolbar"][aria-label="Playback"]',
  );
  expect(
    host.querySelectorAll('[data-slot="top"] [role="toolbar"]'),
  ).toHaveLength(1);
  expect(
    host.querySelectorAll('[data-slot="top"] [role="separator"]'),
  ).toHaveLength(0);
  expect(actionToolbar?.children).toHaveLength(3);
  expect(rotate).toBeTruthy();
  expect(rotate?.closest("[data-slot]")?.getAttribute("data-slot")).toBe("top");
  expect(loop).toBeTruthy();
  expect(loop?.closest("[data-slot]")?.getAttribute("data-slot")).toBe(
    "bottom",
  );
  expect(playbackToolbar?.hasAttribute("data-chrome")).toBe(true);
  expect(host.querySelector('[aria-label="Loop Start in Seconds"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Fill"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Fit"]')).toBeNull();
  const mute = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Mute"]',
  );
  const volume = host.querySelector('[aria-label="Video Volume"]');
  expect(volume).toBeNull();
  expect(host.querySelector("[data-video-volume-popover]")).toBeNull();
  expect(mute?.parentElement?.parentElement).toBe(
    playbackToolbar?.firstElementChild,
  );
  const elapsedTime = host.querySelector('[aria-label="Elapsed time"]');
  const seek = host.querySelector('[aria-label="Seek"]');
  const duration = host.querySelector('[aria-label="Duration"]');
  if (!elapsedTime || !seek || !duration) {
    throw new Error("Missing video transport timing controls");
  }
  expect(elapsedTime.compareDocumentPosition(seek)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(seek.compareDocumentPosition(duration)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const video = host.querySelector("video");
  expect(video).toBeTruthy();
  await act(async () => mute?.click());
  expect(video?.muted).toBe(true);
  await act(async () => video?.dispatchEvent(new Event("volumechange")));
  expect(host.querySelector('button[aria-label="Unmute"]')).toBe(mute);
  expect(host.querySelector('button[aria-label="Back"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Forward"]')).toBeNull();
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: 60,
  });
  if (video) video.currentTime = 20;
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
  });
  expect(video?.currentTime).toBe(10);
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(video?.currentTime).toBe(20);
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        shiftKey: true,
        bubbles: true,
      }),
    );
  });
  expect(video?.currentTime).toBe(20);
  expect(host.querySelector('button[aria-label="Previous Frame"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Next Frame"]')).toBeNull();
  expect(host.querySelector("[data-anchor]")).toBeNull();
});

it("keeps Space toggling playback after the seek bar is clicked", async () => {
  const play = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: play,
  });
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const seek = host.querySelector('[aria-label="Seek"]');
  const thumb = seek?.querySelector("input");
  if (!seek || !thumb) throw new Error("Missing seek bar");

  thumb.focus();
  await act(async () => {
    seek.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(seek.contains(document.activeElement)).toBe(false);

  play.mockClear();
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
  });
  expect(play).toHaveBeenCalledTimes(1);
});

it("seeks to the pressed point on the seek track", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  const control = host.querySelector('[aria-label="Seek"]')?.firstElementChild;
  if (!video || !(control instanceof HTMLElement)) {
    throw new Error("Missing seek track");
  }
  Object.defineProperty(video, "duration", { configurable: true, value: 60 });
  await act(async () => video.dispatchEvent(new Event("durationchange")));
  control.getBoundingClientRect = () => new DOMRect(0, 0, 200, 24);
  control.setPointerCapture = () => {};
  control.hasPointerCapture = () => false;

  await act(async () => {
    control.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 12,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 100,
        clientY: 12,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
  });

  expect(video.currentTime).toBe(30);
});

it("keeps one scrub preview open across the timeline and closes it on leave", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  const seek = host.querySelector<HTMLElement>('[aria-label="Seek"]');
  if (!video || !seek) throw new Error("Missing seek bar");
  Object.defineProperty(video, "duration", { configurable: true, value: 60 });
  await act(async () => video.dispatchEvent(new Event("durationchange")));
  seek.getBoundingClientRect = () => new DOMRect(0, 0, 200, 24);
  const move = (clientX: number) =>
    act(async () => {
      seek.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX }),
      );
    });
  const preview = () =>
    seek.querySelector("video")?.parentElement?.parentElement;

  await move(50);
  const opened = preview();
  expect(opened?.hasAttribute("data-open")).toBe(true);
  expect(opened?.textContent).toContain("0:15");

  await move(150);
  expect(preview()).toBe(opened);
  expect(opened?.textContent).toContain("0:45");

  await act(async () => {
    seek.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
  });
  expect(preview()).toBe(opened);
  expect(opened?.hasAttribute("data-open")).toBe(false);

  await move(100);
  expect(preview()).toBe(opened);
  expect(opened?.hasAttribute("data-open")).toBe(true);
});

it("always fits video inside the viewer", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  expect(video).not.toBeNull();
  Object.defineProperties(video, {
    duration: { configurable: true, value: 60 },
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 },
  });
  await act(async () => {
    video?.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(video?.style.width).toBe("");
  expect(video?.style.height).toBe("");
  expect(video?.style.objectFit).toBe("contain");
  expect(host.querySelector('button[aria-label="Fill"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Fit"]')).toBeNull();
});

it("toggles whole-video looping from the playback toolbar", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  const loop = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Loop"]',
  );
  expect(video?.loop).toBe(false);
  expect(loop?.getAttribute("aria-pressed")).toBeNull();

  await act(async () => loop?.click());

  expect(video?.loop).toBe(true);
  expect(loop?.getAttribute("aria-pressed")).toBe("true");
});

it("lets the playback toolbar turn off automatic short-video looping", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  const loop = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Loop"]',
  );
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: 10,
  });
  await act(async () => {
    video?.dispatchEvent(new Event("durationchange"));
  });
  expect(video?.loop).toBe(true);
  expect(loop?.getAttribute("aria-pressed")).toBe("true");

  await act(async () => loop?.click());

  expect(video?.loop).toBe(false);
  expect(loop?.getAttribute("aria-pressed")).toBeNull();
});

it("puts the whole viewer, playback toolbar included, in full screen", async () => {
  let fullscreenElement: Element | null = null;
  const changeFullscreen = (element: Element | null) => {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  };
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: {
      configurable: true,
      value: () => changeFullscreen(null),
    },
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value(this: HTMLElement) {
      return changeFullscreen(this);
    },
  });
  try {
    await act(async () => {
      root.render(<TestVideoPlayer />);
    });
    const enter = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Full screen"]',
    );
    expect(enter).not.toBeNull();

    await act(async () => enter?.click());

    const viewer = host.querySelector("[data-viewer-root]");
    expect(fullscreenElement).toBe(viewer);
    expect(
      viewer?.contains(host.querySelector('[aria-label="Playback"]')),
    ).toBe(true);
    const exit = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Exit full screen"]',
    );
    expect(exit).toBe(enter);

    await act(async () => exit?.click());

    expect(fullscreenElement).toBeNull();
    expect(
      host.querySelector('button[aria-label="Full screen"]'),
    ).not.toBeNull();
  } finally {
    for (const name of [
      "fullscreenEnabled",
      "fullscreenElement",
      "exitFullscreen",
    ])
      Reflect.deleteProperty(document, name);
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  }
});

it("fades the video in over the poster once the first frame loads", async () => {
  await act(async () => {
    root.render(
      <ViewerChrome>
        <VideoPlayer
          src="pond://test/clip.mp4"
          poster="pond://test/poster.jpg"
        />
      </ViewerChrome>,
    );
  });
  const poster = () => host.querySelector('img[src="pond://test/poster.jpg"]');
  expect(poster()?.hasAttribute("data-covered")).toBe(false);
  expect(host.querySelector("video")?.hasAttribute("data-pending")).toBe(true);

  await act(async () => {
    host.querySelector("video")?.dispatchEvent(new Event("loadeddata"));
  });

  expect(poster()?.hasAttribute("data-covered")).toBe(true);
  expect(host.querySelector("video")?.hasAttribute("data-pending")).toBe(false);
});

it("holds the poster until a video frame is presented", async () => {
  let present = () => {};
  Object.defineProperties(HTMLVideoElement.prototype, {
    requestVideoFrameCallback: {
      configurable: true,
      value: (callback: VideoFrameRequestCallback) => {
        present = () =>
          callback(0, {
            expectedDisplayTime: 0,
            height: 1080,
            mediaTime: 0,
            presentationTime: 0,
            presentedFrames: 1,
            width: 1920,
          });
        return 1;
      },
    },
    cancelVideoFrameCallback: { configurable: true, value: () => {} },
  });
  try {
    await act(async () => {
      root.render(<TestVideoPlayer poster="pond://test/poster.jpg" />);
    });
    const poster = () =>
      host.querySelector('img[src="pond://test/poster.jpg"]');
    await act(async () => {
      host.querySelector("video")?.dispatchEvent(new Event("loadeddata"));
    });
    expect(poster()?.hasAttribute("data-covered")).toBe(false);

    await act(async () => present());

    expect(poster()?.hasAttribute("data-covered")).toBe(true);
  } finally {
    await act(async () => root.render(null));
    Reflect.deleteProperty(
      HTMLVideoElement.prototype,
      "requestVideoFrameCallback",
    );
    Reflect.deleteProperty(
      HTMLVideoElement.prototype,
      "cancelVideoFrameCallback",
    );
  }
});

it("fits the video and its poster before first paint", async () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
  await act(async () => {
    root.render(
      <TestVideoPlayer
        poster="pond://test/poster.jpg"
        width={1080}
        height={1920}
      />,
    );
  });
  const frame = host.querySelector("video")?.parentElement;
  expect(frame?.style).toMatchObject({
    left: "175px",
    top: "0px",
    width: "450px",
    height: "800px",
  });
  expect(
    frame?.querySelector('img[src="pond://test/poster.jpg"]'),
  ).not.toBeNull();
});

it("carries mute to the next preview and keeps volume", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const first = host.querySelector("video");
  const mute = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Mute"]',
  );
  if (!first || !mute) throw new Error("Missing video mute control");
  first.volume = 0.4;

  await act(async () => mute.click());
  expect(first.muted).toBe(true);
  expect(first.volume).toBe(0.4);
  await act(async () => first.dispatchEvent(new Event("volumechange")));

  expect(savedPrefs.viewer.videoMuted).toBe(true);
  expect(first.volume).toBe(0.4);
  await act(async () => root.render(null));
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });

  const second = host.querySelector("video");
  if (!second) throw new Error("Missing reopened video");
  expect(second).not.toBe(first);
  expect(second.muted).toBe(true);
  expect(second.volume).toBe(1);
  expect(host.querySelector('button[aria-label="Unmute"]')).not.toBeNull();

  const unmute = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Unmute"]',
  );
  await act(async () => unmute?.click());
  expect(second.muted).toBe(false);
  expect(second.volume).toBe(1);
  await act(async () => second.dispatchEvent(new Event("volumechange")));
  expect(savedPrefs.viewer.videoMuted).toBe(false);
});

it("opens a preview muted when the preference was saved", async () => {
  seedViewer({ videoMuted: true });
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  expect(video?.muted).toBe(true);
  expect(video?.volume).toBe(1);
  expect(host.querySelector('button[aria-label="Unmute"]')).not.toBeNull();
});
