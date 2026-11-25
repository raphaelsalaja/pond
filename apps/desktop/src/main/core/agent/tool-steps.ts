import type {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from "ai";
import { z } from "zod";
import type { AssistantToolStep } from "../../../shared/assistant";
import { sourceExcerpt } from "../../../shared/assistant-text";

const labels = new Map<string, string>(
  Object.entries({
    searchLibrary: "Search library",
    readSave: "Read Save",
    grepLibrary: "Search saved text",
    libraryOverview: "Library overview",
    listFolders: "Read folders",
    applyFilter: "Apply filter",
    setOverlay: "Set overlay",
    citeSaves: "Cite Saves",
    openSave: "Open Save",
    findDuplicates: "Find duplicates",
    describeSaves: "Describe images",
    proposeChanges: "Prepare changes for review",
    discoverPondOperations: "Find Pond capabilities",
    describePondOperation: "Read operation details",
    runPondOperation: "Use Pond",
    readPondOperationResult: "Read operation result",
    createRoutine: "Set up routine",
    updateRoutine: "Update routine",
    deleteRoutine: "Delete routine",
  }),
);

export function createToolTracker(
  signal: AbortSignal,
  onSteps?: (steps: Array<AssistantToolStep>) => void,
) {
  let steps: Array<AssistantToolStep> = [];
  const update = (id: string, value: Partial<AssistantToolStep>) => {
    steps = steps.map((step) =>
      step.id === id ? { ...step, ...value } : step,
    );
    onSteps?.(steps);
  };
  const finishPending = () => {
    steps = steps.map((step) =>
      step.status === "running"
        ? { ...step, status: signal.aborted ? "stopped" : "error" }
        : step,
    );
    onSteps?.(steps);
  };
  const onToolExecutionStart: OnToolExecutionStartCallback = (event) => {
    signal.throwIfAborted();
    const toolName = event.toolCall.toolName;
    const label = labels.get(toolName);
    if (!label) return;
    const args = z
      .object({ query: z.string().catch("Recent Saves") })
      .catch({ query: "Recent Saves" })
      .parse(event.toolCall.input);
    steps = [
      ...steps,
      {
        id: event.toolCall.toolCallId,
        label,
        detail:
          toolName === "searchLibrary"
            ? sourceExcerpt(args.query, 150)
            : undefined,
        status: "running",
      },
    ];
    onSteps?.(steps);
  };
  const onToolExecutionEnd: OnToolExecutionEndCallback = (event) => {
    update(event.toolCall.toolCallId, {
      status: signal.aborted
        ? "stopped"
        : event.toolOutput.type === "tool-result"
          ? "complete"
          : "error",
      elapsedMs: event.toolExecutionMs,
    });
  };
  return {
    steps: () => steps,
    onToolExecutionStart,
    onToolExecutionEnd,
    finishPending,
  };
}
