import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsPage } from "./";

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

function SectionName() {
  const { section } = useParams({ strict: false });
  return <p>{section}</p>;
}

async function mount(initialEntry: string) {
  const rootRoute = createRootRoute();
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: SettingsPage,
  });
  const sectionRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "$section",
    component: SectionName,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      settingsRoute.addChildren([sectionRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
  return router;
}

function scroller(): HTMLElement {
  const element = host.querySelector("[data-scroll-fade]");
  if (!(element instanceof HTMLElement)) throw new Error("Missing scroller");
  return element;
}

it("starts a new section at the top", async () => {
  const router = await mount("/settings/general");
  scroller().scrollTop = 400;

  await act(async () => {
    await router.navigate({
      to: "/settings/$section",
      params: { section: "storage" },
    });
  });

  expect(host.textContent).toBe("storage");
  expect(scroller().scrollTop).toBe(0);
});

it("keeps the scroll position when only the field anchor changes", async () => {
  const router = await mount("/settings/general");
  scroller().scrollTop = 400;

  await act(async () => {
    await router.navigate({
      to: "/settings/$section",
      params: { section: "general" },
      hash: "setting-general-startupPage",
    });
  });

  expect(scroller().scrollTop).toBe(400);
});
