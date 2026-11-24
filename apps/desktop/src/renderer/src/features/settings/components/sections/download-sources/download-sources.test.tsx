import type { QueryResult } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsSectionView } from "@/features/settings/components/engine";
import { sourceDownloadsSection } from "@/features/settings/lib/config-source-downloads";
import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_VIDEO_DOWNLOAD,
} from "@/features/settings/lib/section-types";
import { bridge } from "@/shared/test/pond-bridge";
import { DownloadSources, MissingVideos } from ".";

let host: HTMLDivElement;
let root: Root;

function stubPond(
  overrides: {
    videoDownloadSources?: QueryResult<"settings.get">["videoDownloadSources"];
    missing?: number;
  } = {},
) {
  bridge.use({
    query: {
      "saves.missingVideoCount": () => ({ count: overrides.missing ?? 0 }),
      "saves.downloadMissingVideos": () => ({
        ok: true,
        queued: overrides.missing ?? 0,
      }),
      "settings.get": () => ({
        id: "singleton",
        libraryRoot: null,
        updatedAt: new Date(0),
        videoDownload: { ...DEFAULT_VIDEO_DOWNLOAD, maxHeight: 720 },
        imageDownload: DEFAULT_IMAGE_DOWNLOAD,
        videoDownloadSources: overrides.videoDownloadSources ?? {},
        imageDownloadSources: {},
      }),
    },
  });
}

async function render(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  });
  await settle();
}

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) {
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 0);
        }),
    );
  }
}

function row(key: string) {
  return host.querySelector(`#setting-sources-youtube-${key}`);
}

function item(label: string) {
  return host.querySelector(`[aria-label="Edit ${label}"]`)?.parentElement
    ?.parentElement;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("shows global values on a source page and locks them while it follows global", async () => {
  stubPond();
  await render(
    <SettingsSectionView
      config={sourceDownloadsSection("youtube")}
      sectionId="sources-youtube"
    />,
  );

  expect(
    row("useGlobal")
      ?.querySelector("[role='switch']")
      ?.getAttribute("aria-checked"),
  ).toBe("true");
  expect(row("useGlobal")?.hasAttribute("data-disabled")).toBe(false);
  expect(row("autoDownload")?.hasAttribute("data-disabled")).toBe(true);
  expect(row("maxLongEdge")?.hasAttribute("data-disabled")).toBe(true);
  expect(row("maxHeight")?.hasAttribute("data-disabled")).toBe(true);
  expect(row("maxHeight")?.textContent).toContain("720p");
});

it("unlocks every row on a custom source, even with auto-download off", async () => {
  stubPond({ videoDownloadSources: { youtube: { maxHeight: 2160 } } });
  await render(
    <SettingsSectionView
      config={sourceDownloadsSection("youtube")}
      sectionId="sources-youtube"
    />,
  );

  expect(row("autoDownload")?.hasAttribute("data-disabled")).toBe(false);
  expect(row("maxLongEdge")?.hasAttribute("data-disabled")).toBe(false);
  expect(row("maxHeight")?.hasAttribute("data-disabled")).toBe(false);
  expect(row("maxHeight")?.textContent).toContain("2160p");
});

it("marks only sources with custom settings", async () => {
  stubPond({ videoDownloadSources: { youtube: {} } });
  await render(<DownloadSources />);

  expect(item("YouTube")?.textContent).toContain("Custom");
  expect(item("Reddit")?.textContent).not.toContain("Custom");
  expect(item("Reddit")?.textContent).not.toContain("Global");
});

it("downloads missing videos for one source", async () => {
  stubPond({ missing: 12 });
  await render(<MissingVideos source="youtube" />);

  expect(host.textContent).toContain("12 video saves don't have a video file.");
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Download",
  );
  await act(async () => button?.click());
  await settle();

  expect(window.pond.query).toHaveBeenCalledWith(
    "saves.downloadMissingVideos",
    { source: "youtube" },
  );
  const queued = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Queued",
  );
  expect(queued?.disabled).toBe(true);
});

it("disables the download when every video save has its file", async () => {
  stubPond({ missing: 0 });
  await render(<MissingVideos />);

  expect(host.textContent).toContain("All video saves have a video file.");
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Download",
  );
  expect(button?.disabled).toBe(true);
});
