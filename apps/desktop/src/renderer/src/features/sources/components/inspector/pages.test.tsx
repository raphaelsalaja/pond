import { isHTMLElement } from "@pond/ui/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { SourceActivity } from "./activity";
import { SourceSchedule } from "./schedule";

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
});

async function render(node: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  });
}

it("pauses scheduled fetches for one source", async () => {
  bridge.use({ query: { "sources.setSchedule": () => ({ ok: true }) } });
  const onChanged = vi.fn();
  await render(
    <SourceSchedule
      target={{ kind: "account", id: "acc-1" }}
      sync={{ intervalHours: 6 }}
      onChanged={onChanged}
      actions={null}
    />,
  );
  const toggle = host.querySelector('[aria-label="Automatic Fetching"]');
  if (!isHTMLElement(toggle)) {
    throw new Error("Missing switch");
  }
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(host.textContent).toContain("Every 6 Hours");
  await act(async () => toggle.click());
  expect(window.pond.query).toHaveBeenCalledWith("sources.setSchedule", {
    kind: "account",
    id: "acc-1",
    paused: true,
    intervalHours: 6,
  });
  expect(onChanged).toHaveBeenCalledOnce();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
});

it("lists each fetch with what it found", async () => {
  bridge.use({
    query: {
      "sync.history": () => ({
        runs: [
          {
            id: 2,
            ts: Date.now() - 60_000,
            source: "twitter",
            accountId: "acc-1",
            trigger: "cron",
            outcome: "ok",
            durationMs: 4000,
            harvest: { seen: 40, fresh: 12, recovery: 0 },
            enqueue: { succeeded: 12, failed: 0 },
            error: null,
            watchdogTripped: false,
          },
          {
            id: 1,
            ts: Date.now() - 3_600_000,
            source: "twitter",
            accountId: "acc-1",
            trigger: "manual",
            outcome: "error",
            durationMs: 900,
            harvest: null,
            enqueue: null,
            error: { name: "Error", message: "Session expired" },
            watchdogTripped: false,
          },
        ],
      }),
    },
  });
  await render(<SourceActivity id="acc-1" source="twitter" />);
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain("12 new saves"));
  });
  const titles = Array.from(host.querySelectorAll("h3")).map(
    (title) => title.textContent,
  );
  expect(titles).toEqual(["Scheduled Fetch", "Fetch"]);
  expect(host.textContent).toContain("Session expired");
  expect(host.textContent).toContain("Failed");
  expect(host.querySelector('[aria-label="Copy Fetch Error"]')).toBeTruthy();
});

it("says when a source has never fetched", async () => {
  bridge.use({ query: { "sync.history": () => ({ runs: [] }) } });
  await render(<SourceActivity id="acc-1" source="twitter" />);
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain("No Fetches Yet"),
    );
  });
});
