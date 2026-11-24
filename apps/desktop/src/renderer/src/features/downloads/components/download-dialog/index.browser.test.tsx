import {
  DownloadProbeInputSchema,
  DownloadStartInputSchema,
} from "@shared/downloader-contracts";
import type {
  DownloadFileProbe,
  DownloadPostProbe,
  DownloadProbeResult,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { downloadDialog } from "@/features/downloads/state/download-dialog";
import { bridge } from "@/shared/test/pond-bridge";
import { DownloadDialogHost } from "./index";

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

const POST: DownloadPostProbe = {
  kind: "post",
  url: "https://x.com/pond/status/1",
  source: "twitter",
  site: "Twitter",
  title: "Two photos from the lake",
  author: "Pond",
  text: "Two photos from the lake",
  images: ["https://pbs.twimg.com/a.jpg", "https://pbs.twimg.com/b.jpg"],
  existingSaveId: null,
};

const FILE: DownloadFileProbe = {
  kind: "file",
  url: "https://example.com/pond-field-guide.pdf",
  site: "example.com",
  name: "pond-field-guide.pdf",
  mimeType: "application/pdf",
  size: 2_457_600,
  existingSaveId: null,
};

type Call = {
  name: string;
  input: object | undefined;
};

beforeEach(() => {
  // The dialog store lives for the whole file. Close it so the next open
  // starts a new session instead of reusing a dialog left open by the last case.
  downloadDialog.close();
});

afterEach(() => {
  downloadDialog.close();
  document.body.replaceChildren();
});

function buttonLabelled(label: string) {
  return [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {});
  }
}

async function renderDialog(
  probes: Record<string, DownloadProbeResult>,
  links: Array<string>,
) {
  const calls: Array<Call> = [];
  const record = (name: string, input?: object) => {
    calls.push({ name, input });
  };
  // `window.pond` is read when a query runs, so one module instance is enough.
  // Re-importing the dialog per test (`vi.resetModules()`) evaluates the Motion
  // and sources graph inside the 5s test budget. On a busy Windows runner that
  // exceeds the timeout, and the next test then clears the cache while the
  // first import is still evaluating, so the component and this store diverge.
  bridge.use({
    query: {
      "downloader.clipboardLinks": (input) => {
        record("downloader.clipboardLinks", input);
        return { urls: [] };
      },
      "downloader.frames": (input) => {
        record("downloader.frames", input);
        return { frames: [] };
      },
      "downloader.exportFolder": (input) => {
        record("downloader.exportFolder", input);
        return { path: "/Users/me/Downloads", name: "Downloads" };
      },
      "downloader.export": (input) => {
        record("downloader.export", input);
        return {
          ok: true,
          destination: "file",
          path: "/Users/me/Downloads/A talk about ponds.webm",
        };
      },
      "downloader.probe": (input) => {
        record("downloader.probe", input);
        const { url } = DownloadProbeInputSchema.parse(input);
        return probes[url] ?? { ok: false, reason: "failed", message: "Nope." };
      },
      "saves.quickAdd": (input) => {
        record("saves.quickAdd", input);
        return { ok: true, id: "save-post" };
      },
      "downloader.exportFiles": (input) => {
        record("downloader.exportFiles", input);
        return {
          ok: true,
          paths: input.files.map((_, index) => `/tmp/${index}.jpg`),
        };
      },
      "downloader.start": (input) => {
        record("downloader.start", input);
        const { urls } = DownloadStartInputSchema.parse(input);
        return { ids: urls.map((_, index) => `save-${index}`), failed: [] };
      },
    },
  });
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
  return {
    calls,
    text: () => document.body.textContent ?? "",
    button: buttonLabelled,
    async type(value: string) {
      const field = document.body.querySelector<HTMLInputElement>(
        'input[aria-label="Link"]',
      );
      if (!field) {
        throw new Error("No link field");
      }
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      await act(async () => {
        setValue?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 10);
          }),
      );
      await flush();
    },
    async click(label: string) {
      const target = buttonLabelled(label);
      if (!target) {
        throw new Error(`No button labelled ${label}`);
      }
      await act(async () => target.click());
      await flush();
    },
    async cleanup() {
      await act(async () => {
        downloadDialog.close();
        root.unmount();
      });
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
    expect(view.text()).toContain("Adds a save to your library.");
    await view.click("Audio");
    await view.click("Download");
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
    await view.click("WebM");
    await view.click("Small");
    await view.click("File");
    expect(view.text()).toContain("Saves to Downloads.");
    await view.click("Download");
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

it("reads a link as soon as it's entered and opens the editor", async () => {
  const view = await renderDialog(
    { [VIDEO.url]: { ok: true, probe: VIDEO } },
    [],
  );
  try {
    expect(view.text()).toContain("Paste a link to a video, post, page");
    expect(view.button("Download")).toBeUndefined();
    await view.type(VIDEO.url);
    expect(view.text()).toContain("A talk about ponds");
    expect(view.button("Download")?.disabled).toBe(false);
  } finally {
    await view.cleanup();
  }
});

it("shows the reason a link can't be read under the link field", async () => {
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
    expect(view.button("Download")).toBeUndefined();
    expect(view.calls.some((call) => call.name === "downloader.start")).toBe(
      false,
    );
  } finally {
    await view.cleanup();
  }
});

it("saves a post with no media through the importer", async () => {
  const view = await renderDialog({ [POST.url]: { ok: true, probe: POST } }, [
    POST.url,
  ]);
  try {
    expect(view.text()).toContain("Two photos from the lake");
    expect(view.text()).toContain("2 images and text");
    await view.click("Download");
    expect(view.calls.filter((call) => call.name === "saves.quickAdd")).toEqual(
      [{ name: "saves.quickAdd", input: { url: POST.url } }],
    );
    expect(view.calls.some((call) => call.name === "downloader.start")).toBe(
      false,
    );
  } finally {
    await view.cleanup();
  }
});

it("sends media to the downloader and posts to the importer from one list", async () => {
  const view = await renderDialog(
    {
      [VIDEO.url]: { ok: true, probe: VIDEO },
      [POST.url]: { ok: true, probe: POST },
    },
    [VIDEO.url, POST.url],
  );
  try {
    await view.click("Download 2");
    const start = view.calls.find((call) => call.name === "downloader.start");
    expect(start?.input).toMatchObject({ urls: [VIDEO.url] });
    expect(view.calls.filter((call) => call.name === "saves.quickAdd")).toEqual(
      [{ name: "saves.quickAdd", input: { url: POST.url } }],
    );
  } finally {
    await view.cleanup();
  }
});

it("copies a post's images to the clipboard", async () => {
  const view = await renderDialog({ [POST.url]: { ok: true, probe: POST } }, [
    POST.url,
  ]);
  try {
    await view.click("Clipboard");
    expect(view.text()).toContain("Copies the images, ready to paste.");
    await view.click("Download");
    expect(
      view.calls.find((call) => call.name === "downloader.exportFiles")?.input,
    ).toEqual({
      url: POST.url,
      title: POST.title,
      files: POST.images,
      destination: "clipboard",
    });
    expect(view.calls.some((call) => call.name === "saves.quickAdd")).toBe(
      false,
    );
  } finally {
    await view.cleanup();
  }
});

it("keeps a post with no images to the library", async () => {
  const textOnly = { ...POST, images: [] };
  const view = await renderDialog(
    { [POST.url]: { ok: true, probe: textOnly } },
    [POST.url],
  );
  try {
    expect(view.button("File")?.disabled).toBe(true);
    expect(view.button("Clipboard")?.disabled).toBe(true);
  } finally {
    await view.cleanup();
  }
});

it("downloads a linked file to the export folder", async () => {
  const view = await renderDialog({ [FILE.url]: { ok: true, probe: FILE } }, [
    FILE.url,
  ]);
  try {
    expect(view.text()).toContain("pond-field-guide.pdf");
    expect(view.text()).toContain("PDF, ");
    await view.click("File");
    expect(view.text()).toContain("Saves to Downloads.");
    await view.click("Download");
    expect(
      view.calls.find((call) => call.name === "downloader.exportFiles")?.input,
    ).toEqual({
      url: FILE.url,
      title: null,
      files: [FILE.url],
      destination: "file",
    });
  } finally {
    await view.cleanup();
  }
});
