import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { normalise } from "@/features/saves";
import { resultNavigation, selection } from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import { HoverPreview } from "./";

it("hydrates and previews the next logical save beyond loaded grid rows", async () => {
  const first = normalise({
    id: "quick-first",
    source: "web",
    sourceId: "first",
    url: "https://fixture.test/one",
    title: "First reference",
    files: [],
  });
  if (!first) throw new Error("Invalid fixture");
  pool.upsert(first);
  const query = vi.fn(async (name: string) =>
    name === "settings.getPrefs"
      ? PrefsSchema.parse({})
      : [
          {
            id: "quick-next",
            source: "web",
            sourceId: "next",
            url: "https://fixture.test/two",
            title: "Next reference",
            files: [],
          },
        ],
  );
  vi.stubGlobal("pond", {
    query,
    onPreviewNeighborRequested: () => () => {},
  });
  selection.setAnchor("range-start");
  selection.setCursor(first.id);
  resultNavigation.setSource({
    ids: [first.id],
    allIds: async () => [first.id, "quick-next"],
  });
  const host = document.createElement("div");
  host.setAttribute("data-save-collection", "");
  host.tabIndex = 0;
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HoverPreview />));
    host.focus();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      ),
    );
    expect(document.body.textContent).toContain("First reference");
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-quick-preview] [aria-label='Close']"),
    ).not.toBeNull();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          bubbles: true,
        }),
      ),
    );
    expect(selection.getAnchor()).toBe("quick-next");
    expect(query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["quick-next"],
    });
    expect(document.body.textContent).toContain("Next reference");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    resultNavigation.setSource({ ids: [] });
    selection.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});
