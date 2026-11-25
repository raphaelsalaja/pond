import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AssistantResponse, safeResponseUrl } from "./assistant-response";

const render = (content: string, streaming = false) =>
  renderToStaticMarkup(
    <AssistantResponse
      content={content}
      streaming={streaming}
      sources={[
        {
          id: "verified",
          title: "A film",
          url: "https://example.com",
          source: "arena",
        },
      ]}
      onOpenSave={vi.fn()}
    />,
  );

it("animates streaming prose by word without changing saved responses", () => {
  const streaming = render("A **clear** answer.", true);
  expect(streaming.match(/data-sd-animate="/g)).toHaveLength(3);
  expect(streaming).toMatch(
    /<strong[^>]*><span[^>]*data-sd-animate="[^>]*>clear<\/span><\/strong>/,
  );
  expect(render("A **clear** answer.")).not.toContain("data-sd-animate");
});

it("does not replay words already on screen as text is appended", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onOpenSave = vi.fn();
  const response = (content: string) => (
    <AssistantResponse content={content} streaming onOpenSave={onOpenSave} />
  );
  await act(async () => root.render(response("A clear")));
  await act(async () => root.render(response("A clear answer")));
  const words = [...host.querySelectorAll<HTMLElement>("[data-sd-animate]")];
  expect(words.map((word) => word.textContent?.trim())).toEqual([
    "A",
    "clear",
    "answer",
  ]);
  expect(
    words.map((word) => word.style.getPropertyValue("--sd-duration")),
  ).toEqual(["0ms", "0ms", "350ms"]);
  await act(async () => root.unmount());
});

it("renders semantic paragraphs, lists, tables, quotes and code", () => {
  const html = render(
    "A **clear** answer.\n\n- First\n- Second\n\n| Film | Light |\n| --- | --- |\n| A | Red |\n\n> Quoted\n\n```js\nconst x = 1;\n```",
  );
  for (const tag of [
    "<p>",
    "<strong>",
    "<ul>",
    "<li>",
    "<table>",
    "<th>",
    "<blockquote>",
  ]) {
    expect(html).toContain(tag);
  }
  expect(html).toMatch(/<pre[^>]*><code[^>]*>const x = 1;/);
});
it("renders only verified Save references as controls", () => {
  const html = render("[Invented title](#save-1) [Unknown](#save-7)");
  expect(html).toContain('title="Open A film"');
  expect(html).not.toContain("Invented title");
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain("Unknown");
});
it("makes numbered citations inspectable only when the reference exists", () => {
  const html = render(
    "The lighting is vivid [1], unlike the second example [8].",
  );
  expect(html).toContain('title="Open A film"');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain("[8]");
});
it("leaves numbered text in code and existing links unchanged", () => {
  const html = render(
    "`items[1]`\n\n```js\nitems[1]\n```\n\n[1](https://example.com)\n\n[8, 1]",
  );
  expect(html).not.toContain('title="Open A film"');
  expect(html).toContain("items[1]");
  expect(html).toContain('href="https://example.com/"');
  expect(html).toContain("[8, 1]");
});
it("preserves escaped citation text as literal Markdown", () => {
  const html = render(String.raw`A literal \[1\] is not a source control.`);
  expect(html).not.toContain('title="Open A film"');
  expect(html).toContain("[1]");
});
it("renders Save mentions as chips instead of links", () => {
  const html = render("[A film](pond-save:verified)");
  expect(html).toContain("A film");
  expect(html).not.toMatch(/href="pond-save:/);
});
it("does not execute HTML, load remote images, or link unsafe schemes", () => {
  const html = render(
    '<script>alert(1)</script>\n\n<img src="https://tracker.test">\n\n![tracking](https://tracker.test/pixel) [bad](javascript:alert) [file](file:///etc/passwd) [app](pond://save/private) [safe](https://example.com)',
  );
  expect(html).not.toMatch(
    /<script|<img|tracker.test|href="(?:javascript|file|pond):/,
  );
  expect(html).toContain('href="https://example.com/"');
  expect(html).toContain('rel="noopener noreferrer"');
});
it.each([
  "javascript:alert(1)",
  "file:///tmp/x",
  "data:text/html,a",
  "//tracker.test",
  "https://user:pass@example.com",
  "#save-0",
  "#save-1evil",
])("blocks unsafe or unverifiable URLs: %s", (url) =>
  expect(safeResponseUrl(url)).toBe(""),
);
it("keeps Save mention hrefs so chips can render", () => {
  expect(safeResponseUrl("pond-save:verified")).toBe("pond-save:verified");
});
