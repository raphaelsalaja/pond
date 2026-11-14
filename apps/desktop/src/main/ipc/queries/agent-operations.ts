import { z } from "zod";
import type { QueryName } from "../../../shared/query-contracts";
import type { PondOperation } from "../../core/agent/operations";
import { queryOperationAccess } from "./agent-operation-access";
import type { QueryHandlerMap } from "./params";

const descriptions = new Map<string, string>(
  Object.entries({
    "settings.getPrefs":
      "Read current application preferences, including appearance, layout, shortcuts, download preferences, Fish provider and model selections, storage, and viewer settings. Contains no provider API keys.",
    "settings.setPrefs":
      "Patch application preferences. Read settings.getPrefs and settings.preferenceSchema first, use the same nested field names, and send only the fields the user requested. Provider API keys are managed through the native Integrations screen.",
    "agent.keys":
      "List configured AI provider connection status without exposing API keys.",
    "agent.listAvailableModels":
      "List available models from configured AI providers.",
    "saves.bulkEdit":
      "Edit rating, favorite or tags, trash, restore, or permanently delete explicitly selected Saves. Pass exact IDs and an operation. Purge is permanent; trash is recoverable.",
    "saves.createManual":
      "Create a Save from a title, URL, note, tags, and optional local files.",
    "saves.createBlankDocument":
      "Create a blank editable document in the Library. Use saves.listBlankDocuments to discover supported document kinds.",
    "saves.queryPage":
      "Query exact Library results using nested filters, sorting, and cursor pagination. Returns IDs; use readSave for evidence and metadata.",
    "saves.queryIds":
      "Get exact matching Save IDs using nested Library filters for bulk operations.",
    "saves.cropAsCopy":
      "Crop a selected image or video frame into a new Save. Preserve the original.",
    "saves.emptyTrash":
      "Permanently delete every Save in Trash. Cannot be undone.",
    "saves.split":
      "Split explicitly selected multi-image or multi-video Saves so each image or video becomes its own Save with the same source, tags, notes, and Folders.",
    "folders.rules.set":
      "Set inherited tags for a Folder and optionally apply them to existing Saves.",
    "canvases.list":
      "List Canvases: boards where Saves from anywhere in the Library sit beside notes, text, shapes, sections, tables, code, mind maps, drawings, and connectors.",
    "canvases.get":
      "Read one Canvas: its Save cards, sticky notes, text, shapes, sections, tables, code blocks, mind-map topics, drawings, and the connectors between them.",
    "canvases.create":
      "Create a Canvas, optionally starting with explicit Save IDs placed in a grid.",
    "canvases.addSaves":
      "Add explicit Save IDs to a Canvas. Saves already on it are skipped; new cards land beside existing content.",
    "fish.list":
      "List fish: characters with a name, color, instructions, a folder and tag scope, an optional model, and their routines.",
    "fish.create":
      "Create a fish with a name, color, instructions, scope, and model.",
    "fish.update":
      "Change a fish's name, color, instructions, scope, or model. Routines change through createRoutine and updateRoutine.",
    "conversion.start":
      "Export converted image or video-to-GIF copies using a preset. Opens a native export directory picker; originals are retained. Returns a job ID for progress and cancellation.",
    "conversion.capabilities":
      "List conversion formats and the codecs available in this Pond build.",
    "downloader.probe":
      "Read a media link before downloading it: title, length, quality options with sizes, captions, Most Replayed, or the entries of a playlist.",
    "downloader.start":
      "Download media links into the Library as Saves. Mode is video, audio, or transcript; a range trims a single link to a clip. Container, fps, and compression convert a video after download; GIF needs a range of 30 seconds or less.",
    "conversion.compress":
      "Compress selected existing image files in one recoverable batch. Replaces originals, regenerates derived data, and records the operation for Undo.",
    "library.switchTo":
      "Switch the active Library to a selected path. This ends work in the current Library.",
    "library.createAt":
      "Create a Library at a selected path with a name. Use library.pickFolder when the user needs to choose a location.",
    "library.restoreBackup":
      "Restore a Library backup to a chosen destination through Pond's existing restore flow.",
    "reset.factory":
      "Delete the active Library index. The Library files remain on disk, but this removes indexed chat history. Use the native Settings flow.",
  } satisfies Partial<Record<QueryName, string>>),
);

function describe(name: QueryName): string {
  const explicit = descriptions.get(name);
  if (explicit) return explicit;
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll(".", " ");
  return name.startsWith("savedViews.")
    ? `Smart Folders, Saved Views, and Groups: ${words}. Uses the same operation as Pond's interface.`
    : `${words}. Uses the same operation as Pond's interface.`;
}

type QueryHandler = NonNullable<QueryHandlerMap[QueryName]> & {
  inputSchema?: z.ZodType;
};

export function agentOperationsForQueries(
  registry: QueryHandlerMap,
): PondOperation[] {
  const names = z.enum(Object.keys(queryOperationAccess));
  return Object.keys(registry).flatMap((key) => {
    const name = names.parse(key);
    /** SAFETY: the exhaustive QueryName record above is the source of this validated name. */
    const queryName = name as QueryName;
    const access = queryOperationAccess[queryName];
    if (access === "hidden") return [];
    const handler: QueryHandler | undefined = registry[queryName];
    if (!handler) return [];
    return [
      {
        name,
        description: describe(queryName),
        access,
        inputSchema: handler.inputSchema ?? z.object({}),
        execute: async (args) => {
          const result = await handler(args);
          if (queryName === "agent.keys") {
            return z
              .array(
                z.object({
                  provider: z.string(),
                  hasKey: z.boolean(),
                  enabled: z.boolean(),
                }),
              )
              .parse(result);
          }
          return z.json().parse(JSON.parse(JSON.stringify(result ?? null)));
        },
      },
    ];
  });
}
