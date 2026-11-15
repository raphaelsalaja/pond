import { ulid } from "ulid";
import { z } from "zod";
import type {
  AssistantActivity,
  AssistantChange,
  AssistantResultSet,
  AssistantSource,
  AssistantToolStep,
} from "../../../shared/assistant";
import {
  ASSISTANT_CHANGE_CAP,
  type AssistantQuestion,
  assistantProposalInput,
  assistantQuestion,
  assistantResultSet,
  assistantSource,
} from "../../../shared/assistant";
import { folderIdsForSave, listFolders } from "../folders";
import { normalizeTagList } from "../tags";
import type { ToolSpec } from "./complete";
import { pondOperationTools } from "./operations";
import { boundedSource } from "./output";
import { createToolTracker } from "./tool-steps";
import {
  applyFilter,
  applyFilterInput,
  citeSaves,
  citeSavesInput,
  describeSaves,
  describeSavesInput,
  findDuplicateSaves,
  findDuplicatesInput,
  grepLibrary,
  grepLibraryInput,
  type LibraryScope,
  libraryOverview,
  libraryOverviewInput,
  openSave,
  openSaveInput,
  readSave,
  readSaveInput,
  searchLibrary,
  searchLibraryInput,
  setOverlay,
  setOverlayInput,
} from "./tools";

export const contextDependencies = {
  pondOperationTools,
  folderIdsForSave,
  listFolders,
  searchLibrary,
  readSave,
  grepLibrary,
  libraryOverview,
  applyFilter,
  setOverlay,
  citeSaves,
  openSave,
  describeSaves,
  findDuplicateSaves,
};

/** Small models fill every optional filter with a guess, so an empty result names the filters to drop. */
export function emptySearchNote(
  input: z.infer<typeof searchLibraryInput>,
): string | undefined {
  const filters = [
    input.source && `source "${input.source}"`,
    input.folderId && `folderId "${input.folderId}"`,
    input.media?.length && `media ${input.media.join(", ")}`,
    input.untagged && "untagged",
  ].filter(Boolean);
  if (!filters.length) return undefined;
  return `No Saves matched ${filters.join(", ")}. Remove any filter the request did not ask for and search again.`;
}

export function libraryContext(
  input: {
    scope: LibraryScope;
    signal: AbortSignal;
    onActivity: (activity: AssistantActivity) => void;
    onSources: (sources: AssistantSource[]) => void;
    onResults?: (results: AssistantResultSet[]) => void;
    onSteps?: (steps: AssistantToolStep[]) => void;
    visionEnabled?: () => boolean;
  },
  deps = contextDependencies,
) {
  const sources = new Map<string, AssistantSource>();
  const changes = new Map<string, AssistantChange>();
  let question: AssistantQuestion | undefined;
  let results: AssistantResultSet[] = [];
  const forModel = (save: AssistantSource) =>
    boundedSource(save, [...sources.keys()].indexOf(save.id) + 1);
  function collect(rows: AssistantSource[]) {
    input.signal.throwIfAborted();
    let changed = false;
    for (const row of rows) {
      if (sources.size >= 80 && !sources.has(row.id)) continue;
      const current = sources.get(row.id);
      if (current && JSON.stringify(current) === JSON.stringify(row)) continue;
      sources.set(row.id, row);
      changed = true;
    }
    if (changed) input.onSources([...sources.values()]);
  }
  function showResult(
    result: AssistantResultSet,
  ): "added" | "duplicate" | "limit" {
    const saveIds = [...new Set(result.saveIds)];
    if (
      results.some(
        (current) =>
          current.title === result.title &&
          current.saveIds.length === saveIds.length &&
          current.saveIds.every((id) => saveIds.includes(id)),
      )
    )
      return "duplicate";
    if (results.length >= 12) return "limit";
    results = [...results, { ...result, saveIds }];
    input.onResults?.(results);
    return "added";
  }
  async function retrieve(args: z.infer<typeof searchLibraryInput>) {
    input.signal.throwIfAborted();
    input.onActivity("searching");
    const result = await deps.searchLibrary(args, input.scope);
    collect(result.saves);
    return result.saves;
  }
  const tools: ToolSpec[] = [
    {
      name: "showSaves",
      description:
        "Display a small inline collection of Saves already found with searchLibrary or readSave. Use this after you have something to say about them; do not dump an exhaustive search list. Do not repeat the Save list in prose. Only known Save IDs are accepted.",
      schema: assistantResultSet,
      execute: async (args) => {
        input.signal.throwIfAborted();
        const parsed = assistantResultSet.parse(args);
        const saveIds = [...new Set(parsed.saveIds)];
        if (saveIds.some((id) => !sources.has(id)))
          throw new Error("Only Saves read in this conversation can be shown.");
        const outcome = showResult({ ...parsed, saveIds });
        if (outcome === "limit")
          throw new Error("Up to twelve result groups can be shown per reply.");
        return {
          shown: saveIds.length,
          references: saveIds.map((id) => ({
            id,
            reference: `#save-${[...sources.keys()].indexOf(id) + 1}`,
          })),
          message:
            "These Saves are shown inline. Cite them using these exact global references; their order in this group does not renumber them. Do not repeat their titles in prose.",
        };
      },
    },
    {
      name: "requestQuestion",
      description:
        "Ask one necessary clarifying question with 2 to 4 distinct options. The user can also write their own answer. Do not repeat the question in prose.",
      schema: assistantQuestion,
      execute: async (args) => {
        input.signal.throwIfAborted();
        if (question) return { requested: true };
        question = assistantQuestion.parse(args);
        question.options = [...new Set(question.options)];
        question = assistantQuestion.parse(question);
        return {
          requested: true,
          message: "The question is shown to the user. Wait for their answer.",
        };
      },
    },
    {
      name: "searchLibrary",
      description:
        "Gather ranked evidence from titles, descriptions, authors, tags, captions, OCR, transcripts, notes, and URLs within the selected scope. Set task explicitly to code for source-code retrieval or fact-check to verify a claim; otherwise omit it for ordinary search. Use media as a filter rather than adding words such as pictures or videos to query. Set untagged to only return Saves with no tags. Omit query to list recent Saves. Then explain or act; call showSaves for a small set to display.",
      schema: searchLibraryInput,
      execute: async (args) => {
        const parsed = searchLibraryInput.parse(args);
        const saves = await retrieve({
          ...parsed,
          limit: parsed.limit ?? 24,
        });
        const found = saves.filter((save) => sources.has(save.id));
        const note = found.length ? undefined : emptySearchNote(parsed);
        return { saves: found.map(forModel), ...(note && { note }) };
      },
    },
    {
      name: "readSave",
      description:
        "Read a Save the way Cursor reads a file: caption, OCR, transcript, notes, rating, favorite, tags, folders, and media. Use field plus offset and limit for long transcripts.",
      schema: readSaveInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        input.onActivity("reading");
        const result = await deps.readSave(
          readSaveInput.parse(args),
          input.scope,
        );
        if (result.save && "url" in result.save) {
          const save = assistantSource.parse(result.save);
          collect([save]);
          if (sources.has(save.id))
            return { ...result, reference: forModel(save).reference };
        }
        return result;
      },
    },
    {
      name: "grepLibrary",
      description:
        "Search inside caption, OCR, transcript, notes, and titles. Pass id to grep one Save. Returns snippets with Save IDs.",
      schema: grepLibraryInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        input.onActivity("searching");
        return deps.grepLibrary(grepLibraryInput.parse(args), input.scope);
      },
    },
    {
      name: "libraryOverview",
      description:
        "Library counts, coverage, and how many Saves are untagged, untitled, or unfiled. Use this once, then say what to organize first.",
      schema: libraryOverviewInput,
      execute: async () => {
        input.signal.throwIfAborted();
        return deps.libraryOverview();
      },
    },
    {
      name: "applyFilter",
      description:
        "Apply a structured Library filter to the grid. Use this to show matching Saves in the Library.",
      schema: applyFilterInput,
      execute: async (args) => deps.applyFilter(applyFilterInput.parse(args)),
    },
    {
      name: "setOverlay",
      description:
        "Set the Semantic query and/or Visual Match Save on the Library grid.",
      schema: setOverlayInput,
      execute: async (args) => deps.setOverlay(setOverlayInput.parse(args)),
    },
    {
      name: "citeSaves",
      description: "Highlight Saves in the Library grid by ID.",
      schema: citeSavesInput,
      execute: async (args) => deps.citeSaves(citeSavesInput.parse(args)),
    },
    {
      name: "openSave",
      description: "Open a Save in the Library.",
      schema: openSaveInput,
      execute: async (args) => deps.openSave(openSaveInput.parse(args)),
    },
    {
      name: "findDuplicates",
      description: "Find duplicate Saves by file hash or perceptual hash.",
      schema: findDuplicatesInput,
      execute: async () => {
        input.signal.throwIfAborted();
        return deps.findDuplicateSaves();
      },
    },
    {
      name: "describeSaves",
      description:
        "Look at selected Saves with the vision model. Then propose titles and tags with proposeChanges.",
      schema: describeSavesInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        if (!input.visionEnabled?.())
          return { error: "Choose a vision model in Settings Models." };
        input.onActivity("reading");
        const parsed = describeSavesInput.parse(args);
        for (const id of parsed.ids) {
          const result = await deps.readSave({ id }, input.scope);
          if (result.save && "url" in result.save)
            collect([assistantSource.parse(result.save)]);
        }
        return deps.describeSaves(parsed);
      },
    },
    {
      name: "listFolders",
      description:
        "List existing folder IDs and names when preparing folder suggestions.",
      schema: z.object({}),
      execute: async () => {
        input.signal.throwIfAborted();
        return (await deps.listFolders()).map(({ id, name }) => ({ id, name }));
      },
    },
    {
      name: "proposeChanges",
      description:
        "Prepare Library edits for explicit review. Never applies changes. Covers title, note, tags, folders, rating, trash, folder and tag CRUD, saved views, import URL, merge duplicates, export, sync, refresh, archive, copy URL, reveal, batch rename, and empty trash. Tags and folders replace the current list, so preserve entries the user has not asked to remove.",
      schema: assistantProposalInput,
      execute: async (args) => {
        input.signal.throwIfAborted();
        input.onActivity("preparing");
        const proposals = assistantProposalInput.parse(args).changes;
        const saveIds = [
          ...new Set(
            proposals
              .map((proposal) => proposal.saveId)
              .filter((id) => id.length > 0),
          ),
        ];
        const [folderRows, loaded] = await Promise.all([
          deps.listFolders(),
          Promise.all(
            saveIds.map(
              async (id) =>
                [id, await deps.readSave({ id }, input.scope)] as const,
            ),
          ),
        ]);
        const folders = new Set(folderRows.map((folder) => folder.id));
        const savesById = new Map(loaded);
        const folderSaveIds = [
          ...new Set(
            proposals
              .filter((proposal) => proposal.field === "folders")
              .map((proposal) => proposal.saveId),
          ),
        ];
        const currentFolders = new Map(
          await Promise.all(
            folderSaveIds.map(
              async (id) => [id, await deps.folderIdsForSave(id)] as const,
            ),
          ),
        );
        const accepted: AssistantChange[] = [];
        for (const proposal of proposals) {
          input.signal.throwIfAborted();
          if (proposal.field === "action") {
            const change: AssistantChange = {
              id: `${proposal.action}:${proposal.saveId}:${proposal.after}`,
              saveId: proposal.saveId,
              title: proposal.after,
              reason: proposal.reason,
              status: "pending",
              field: "action",
              action: proposal.action,
              before: null,
              after: proposal.after,
              payload: proposal.payload,
            };
            if (changes.size >= ASSISTANT_CHANGE_CAP && !changes.has(change.id))
              continue;
            changes.set(change.id, change);
            accepted.push(change);
            continue;
          }
          const result = savesById.get(proposal.saveId);
          if (!result?.save || !sources.has(proposal.saveId)) continue;
          const base = {
            id: `${proposal.saveId}:${proposal.field}`,
            saveId: proposal.saveId,
            title: result.save.title || "Untitled",
            reason: proposal.reason,
            status: "pending" as const,
          };
          let change: AssistantChange;
          if (proposal.field === "title" || proposal.field === "note") {
            change = {
              ...base,
              field: proposal.field,
              before:
                proposal.field === "note"
                  ? "notes" in result.save
                    ? (result.save.notes ?? "")
                    : ""
                  : result.save.title,
              after: proposal.after,
            };
          } else if (proposal.field === "rating") {
            change = {
              ...base,
              field: "rating",
              before:
                "rating" in result.save ? (result.save.rating ?? null) : null,
              after: proposal.after,
            };
          } else if (proposal.field === "trash") {
            change = {
              ...base,
              field: "trash",
              before: "active",
              after: proposal.after === "restore" ? "active" : "trashed",
            };
          } else {
            const after =
              proposal.field === "tags"
                ? normalizeTagList(proposal.after)
                : [...new Set(proposal.after)];
            if (
              proposal.field === "folders" &&
              after.some((id) => !folders.has(id))
            )
              continue;
            change = {
              ...base,
              field: proposal.field,
              before:
                proposal.field === "tags"
                  ? "tags" in result.save
                    ? (result.save.tags ?? [])
                    : []
                  : (currentFolders.get(proposal.saveId) ?? []),
              after,
            };
          }
          if (JSON.stringify(change.before) === JSON.stringify(change.after))
            continue;
          if (changes.size >= ASSISTANT_CHANGE_CAP && !changes.has(change.id))
            continue;
          changes.set(change.id, change);
          accepted.push(change);
        }
        return {
          proposed: accepted.length,
          message:
            "These changes are pending user review. Nothing has been applied.",
        };
      },
    },
  ];
  const proposedOperations = new Map<string, string>();
  tools.push(
    ...deps.pondOperationTools({
      signal: input.signal,
      propose: (request, _description, reason) => {
        const key = JSON.stringify(request);
        const existing = proposedOperations.get(key);
        if (existing) return existing;
        if (changes.size >= ASSISTANT_CHANGE_CAP)
          throw new Error("There are too many pending changes in this reply.");
        const id = ulid();
        changes.set(id, {
          id,
          saveId: "",
          title: reason,
          reason: "",
          status: "pending",
          field: "action",
          action: "runOperation",
          before: null,
          after: request.operation,
          payload: request,
          undoable: false,
        });
        proposedOperations.set(key, id);
        return id;
      },
    }),
  );
  return {
    ...createToolTracker(input.signal, input.onSteps),
    tools,
    results: () => results,
    sources: () => [...sources.values()],
    changes: () => [...changes.values()],
    question: () => question,
  };
}
