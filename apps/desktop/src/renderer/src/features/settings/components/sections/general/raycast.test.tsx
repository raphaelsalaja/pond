import { Tooltip } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { RaycastRow } from "./raycast";

it("copies the Local API Token without rendering it", async () => {
  const copied: Array<string> = [];
  bridge.use({
    query: {
      "settings.ingestToken": () => ({ token: "secret-token" }),
      "clipboard.writeText": ({ text }) => {
        copied.push(text);
        return { ok: true };
      },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Tooltip.Provider>
          <RaycastRow />
        </Tooltip.Provider>,
      ),
    );
    expect(host.textContent).not.toContain("secret-token");
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent === "Copy Token",
    );
    if (!button) throw new Error("Missing copy token button");
    await act(async () => button.click());
    expect(copied).toEqual(["secret-token"]);
    expect(button.textContent).toBe("Copied");
    expect(host.textContent).not.toContain("secret-token");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
