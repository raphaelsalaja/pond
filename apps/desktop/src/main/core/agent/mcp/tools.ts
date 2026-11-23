import { setTimeout as sleep } from "node:timers/promises";
import type {
  CallToolResult,
  ContentBlock,
  McpServer,
  ServerContext,
  ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { AppNavigationSchema } from "../../../../shared/app-navigation";
import {
  ConversionApiRequestSchema,
  type ConversionJob,
  ConversionJobSchema,
  ConversionPresetSchema,
  ImageCompressionRequestSchema,
  VideoCompressionRequestSchema,
} from "../../../../shared/conversion-contracts";
import { LibraryQueryRequestSchema } from "../../../../shared/library-query";
import { queryActiveLibraryPage } from "../../active-library-query";
import { conversionCapabilities } from "../../conversion-capabilities";
import {
  conversionJobs,
  conversionPresets,
  saveConversionPreset,
} from "../../conversion-jobs";
import {
  applyFilterInput,
  findDuplicateSaves,
  grepLibrary,
  grepLibraryInput,
  libraryOverview,
  listLibraryFolders,
  readSave,
  readSaveInput,
  searchLibrary,
  searchLibraryInput,
} from "../tools";
import { navigatePond } from "./app-client";
import { listSavedViews, listTags, saveCards } from "./library";
import { type PreviewSize, savePreview } from "./previews";
import {
  errorResult,
  jsonResult,
  structuredResult,
  withAccess,
} from "./results";
import { SAVES_VIEW_URI } from "./saves-view";

const READ: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const NAVIGATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const saveId = z.string().min(1).describe("A Save id from a search result.");

const saveIds = (max: number) =>
  z
    .array(z.string().min(1))
    .min(1)
    .max(max)
    .describe(`Save ids from a search result, ${max} at most.`);

const searchInput = searchLibraryInput.extend({
  query: z
    .string()
    .optional()
    .describe(
      "What to look for, in plain words. Pond matches meaning, titles, notes, text in images and transcripts.",
    ),
  folderId: z
    .string()
    .optional()
    .describe("A folder id from list_folders. Omit to search every folder."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("How many Saves to return. Pond returns 40 at most."),
  detail: z
    .enum(["concise", "detailed"])
    .optional()
    .describe(
      "concise returns id, title, source and url only. Defaults to detailed.",
    ),
});

const SaveCardSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  url: z.string(),
  author: z.string().nullable(),
  source: z.string(),
  mediaType: z.string().nullable(),
  savedAt: z.string().nullable(),
});

interface PreviewCaption
  extends Pick<z.infer<typeof SaveCardSchema>, "id" | "title" | "source"> {
  error?: string;
}

const TagsOutputSchema = z.object({
  tags: z.array(
    z.object({ name: z.string(), count: z.number(), starred: z.boolean() }),
  ),
  total: z.number(),
});

const PREVIEW_SIZES = [
  "small",
  "medium",
  "large",
] as const satisfies readonly PreviewSize[];

const JOB_POLL_MS = 500;

function jobResult(job: ConversionJob | null): CallToolResult {
  return job
    ? structuredResult(job)
    : errorResult(
        "No conversion has that id. Jobs last until this MCP connection closes.",
      );
}

async function waitForJob(
  id: string,
  seconds: number,
  ctx: ServerContext,
): Promise<ConversionJob | null> {
  const token = ctx.mcpReq._meta?.progressToken;
  const deadline = Date.now() + seconds * 1000;
  let job = conversionJobs.status(id);
  while (
    job?.status === "running" &&
    Date.now() < deadline &&
    !ctx.mcpReq.signal.aborted
  ) {
    if (token !== undefined) {
      await ctx.mcpReq.notify({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress: job.completed,
          total: job.total,
          message: `${job.completed} of ${job.total} files`,
        },
      });
    }
    await sleep(JOB_POLL_MS);
    job = conversionJobs.status(id);
  }
  return job;
}

function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "library_overview",
    {
      title: "Library Overview",
      description:
        "Summarize the Library: Save, folder and tag counts, untagged and unfiled Saves, top folders, tags and sources, and which search indexes are on. Call this first to learn what the Library holds.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("search", async () => jsonResult(await libraryOverview())),
  );
  server.registerTool(
    "query_library",
    {
      title: "Query Library",
      description:
        "Query exact scoped results with nested filters and keyword grammar, stable sorting, total count and cursor pagination. Use this for precise lists, such as every PDF in a folder saved this year. Use read_save to hydrate returned IDs. Pass nextCursor as cursor for the next page.",
      inputSchema: LibraryQueryRequestSchema,
      annotations: READ,
    },
    withAccess("search", async (request) =>
      jsonResult(await queryActiveLibraryPage(request)),
    ),
  );
  server.registerTool(
    "search_library",
    {
      title: "Search Library",
      description:
        "Find Saves by meaning, ranked by relevance. Use this for fuzzy requests, such as that article about typography. Supports media probes via saveId or a media embedding vector. Use query_library for exact filters and grep_library for an exact phrase.",
      inputSchema: searchInput,
      annotations: READ,
    },
    withAccess("search", async ({ detail, ...args }) => {
      const result = await searchLibrary(searchLibraryInput.parse(args));
      if (detail !== "concise") return jsonResult(result);
      return jsonResult({
        saves: result.saves.map(({ id, title, source, url }) => ({
          id,
          title,
          source,
          url,
        })),
      });
    }),
  );
  server.registerTool(
    "read_save",
    {
      title: "Read Save",
      description:
        "Read stored caption, OCR, transcript, notes, and metadata for one save. Pass field with offset and limit to page through one long field in tokens.",
      inputSchema: readSaveInput,
      annotations: READ,
    },
    withAccess("search", async (args) => jsonResult(await readSave(args))),
  );
  server.registerTool(
    "grep_library",
    {
      title: "Grep Library",
      description:
        "Search inside captions, OCR, transcripts, notes, and titles for exact words, and return matching snippets. Pass id to search one Save.",
      inputSchema: grepLibraryInput,
      annotations: READ,
    },
    withAccess("search", async (args) => jsonResult(await grepLibrary(args))),
  );
  server.registerTool(
    "list_folders",
    {
      title: "List Folders",
      description:
        "List folders in the Pond library with their ids and parents. Pass an id as folderId to search_library or in scope.folderIds to query_library.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("search", async () => jsonResult(await listLibraryFolders())),
  );
  server.registerTool(
    "list_tags",
    {
      title: "List Tags",
      description:
        "List tags in use, most used first, with Save counts. Filter on a tag with query_library.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("How many tags to return. Defaults to 100."),
      }),
      outputSchema: TagsOutputSchema,
      annotations: READ,
    },
    withAccess("search", async ({ limit }) =>
      structuredResult(await listTags(limit ?? 100)),
    ),
  );
  server.registerTool(
    "list_views",
    {
      title: "List Views",
      description:
        "List saved Views with their filters. Pass a View's query to query_library or apply_filter to reuse it.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("search", async () => jsonResult(await listSavedViews())),
  );
  server.registerTool(
    "find_duplicates",
    {
      title: "Find Duplicates",
      description:
        "Find groups of Saves that look like the same image or file. Read-only. Pond changes nothing.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("search", async () => jsonResult(await findDuplicateSaves())),
  );
  server.registerTool(
    "view_saves",
    {
      title: "View Saves",
      description:
        "Look at Saves as images: returns a preview of each Save's cover image or video frame. Use this when the answer depends on what a Save looks like.",
      inputSchema: z.object({
        ids: saveIds(8),
        size: z
          .enum(PREVIEW_SIZES)
          .optional()
          .describe(
            "small is 160px, medium 480px, large 1024px wide. Defaults to medium.",
          ),
      }),
      annotations: READ,
    },
    withAccess("search", async ({ ids, size }) => {
      const cards = await saveCards(ids);
      const content: ContentBlock[] = [];
      for (const card of cards) {
        const image = await savePreview(card, size ?? "medium");
        const caption: PreviewCaption = {
          id: card.id,
          title: card.title,
          source: card.source,
        };
        if (!image) caption.error = "No image to show for this Save.";
        content.push({ type: "text", text: JSON.stringify(caption) });
        if (image) content.push(image);
      }
      const found = new Set(cards.map((card) => card.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) {
        content.push({
          type: "text",
          text: JSON.stringify({ notFound: missing }),
        });
      }
      return { content };
    }),
  );
  server.registerTool(
    "show_saves",
    {
      title: "Show Saves",
      description:
        "Show Saves to the person as a visual grid they can click to open in Pond. Hosts without MCP Apps get the list as text. Use after a search when the person wants to see the results.",
      inputSchema: z.object({ ids: saveIds(60) }),
      outputSchema: z.object({ saves: z.array(SaveCardSchema) }),
      annotations: READ,
      _meta: {
        ui: { resourceUri: SAVES_VIEW_URI },
        "ui/resourceUri": SAVES_VIEW_URI,
      },
    },
    withAccess("search", async ({ ids }) => {
      const cards = await saveCards(ids);
      return structuredResult({
        saves: cards.map(({ files: _files, savedAt, ...card }) => ({
          ...card,
          savedAt: savedAt?.toISOString() ?? null,
        })),
      });
    }),
  );
  server.registerTool(
    "preview_save",
    {
      title: "Preview Save",
      description:
        "Return one Save's small preview as a data URL for the Show Saves grid.",
      inputSchema: z.object({ id: saveId }),
      outputSchema: z.object({
        id: z.string(),
        dataUrl: z.string().nullable(),
      }),
      annotations: READ,
      _meta: {
        ui: { resourceUri: SAVES_VIEW_URI, visibility: ["app"] },
      },
    },
    withAccess("search", async ({ id }) => {
      const [card] = await saveCards([id]);
      const image = card ? await savePreview(card, "small") : null;
      return structuredResult({
        id,
        dataUrl: image ? `data:${image.mimeType};base64,${image.data}` : null,
      });
    }),
  );
}

function registerOpenTools(server: McpServer): void {
  server.registerTool(
    "open_save",
    {
      title: "Open Save",
      description:
        "Open one Save in the Pond window. Opens Pond if it's closed.",
      inputSchema: z.object({ id: saveId }),
      annotations: NAVIGATE,
    },
    withAccess("open", async ({ id }) =>
      jsonResult(await navigatePond({ kind: "save", id })),
    ),
  );
  server.registerTool(
    "apply_filter",
    {
      title: "Apply Filter",
      description:
        "Show a structured filter in the Pond Library grid, so the person sees the same results you found. Opens Pond if it's closed.",
      inputSchema: applyFilterInput,
      annotations: NAVIGATE,
    },
    withAccess("open", async ({ query }) =>
      jsonResult(
        await navigatePond(
          AppNavigationSchema.parse({ kind: "filter", query }),
        ),
      ),
    ),
  );
}

function registerExportTools(server: McpServer): void {
  server.registerTool(
    "list_conversion_capabilities",
    {
      title: "List Conversion Formats",
      description:
        "List image, animation, and video conversion formats available in this Pond build.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("export", async () =>
      jsonResult(await conversionCapabilities()),
    ),
  );
  server.registerTool(
    "list_conversion_presets",
    {
      title: "List Conversion Presets",
      description: "List portable image and video-to-GIF export presets.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withAccess("export", async () => jsonResult(conversionPresets())),
  );
  server.registerTool(
    "save_conversion_preset",
    {
      title: "Save Conversion Preset",
      description:
        "Save a reusable conversion preset in the current library. Saving a preset with an existing id replaces it.",
      inputSchema: z.object({ preset: ConversionPresetSchema }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withAccess("export", async ({ preset }) =>
      jsonResult(saveConversionPreset(preset)),
    ),
  );
  server.registerTool(
    "start_conversion",
    {
      title: "Start Conversion",
      description:
        "Export converted copies of selected Save files to a chosen directory. Preserves originals and existing output files. Returns a job ID for progress and cancellation. Two conversions can run at once.",
      inputSchema: ConversionApiRequestSchema,
      outputSchema: ConversionJobSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAccess("export", async (request) =>
      structuredResult(conversionJobs.start(request)),
    ),
  );
  server.registerTool(
    "compress_images",
    {
      title: "Compress Images",
      description:
        "Compress selected existing image files in one recoverable batch. Replaces originals, regenerates metadata and derived images, and records Undo.",
      inputSchema: ImageCompressionRequestSchema,
      outputSchema: ConversionJobSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAccess("export", async (request) =>
      structuredResult(conversionJobs.startCompression(request)),
    ),
  );
  server.registerTool(
    "compress_videos",
    {
      title: "Compress Videos",
      description:
        "Re-encode the videos of selected Saves as HEVC to reclaim disk space. Replaces the original files without Undo. Verifies each output against its original first and leaves videos that would not shrink by at least 10%. Available on macOS only.",
      inputSchema: VideoCompressionRequestSchema,
      outputSchema: ConversionJobSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAccess("export", async (request) =>
      structuredResult(conversionJobs.startVideoCompression(request)),
    ),
  );
  server.registerTool(
    "conversion_status",
    {
      title: "Conversion Status",
      description:
        "Read conversion progress, completed files and failures. Pass waitSeconds to wait for the job to finish, with progress updates while it runs.",
      inputSchema: z.object({
        id: z.string().min(1),
        waitSeconds: z
          .number()
          .int()
          .min(0)
          .max(120)
          .optional()
          .describe("Seconds to wait for the job to finish. Defaults to 0."),
      }),
      outputSchema: ConversionJobSchema,
      annotations: READ,
    },
    withAccess("export", async ({ id, waitSeconds }, ctx) =>
      jobResult(
        waitSeconds
          ? await waitForJob(id, waitSeconds, ctx)
          : conversionJobs.status(id),
      ),
    ),
  );
  server.registerTool(
    "cancel_conversion",
    {
      title: "Cancel Conversion",
      description:
        "Cancel a running conversion. Completed exports are retained.",
      inputSchema: z.object({ id: z.string().min(1) }),
      outputSchema: ConversionJobSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withAccess("export", async ({ id }) =>
      jobResult(conversionJobs.cancel(id)),
    ),
  );
}

export function registerPondTools(server: McpServer): void {
  registerSearchTools(server);
  registerOpenTools(server);
  registerExportTools(server);
}
