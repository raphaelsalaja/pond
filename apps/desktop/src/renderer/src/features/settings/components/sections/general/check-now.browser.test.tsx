import { Dialog } from "@pond/ui";
import { isHTMLTag } from "@pond/ui/dom";
import type { QueryResult } from "@shared/query-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UpdateDialog } from "@/features/settings/components/update-dialog";
import { bridge } from "@/shared/test/pond-bridge";
import { CheckNowRow } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("opens the update dialog from Settings without waiting to leave the page", async () => {
  const check = Promise.withResolvers<QueryResult<"updates.checkNow">>();
  let checks = 0;
  let notice: QueryResult<"updates.currentNotice"> = null;
  bridge.use({
    appInfo: async () => ({
      name: "Pond",
      version: "1.0.0",
      platform: "darwin",
      arch: "arm64",
      username: "rafa",
      isPackaged: true,
    }),
    query: {
      "updates.checkNow": () => {
        checks += 1;
        return check.promise;
      },
      "updates.currentNotice": () => notice,
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
  if (!isHTMLTag(button, "button")) {
    throw new Error("Missing Check Now button");
  }
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
    check.resolve({ ok: true, version: "2.0.0" });
  });
  await vi.waitFor(() => {
    expect(document.body.textContent).toContain("Downloading Update");
    expect(document.body.textContent).toContain(
      "Keep working while Pond 2.0.0 downloads.",
    );
  });
  expect(host.textContent).not.toContain("Pond 2.0.0 is available.");
});
