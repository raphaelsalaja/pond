import { PrefsSchema } from "@pond/schema";
import { RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { createLibraryTestRouter } from "@/app/test/library-router";
import {
  resetFilters,
  setSearchInput,
} from "@/features/library/state/view-store";
import { SearchComposer } from "@/features/search";
import { SearchChrome } from "@/shared/components/search-chrome";
import { bridge } from "@/shared/test/pond-bridge";
import { LibrarySearchActions } from ".";

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

async function mountSearchActions(path: string) {
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "tags.list": () => [],
      "tagGroups.list": () => [],
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const router = createLibraryTestRouter(path, {
    component: () => <LibrarySearchActions />,
  });
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
  await act(async () => {});
  return {
    host,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function filterButton(host: HTMLElement) {
  return host.querySelector(
    'button[aria-label="Filter"], button[aria-label="Add Filter"]',
  );
}

function viewOptionsButton(host: HTMLElement) {
  return host.querySelector('button[aria-label="View Options"]');
}

it("hides normal grid actions in Inbox review", async () => {
  const view = await mountSearchActions("/inbox");
  try {
    expect(filterButton(view.host)).toBeNull();
    expect(viewOptionsButton(view.host)).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("hides normal grid actions in snoozed Inbox", async () => {
  const view = await mountSearchActions("/inbox/snoozed");
  try {
    expect(filterButton(view.host)).toBeNull();
    expect(viewOptionsButton(view.host)).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("keeps normal grid actions in the library grid", async () => {
  const view = await mountSearchActions("/");
  try {
    expect(filterButton(view.host)).not.toBeNull();
    expect(viewOptionsButton(view.host)).not.toBeNull();
  } finally {
    await view.unmount();
  }
});
