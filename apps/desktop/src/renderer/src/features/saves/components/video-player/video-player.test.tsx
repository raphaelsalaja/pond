import { PrefsSchema } from "@pond/schema";
import type { Prefs } from "@pond/schema";
import { isHTMLElement } from "@pond/ui/dom";
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  ViewerChrome,
} from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { rememberCardThumbnail } from "@/features/saves/state/card-thumbnails";
import { savePrefsSection } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
import { VideoPlayer } from "./";

let savedPrefs = PrefsSchema.parse({});

async function seedViewer(patch: Partial<Prefs["viewer"]>): Promise<void> {
  await act(async () => savePrefsSection("viewer", patch));
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  savedPrefs = PrefsSchema.parse({});
  bridge.use({
    query: {
      "saves.mediaTiming": () => ({ frameRate: 24 }),
      "settings.getPrefs": () => structuredClone(savedPrefs),
      "settings.setPrefs": (patch) => {
        savedPrefs = PrefsSchema.parse({
          ...savedPrefs,
          ...patch,
          viewer: { ...savedPrefs.viewer, ...patch?.viewer },
        });
        return { ok: true, prefs: structuredClone(savedPrefs) };
      },
    },
  });
  await savePrefsSection("viewer", savedPrefs.viewer);
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
  const play = vi.spyOn(HTMLMediaElement.prototype, "play");
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const seek = host.querySelector('[aria-label="Seek"]');
  const thumb = seek?.querySelector("input");
  if (!seek || !thumb) throw new Error("Missing seek bar");

  thumb.focus();
  await act(async () => {
    seek.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
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
  if (!video || !isHTMLElement(control)) {
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
    ]) {
      Reflect.deleteProperty(document, name);
    }
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  }
});

it("leaves fullscreen to the host when the viewer chrome is disabled", async () => {
  await act(async () => {
    root.render(
      <ViewerChrome enabled={false}>
        <VideoPlayer src="pond://test/clip.mp4" active />
      </ViewerChrome>,
    );
  });
  expect(host.querySelector('[aria-label="Playback"]')).not.toBeNull();
  expect(host.querySelector('button[aria-label="Full screen"]')).toBeNull();
});

it("shows the video over the poster once the first frame loads", async () => {
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

it("keeps a cross-file poster out of the start and end surfaces even with a card thumbnail", async () => {
  const src = "pond://test/youtube-cross-file.mp4";
  const poster = "pond://test/youtube-platform-poster.jpg";
  rememberCardThumbnail(src, poster);
  await act(async () => {
    root.render(
      <ViewerChrome>
        <VideoPlayer src={src} poster={poster} posterIsCrossFile />
      </ViewerChrome>,
    );
  });

  expect(host.querySelector(`img[src="${poster}"]`)).toBeNull();

  const video = host.querySelector("video");
  if (!video) throw new Error("Missing video");
  Object.defineProperty(video, "ended", { configurable: true, value: true });
  await act(async () => video.dispatchEvent(new Event("ended")));

  expect(host.querySelector(`img[src="${poster}"]`)).toBeNull();
});

it("holds the poster until a video frame is presented", async () => {
  let present: (() => void) | undefined;
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

    await act(async () => present?.());

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

/** jsdom lays nothing out, so the viewer reports the size a real 800px square would. */
function squareViewer() {
  return { width: 800, height: 800 };
}

it("fits the video and its poster before first paint", async () => {
  await act(async () => {
    root.render(
      <TestVideoPlayer
        poster="pond://test/poster.jpg"
        width={1080}
        height={1920}
        measure={squareViewer}
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
  await seedViewer({ videoMuted: true });
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  expect(video?.muted).toBe(true);
  expect(video?.volume).toBe(1);
  expect(host.querySelector('button[aria-label="Unmute"]')).not.toBeNull();
});

function pressKey(key: string, target: EventTarget = document): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

it("changes video volume with the arrow keys", async () => {
  await act(async () => {
    root.render(<TestVideoPlayer />);
  });
  const video = host.querySelector("video");
  if (!video) throw new Error("Missing video");
  video.volume = 0.5;

  await act(async () => {
    pressKey("ArrowUp");
    pressKey("ArrowUp");
  });
  expect(video.volume).toBe(0.6);
  await act(async () => pressKey("ArrowDown"));
  expect(video.volume).toBe(0.55);
  expect(host.querySelector('button[aria-label="Mute"]')).not.toBeNull();

  video.volume = 1;
  await act(async () => pressKey("ArrowUp"));
  expect(video.volume).toBe(1);

  video.volume = 0.02;
  await act(async () => pressKey("ArrowDown"));
  expect(video.volume).toBe(0);
  await act(async () => video.dispatchEvent(new Event("volumechange")));
  expect(host.querySelector('button[aria-label="Unmute"]')).not.toBeNull();

  await act(async () => pressKey("ArrowUp"));
  expect(video.volume).toBe(0.05);
  await act(async () => video.dispatchEvent(new Event("volumechange")));
  expect(host.querySelector('button[aria-label="Mute"]')).not.toBeNull();

  video.volume = 0.4;
  video.muted = true;
  await act(async () => video.dispatchEvent(new Event("volumechange")));
  expect(savedPrefs.viewer.videoMuted).toBe(true);
  expect(host.querySelector('button[aria-label="Unmute"]')).not.toBeNull();

  await act(async () => pressKey("ArrowDown"));
  expect(video.muted).toBe(true);
  expect(video.volume).toBe(0.35);
  expect(savedPrefs.viewer.videoMuted).toBe(true);

  await act(async () => pressKey("ArrowUp"));
  expect(video.muted).toBe(false);
  expect(video.volume).toBe(0.4);
  await act(async () => video.dispatchEvent(new Event("volumechange")));
  expect(savedPrefs.viewer.videoMuted).toBe(false);
  expect(host.querySelector('button[aria-label="Mute"]')).not.toBeNull();

  Object.defineProperty(video, "duration", { configurable: true, value: 60 });
  video.currentTime = 20;
  await act(async () => pressKey("ArrowLeft"));
  expect(video.currentTime).toBe(10);
  await act(async () => pressKey("ArrowRight"));
  expect(video.currentTime).toBe(20);

  const held = video.volume;
  const field = document.createElement("textarea");
  const range = document.createElement("input");
  range.type = "range";
  const slider = document.createElement("div");
  slider.tabIndex = 0;
  slider.setAttribute("role", "slider");
  document.body.append(field, range, slider);
  const seek = host.querySelector('[aria-label="Seek"] input');
  const mute = host.querySelector('button[aria-label="Mute"]');
  try {
    for (const control of [field, range, slider, seek, mute]) {
      if (!isHTMLElement(control)) {
        throw new Error("Missing interactive control");
      }
      control.focus();
      await act(async () => pressKey("ArrowUp", control));
      expect(video.volume).toBe(held);
    }
  } finally {
    field.remove();
    range.remove();
    slider.remove();
  }
});

const playIndicator = () =>
  host.querySelector<HTMLElement>("[data-play-indicator]");

function currentVideo(): HTMLVideoElement {
  const element = host.querySelector("video");
  if (!element) {
    throw new Error("Missing video");
  }
  return element;
}

it("toggles playback by clicking the video and ignores toolbar clicks", async () => {
  let paused = true;
  function startPlayback(this: HTMLMediaElement) {
    paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  function stopPlayback(this: HTMLMediaElement) {
    paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  const previousPaused = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "paused",
  );
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get: () => paused,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: startPlayback,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: stopPlayback,
  });
  const play = vi.spyOn(HTMLMediaElement.prototype, "play");
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");

  try {
    await seedViewer({ autoplayVideo: false });
    await act(async () => {
      root.render(<TestVideoPlayer />);
    });
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(true);
    expect(
      currentVideo().parentElement?.contains(playIndicator() ?? null),
    ).toBe(true);
    expect(playIndicator()?.querySelector("svg")).not.toBeNull();

    play.mockClear();
    pause.mockClear();
    await act(async () => currentVideo().click());
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(false);

    play.mockClear();
    pause.mockClear();
    await act(async () => currentVideo().click());
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(true);

    play.mockClear();
    pause.mockClear();
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      );
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(false);

    play.mockClear();
    pause.mockClear();
    const playback = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Pause"]',
    );
    const seek = host.querySelector<HTMLElement>('[aria-label="Seek"]');
    const rotate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Rotate Video"]',
    );
    const mute = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Mute"]',
    );
    if (!playback || !seek || !rotate || !mute) {
      throw new Error("Missing playback controls");
    }
    await act(async () => playback.click());
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(true);

    play.mockClear();
    pause.mockClear();
    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.setAttribute("aria-label", "Overlay");
    currentVideo().parentElement?.append(overlay);
    await act(async () => {
      seek.click();
      rotate.click();
      mute.click();
      overlay.click();
    });
    overlay.remove();
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(playIndicator()?.hasAttribute("data-paused")).toBe(true);

    await act(async () => root.render(null));
    play.mockClear();
    pause.mockClear();
    await act(async () => {
      root.render(
        <ViewerChrome>
          <VideoPlayer src="pond://test/clip.mp4" />
        </ViewerChrome>,
      );
    });
    expect(host.querySelector("[data-play-indicator]")).toBeNull();
    play.mockClear();
    pause.mockClear();
    await act(async () => currentVideo().click());
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  } finally {
    if (previousPaused) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        "paused",
        previousPaused,
      );
    } else {
      Reflect.deleteProperty(HTMLMediaElement.prototype, "paused");
    }
  }
});
