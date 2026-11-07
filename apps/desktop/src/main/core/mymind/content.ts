import { z } from "zod";
import type { MymindObject } from "./client";

const ProseNodeSchema = z.object({
  type: z.string().min(1),
  text: z.string().optional(),
  attrs: z
    .object({
      level: z.number().int().min(1).max(6).optional(),
      start: z.number().int().optional(),
      checked: z.boolean().optional(),
      language: z.string().nullable().optional(),
    })
    .optional(),
  marks: z
    .array(
      z.object({
        type: z.string(),
        attrs: z.object({ href: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  get content(): z.ZodOptional<z.ZodArray<typeof ProseNodeSchema>> {
    return z.array(ProseNodeSchema).optional();
  },
});

type ProseNode = z.infer<typeof ProseNodeSchema>;

function invalidContent(): never {
  throw new Error("mymind returned invalid note content.");
}

function escapeText(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>~]/g, "\\$&");
}

function codeDelimiter(text: string, minimum: number): string {
  const lengths = [...text.matchAll(/`+/g)].map((match) => match[0].length + 1);
  return "`".repeat(Math.max(minimum, ...lengths));
}

function textNode(node: ProseNode): string {
  if (node.text === undefined) return invalidContent();
  const marks = node.marks ?? [];
  const isCode = marks.some((mark) => mark.type === "code");
  let text = escapeText(node.text);
  if (isCode) {
    const delimiter = codeDelimiter(node.text, 1);
    const padding = /^[` ]|[` ]$/.test(node.text) ? " " : "";
    text = `${delimiter}${padding}${node.text}${padding}${delimiter}`;
  }
  for (const mark of marks) {
    if (mark.type === "bold" || mark.type === "strong") text = `**${text}**`;
    if (mark.type === "italic" || mark.type === "em") text = `*${text}*`;
    if (mark.type === "strike") text = `~~${text}~~`;
    if (mark.type === "link") {
      const href = mark.attrs?.href;
      if (!href) return invalidContent();
      const destination = href.replace(/[\\\s()<>]/g, (character) =>
        character === "("
          ? "%28"
          : character === ")"
            ? "%29"
            : encodeURIComponent(character),
      );
      text = `[${text}](${destination})`;
    }
  }
  return text;
}

function renderList(node: ProseNode): string {
  return `${(node.content ?? [])
    .map((item, index) => {
      const prefix =
        node.type === "orderedList"
          ? `${(node.attrs?.start ?? 1) + index}. `
          : node.type === "taskList"
            ? `- [${item.attrs?.checked ? "x" : " "}] `
            : "- ";
      return renderNode(item)
        .trimEnd()
        .split("\n")
        .map((line, lineIndex) =>
          lineIndex === 0
            ? `${prefix}${line}`
            : line
              ? `${" ".repeat(prefix.length)}${line}`
              : "",
        )
        .join("\n");
    })
    .join("\n")}\n\n`;
}

function renderNode(node: ProseNode): string {
  if (node.type === "text") return textNode(node);
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "horizontalRule") return "---\n\n";
  if (["bulletList", "orderedList", "taskList"].includes(node.type))
    return renderList(node);
  if (node.type === "codeBlock") {
    const code = (node.content ?? [])
      .map((child) => {
        if (child.type === "text" && child.text !== undefined)
          return child.text;
        if (child.type === "hardBreak") return "\n";
        return invalidContent();
      })
      .join("");
    const fence = codeDelimiter(code, 3);
    const language = node.attrs?.language ?? "";
    if (!/^[\w+-]*$/.test(language)) return invalidContent();
    return `${fence}${language}\n${code}\n${fence}\n\n`;
  }

  const children = (node.content ?? []).map(renderNode).join("");
  switch (node.type) {
    case "doc":
    case "listItem":
    case "taskItem":
      return children;
    case "paragraph":
      return `${children}\n\n`;
    case "heading":
      return `${"#".repeat(node.attrs?.level ?? 1)} ${children}\n\n`;
    case "blockquote":
      return `${children
        .trimEnd()
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n")}\n\n`;
    default:
      if (node.text !== undefined) return `${escapeText(node.text)}${children}`;
      if (node.content !== undefined) return children;
      return invalidContent();
  }
}

export function mymindContentText(content: MymindObject["content"]): string {
  if (!content) return "";
  if (content.type === "text/markdown" || content.type === "text/plain") {
    const text = z.string().safeParse(content.body);
    return text.success ? text.data : invalidContent();
  }
  if (content.type === "application/prose+json") {
    const prose = ProseNodeSchema.safeParse(content.body);
    return prose.success ? renderNode(prose.data).trimEnd() : invalidContent();
  }
  return invalidContent();
}
