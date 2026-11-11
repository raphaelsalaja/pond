import { Dialog } from "@pond/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UpdateDialog } from "@/features/settings/components/update-dialog";
import { CheckNowRow } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("opens the update dialog from Settings without waiting to leave the page", async () => {
  let finishCheck: (value: { ok: true; version: string }) => void = () => {};
  const pending = new Promise<{ ok: true; version: string }>((resolve) => {
    finishCheck = resolve;
  });
  let checks = 0;
  let notice: {
    phase: "available";
    version: string;
    downloading: boolean;
  } | null = null;
  vi.stubGlobal("pond", {
    appInfo: async () => ({
      name: "Pond",
      version: "1.0.0",
      platform: "darwin",
      arch: "arm64",
      username: "rafa",
      isPackaged: true,
    }),
    onUpdateNotice: () => () => {},
    query: (name: string) => {
      if (name === "updates.checkNow") {
        checks += 1;
        return pending;
      }
      if (name === "updates.currentNotice") return notice;
      throw new Error(name);
    },
  });

  await act(async () => {
    root.render(
      <Dialog.PortalProvider>
        <CheckNowRow />
        <UpdateDialog />
      </Dialog.PortalProvider>,
    );
  });

  const button = [...host.querySelectorAll("button")].find(
    (entry) => entry.textContent === "Check Now",
  );
  if (!(button instanceof HTMLButtonElement))
    throw new Error("Missing Check Now button");
  await act(async () => {
    button.click();
    button.click();
  });

  expect(checks).toBe(1);
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Checking for Updates"),
  );
  expect(host.textContent).not.toContain("is available");

  notice = { phase: "available", version: "2.0.0", downloading: true };
  await act(async () => {
    finishCheck({ ok: true, version: "2.0.0" });
  });
  await vi.waitFor(() => {
    expect(document.body.textContent).toContain("Update Available");
    expect(document.body.textContent).toContain("Pond 2.0.0 is downloading.");
  });
  expect(host.textContent).not.toContain("Pond 2.0.0 is available.");
});
