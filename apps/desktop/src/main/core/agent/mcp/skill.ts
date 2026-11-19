export const POND_SKILL_NAME = "pond-library";

export const POND_SKILL = `---
name: ${POND_SKILL_NAME}
description: Work with the person's Pond Library, their local archive of saved posts, images, videos, articles and files. Use when they ask about something they saved, want to find, compare, summarize or tidy Saves, or want results shown or opened in Pond.
---

# Pond Library

Pond keeps every Save on the person's own Mac. Nothing you read leaves it unless you send it somewhere.

## Find

- Start with \`library_overview\` to learn the size, sources, folders and tags.
- Use \`search_library\` for requests by meaning, such as "that poster with the blue gradient". Pass \`detail: "concise"\` when you only need ids and titles.
- Use \`query_library\` for exact lists: a folder, a tag, a source, a date range, or a sort. Follow \`nextCursor\` to page.
- Use \`grep_library\` when the person quotes exact words.
- Use \`list_folders\`, \`list_tags\` and \`list_views\` to turn names into ids and filters.

## Read and look

- \`read_save\` returns notes, caption, text in images and transcript. Pass \`field\`, \`offset\` and \`limit\` to page one long field.
- \`view_saves\` returns preview images. Look before you describe what a Save shows.

## Show

- \`show_saves\` renders a clickable grid in hosts that support MCP Apps, and a list elsewhere. Use it after a search the person wants to see.
- \`open_save\` opens one Save in Pond. \`apply_filter\` shows a filter in the Library grid. Both open Pond if it's closed.

## Export

- \`start_conversion\` writes converted copies and never touches originals. \`compress_images\` replaces originals, with Undo in Pond.
- Poll \`conversion_status\` with \`waitSeconds\` instead of calling it in a loop.

## Rules

- Cite Saves by title and id so the person can open them.
- If a tool says an access group is off, tell the person where to turn it on. Don't retry.
- Never invent a Save. If search finds nothing, say so.
`;

export const POND_INSTRUCTIONS =
  "Pond is the person's local library of saved posts, images, videos, articles and files, stored on their Mac. Start with library_overview. Use search_library for requests by meaning, query_library for exact filters and paging, grep_library for exact words, and read_save for a Save's text. Use view_saves to look at images and show_saves to show results. open_save and apply_filter move the Pond window. A tool group that's off in Settings returns an error naming the setting.";
