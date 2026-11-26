import { expect, it } from "vitest";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { bridge } from "@/shared/test/pond-bridge";
import { buildDownloadMenuItems } from "./context-menu";

function row(
  status: DownloadRow["status"],
  error: string | null = null,
): DownloadRow {
  return {
    id: status,
    saveId: status,
    name: status,
    url: `https://example.com/${status}`,
    source: "web",
    status,
    stage: null,
    op: null,
    progress: null,
    attempts: 0,
    error,
    ts: 1,
    durationMs: null,
    live: true,
  };
}

function visible(rows: Array<DownloadRow>) {
  return buildDownloadMenuItems(rows).flatMap((item) =>
    "label" in item && !item.hidden ? [item] : [],
  );
}

function disabled(items: ReturnType<typeof visible>) {
  return items.map((item) =>
    "disabled" in item ? (item.disabled ?? false) : false,
  );
}

it("keeps download actions in the row context menu", () => {
  const failed = visible([row("failed", "Network error")]);
  expect(failed.map((item) => item.label)).toEqual([
    "Retry Download",
    "Cancel Download",
    "Skip Download",
    "Open Link",
    "Copy Link",
    "Copy Error",
    "Move to Trash",
    "Clear Selection",
  ]);
  expect(disabled(failed)).toEqual([
    false,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);

  const running = visible([row("running")]);
  expect(running.map((item) => item.label)).toEqual([
    "Retry Download",
    "Cancel Download",
    "Skip Download",
    "Open Link",
    "Copy Link",
    "Move to Trash",
    "Clear Selection",
  ]);
  expect(disabled(running)).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
});

function click(rows: Array<DownloadRow>, label: string) {
  const item = visible(rows).find((entry) => entry.label === label);
  if (item && "onClick" in item) item.onClick?.();
}

it("offers Copy Error whenever the download recorded an error", () => {
  bridge.use({ query: { "clipboard.writeText": () => ({ ok: true }) } });
  click(
    [{ ...row("retrying"), lastError: "TransientError: scrape timeout" }],
    "Copy Error",
  );
  expect(window.pond.query).toHaveBeenCalledWith("clipboard.writeText", {
    text: "Scrape timeout",
  });
});

it("opens the source link in the browser", () => {
  bridge.use({ openExternal: async () => ({ ok: true }) });
  click([row("dead")], "Open Link");
  expect(window.pond.openExternal).toHaveBeenCalledWith(
    "https://example.com/dead",
  );
  const local = { ...row("failed"), url: "pond:local/file" };
  expect(visible([local]).map((item) => item.label)).not.toContain("Open Link");
});

function actionStates(status: DownloadRow["status"]) {
  return Object.fromEntries(
    visible([row(status)]).map((item): [string, boolean] => [
      String(item.label),
      "disabled" in item ? (item.disabled ?? false) : false,
    ]),
  );
}

it("retries downloads that ran out of attempts but not canceled ones", () => {
  expect(actionStates("dead")).toMatchObject({
    "Retry Download": false,
    "Cancel Download": true,
  });
  expect(actionStates("cancelled")).toMatchObject({
    "Retry Download": true,
    "Cancel Download": true,
  });
  expect(actionStates("waiting")).toMatchObject({
    "Retry Download": true,
    "Cancel Download": false,
  });
});

it("offers Open Save only for a finished download", () => {
  expect(visible([row("complete")])[0]?.label).toBe("Open Save");
  expect(
    visible([row("complete"), row("failed")]).map((item) => item.label),
  ).not.toContain("Open Save");
});

it("copies every selected link and Pond links for finished downloads", () => {
  bridge.use({
    query: {
      "clipboard.writeText": () => ({ ok: true }),
      "saves.copyInternalLinks": () => ({ ok: true }),
    },
  });
  const rows = [row("complete"), row("failed")];
  const labels = visible(rows).map((item) => item.label);
  expect(labels).toContain("Copy Links");
  expect(labels).toContain("Copy Pond Link");

  click(rows, "Copy Links");
  expect(window.pond.query).toHaveBeenCalledWith("clipboard.writeText", {
    text: "https://example.com/complete\nhttps://example.com/failed",
  });
  click(rows, "Copy Pond Link");
  expect(window.pond.query).toHaveBeenCalledWith("saves.copyInternalLinks", {
    ids: ["complete"],
  });
  expect(visible([row("failed")]).map((item) => item.label)).not.toContain(
    "Copy Pond Link",
  );
});
