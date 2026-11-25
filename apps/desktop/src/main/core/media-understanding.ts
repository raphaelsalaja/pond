import type { LanguageModel, ModelMessage } from "ai";
import log from "electron-log/main.js";
import type {
  MediaUnderstandOperationalMetric,
  MediaUnderstandFailureReason as MediaUnderstandOutcomeFailure,
} from "../../shared/query-contracts-system";
import { loadModel } from "./agent/adapter";
import {
  LocalRuntimeCoordinationError,
  localRuntimeCoordinator,
} from "./agent/local-runtime-coordinator";
import type { LocalRuntimeCoordinator } from "./agent/local-runtime-coordinator";

export type MediaUnderstandingTask = "caption" | "ocr";

export type LocalMediaModelConnection = {
  provider: "ollama" | "lmstudio";
  modelId: string;
  apiKey: string | null;
  baseUrl?: string;
};

export interface MediaImageRequest {
  mimeType: string;
  bytes: Uint8Array;
  signal: AbortSignal;
  connection: LocalMediaModelConnection;
}

export interface MediaTextResult {
  text: string;
  model: string;
}

export interface MediaUnderstanding {
  caption(input: MediaImageRequest): Promise<MediaTextResult>;
  ocr(input: MediaImageRequest): Promise<MediaTextResult>;
}

export type MediaUnderstandingFailureReason =
  | "invalid-input"
  | "aborted"
  | "timeout"
  | "model-unavailable"
  | "generation-failed"
  | "empty-output"
  | "model-chatter"
  | "output-too-long";

const failureMessages = {
  "invalid-input": "The image request is invalid.",
  aborted: "Image understanding was canceled.",
  timeout: "Image understanding took too long.",
  "model-unavailable": "The selected local model is unavailable.",
  "generation-failed": "The local model could not understand the image.",
  "empty-output": "The local model returned an empty caption.",
  "model-chatter": "The local model returned commentary instead of the result.",
  "output-too-long": "The local model returned more text than allowed.",
} satisfies Record<MediaUnderstandingFailureReason, string>;

export class MediaUnderstandingError extends Error {
  readonly reason: MediaUnderstandingFailureReason;
  readonly task: MediaUnderstandingTask;
  operationalMetric?: MediaUnderstandingOperationalMetric;

  constructor(
    reason: MediaUnderstandingFailureReason,
    task: MediaUnderstandingTask,
  ) {
    super(failureMessages[reason]);
    this.name = "MediaUnderstandingError";
    this.reason = reason;
    this.task = task;
  }
}

type LocalReasoningOptions = {
  ollama?: { reasoningEffort: "none" };
  lmstudio?: { reasoningEffort: "none" };
};

export interface MediaUnderstandingGenerationInput {
  model: LanguageModel;
  messages: Array<ModelMessage>;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
  providerOptions?: LocalReasoningOptions;
}

export type MediaUnderstandingOperationalMetric =
  MediaUnderstandOperationalMetric;

export interface MediaUnderstandingMetricsSink {
  record(metric: MediaUnderstandingOperationalMetric): void;
}

type MediaUnderstandingDependencies = {
  loadModel: typeof loadModel;
  generateText: (
    input: MediaUnderstandingGenerationInput,
  ) => Promise<{ text: string }>;
  coordinator: LocalRuntimeCoordinator;
  metrics: MediaUnderstandingMetricsSink;
  now: () => number;
  timeoutMs: number;
};

const MEDIA_UNDERSTANDING_TIMEOUT_MS = 2 * 60_000;
const MAX_METRIC_MODEL_ID_CHARACTERS = 200;
const MAX_METRIC_DURATION_MS = 10 * 60_000;
const MAX_METRIC_IMAGE_BYTES = 25 * 1024 * 1024;

const CAPTION_PROMPT =
  "Describe the image in exactly one factual sentence. State only visible facts. Do not add a preamble and do not guess anyone's identity.";
const OCR_PROMPT =
  "Transcribe only the visible text verbatim in reading order. Preserve line breaks. Return an empty response when no text is visible. Do not add a preamble or commentary.";

const TASK_CONFIG = {
  caption: {
    prompt: CAPTION_PROMPT,
    maxOutputTokens: 96,
    maxCharacters: 500,
  },
  ocr: {
    prompt: OCR_PROMPT,
    maxOutputTokens: 2048,
    maxCharacters: 16_000,
  },
} satisfies Record<
  MediaUnderstandingTask,
  { prompt: string; maxOutputTokens: number; maxCharacters: number }
>;

const CAPTION_CHATTER =
  /^(?:sure\b|certainly\b|of course\b|here(?:'s| is)\b|caption\s*:|i (?:can )?see\b|the image (?:shows|depicts|contains)\b|this image (?:shows|depicts|contains)\b)/i;
const OCR_CHATTER =
  /^(?:sure\b|certainly\b|of course\b|here(?:'s| is) (?:the )?(?:visible |extracted )?text\b|ocr\s*:|transcription\s*:|no (?:visible )?text\b)/i;

const defaultDependencies: MediaUnderstandingDependencies = {
  loadModel,
  /** The AI SDK is large and only needed once a local model runs; keep it off the launch path. */
  async generateText(input) {
    const { generateText } = await import("ai");
    return generateText(input);
  },
  coordinator: localRuntimeCoordinator,
  metrics: {
    record(metric) {
      log.info("[pond media] local understanding", metric);
    },
  },
  now: () => performance.now(),
  timeoutMs: MEDIA_UNDERSTANDING_TIMEOUT_MS,
};

function failure(
  reason: MediaUnderstandingFailureReason,
  task: MediaUnderstandingTask,
): MediaUnderstandingError {
  return new MediaUnderstandingError(reason, task);
}

/** Ollama puts the caption in reasoning and leaves content empty when thinking uses the token budget. */
function localReasoningOptions(
  provider: LocalMediaModelConnection["provider"],
): LocalReasoningOptions {
  if (provider === "ollama") return { ollama: { reasoningEffort: "none" } };
  return { lmstudio: { reasoningEffort: "none" } };
}

function validateRequest(
  task: MediaUnderstandingTask,
  input: MediaImageRequest,
): string {
  if (input.signal.aborted) throw failure("aborted", task);
  const mimeType = input.mimeType.trim().toLowerCase();
  if (
    !mimeType.startsWith("image/") ||
    input.bytes.byteLength === 0 ||
    !input.connection.modelId.trim()
  ) {
    throw failure("invalid-input", task);
  }
  return mimeType;
}

function cleanOutput(task: MediaUnderstandingTask, output: string): string {
  const config = TASK_CONFIG[task];
  const text = output.replaceAll(/\r\n?/g, "\n").trim();
  if (!text) {
    if (task === "ocr") return "";
    throw failure("empty-output", task);
  }
  if (text.length > config.maxCharacters) {
    throw failure("output-too-long", task);
  }
  const chatter = task === "caption" ? CAPTION_CHATTER : OCR_CHATTER;
  if (chatter.test(text)) throw failure("model-chatter", task);
  return text;
}

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(value)));
}

function recordMetric(
  dependencies: MediaUnderstandingDependencies,
  input: MediaImageRequest,
  task: MediaUnderstandingTask,
  startedAt: number,
  cold: boolean,
  outcome: MediaUnderstandingOperationalMetric["outcome"],
): MediaUnderstandingOperationalMetric {
  const metric: MediaUnderstandingOperationalMetric = {
    modelId: input.connection.modelId.slice(0, MAX_METRIC_MODEL_ID_CHARACTERS),
    task,
    temperature: cold ? "cold" : "warm",
    durationMs: boundedInteger(
      dependencies.now() - startedAt,
      MAX_METRIC_DURATION_MS,
    ),
    imageBytes: boundedInteger(input.bytes.byteLength, MAX_METRIC_IMAGE_BYTES),
    outcome,
    fallbackUsed: false,
  };
  try {
    dependencies.metrics.record(metric);
  } catch {
    /** Operational metrics must never affect image understanding. */
  }
  return metric;
}

const METRIC_FAILURE_CODE = {
  "invalid-input": "invalid_input",
  aborted: "aborted",
  timeout: "timeout",
  "model-unavailable": "model_unavailable",
  "generation-failed": "generation_failed",
  "empty-output": "empty_output",
  "model-chatter": "model_chatter",
  "output-too-long": "output_too_long",
} as const satisfies Record<
  MediaUnderstandingFailureReason,
  MediaUnderstandOutcomeFailure
>;

function asMediaUnderstandingError(
  error: Error,
  task: MediaUnderstandingTask,
): MediaUnderstandingError {
  if (error instanceof MediaUnderstandingError) {
    return error;
  }
  if (error instanceof LocalRuntimeCoordinationError) {
    return failure(error.reason, task);
  }
  return failure("generation-failed", task);
}

async function executeTask(
  task: MediaUnderstandingTask,
  input: MediaImageRequest,
  dependencies: MediaUnderstandingDependencies,
): Promise<MediaTextResult> {
  const mimeType = validateRequest(task, input);
  const { connection } = input;
  let model: LanguageModel | null;
  try {
    model = await dependencies.loadModel({
      provider: connection.provider,
      model: connection.modelId,
      apiKey: connection.apiKey,
      baseUrl: connection.baseUrl,
    });
  } catch {
    if (input.signal.aborted) throw failure("aborted", task);
    throw failure("model-unavailable", task);
  }
  if (input.signal.aborted) throw failure("aborted", task);
  if (!model) throw failure("model-unavailable", task);

  const config = TASK_CONFIG[task];
  let text: string;
  try {
    const result = await dependencies.generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: input.bytes, mediaType: mimeType },
            { type: "text", text: config.prompt },
          ],
        },
      ],
      maxOutputTokens: config.maxOutputTokens,
      abortSignal: input.signal,
      providerOptions: localReasoningOptions(connection.provider),
    });
    text = result.text;
  } catch {
    if (input.signal.aborted) throw failure("aborted", task);
    throw failure("generation-failed", task);
  }
  if (input.signal.aborted) throw failure("aborted", task);

  return {
    text: cleanOutput(task, text),
    model: `${connection.provider}/${connection.modelId}:${task}:v1`,
  };
}

async function runTask(
  task: MediaUnderstandingTask,
  input: MediaImageRequest,
  dependencies: MediaUnderstandingDependencies,
): Promise<MediaTextResult> {
  validateRequest(task, input);
  const startedAt = dependencies.now();
  let cold = true;
  try {
    const result = await dependencies.coordinator.run(
      {
        runtime: {
          provider: input.connection.provider,
          baseUrl: input.connection.baseUrl,
        },
        priority: "background",
        signal: input.signal,
        timeoutMs: dependencies.timeoutMs,
      },
      (execution) => {
        cold = execution.cold;
        return executeTask(
          task,
          { ...input, signal: execution.signal },
          dependencies,
        );
      },
    );
    recordMetric(dependencies, input, task, startedAt, cold, "ok");
    return result;
  } catch (error) {
    const normalized = asMediaUnderstandingError(
      error instanceof Error ? error : new Error(String(error)),
      task,
    );
    normalized.operationalMetric = recordMetric(
      dependencies,
      input,
      task,
      startedAt,
      cold,
      METRIC_FAILURE_CODE[normalized.reason],
    );
    throw normalized;
  }
}

export function createMediaUnderstanding(
  dependencies: Partial<MediaUnderstandingDependencies> = {},
): MediaUnderstanding {
  const resolved = { ...defaultDependencies, ...dependencies };
  return {
    caption: (input) => runTask("caption", input, resolved),
    ocr: (input) => runTask("ocr", input, resolved),
  };
}
