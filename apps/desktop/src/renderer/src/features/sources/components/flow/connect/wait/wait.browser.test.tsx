import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import { Dialog } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { bridge } from "@/shared/test/pond-bridge";
import { ConnectActions, ConnectWaitSection } from "./";

let root: Root;
let host: HTMLDivElement;

type AccountRow = QueryResult<"accounts.list">["accounts"][number];

const twitterAccount: AccountRow = {
  id: "acc-twitter",
  source: "twitter",
  handle: "raph",
  identityKey: null,
  label: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  sync: DEFAULT_SOURCE_SYNC_PREFS,
  connected: true,
  syncing: false,
};

function registerPond(accounts: Array<AccountRow> = [twitterAccount]) {
  bridge.use({
    query: {
      "accounts.list": () => ({ accounts }),
      "sources.extensionLastSeen": () => ({ at: null }),
    },
    connectSource: async () => ({ ok: true, mode: "external" }),
    syncRunNow: async () => ({ ok: true }),
    clearPendingSession: async () => ({ ok: true }),
  });
}

beforeEach(() => {
  registerPond();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  connectFlow.clear();
  registerPond([]);
  await refetchAccounts();
});

it("marks the wait screen connected when a new account arrives", async () => {
  connectFlow.start("twitter", []);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pond is syncing your saved posts now.");
  });
});

it("marks the wait screen connected when an existing account is reimported", async () => {
  connectFlow.start("twitter", ["acc-twitter"]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(host.textContent).toContain("Sign in to Twitter in your browser.");
  expect(bridge.listening("onSessionImported")).toBe(true);
  await act(async () => {
    bridge.emit("onSessionImported", {
      source: "twitter",
      accountId: "acc-twitter",
    });
  });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pond is syncing your saved posts now.");
  });
});

it("explains the local connection before the account arrives", async () => {
  connectFlow.start("twitter", ["acc-twitter"]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(host.textContent).toContain("Connect Twitter to Pond");
  expect(host.textContent).toContain("Keep your session on this device");
  expect(host.textContent).toContain("Read your saved posts");
  expect(host.textContent).toContain(
    "Pond gets your session through its browser extension.",
  );
  expect(host.textContent).toContain("Get Extension");
  expect(host.textContent).toContain(
    "You're responsible for following Twitter's terms while Pond syncs your account.",
  );
  expect(host.textContent).not.toContain("Waiting for sign-in");
});

it("keeps waiting when a signed-out browser profile sends its session", async () => {
  connectFlow.start("twitter", ["acc-twitter"]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });

  expect(bridge.listening("onSessionImportFailed")).toBe(true);
  expect(bridge.listening("onSessionImported")).toBe(true);
  await act(async () => {
    bridge.emit("onSessionImportFailed", {
      source: "twitter",
      reason: "no_auth_cookies_in_payload",
    });
  });

  expect(host.textContent).toContain("Signed out of Twitter");
  expect(host.textContent).toContain(
    "Sign in there, or add the extension to the profile you use.",
  );
  expect(host.textContent).not.toContain("Couldn't connect");

  await act(async () => {
    bridge.emit("onSessionImported", {
      source: "twitter",
      accountId: "acc-twitter",
    });
  });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pond is syncing your saved posts now.");
  });
});

it("asks what to import before a new account syncs", async () => {
  registerPond([
    {
      ...twitterAccount,
      id: "acc-instagram",
      source: "instagram",
      sync: { ...twitterAccount.sync, importPending: true },
    },
  ]);
  connectFlow.start("instagram", []);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Dialog.Root open={false}>
          <ConnectWaitSection />
          <ConnectActions />
        </Dialog.Root>
      </QueryClientProvider>,
    );
  });

  await vi.waitFor(() => {
    expect(host.textContent).toContain("Next, choose what Pond imports.");
  });
  expect(host.textContent).not.toContain("Pond is syncing");
  expect(window.pond.syncRunNow).not.toHaveBeenCalled();

  const next = Array.from(host.querySelectorAll("button")).find(
    (element) => element.textContent === "Continue",
  );
  const open = vi.spyOn(sourceDetail, "openAccount");
  await act(async () => next?.click());
  expect(open).toHaveBeenCalledWith("acc-instagram");
  open.mockRestore();
});

it.each([
  ["never reaches Pond", null, true],
  ["reaches Pond during the wait", Number.MAX_SAFE_INTEGER, false],
])("says when the extension %s", async (_label, at, silent) => {
  vi.useFakeTimers();
  registerPond([]);
  bridge.use({
    query: { "sources.extensionLastSeen": () => ({ at }) },
  });
  connectFlow.start("instagram", []);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(21_000);
  });
  expect(
    host.textContent?.includes("Pond hasn't heard from its extension yet."),
  ).toBe(silent);
  vi.useRealTimers();
});

it("fails when Pond cannot open the sign-in page", async () => {
  bridge.use({
    connectSource: async () => ({ ok: false, mode: "external" }),
  });
  connectFlow.start("instagram", []);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });

  await vi.waitFor(() => {
    expect(host.textContent).toContain("Couldn't connect Instagram");
  });
  expect(host.textContent).toContain(
    "Pond couldn't open the sign-in page. Try again.",
  );
});

async function connectByHandle(
  reply:
    | { ok: true; accountId: string }
    | { ok: false; reason: "invalid" | "not_found" | "unavailable" },
) {
  registerPond([]);
  bridge.use({ connectSourceHandle: async () => reply });
  connectFlow.start("bluesky", []);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });
  const input = host.querySelector("input");
  if (!input) {
    throw new Error("handle field did not render");
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "alice.bsky.social");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    host.querySelector("form")?.requestSubmit();
  });
}

it("asks a handle Source for its handle instead of opening a browser", async () => {
  await connectByHandle({ ok: true, accountId: "acc-bluesky" });
  expect(host.textContent).toContain("Your Bluesky Handle");
  expect(host.textContent).toContain("Read your liked posts");
  expect(host.textContent).not.toContain("Get Extension");
  expect(window.pond.connectSource).not.toHaveBeenCalled();
  expect(window.pond.connectSourceHandle).toHaveBeenCalledWith(
    "bluesky",
    "alice.bsky.social",
  );
});

it("says when a handle does not resolve", async () => {
  await connectByHandle({ ok: false, reason: "not_found" });
  await vi.waitFor(() => {
    expect(host.textContent).toContain(
      "Pond couldn't find that handle. Check the spelling and try again.",
    );
  });
});
