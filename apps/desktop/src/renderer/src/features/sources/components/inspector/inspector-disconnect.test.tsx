import { Dialog } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SourceDetail } from "@/features/sources/components/inspector";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { sourceDetail } from "@/features/sources/state/source-detail";

let root: Root;
let host: HTMLDivElement;

const account = {
  id: "acc-tiktok",
  source: "tiktok",
  handle: null,
  label: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  sync: { lastSyncedAt: null, lastError: null, knownCount: 0 },
  connected: true,
  syncing: false,
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 240;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 280;
    },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      if (name === "accounts.list") {
        return { accounts: [account] };
      }
      if (name === "accounts.disconnect") {
        return { ok: true };
      }
      if (name === "watches.list") {
        return { watches: [] };
      }
      throw new Error(name);
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sourceDetail.close();
  vi.stubGlobal("pond", {
    query: async () => ({ accounts: [], watches: [] }),
  });
  await refetchAccounts();
  vi.unstubAllGlobals();
});

it("disconnects from a confirm dialog on the connection page", async () => {
  const query = vi.fn(async (name: string) => {
    if (name === "accounts.list") {
      return { accounts: [account] };
    }
    if (name === "accounts.disconnect") {
      return { ok: true };
    }
    if (name === "watches.list") {
      return { watches: [] };
    }
    throw new Error(name);
  });
  vi.stubGlobal("pond", { query });
  await act(async () => {
    root.render(
      <>
        <Dialog.Host />
        <SourceDetail kind="account" id={account.id} page="connection" />
      </>,
    );
  });
  await vi.waitFor(() => {
    expect(document.body.textContent).toContain("Disconnect TikTok");
  });
  const disconnect = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent === "Disconnect");
  if (!disconnect) {
    throw new Error("Missing Disconnect");
  }
  await act(async () => {
    disconnect.click();
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("stay in your library");
  });
  const confirm = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ).find((button) => button.textContent === "Disconnect");
  if (!confirm) {
    throw new Error("Missing confirm Disconnect");
  }
  await act(async () => {
    confirm.click();
  });
  await vi.waitFor(() => {
    expect(query).toHaveBeenCalledWith("accounts.disconnect", {
      accountId: account.id,
    });
  });
});
