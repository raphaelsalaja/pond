import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { importScopeFlow } from "@/features/sources/state/import-scope-flow";
import { ConnectWaitSection } from "./";

let root: Root;
let host: HTMLDivElement;

const twitterAccount = {
  id: "acc-twitter",
  source: "twitter",
  handle: "raph",
  label: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  sync: { lastSyncedAt: null, lastError: null, knownCount: 0 },
  connected: true,
  syncing: false,
};

function stubPond(
  onImported?: (
    cb: (payload: { source: string; accountId: string }) => void,
  ) => void,
  onImportFailed?: (
    cb: (payload: { source: string; reason: string }) => void,
  ) => void,
) {
  vi.stubGlobal("pond", {
    query: async () => ({ accounts: [twitterAccount] }),
    connectSource: async () => ({ ok: true, mode: "external" }),
    syncRunNow: async () => ({ ok: true }),
    clearPendingSession: async () => ({ ok: true }),
    onSessionImported: (
      cb: (payload: { source: string; accountId: string }) => void,
    ) => {
      onImported?.(cb);
      return () => {};
    },
    onSessionImportFailed: (
      cb: (payload: { source: string; reason: string }) => void,
    ) => {
      onImportFailed?.(cb);
      return () => {};
    },
  });
}

beforeEach(() => {
  stubPond();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  connectFlow.clear();
  importScopeFlow.clear();
  vi.stubGlobal("pond", {
    query: async () => ({ accounts: [] }),
    connectSource: async () => ({ ok: true, mode: "external" }),
    syncRunNow: async () => ({ ok: true }),
    clearPendingSession: async () => ({ ok: true }),
    onSessionImported: () => () => {},
    onSessionImportFailed: () => () => {},
  });
  await refetchAccounts();
  vi.unstubAllGlobals();
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
  let imported:
    | ((payload: { source: string; accountId: string }) => void)
    | undefined;
  stubPond((cb) => {
    imported = cb;
  });
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
  const sessionImported = imported;
  if (!sessionImported)
    throw new Error("session import listener was not attached");
  await act(async () => {
    sessionImported({ source: "twitter", accountId: "acc-twitter" });
  });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pond is syncing your saved posts now.");
  });
});

it("explains the local connection before the account arrives", async () => {
  stubPond();
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
  let importFailed:
    | ((payload: { source: string; reason: string }) => void)
    | undefined;
  let imported:
    | ((payload: { source: string; accountId: string }) => void)
    | undefined;
  stubPond(
    (cb) => {
      imported = cb;
    },
    (cb) => {
      importFailed = cb;
    },
  );
  connectFlow.start("twitter", ["acc-twitter"]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectWaitSection />
      </QueryClientProvider>,
    );
  });

  const notifyImportFailed = importFailed;
  const notifyImported = imported;
  if (!notifyImportFailed || !notifyImported)
    throw new Error("session import listeners were not attached");
  await act(async () => {
    notifyImportFailed({
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
    notifyImported({ source: "twitter", accountId: "acc-twitter" });
  });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pond is syncing your saved posts now.");
  });
});

it("asks what to import before a new account syncs", async () => {
  const syncRunNow = vi.fn(async () => ({ ok: true }));
  stubPond();
  vi.stubGlobal("pond", {
    ...window.pond,
    query: async () => ({
      accounts: [
        {
          ...twitterAccount,
          id: "acc-instagram",
          source: "instagram",
          sync: { ...twitterAccount.sync, importPending: true },
        },
      ],
    }),
    syncRunNow,
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
    expect(host.textContent).toContain(
      "Choose what Pond imports, then start the first sync.",
    );
  });
  expect(host.textContent).toContain("Saved Posts");
  expect(host.textContent).toContain("Liked Posts");
  expect(host.textContent).not.toContain("Pond is syncing");
  expect(syncRunNow).not.toHaveBeenCalled();
});

it("fails when Pond cannot open the sign-in page", async () => {
  stubPond();
  vi.stubGlobal("pond", {
    ...window.pond,
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
