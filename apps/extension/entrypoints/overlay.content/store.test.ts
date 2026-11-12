import { expect, it } from "vitest";
import type { CaptureStatus } from "@/utils/outcome";
import { createOverlayStore } from "./store";

const appearance = { theme: null, mode: null };

function capture(status: CaptureStatus) {
  return {
    view: "toast" as const,
    toast: { id: "capture-1", status, title: "A post" },
  };
}

function titlesFrom(event: {
  action: string;
  options: { title?: string; updates?: { title?: string } };
}): string {
  const title =
    event.action === "update"
      ? event.options.updates?.title
      : event.options.title;
  return `${event.action}:${title ?? ""}`;
}

it("shows the first capture toast once the notification UI subscribes", () => {
  const store = createOverlayStore();
  const seen: string[] = [];
  store.show(capture("sending"), appearance);
  store.show(capture("duplicate"), appearance);

  store.toasts[" subscribe"]((event) => {
    seen.push(titlesFrom(event));
  });

  expect(seen).toEqual(["add:Already in Pond"]);
});

it("keeps Saving to Pond when the result arrives after the UI subscribes", () => {
  const store = createOverlayStore();
  const seen: string[] = [];
  store.show(capture("sending"), appearance);
  store.toasts[" subscribe"]((event) => {
    seen.push(titlesFrom(event));
  });
  store.show(capture("saved"), appearance);

  expect(seen).toEqual(["add:Saving to Pond", "update:Saved to Pond"]);
});

it("does not restore a toast cleared before the UI subscribes", () => {
  const store = createOverlayStore();
  const seen: string[] = [];
  store.show(capture("sending"), appearance);
  store.show({ view: "clear" }, appearance);
  store.toasts[" subscribe"]((event) => {
    seen.push(event.action);
  });

  expect(seen).toEqual([]);
});
