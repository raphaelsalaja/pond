import type { TransferJob } from "@shared/transfer-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TransferJobsPanel } from "./";

const failedId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const runningId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";

function job(status: TransferJob["status"], error: string | null): TransferJob {
  return {
    id: status === "running" ? runningId : failedId,
    request: {
      kind: "copy_library",
      origin: "/Users/user/Pond",
      destination: "/Users/user/Pond",
    },
    status,
    phase: "Verifying package",
    completed: 220,
    total: 220,
    bytes: 0,
    currentFile: null,
    error,
    startedAt: 1,
    updatedAt: 1,
  };
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const query = vi.fn();

beforeEach(() => {
  query.mockReset();
  Object.assign(window, { pond: { query } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderPanel() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TransferJobsPanel />
      </QueryClientProvider>,
    );
  });
  await settle();
}

function button(label: string) {
  return [...document.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
}

async function clickButton(label: string) {
  const node = button(label);
  if (!node) throw new Error(`Missing button ${label}`);
  await act(async () => node.click());
  await settle();
}

async function waitForText(text: string, present: boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const has = document.body.textContent?.includes(text) ?? false;
    if (has === present) return;
    await settle();
  }
  throw new Error(
    `Expected "${text}" to be ${present ? "shown" : "hidden"}. Body: ${document.body.textContent}`,
  );
}

it("dismisses a failed library transfer and hides the section", async () => {
  const failed = job("failed", "One of the selected Saves no longer exists.");
  let jobs = [failed];
  query.mockImplementation(async (name: string, input?: { id: string }) => {
    if (name === "transferJobs.list") return jobs;
    if (name === "transferJobs.dismiss") {
      expect(input).toEqual({ id: failed.id });
      jobs = [];
      return { ok: true };
    }
    throw new Error(`Unexpected query: ${name}`);
  });
  await renderPanel();
  await waitForText("One of the selected Saves no longer exists.", true);
  expect(button("Retry")).toBeTruthy();
  expect(button("Dismiss")).toBeTruthy();
  expect(button("Cancel")).toBeUndefined();
  await clickButton("Dismiss");
  await waitForText("Library Transfers", false);
  expect(query).toHaveBeenCalledWith("transferJobs.dismiss", { id: failed.id });
});

it("offers cancel instead of dismiss while a transfer is running", async () => {
  query.mockImplementation(async (name: string) => {
    if (name === "transferJobs.list") return [job("running", null)];
    throw new Error(`Unexpected query: ${name}`);
  });
  await renderPanel();
  await waitForText("In progress", true);
  expect(button("Cancel")).toBeTruthy();
  expect(button("Dismiss")).toBeUndefined();
  expect(button("Retry")).toBeUndefined();
});

it("keeps the failed transfer when dismiss is refused", async () => {
  const failed = job("failed", "One of the selected Saves no longer exists.");
  query.mockImplementation(async (name: string) => {
    if (name === "transferJobs.list") return [failed];
    if (name === "transferJobs.dismiss")
      return { ok: false, error: "This transfer is still running." };
    throw new Error(`Unexpected query: ${name}`);
  });
  await renderPanel();
  await waitForText("One of the selected Saves no longer exists.", true);
  await clickButton("Dismiss");
  await waitForText("This transfer is still running.", true);
  expect(document.body.textContent).toContain(
    "One of the selected Saves no longer exists.",
  );
  expect(button("Dismiss")).toBeTruthy();
});
