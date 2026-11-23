import {
  type McpServer,
  type ReadResourceResult,
  ResourceTemplate,
  type Variables,
} from "@modelcontextprotocol/server";
import { LibraryQueryRequestSchema } from "../../../../shared/library-query";
import { queryActiveLibraryPage } from "../../active-library-query";
import { libraryOverview, listLibraryFolders, readSave } from "../tools";
import { accessError, type McpToolBody } from "./results";
import {
  MCP_APP_MIME_TYPE,
  SAVES_VIEW_HTML,
  SAVES_VIEW_URI,
} from "./saves-view";

const JSON_TYPE = "application/json";
const FOLDER_PAGE = 100;

function json(uri: URL, value: McpToolBody): ReadResourceResult {
  return {
    contents: [
      { uri: uri.href, mimeType: JSON_TYPE, text: JSON.stringify(value) },
    ],
  };
}

function variable(variables: Variables, name: string): string {
  const value = variables[name];
  return decodeURIComponent(Array.isArray(value) ? (value[0] ?? "") : value);
}

async function requireSearch(): Promise<void> {
  const denied = await accessError("search");
  if (denied) throw new Error(denied);
}

async function folderIds(prefix: string): Promise<string[]> {
  if (await accessError("search")) return [];
  const { folders } = await listLibraryFolders();
  return folders
    .map((folder) => folder.id)
    .filter((id) => id.startsWith(prefix))
    .slice(0, 50);
}

export function registerPondResources(server: McpServer): void {
  server.registerResource(
    "saves-view",
    SAVES_VIEW_URI,
    {
      title: "Show Saves",
      description: "The grid the show_saves tool renders in MCP Apps hosts.",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: MCP_APP_MIME_TYPE, text: SAVES_VIEW_HTML },
      ],
    }),
  );
  server.registerResource(
    "library-overview",
    "pond://library/overview",
    {
      title: "Library Overview",
      description:
        "Counts, top folders, tags and sources, and which search indexes are on.",
      mimeType: JSON_TYPE,
    },
    async (uri) => {
      await requireSearch();
      return json(uri, await libraryOverview());
    },
  );
  server.registerResource(
    "save",
    new ResourceTemplate("pond://save/{id}", { list: undefined }),
    {
      title: "Save",
      description:
        "One Save's metadata, notes, caption, text in images and transcript.",
      mimeType: JSON_TYPE,
    },
    async (uri, variables) => {
      await requireSearch();
      const result = await readSave({ id: variable(variables, "id") });
      if ("error" in result) throw new Error(result.error);
      return json(uri, result.save);
    },
  );
  server.registerResource(
    "folder",
    new ResourceTemplate("pond://folder/{id}", {
      list: async () => {
        if (await accessError("search")) return { resources: [] };
        const { folders } = await listLibraryFolders();
        return {
          resources: folders.map((folder) => ({
            uri: `pond://folder/${encodeURIComponent(folder.id)}`,
            name: folder.name,
            mimeType: JSON_TYPE,
          })),
        };
      },
      complete: { id: folderIds },
    }),
    {
      title: "Folder",
      description: `A folder's newest ${FOLDER_PAGE} Saves. Use query_library to page further.`,
      mimeType: JSON_TYPE,
    },
    async (uri, variables) => {
      await requireSearch();
      const page = await queryActiveLibraryPage(
        LibraryQueryRequestSchema.parse({
          scope: { folderIds: [variable(variables, "id")] },
          limit: FOLDER_PAGE,
          include: ["saves"],
        }),
      );
      return json(uri, page);
    },
  );
}
