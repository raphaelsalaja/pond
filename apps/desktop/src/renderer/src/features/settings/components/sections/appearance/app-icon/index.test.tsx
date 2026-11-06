// Checks that the app icon swatches preview the image the Dock shows for the current icon style.
import type { AppIconStyle } from "@shared/app-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppIconRow } from "./";

async function swatchFor(style: AppIconStyle | null, label: string) {
  vi.stubGlobal("pond", {
    async query(name: string) {
      if (name === "settings.appIconAppearance")
        return { style, macosMajor: 26 };
      throw new Error(`unexpected query ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <AppIconRow
          binding={{ values: { appIcon: "grape" }, loaded: true, patch() {} }}
        />
      </QueryClientProvider>,
    ),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const src =
    host
      .querySelector(`button[aria-label="${label}"] img`)
      ?.getAttribute("src") ?? "";
  await act(async () => root.unmount());
  host.remove();
  return src;
}

it("previews the dark images when the icon style is Dark", async () => {
  expect(await swatchFor("dark", "Grape")).toContain("grape.dark");
});

it("keeps the colored images in the Default, Clear, and Tinted styles", async () => {
  expect(await swatchFor("light", "Grape")).not.toContain(".dark");
  expect(await swatchFor("monochrome", "Grape")).not.toContain(".dark");
  expect(await swatchFor(null, "Grape")).not.toContain(".dark");
});

it("switches the swatches when the icon style changes while Pond was in the background", async () => {
  let style: AppIconStyle = "light";
  vi.stubGlobal("pond", {
    async query(name: string) {
      if (name === "settings.appIconAppearance")
        return { style, macosMajor: 26 };
      throw new Error(`unexpected query ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });
  const grapeSrc = () =>
    host.querySelector('button[aria-label="Grape"] img')?.getAttribute("src") ??
    "";
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <AppIconRow
            binding={{ values: { appIcon: "grape" }, loaded: true, patch() {} }}
          />
        </QueryClientProvider>,
      ),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(grapeSrc()).not.toContain(".dark");
    style = "dark";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    // The refetch settles on its own schedule; give it up to a second.
    for (let tries = 0; tries < 50 && !grapeSrc().includes(".dark"); tries++) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    }
    expect(grapeSrc()).toContain("grape.dark");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
