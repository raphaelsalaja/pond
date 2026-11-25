import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WatchTargetProvider, WatchTargetSection, WatchTargetSubmit } from "./";

type ProviderProps = ComponentProps<typeof WatchTargetProvider>;
type AddWatchReply = ReturnType<ProviderProps["addWatch"]>;
let root: Root;
let host: HTMLDivElement;
let replies: Array<() => AddWatchReply>;
let watches: { addWatch: ProviderProps["addWatch"] };
let onAdded: ProviderProps["onAdded"];

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  replies = [];
  watches = {
    addWatch: async () =>
      replies.shift()?.() ?? { ok: true, watch: { id: "watch-1" } },
  };
  vi.spyOn(watches, "addWatch");
  onAdded = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

async function render(
  source: ProviderProps["source"] = "youtube",
  connectedSources: ProviderProps["connectedSources"] = [],
) {
  await act(async () =>
    root.render(
      <WatchTargetProvider
        source={source}
        connectedSources={connectedSources}
        addWatch={watches.addWatch}
        onAdded={onAdded}
      >
        <WatchTargetSection />
        <WatchTargetSubmit />
      </WatchTargetProvider>,
    ),
  );
}

function noop() {}

function field() {
  const input = host.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) {
    throw new Error("Missing input");
  }
  return input;
}

function watchButton() {
  const button = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Watch",
  );
  if (!button) {
    throw new Error("Missing Watch button");
  }
  return button;
}

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    host.querySelector("form")?.requestSubmit();
  });
}

async function finishAdding() {
  expect(onAdded).not.toHaveBeenCalled();
  await act(async () => vi.runOnlyPendingTimers());
}

it("is a plain input that only submits on Watch", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  await render();
  expect(watchButton().disabled).toBe(false);
  await type("drumarjohnson");
  expect(host.querySelector('[role="group"]')).toBeNull();
  expect(watches.addWatch).not.toHaveBeenCalled();
  expect(watchButton().disabled).toBe(false);
  await submit();
  expect(watches.addWatch).toHaveBeenCalledExactlyOnceWith(
    "youtube",
    "drumarjohnson",
  );
  await finishAdding();
  expect(onAdded).toHaveBeenCalledWith("watch-1");
});

it("submits a full link as typed", async () => {
  await render();
  await type("  https://youtube.com/@alice ");
  await submit();
  expect(watches.addWatch).toHaveBeenCalledExactlyOnceWith(
    "youtube",
    "https://youtube.com/@alice",
  );
});

it("adds a feed Watch without a connected account", async () => {
  await render("web");
  expect(host.textContent).toContain("Watch an RSS Feed");
  expect(field().placeholder).toBe("https://example.com/feed.xml");
  await type("https://example.com/Feed.xml?key=AbC");
  expect(watchButton().disabled).toBe(false);
  await submit();
  expect(watches.addWatch).toHaveBeenCalledExactlyOnceWith(
    "web",
    "https://example.com/Feed.xml?key=AbC",
  );
});

it("blocks a feed handle and explains an invalid feed response", async () => {
  await render("web");
  await type("person");
  expect(watchButton().disabled).toBe(false);
  await submit();
  expect(watches.addWatch).not.toHaveBeenCalled();
  replies.push(async () => ({ ok: false, reason: "invalid" }));
  await type("https://example.com/feed");
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "No RSS or Atom feed was found. Check the feed URL.",
  );
});

it("rejects a link from another source", async () => {
  await render("instagram", ["instagram"]);
  await type("https://youtube.com/@alice");
  expect(host.textContent).toContain("This link isn't from Instagram.");
  expect(watchButton().disabled).toBe(false);
  await submit();
  expect(watches.addWatch).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(field());
});

it("explains an empty submit beside the field and focuses it", async () => {
  await render();
  field().blur();
  await submit();
  expect(watches.addWatch).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Enter a handle or paste a YouTube link.",
  );
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field());
  await type("alice");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("blocks Instagram watches until that account is connected", async () => {
  await render("instagram");
  await type("drumarjohnson");
  expect(host.textContent).toContain("Watching needs your Instagram account.");
  expect(watchButton().disabled).toBe(true);
  await submit();
  expect(watches.addWatch).not.toHaveBeenCalled();
});

it("offers Connect up front when the source needs a signed-in account", async () => {
  await render("twitter");
  expect(field().placeholder).toBe("@handle or x.com link");
  expect(
    Array.from(host.querySelectorAll("li"), (item) => item.textContent),
  ).toEqual(["Accounts@handle", "Listsx.com/i/lists/123"]);
  const connect = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Connect",
  );
  expect(connect?.type).toBe("button");
});

it("explains a profile Pond couldn't find and clears it on edit", async () => {
  replies.push(async () => ({ ok: false, reason: "invalid" }));
  await render();
  await type("missing-account");
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Couldn't find that profile on YouTube.",
  );
  expect(field().getAttribute("aria-invalid")).toBe("true");
  await type("missing-account2");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("prevents duplicate starts and lets the user retry after a failure", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  let fail: (error: Error) => void = noop;
  replies.push(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  await render();
  await type("alice");
  await act(async () => {
    host.querySelector("form")?.requestSubmit();
    host.querySelector("form")?.requestSubmit();
  });
  expect(watches.addWatch).toHaveBeenCalledTimes(1);
  expect(field().disabled).toBe(true);
  await act(async () => fail(new Error("Unavailable")));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await submit();
  expect(watches.addWatch).toHaveBeenCalledTimes(2);
  await finishAdding();
  expect(onAdded).toHaveBeenCalledWith("watch-1");
});
