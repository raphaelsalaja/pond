import type { Prefs } from "@pond/schema/db";
import type {
  MediaUnderstandInput,
  MediaUnderstandResult,
} from "@shared/query-contracts-system";
import { florenceModelVersion, runFlorence } from "./florence";
import { loadImage } from "./image";

export type MediaUnderstandingTask = MediaUnderstandInput["task"];

type MediaUnderstandingRouterDependencies = {
  florenceModelVersion: () => string;
  runFlorence: (
    task: MediaUnderstandingTask,
    imageUrl: string,
  ) => Promise<string>;
  understandMedia: (
    saveId: string,
    task: MediaUnderstandingTask,
  ) => Promise<MediaUnderstandResult>;
};

type MediaUnderstandingRunInput = {
  saveId: string;
  imageUrl: string;
  task: MediaUnderstandingTask;
  prefs: Prefs["ai"];
};

type MediaUnderstandingText = { text: string; model: string };

class GemmaMediaUnderstandingError extends Error {
  readonly reason: Extract<MediaUnderstandResult, { ok: false }>["reason"];

  constructor(result: Extract<MediaUnderstandResult, { ok: false }>) {
    super(`Local media understanding failed: ${result.reason}`);
    this.name = "GemmaMediaUnderstandingError";
    this.reason = result.reason;
  }
}

const FLORENCE_TASK = {
  caption: "<CAPTION>",
  ocr: "<OCR>",
} as const;

const defaultDependencies: MediaUnderstandingRouterDependencies = {
  florenceModelVersion,
  async runFlorence(task, imageUrl) {
    const image = await loadImage(imageUrl);
    return runFlorence(image, FLORENCE_TASK[task]);
  },
  understandMedia(saveId, task) {
    return window.pond.query("saves.understandMedia", { saveId, task });
  },
};

function gemmaModelVersion(
  task: MediaUnderstandingTask,
  prefs: Prefs["ai"],
): string {
  return `${prefs.mediaUnderstandingProvider}/${prefs.mediaUnderstandingModelId.trim()}:${task}:v1`;
}

function gemmaFailure(result: Extract<MediaUnderstandResult, { ok: false }>) {
  return new GemmaMediaUnderstandingError(result);
}

/** These files cannot be sent to the local model, so a failed attempt must not stay eligible. */
const UNREADABLE_MEDIA = new Set<
  Extract<MediaUnderstandResult, { ok: false }>["reason"]
>(["unsupported_media", "too_large"]);

export function createMediaUnderstandingRouter(
  dependencies: Partial<MediaUnderstandingRouterDependencies> = {},
) {
  const resolved = { ...defaultDependencies, ...dependencies };

  async function runGemma(
    saveId: string,
    task: MediaUnderstandingTask,
  ): Promise<MediaUnderstandingText> {
    const result = await resolved.understandMedia(saveId, task);
    if (!result.ok) throw gemmaFailure(result);
    return { text: result.text, model: result.model };
  }

  async function runFlorencePrimary(
    input: MediaUnderstandingRunInput,
  ): Promise<MediaUnderstandingText> {
    return {
      text: await resolved.runFlorence(input.task, input.imageUrl),
      model: resolved.florenceModelVersion(),
    };
  }

  return {
    primaryModel(task: MediaUnderstandingTask, prefs: Prefs["ai"]): string {
      return prefs.mediaUnderstandingMode === "gemma4"
        ? gemmaModelVersion(task, prefs)
        : resolved.florenceModelVersion();
    },
    async run(
      input: MediaUnderstandingRunInput,
    ): Promise<MediaUnderstandingText> {
      if (input.prefs.mediaUnderstandingMode === "gemma4") {
        try {
          return await runGemma(input.saveId, input.task);
        } catch (error) {
          if (!(error instanceof GemmaMediaUnderstandingError)) throw error;
          if (UNREADABLE_MEDIA.has(error.reason)) {
            return {
              text: "",
              model: gemmaModelVersion(input.task, input.prefs),
            };
          }
          throw error;
        }
      }

      return await runFlorencePrimary(input);
    },
  };
}

export type MediaUnderstandingRouter = ReturnType<
  typeof createMediaUnderstandingRouter
>;

export const mediaUnderstandingRouter = createMediaUnderstandingRouter();
