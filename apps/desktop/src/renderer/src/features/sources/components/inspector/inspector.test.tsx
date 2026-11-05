import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SourceDetailsPage } from "@/features/sources/state/source-detail";
import {
  SourceDetail,
  SourceDetailNavView,
  SourceDetailSidebar,
  type SourceDetailsProps,
  SourceDetailView,
  sourceDetailModel,
} from "./index";

interface TestRoot {
  render(node: ReactNode): void;
  unmount(): void;
}

let host: HTMLDivElement;
let root: TestRoot;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 240;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 280;
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  const base = createRoot(host);
  root = {
    render: (node) => base.render(node),
    unmount: () => base.unmount(),
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function DetailHarness(props: SourceDetailsProps) {
  const [page, setPage] = useState<SourceDetailsPage | undefined>();
  const model = sourceDetailModel(props);
  return (
    <>
      <SourceDetailNavView model={model} page={page} onSelect={setPage} />
      <SourceDetailView model={model} page={page} />
    </>
  );
}

function actionButton(name: string) {
  return host.querySelector(`button[aria-label="${name}"]`);
}

it.each([
  ["loading", "Loading source details"],
  ["missing", "This source is unavailable."],
] as const)("shows the %s state without details", async (status, copy) => {
  await act(async () => {
    root.render(<SourceDetailView model={{ status }} />);
  });
  expect(host.querySelector('[role="status"]')?.textContent).toBe(copy);
  expect(nicknameField()).toBeNull();
});

function nicknameField() {
  return host.querySelector('input[aria-label="Nickname"]');
}

it("centers the handle and suggests it as the nickname", async () => {
  await act(async () => {
    root.render(
      <DetailHarness
        handle="@oluwa.rafa"
        description="Last fetched 1 day ago"
        source="instagram"
        nickname=""
        onNicknameSave={async () => {}}
      />,
    );
  });
  const field = nicknameField();
  if (!(field instanceof HTMLInputElement))
    throw new Error("Missing nickname field");
  expect(field.value).toBe("");
  expect(field.placeholder).toBe("@oluwa.rafa");
  expect(host.querySelector("h3")?.textContent).toBe("Profile Picture");
  expect(host.textContent).toContain("Last fetched 1 day ago");
  const done = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Done",
  );
  expect(done).toBeUndefined();
});

it("switches pages from the sidebar", async () => {
  await act(async () => {
    root.render(
      <DetailHarness
        handle="@raphaelsalaja"
        source="twitter"
        pages={[
          {
            id: "filters",
            label: "Filters",
            icon: null,
            description: "Nothing else from X reaches your library.",
            content: <p>Import choices</p>,
          },
        ]}
        initialPage="filters"
        onNicknameSave={async () => {}}
      />,
    );
  });
  const nav = host.querySelector('[aria-label="Source"]');
  const pages = Array.from(nav?.querySelectorAll("button") ?? []);
  expect(pages.map((page) => page.textContent)).toEqual(["General", "Filters"]);
  expect(host.querySelector("h1")?.textContent).toBe("Filters");
  expect(host.textContent).toContain("Import choices");
  expect(nicknameField()).toBeNull();

  await act(async () => pages[0]?.click());
  expect(host.querySelector("h1")?.textContent).toBe("General");
  expect(nicknameField()).toBeInstanceOf(HTMLInputElement);
  expect(host.textContent).not.toContain("Import choices");
  expect(pages[0]?.getAttribute("aria-current")).toBe("page");
});

it("lays out source actions as rows on General", async () => {
  const onCopy = vi.fn();
  const onDisconnect = vi.fn();
  await act(async () => {
    root.render(
      <DetailHarness
        handle="@raphael-salaja"
        source="arena"
        nickname="Are.na"
        actions={{
          kind: "Profile",
          profile: [
            {
              id: "identity",
              title: "Username",
              value: "raphael-salaja",
              actions: [
                { label: "Copy", name: "Copy Username", onClick: onCopy },
              ],
            },
          ],
          fetch: [],
          connection: [
            {
              id: "remove",
              title: "Disconnect Are.na",
              actions: [
                {
                  label: "Disconnect",
                  variant: "destructive",
                  onClick: onDisconnect,
                },
              ],
            },
          ],
        }}
        onNicknameSave={async () => {}}
      />,
    );
  });
  const field = nicknameField();
  if (!(field instanceof HTMLInputElement))
    throw new Error("Missing nickname field");
  expect(field.value).toBe("Are.na");
  const titles = Array.from(host.querySelectorAll("h3")).map(
    (title) => title.textContent,
  );
  expect(titles).toEqual([
    "Profile Picture",
    "Nickname",
    "Username",
    "Image and Video Downloads",
  ]);
  expect(host.textContent).toContain("Profile");
  const copy = actionButton("Copy Username");
  if (!(copy instanceof HTMLElement)) throw new Error("Missing Copy Username");
  await act(async () => copy.click());
  expect(onCopy).toHaveBeenCalledOnce();

  const connection = Array.from(
    host.querySelectorAll('[aria-label="Source"] button'),
  ).find((button) => button.textContent === "Connection");
  if (!(connection instanceof HTMLElement)) throw new Error("Missing page");
  await act(async () => connection.click());
  expect(host.querySelector("h1")?.textContent).toBe("Connection");
  const disconnect = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Disconnect",
  );
  await act(async () => disconnect?.click());
  expect(onDisconnect).toHaveBeenCalledOnce();
});

it("groups the sidebar and keeps Connection last", async () => {
  const page = (
    id: SourceDetailsPage,
    label: string,
    group?: "import" | "fetching",
  ) => ({ id, label, icon: null, group, content: <p>{label}</p> });
  await act(async () => {
    root.render(
      <DetailHarness
        source="twitter"
        overview={page("overview", "Overview")}
        pages={[
          page("filters", "Filters", "import"),
          page("organize", "Organize", "import"),
          page("schedule", "Schedule", "fetching"),
          page("activity", "Activity", "fetching"),
        ]}
        actions={{
          kind: "Profile",
          profile: [],
          fetch: [],
          connection: [{ id: "remove", title: "Disconnect X", actions: [] }],
        }}
      />,
    );
  });
  const nav = host.querySelector('[aria-label="Source"]');
  expect(
    Array.from(nav?.querySelectorAll("button") ?? []).map(
      (button) => button.textContent,
    ),
  ).toEqual([
    "Overview",
    "General",
    "Filters",
    "Organize",
    "Schedule",
    "Activity",
    "Connection",
  ]);
  expect(nav?.textContent).toContain("Import");
  expect(nav?.textContent).toContain("Fetching");
});

it("searches pages by the rows on them", async () => {
  await act(async () => {
    root.render(
      <DetailHarness
        source="twitter"
        onNicknameSave={async () => {}}
        pages={[
          {
            id: "schedule",
            label: "Schedule",
            icon: null,
            group: "fetching",
            items: ["Automatic Fetching", "Fetch Interval"],
            content: <p>Schedule rows</p>,
          },
        ]}
      />,
    );
  });
  const search = host.querySelector(
    'input[aria-label="Search source settings"]',
  );
  if (!(search instanceof HTMLInputElement)) throw new Error("Missing search");
  const type = async (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const nav = () =>
    Array.from(
      host.querySelectorAll('[aria-label="Source"] button'),
      (button) => button.textContent,
    );

  await type("interval");
  expect(nav()).toEqual(["Schedule", "Fetch Interval"]);
  const result = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Fetch Interval",
  );
  await act(async () => result?.click());
  expect(host.querySelector("h1")?.textContent).toBe("Schedule");

  await type("zzzz");
  expect(host.textContent).toContain("No settings match.");
});

it("dims a disabled action row without hiding it", async () => {
  const onFetch = vi.fn();
  await act(async () => {
    root.render(
      <DetailHarness
        source="twitter"
        actions={{
          kind: "Profile",
          profile: [
            {
              id: "older",
              title: "Fetch Older Saves",
              disabled: true,
              actions: [
                { label: "Fetch", name: "Fetch Older Saves", onClick: onFetch },
              ],
            },
          ],
          fetch: [],
          connection: [],
        }}
      />,
    );
  });
  const fetch = actionButton("Fetch Older Saves");
  if (!(fetch instanceof HTMLButtonElement))
    throw new Error("Missing Fetch Older Saves");
  expect(fetch.disabled).toBe(true);
  expect(fetch.closest("[data-disabled]")).toBeTruthy();
});

it("keeps a failed nickname edit available and retries it on the next blur", async () => {
  const save = vi
    .fn<(value: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce();
  await act(async () => {
    root.render(
      <DetailHarness source="arena" nickname="Alex" onNicknameSave={save} />,
    );
  });
  const field = nicknameField();
  if (!(field instanceof HTMLInputElement))
    throw new Error("Missing nickname field");
  await act(async () => {
    field.focus();
    field.blur();
  });
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    field.focus();
    field.value = "Marques Brownlee";
    field.blur();
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Couldn't save",
  );
  expect(field.value).toBe("Marques Brownlee");
  expect(field.disabled).toBe(false);
  await act(async () => {
    field.focus();
    field.blur();
  });
  expect(save).toHaveBeenLastCalledWith("Marques Brownlee");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => {
    field.focus();
    field.blur();
  });
  expect(save).toHaveBeenCalledTimes(2);
});

it("shows watch properties", async () => {
  await act(async () => {
    root.render(
      <DetailHarness
        source="youtube"
        properties={[
          { label: "Source", value: "YouTube" },
          { label: "Type", value: "Playlist" },
          { label: "Saved Items", value: "42" },
          { label: "Connected Via", value: "@pond" },
        ]}
      />,
    );
  });
  expect(host.textContent).toContain("Playlist");
  expect(host.textContent).toContain("Connected Via");
});

it("shows watched folder details with its folder actions", async () => {
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      if (name === "autoImport.status")
        return {
          enabled: true,
          path: "/Users/me/Inbox",
          mode: "copy",
          history: [{ at: Date.now(), name: "a.png", mode: "copy", ok: true }],
        };
      throw new Error(name);
    },
  });
  const client = new QueryClient();
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <SourceDetailSidebar kind="folder" id="/Users/me/Inbox" />
        <SourceDetail kind="folder" id="/Users/me/Inbox" />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain("/Users/me/Inbox"),
    );
  });
  expect(host.textContent).toContain("Last imported");
  expect(host.textContent).not.toContain("Profile Picture");
  expect(host.textContent).not.toContain("Downloads");
  expect(host.textContent).toContain("Watching");
  expect(nicknameField()).toBeNull();
  expect(actionButton("Change Folder")).toBeTruthy();
  const deleteSwitch = host.querySelector(
    '[role="switch"][aria-label="Delete After Import"]',
  );
  expect(deleteSwitch?.getAttribute("aria-checked")).toBe("false");

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <SourceDetail kind="folder" id="/Users/me/Inbox" page="connection" />
      </QueryClientProvider>,
    );
  });
  expect(actionButton("Pause Watching")).toBeTruthy();
  expect(host.textContent).toContain("Stop Watching");
  client.clear();
});
