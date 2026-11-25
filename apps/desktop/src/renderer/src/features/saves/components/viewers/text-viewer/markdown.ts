import { $createLinkNode } from "@lexical/link";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  MdastImportExtension,
} from "@lexical/mdast";
import type {
  MdastExportRule,
  MdastImportContext,
  MdastImportRule,
  MdastNode,
  MdastParent,
  PhrasingContent,
} from "@lexical/mdast";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  configExtension,
} from "lexical";
import type { LexicalEditor, LexicalNode, TextNode } from "lexical";
import {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
  $isCollapsibleTitleNode,
} from "./collapsible";
import { $createFileNode, $isFileNode } from "./file-node";
import { $createImageNode, $isImageNode } from "./image-node";
import {
  $createYouTubeNode,
  $isYouTubeNode,
  parseYouTubeId,
  youtubeWatchUrl,
} from "./youtube-node";

type CollapseSegment = {
  kind: "collapse";
  open: boolean;
  title: string;
  body: string;
};

type MarkdownSegment = { kind: "md"; value: string } | CollapseSegment;

function splitPondMarkdown(source: string): Array<MarkdownSegment> {
  const lines = source.split("\n");
  const segments: Array<MarkdownSegment> = [];
  let buf: Array<string> = [];
  const flush = () => {
    const value = buf.join("\n");
    buf = [];
    if (value.trim().length === 0) return;
    segments.push({ kind: "md", value });
  };
  for (let i = 0; i < lines.length; i++) {
    const start = /^:::collapse( closed)?\s*$/.exec(lines[i] ?? "");
    if (!start) {
      buf.push(lines[i] ?? "");
      continue;
    }
    flush();
    const open = start[1] === undefined;
    i += 1;
    const title = (lines[i] ?? "").trim();
    i += 1;
    while (i < lines.length && (lines[i] ?? "").trim() === "") {
      i += 1;
    }
    const body: Array<string> = [];
    while (i < lines.length && !/^:::\s*$/.test(lines[i] ?? "")) {
      body.push(lines[i] ?? "");
      i += 1;
    }
    segments.push({
      kind: "collapse",
      open,
      title,
      body: body.join("\n").trim(),
    });
  }
  flush();
  return segments;
}

function $splitUnderline(text: TextNode): void {
  const value = text.getTextContent();
  const parts: Array<{ value: string; underline: boolean }> = [];
  let last = 0;
  for (const match of value.matchAll(/\+\+([^+]+)\+\+/g)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ value: value.slice(last, index), underline: false });
    }
    parts.push({ value: match[1] ?? "", underline: true });
    last = index + match[0].length;
  }
  if (parts.length === 0) return;
  if (last < value.length) {
    parts.push({ value: value.slice(last), underline: false });
  }
  const format = text.getFormat();
  const nodes = parts.flatMap((part) => {
    if (part.value.length === 0) {
      return [];
    }
    const next = $createTextNode(part.value);
    next.setFormat(format);
    if (part.underline && !next.hasFormat("underline")) {
      next.toggleFormat("underline");
    }
    return [next];
  });
  const first = nodes[0];
  if (!first) return;
  text.replace(first);
  let cursor = first;
  for (const node of nodes.slice(1)) {
    cursor.insertAfter(node);
    cursor = node;
  }
}

function $applyUnderlineMarkers(): void {
  for (const text of $getRoot().getAllTextNodes()) $splitUnderline(text);
}

function $appendMarkdown(markdown: string): void {
  const nodes = $generateNodesFromMarkdownString(markdown);
  if (nodes.length === 0) return;
  $getRoot().append(...nodes);
}

export function $writeMarkdown(markdown: string): void {
  const root = $getRoot();
  root.clear();
  const segments = splitPondMarkdown(markdown);
  if (segments.length === 0) {
    $convertFromMarkdownString("");
    $applyUnderlineMarkers();
    return;
  }
  for (const segment of segments) {
    if (segment.kind === "md") {
      $appendMarkdown(segment.value);
      continue;
    }
    const title = $createParagraphNode();
    if (segment.title) title.append($createTextNode(segment.title));
    const content = $createCollapsibleContentNode();
    if (segment.body) {
      const inner = $generateNodesFromMarkdownString(segment.body);
      if (inner.length) content.append(...inner);
    }
    if (content.getChildrenSize() === 0) content.append($createParagraphNode());
    root.append(
      $createCollapsibleContainerNode(segment.open).append(
        $createCollapsibleTitleNode().append(title),
        content,
      ),
    );
  }
  $applyUnderlineMarkers();
}

export function markdownFromEditor(editor: LexicalEditor): string {
  return editor.read(() => $convertToMarkdownString().trim());
}

function $exportUnderline(node: LexicalNode): PhrasingContent | null {
  if (!$isTextNode(node) || !node.hasFormat("underline")) return null;
  const value = `++${node.getTextContent()}++`;
  let phrasing: PhrasingContent = node.hasFormat("code")
    ? { type: "inlineCode", value }
    : { type: "text", value };
  if (node.hasFormat("italic")) {
    phrasing = { type: "emphasis", children: [phrasing] };
  }
  if (node.hasFormat("bold")) {
    phrasing = { type: "strong", children: [phrasing] };
  }
  if (node.hasFormat("strikethrough")) {
    phrasing = { type: "delete", children: [phrasing] };
  }
  return phrasing;
}

function $exportCollapse(node: LexicalNode): MdastNode | null {
  if (!$isCollapsibleContainerNode(node)) return null;
  const title = node.getChildren().find($isCollapsibleTitleNode);
  const content = node.getChildren().find($isCollapsibleContentNode);
  const heading = title?.getTextContent() ?? "";
  const body = content ? $convertToMarkdownString(content).trim() : "";
  const marker = node.getOpen() ? ":::collapse" : ":::collapse closed";
  return {
    type: "html",
    value: `${marker}\n${heading}${body ? `\n\n${body}` : ""}\n:::`,
  };
}

function $importImage(node: { url?: string; alt?: string | null }) {
  const src = node.url;
  if (!src) return null;
  const video = parseYouTubeId(src);
  if (video) return $createYouTubeNode(video);
  return $createImageNode({ src, alt: node.alt ?? "" });
}

function $importLink(
  node: MdastParent & { url?: string; title?: string | null },
  ctx: MdastImportContext,
) {
  const href = node.url;
  if (!href) return null;
  const video = parseYouTubeId(href);
  if (video) return $createYouTubeNode(video);
  if (IMAGE_HREF.test(href)) {
    return $createImageNode({ src: href, alt: linkLabel(node) });
  }
  if (href.startsWith("file:")) {
    return $createFileNode({ href, name: linkLabel(node) || fileName(href) });
  }
  const link = $createLinkNode(
    href,
    node.title ? { title: node.title } : undefined,
  );
  const children = ctx.importChildren(node);
  if (children.length) link.append(...children);
  return link;
}

function $exportImage(node: LexicalNode): MdastNode | null {
  if (!$isImageNode(node)) return null;
  return { type: "image", url: node.getSrc(), alt: node.getAlt() };
}

function $exportFile(node: LexicalNode): MdastNode | null {
  if (!$isFileNode(node)) return null;
  return {
    type: "link",
    url: node.getHref(),
    children: [{ type: "text", value: node.getName() }],
  };
}

function $exportYouTube(node: LexicalNode): MdastNode | null {
  if (!$isYouTubeNode(node)) return null;
  const url = youtubeWatchUrl(node.getId());
  return {
    type: "paragraph",
    children: [
      {
        type: "link",
        url,
        children: [{ type: "text", value: url }],
      },
    ],
  };
}

const IMAGE_HREF = /\.(gif|png|jpe?g|webp|avif|svg|heic|bmp)(?:\?|#|$)/i;

function fileName(href: string): string {
  try {
    const path = decodeURI(new URL(href).pathname);
    return path.split("/").filter(Boolean).at(-1) ?? href;
  } catch {
    return href.split("/").filter(Boolean).at(-1) ?? href;
  }
}

function linkLabel(node: MdastParent & { alt?: string | null }): string {
  if (node.alt) return node.alt;
  return node.children
    .map((child) => ("value" in child ? String(child.value ?? "") : ""))
    .join("");
}

const importRules: Array<MdastImportRule> = [
  { type: "image", $import: $importImage },
  { type: "link", $import: $importLink },
];

const exportRules: Array<MdastExportRule> = [
  { type: "text", $export: $exportUnderline },
  { type: "collapsible-container", $export: $exportCollapse },
  { type: "image", $export: $exportImage },
  { type: "file", $export: $exportFile },
  { type: "youtube", $export: $exportYouTube },
];

export const pondMdastExtension = configExtension(MdastImportExtension, {
  importRules,
  exportRules,
  toMarkdownExtensions: [
    {
      emphasis: "*",
      strong: "*",
      bullet: "-",
    },
  ],
});
