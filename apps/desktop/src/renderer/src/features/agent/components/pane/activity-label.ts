import { ASSISTANT_ACTIVITY_LABELS as activities } from "@shared/assistant";
import type { AssistantActivity, AssistantToolStep } from "@shared/assistant";

interface StepCopy {
  /** While the tool runs. */
  live: string;
  /** Once it returns and the fish works with the result. */
  after: string;
}

const copy = new Map<string, StepCopy>([
  [
    "Search library",
    {
      live: "Searching your library",
      after: "Looking through the results",
    },
  ],
  [
    "Read Save",
    {
      live: "Reading a Save",
      after: "Thinking about what it read",
    },
  ],
  [
    "Search saved text",
    {
      live: "Searching saved text",
      after: "Looking through the matches",
    },
  ],
  [
    "Library overview",
    {
      live: "Reading your library overview",
      after: "Getting a feel for your library",
    },
  ],
  [
    "Read folders",
    {
      live: "Reading folders",
      after: "Thinking about your folders",
    },
  ],
  [
    "Apply filter",
    {
      live: "Applying filters",
      after: "Checking the filtered view",
    },
  ],
  [
    "Set overlay",
    {
      live: "Updating the view",
      after: "Checking the view",
    },
  ],
  [
    "Cite Saves",
    {
      live: "Collecting references",
      after: "Putting the reply together",
    },
  ],
  [
    "Open Save",
    {
      live: "Opening a Save",
      after: "Looking at the Save",
    },
  ],
  [
    "Find duplicates",
    {
      live: "Finding duplicates",
      after: "Comparing the duplicates",
    },
  ],
  [
    "Describe images",
    {
      live: "Examining images",
      after: "Thinking about the images",
    },
  ],
  [
    "Prepare changes for review",
    {
      live: "Preparing changes for review",
      after: "Double-checking the changes",
    },
  ],
  [
    "Find Pond capabilities",
    {
      live: "Checking what Pond can do",
      after: "Picking the right tool",
    },
  ],
  [
    "Read operation details",
    {
      live: "Checking operation details",
      after: "Planning the next step",
    },
  ],
  [
    "Use Pond",
    {
      live: "Using Pond",
      after: "Checking how it went",
    },
  ],
  [
    "Read operation result",
    {
      live: "Reading operation results",
      after: "Checking how it went",
    },
  ],
  [
    "Set up routine",
    {
      live: "Setting up a routine",
      after: "Checking the routine",
    },
  ],
  [
    "Update routine",
    {
      live: "Updating a routine",
      after: "Checking the routine",
    },
  ],
  [
    "Delete routine",
    {
      live: "Deleting a routine",
      after: "Checking your routines",
    },
  ],
]);

export function currentActivityLabel(
  activity: AssistantActivity,
  steps: ReadonlyArray<AssistantToolStep>,
) {
  const running = steps.findLast((step) => step.status === "running");
  if (running) {
    const label = copy.get(running.label)?.live ?? running.label;
    return running.detail ? `${label}: ${running.detail}` : label;
  }
  if (activity === "writing") return activities.writing;
  const last = steps.findLast((step) => step.status === "complete");
  return (last && copy.get(last.label)?.after) ?? activities[activity];
}
