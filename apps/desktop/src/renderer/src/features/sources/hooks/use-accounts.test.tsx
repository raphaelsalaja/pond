import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import type { QueryResult } from "@shared/query-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { refetchAccounts, useAccounts } from "./use-accounts";

let root: Root;
let host: HTMLDivElement;
let payload: QueryResult<"accounts.list">;

function View() {
  const { accounts } = useAccounts();
  return <output>{accounts.map((account) => account.id).join(",")}</output>;
}

function Reload() {
  const { refetch } = useAccounts();
  return (
    <button type="button" onClick={() => void refetch()}>
      Reload
    </button>
  );
}

beforeEach(() => {
  payload = { accounts: [] };
  bridge.use({ query: { "accounts.list": () => payload } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  payload = { accounts: [] };
  await refetchAccounts();
  await act(async () => root.unmount());
  host.remove();
});

it("updates every subscriber when one refetch finds a new account", async () => {
  await act(async () => {
    root.render(
      <>
        <View />
        <Reload />
      </>,
    );
  });
  await vi.waitFor(() => {
    expect(host.querySelector("output")?.textContent).toBe("");
  });
  payload = {
    accounts: [
      {
        id: "acc-twitter",
        source: "twitter",
        handle: "raph",
        identityKey: null,
        label: null,
        addedAt: "2026-01-01T00:00:00.000Z",
        sync: DEFAULT_SOURCE_SYNC_PREFS,
        connected: true,
        syncing: false,
      },
    ],
  };
  await act(async () => {
    host.querySelector("button")?.click();
  });
  await vi.waitFor(() => {
    expect(host.querySelector("output")?.textContent).toBe("acc-twitter");
  });
});
