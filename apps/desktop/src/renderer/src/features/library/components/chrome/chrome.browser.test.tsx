import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  resetFilters,
  setSearchInput,
} from "@/features/library/state/view-store";
import { SearchComposer } from "@/features/search";
import { SearchChrome } from "@/shared/components/search-chrome";
import { bridge } from "@/shared/test/pond-bridge";

it("shows the source filter once", async () => {
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse({}),
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  setSearchInput(
    [{ field: "source", operator: "eq", value: "youtube.com" }],
    "",
    "source:youtube.com",
  );
  try {
    await act(async () =>
      root.render(
        <SearchChrome.Root actions={null} below={null}>
          <SearchComposer />
        </SearchChrome.Root>,
      ),
    );
    expect(host.textContent?.match(/source:youtube\.com/g)).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    resetFilters();
    host.remove();
  }
});
