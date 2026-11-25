// @vitest-environment jsdom

import type { Source } from "@pond/schema/db";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { ArticleViewer } from ".";

let host: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const POST_URL = "https://lenny.substack.com/p/how-to-price";

const ARTICLE = `<!doctype html><html><head>
<meta name="pond:title" content="How to price">
<meta name="pond:subtitle" content="A guide">
<meta name="pond:author" content="Lenny">
<meta name="pond:publication" content="Lenny's Newsletter">
<meta name="pond:url" content="${POST_URL}">
<meta name="pond:preview" content="true">
</head><body><p>The opening. <a href="https://example.com/a">A link</a></p></body></html>`;

const ARTICLE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(ARTICLE)}`;

beforeEach(() => {
  bridge.use({ openExternal: async () => ({ ok: true }) });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(source: Source = "substack") {
  await act(async () => {
    root.render(
      <ArticleViewer
        url={ARTICLE_URL}
        source={source}
        onUnavailable={vi.fn()}
      />,
    );
  });
  await act(() =>
    vi.waitFor(() => {
      expect(host.querySelector("h1")).not.toBeNull();
    }),
  );
}

it("renders the header, body, and paywall note", async () => {
  await render();

  expect(host.querySelector("h1")?.textContent).toBe("How to price");
  expect(host.textContent).toContain("A guide");
  expect(host.textContent).toContain("Lenny");
  expect(host.textContent).toContain("Lenny's Newsletter");
  expect(host.textContent).toContain("1 min read");
  expect(host.textContent).toContain("The opening.");
  expect(host.textContent).toContain(
    "This is a preview. Read the full post on Substack.",
  );
});

it("opens body links and Open on Substack in the browser", async () => {
  await render();

  const link = Array.from(host.querySelectorAll("a")).find(
    (anchor) => anchor.textContent === "A link",
  );
  await act(async () => link?.click());
  expect(window.pond.openExternal).toHaveBeenCalledWith(
    "https://example.com/a",
  );

  const open = host.querySelector('[aria-label="Open on Substack"]');
  await act(async () => {
    open?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(window.pond.openExternal).toHaveBeenCalledWith(POST_URL);
});

it("names the save's source in the toolbar", async () => {
  await render("github");

  expect(host.querySelector('[aria-label="Open on GitHub"]')).not.toBeNull();
});
