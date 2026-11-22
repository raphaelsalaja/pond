import { type Source, sourceLabel } from "@pond/schema";

export interface PromptSave {
  source: Source;
  url: string;
  title: string | null;
  author: string | null;
  description: string | null;
  notes: string | null;
  tags: readonly string[];
  caption?: string | null;
  ocrText?: string | null;
  transcript?: string | null;
}

export interface PromptEntry {
  save: PromptSave;
  link: string;
  files: readonly string[];
}

function section(heading: string, body: string | null | undefined) {
  const text = body?.trim();
  return text ? [`### ${heading}`, text] : [];
}

function savePrompt({ save, link, files }: PromptEntry): string {
  const author = save.author?.trim();
  const lines = [
    `## ${save.title?.trim() || "Untitled"}`,
    `Source: ${sourceLabel(save.source)}${author ? `, by ${author}` : ""}`,
    ...(/^https?:\/\//i.test(save.url) ? [`URL: ${save.url}`] : []),
    `Pond: ${link}`,
    ...(files.length ? ["Files:", ...files.map((file) => `- ${file}`)] : []),
    ...(save.tags.length ? [`Tags: ${save.tags.join(", ")}`] : []),
  ];
  return [
    lines.join("\n"),
    ...[
      section("Description", save.description),
      section("Notes", save.notes),
      section("Caption", save.caption),
      section("Text in Image", save.ocrText),
      section("Transcript", save.transcript),
    ]
      .filter((block) => block.length)
      .map((block) => block.join("\n")),
  ].join("\n\n");
}

export function savesPrompt(entries: readonly PromptEntry[]): string {
  return entries.map(savePrompt).join("\n\n");
}
