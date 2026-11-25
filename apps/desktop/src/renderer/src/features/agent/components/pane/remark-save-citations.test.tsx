import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { expect, it } from "vitest";
import { AssistantResponse } from "./assistant-response";
import { remarkSaveCitations } from "./remark-save-citations";

function render(content: string, count = 6) {
  return renderToStaticMarkup(
    <Streamdown
      mode="static"
      remarkPlugins={[[remarkSaveCitations, { count, source: content }]]}
      rehypePlugins={[]}
      components={{
        a: "a",
        code: "code",
        p: "p",
        pre: "pre",
        strong: "strong",
      }}
    >
      {content}
    </Streamdown>,
  );
}

it("turns valid bare Save references into compact links within normal and bold text", () => {
  const html = render("Use #save-1, **#save-2**, or (#save-6).");
  expect(html).toContain('<a href="#save-1">1</a>');
  expect(html).toContain('<strong><a href="#save-2">2</a></strong>');
  expect(html).toContain('(<a href="#save-6">6</a>\u2060)');
});

it("keeps sentence punctuation attached to Save citations", () => {
  const html = render("[Linked](#save-1). **#save-2**, (#save-6).");
  expect(html).toContain('<a href="#save-1">Linked</a>\u2060.');
  expect(html).toContain('<strong><a href="#save-2">2</a></strong>\u2060,');
  expect(html).toContain('<a href="#save-6">6</a>\u2060)');
});

it("preserves escaped references without suppressing their valid neighbors", () => {
  const html = render(
    String.raw`Literal \#save-1 and \[2\], real #save-2 and [1, 6].`,
  );
  expect(html).toContain("Literal #save-1 and [2], real");
  expect(html.match(/<a /g)).toHaveLength(3);
  expect(html).toContain('<a href="#save-2">2</a>');
  expect(html).toContain('<a href="#save-1">1</a><a href="#save-6">6</a>');
});

it("leaves Save reference text in inline code, code blocks, and existing links alone", () => {
  const html = render(
    "`#save-1`\n\n```txt\n#save-2\n```\n\n[#save-6](https://example.com)\n\n[Already linked](#save-1)",
  );
  expect(html).toContain("<code>#save-1</code>");
  expect(html).toContain("#save-2\n</code>");
  expect(html).toContain('<a href="https://example.com">#save-6</a>');
  expect(html).toContain('<a href="#save-1">Already linked</a>');
  expect(html.match(/<a /g)).toHaveLength(2);
});

it("leaves unknown IDs, malformed tokens, and embedded fragments as plain text", () => {
  const content =
    "#save-0 #save-01 #save-7 #save-1evil #save-1-extra #save-1.5 prefix#save-1 /#save-1";
  const html = render(content);
  expect(html).not.toContain("<a ");
  expect(html).toContain(content);
  expect(render("#save-1", 0)).not.toContain("<a ");
});

it("keeps ordinary numbered citations working alongside bare references", () => {
  const html = render("[1, 2] and #save-6; invalid [1, 7].");
  expect(html.match(/<a /g)).toHaveLength(3);
  expect(html).toContain("invalid [1, 7]");
});

it("renders bare bold references as Pond Save controls with verified titles", () => {
  const sources = Array.from({ length: 6 }, (_, index) => ({
    id: `save-${index + 1}`,
    title:
      [
        "boy essentials",
        "flatlays",
        "Third",
        "Fourth",
        "Fifth",
        "Composition101",
      ][index] ?? "Save",
    source: "arena",
    url: "https://example.com",
  }));
  const html = renderToStaticMarkup(
    <AssistantResponse
      content="**#save-1**, **#save-2**, **#save-6**"
      sources={sources}
      onOpenSave={() => {}}
    />,
  );
  expect(html.match(/<button/g)).toHaveLength(3);
  for (const title of ["boy essentials", "flatlays", "Composition101"]) {
    expect(html).toContain(`title="Open ${title}"`);
  }
  expect(html).not.toContain("#save-");
});
