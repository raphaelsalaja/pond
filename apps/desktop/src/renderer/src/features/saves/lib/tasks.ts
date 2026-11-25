import type { Prefs } from "@pond/schema/db";
import {
  autoTag,
  backfillColors,
  backfillMetadata,
  DISABLED_HINTS,
  rebuildVisualIndex,
  recaption,
  reclassifySensitiveContent,
  reembed,
  reocr,
  retranscribe,
  runEnrichment,
  TASK_ENABLED,
} from "@/features/enrichment";
import type { TaskResult, TaskScope } from "@/features/enrichment";

type TaskGroup = "tagging" | "enrichment" | "reprocess";

interface LibraryTask {
  id: string;
  label: string;
  description: string;
  action: string;
  group: TaskGroup;
  keywords: Array<string>;
  selectable: boolean;
  precondition?: (prefs: Prefs | null) => string | null;
  run: (ids?: TaskScope) => TaskResult | Promise<TaskResult>;
}

function gate(
  key: keyof typeof TASK_ENABLED,
): (prefs: Prefs | null) => string | null {
  return (prefs) => (TASK_ENABLED[key](prefs) ? null : DISABLED_HINTS[key]);
}

const TASKS: ReadonlyArray<LibraryTask> = [
  {
    id: "auto-tag",
    label: "Apply Suggested Tags",
    description: "Apply each item's suggested tags.",
    action: "Apply",
    group: "tagging",
    keywords: ["autotag", "tag", "tags"],
    selectable: true,
    run: autoTag,
  },
  {
    id: "run-enrichment",
    label: "Run Enrichment",
    description: "Retry failed runs and process new items.",
    action: "Run",
    group: "enrichment",
    keywords: ["enrich", "sweep", "run"],
    selectable: false,
    run: runEnrichment,
  },
  {
    id: "backfill-colors",
    label: "Backfill Colors",
    description: "Fill missing colors and cover placeholders.",
    action: "Run",
    group: "enrichment",
    keywords: ["colors", "colours", "palette"],
    selectable: false,
    run: backfillColors,
  },
  {
    id: "backfill-metadata",
    label: "Extract Media Metadata",
    description: "Fill missing camera, EXIF, and media details.",
    action: "Run",
    group: "enrichment",
    keywords: ["camera", "exif", "codec", "metadata"],
    selectable: false,
    run: backfillMetadata,
  },
  {
    id: "caption",
    label: "Caption Images",
    description: "Write new captions for every image.",
    action: "Re-run",
    group: "reprocess",
    keywords: ["caption", "alt", "describe"],
    selectable: true,
    precondition: gate("caption"),
    run: recaption,
  },
  {
    id: "ocr",
    label: "Extract Text",
    description: "Read text from images again.",
    action: "Re-run",
    group: "reprocess",
    keywords: ["ocr", "text"],
    selectable: true,
    precondition: gate("ocr"),
    run: reocr,
  },
  {
    id: "transcribe",
    label: "Transcribe Media",
    description: "Transcribe audio and video again.",
    action: "Re-run",
    group: "reprocess",
    keywords: ["transcribe", "transcript", "whisper", "subtitle"],
    selectable: true,
    precondition: gate("transcribe"),
    run: retranscribe,
  },
  {
    id: "re-embed",
    label: "Rebuild Search Index",
    description: "Rebuild so search ranks by meaning again.",
    action: "Rebuild",
    group: "reprocess",
    keywords: ["embed", "embeddings", "semantic", "reindex"],
    selectable: true,
    precondition: gate("reembed"),
    run: reembed,
  },
  {
    id: "rebuild-visual",
    label: "Rebuild Visual Index",
    description: "Rebuild so similar images match again.",
    action: "Rebuild",
    group: "reprocess",
    keywords: ["clip", "visual", "similarity"],
    selectable: true,
    precondition: gate("clip"),
    run: rebuildVisualIndex,
  },
  {
    id: "sensitive-content",
    label: "Check Sensitive Content",
    description: "Check image and video content again.",
    action: "Re-run",
    group: "reprocess",
    keywords: ["sensitive", "nsfw", "safety"],
    selectable: true,
    precondition: gate("sensitiveContent"),
    run: reclassifySensitiveContent,
  },
];

export function selectableTasks(): Array<LibraryTask> {
  return TASKS.filter((t) => t.selectable);
}
