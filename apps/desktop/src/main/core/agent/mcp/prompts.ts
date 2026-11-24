import { completable } from "@modelcontextprotocol/server";
import type { GetPromptResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listLibraryFolders } from "../tools";
import { accessError } from "./results";

const DAY_MS = 86_400_000;

function ask(text: string): GetPromptResult {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

async function folderNames(value: string): Promise<Array<string>> {
  if (await accessError("search")) {
    return [];
  }
  const { folders } = await listLibraryFolders();
  const needle = value.toLowerCase();
  return folders
    .map((folder) => folder.name)
    .filter((name) => name.toLowerCase().includes(needle))
    .slice(0, 50);
}

export function registerPondPrompts(server: McpServer): void {
  server.registerPrompt(
    "find_saves",
    {
      title: "Find Saves",
      description: "Search the Pond Library for a topic and show the results.",
      argsSchema: z.object({
        topic: z.string().min(1).describe("What to look for"),
      }),
    },
    ({ topic }) =>
      ask(
        [
          `Find Saves in my Pond Library about: ${topic}`,
          "Call search_library first. Use grep_library if I quoted exact words.",
          "Read the strongest matches with read_save before you describe them.",
          "List each match with its title, source and why it fits.",
          "Then call show_saves with the ids so I can open them.",
        ].join("\n"),
      ),
  );
  server.registerPrompt(
    "summarize_folder",
    {
      title: "Summarize Folder",
      description: "Read a folder's Saves and summarize its themes.",
      argsSchema: z.object({
        folder: completable(
          z.string().min(1).describe("Folder name"),
          folderNames,
        ),
      }),
    },
    ({ folder }) =>
      ask(
        [
          `Summarize my Pond folder named "${folder}".`,
          "Call list_folders to find its id.",
          'Then call query_library with scope.folderIds and include ["saves"], following nextCursor until you have every Save.',
          "Read the most important Saves with read_save.",
          "Write the main themes, the standout Saves and anything that looks out of place.",
        ].join("\n"),
      ),
  );
  server.registerPrompt(
    "recent_saves",
    {
      title: "Recent Saves",
      description: "Review what you saved lately.",
      argsSchema: z.object({
        days: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .describe("How many days back. Defaults to 7."),
      }),
    },
    ({ days }) => {
      const span = Number(days ?? 7);
      const since = Date.now() - span * DAY_MS;
      return ask(
        [
          `What did I save in Pond in the last ${span} days?`,
          `Call query_library with scope.savedSince set to ${since}, sortKey "savedAt", sortDir "desc" and include ["saves"].`,
          "Group the Saves by theme and call out anything worth a second look.",
          "Then call show_saves with the most interesting ids.",
        ].join("\n"),
      );
    },
  );
  server.registerPrompt(
    "tidy_library",
    {
      title: "Tidy Library",
      description: "Find untagged, unfiled and duplicate Saves.",
    },
    () =>
      ask(
        [
          "Help me tidy my Pond Library. Don't change anything.",
          "Call library_overview, then find_duplicates and list_tags.",
          "Report untagged, untitled and unfiled counts and each duplicate group.",
          "Suggest tags and folders from the ones I already use.",
        ].join("\n"),
      ),
  );
}
