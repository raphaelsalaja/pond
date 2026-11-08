import {
  DownloadProbeInputSchema,
  type DownloadProbeResult,
  type DownloadSingleProbe,
  DownloadStartInputSchema,
} from "@shared/downloader-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const VIDEO: DownloadSingleProbe = {
  kind: "single",
  url: "https://www.youtube.com/watch?v=abc",
  source: "youtube",
  site: "YouTube",
  title: "A talk about ponds",
  author: "Channel",
  duration: 600,
  thumbnail: null,
  isLive: false,
  heatmap: [],
  chapters: [],
  storyboard: null,
  videoOptions: [
    { height: 2160, fps: 30, size: 400_000_000 },
    { height: 1080, fps: 30, size: 80_000_000 },
  ],
  audioSize: 9_000_000,
  captions: [{ lang: "en", name: "English", automatic: false }],
  preview: null,
  existingSaveId: null,
};

interface StubInput {
  url?: string;
  urls?: string[];
}

interface Call {
  name: string;
  input: StubInput;
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

async function renderDialog(
  probes: Record<string, DownloadProbeResult>,
  links: string[],
) {
  vi.resetModules();
  const calls: Call[] = [];
  vi.stubGlobal("pond", {
    async query(name: string, input: StubInput) {
      calls.push({ name, input });
      if (name === "downloader.clipboardLinks") return { urls: [] };
      if (name === "downloader.frames") return { frames: [] };
      if (name === "downloader.exportFolder")
        return { path: "/Users/me/Downloads", name: "Downloads" };
      if (name === "downloader.export")
        return {
          ok: true,
          destination: "file",
          path: "/Users/me/Downloads/A talk about ponds.webm",
        };
      if (name === "downloader.probe") {
        const { url } = DownloadProbeInputSchema.parse(input);
        return probes[url] ?? { ok: false, reason: "failed", message: "Nope." };
      }
      if (name === "downloader.start") {
        const { urls } = DownloadStartInputSchema.parse(input);
        return { ids: urls.map((_, index) => `save-${index}`), failed: [] };
      }
      throw new Error(`Unexpected query: ${name}`);
    },
  });
  const { DownloadDialogHost } = await import("./index");
  const { downloadDialog } = await import(
    "@/features/downloads/state/download-dialog"
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <DownloadDialogHost />
      </QueryClientProvider>,
    ),
  );
  await act(async () => downloadDialog.open(links));
  await flush();
  const button = (label: string) =>
    [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  return {
    calls,
    text: () => document.body.textContent ?? "",
    button,
    async click(label: string) {
      const target = button(label);
      if (!target) throw new Error(`No button labelled ${label}`);
      await act(async () => target.click());
      await flush();
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("previews one link and downloads it as audio to the library", async () => {
  const view = await renderDialog({ [VIDEO.url]: { ok: true, probe: VIDEO } }, [
    VIDEO.url,
  ]);
  try {
    expect(view.text()).toContain("A talk about ponds");
    await view.click("Download");
    expect(view.text()).toContain("Adds a save to your library.");
    await view.click("Audio");
    await view.click("Export");
    const start = view.calls.find((call) => call.name === "downloader.start");
    expect(start?.input).toEqual({
      urls: [VIDEO.url],
      request: {
        mode: "audio",
        maxHeight: 1080,
        audioFormat: "mp3",
        range: null,
        subtitleLang: "en",
        container: null,
        fps: null,
        compression: "original",
        transcriptFormat: "txt",
      },
    });
  } finally {
    await view.cleanup();
  }
});

it("exports a re-encoded file to the chosen folder", async () => {
  const view = await renderDialog({ [VIDEO.url]: { ok: true, probe: VIDEO } }, [
    VIDEO.url,
  ]);
  try {
    await view.click("Download");
    await view.click("WebM");
    await view.click("Small");
    await view.click("File");
    expect(view.text()).toContain("Saves to Downloads.");
    await view.click("Export");
    const exported = view.calls.find(
      (call) => call.name === "downloader.export",
    );
    expect(exported?.input).toEqual({
      url: VIDEO.url,
      destination: "file",
      request: expect.objectContaining({
        mode: "video",
        range: null,
        container: "webm",
        compression: "small",
      }),
    });
    expect(view.calls.some((call) => call.name === "downloader.start")).toBe(
      false,
    );
  } finally {
    await view.cleanup();
  }
});

it("lists several links and downloads the ones that resolved", async () => {
  const second = { ...VIDEO, url: "https://vimeo.com/1", title: "Second" };
  const view = await renderDialog(
    {
      [VIDEO.url]: { ok: true, probe: VIDEO },
      [second.url]: { ok: true, probe: second },
    },
    [VIDEO.url, second.url, "https://example.com/broken"],
  );
  try {
    expect(view.text()).toContain("3 Links");
    expect(view.text()).toContain("Second");
    expect(view.text()).toContain("Nope.");
    expect(view.text()).toContain("2 of 2 selected");
    await view.click("Download 2");
    const start = view.calls.find((call) => call.name === "downloader.start");
    expect(start?.input).toMatchObject({
      urls: [VIDEO.url, second.url],
      request: { mode: "video", maxHeight: 1080, range: null },
    });
  } finally {
    await view.cleanup();
  }
});

it("keeps the link page open with the reason a link can't be read", async () => {
  const view = await renderDialog(
    {
      "https://example.com/private": {
        ok: false,
        reason: "unavailable",
        message: "This link isn't available. It may be private or removed.",
      },
    },
    ["https://example.com/private"],
  );
  try {
    expect(view.text()).toContain("This link isn't available.");
    expect(view.button("Continue")).toBeDefined();
    expect(view.calls.some((call) => call.name === "downloader.start")).toBe(
      false,
    );
  } finally {
    await view.cleanup();
  }
});
