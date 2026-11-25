import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import { Dialog } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SourceDetail } from "@/features/sources/components/inspector";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { bridge } from "@/shared/test/pond-bridge";

let root: Root;
let host: HTMLDivElement;

const account: QueryResult<"accounts.list">["accounts"][number] = {
  id: "acc-tiktok",
  source: "tiktok",
  handle: null,
  identityKey: null,
  label: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  sync: DEFAULT_SOURCE_SYNC_PREFS,
  connected: true,
  syncing: false,
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sourceDetail.close();
  bridge.use({
    query: {
      "accounts.list": () => ({ accounts: [] }),
      "watches.list": () => ({ watches: [] }),
    },
  });
  await refetchAccounts();
});

it("disconnects from a confirm dialog on the connection page", async () => {
  const disconnected = Promise.withResolvers<{ accountId: string }>();
  bridge.use({
    query: {
      "accounts.list": () => ({ accounts: [account] }),
      "accounts.disconnect": (input) => {
        disconnected.resolve(input);
        return { ok: true };
      },
      "watches.list": () => ({ watches: [] }),
    },
  });
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
  await expect(disconnected.promise).resolves.toEqual({
    accountId: account.id,
  });
});
