import { extname } from "node:path";
import type { Prefs } from "@pond/schema/db";
import log from "electron-log/main.js";
import { MediaUnderstandInputSchema } from "../../../shared/query-contracts-system";
import {
  isAuxiliaryKind,
  isOriginalImageKind,
  POSTER_KIND,
} from "../../../shared/save-file-names";
import { keyFor, listProviderModels } from "../../core/agent/keys";
import { connectionFor } from "../../core/agent/provider-models";
import { visionEnabled } from "../../core/agent/vision";
import {
  createMediaUnderstanding,
  MediaUnderstandingError,
} from "../../core/media-understanding";
import type {
  MediaUnderstanding,
  MediaUnderstandingFailureReason,
} from "../../core/media-understanding";
import { getPrefs } from "../../core/prefs";
import {
  libraryMediaMetadata,
  readLibraryMedia,
} from "../../core/storage/library-media-storage";
import { resolvePickedSaveFilePath } from "../helpers";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_MIME = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const QUERY_FAILURE_REASON = {
  "invalid-input": "invalid_input",
  aborted: "aborted",
  timeout: "timeout",
  "model-unavailable": "model_unavailable",
  "generation-failed": "generation_failed",
  "empty-output": "empty_output",
  "model-chatter": "model_chatter",
  "output-too-long": "output_too_long",
} as const satisfies Record<MediaUnderstandingFailureReason, string>;

type LocalProvider = "ollama" | "lmstudio";

type MediaUnderstandingQueryDependencies = {
  getPrefs: () => Promise<Pick<Prefs, "agent" | "ai">>;
  keyFor: typeof keyFor;
  libraryMediaMetadata: typeof libraryMediaMetadata;
  listProviderModels: typeof listProviderModels;
  readLibraryMedia: typeof readLibraryMedia;
  resolvePickedSaveFilePath: typeof resolvePickedSaveFilePath;
  service: MediaUnderstanding;
};

const defaultDependencies: MediaUnderstandingQueryDependencies = {
  getPrefs,
  keyFor,
  libraryMediaMetadata,
  listProviderModels,
  readLibraryMedia,
  resolvePickedSaveFilePath,
  service: createMediaUnderstanding(),
};

/** Locally imported images can carry a non-image kind, so a supported extension also marks an original image. */
function isOriginalImage(file: { kind: string; path: string }): boolean {
  if (isAuxiliaryKind(file.kind)) return false;
  return (
    isOriginalImageKind(file.kind) ||
    IMAGE_MIME.has(extname(file.path).toLowerCase())
  );
}

/**
 * Harvested Saves often list an avatar, thumbnail, or article body before the
 * post's media, so file 0 is not the picture. Read the first original image,
 * then a video's poster. With neither, file 0 keeps the failure that explains
 * why the Save has nothing to read.
 */
function pickMediaUnderstandingFile(
  files: ReadonlyArray<{ kind: string; path: string }>,
): number {
  const image = files.findIndex(isOriginalImage);
  if (image !== -1) return image;
  const poster = files.findIndex((file) => file.kind === POSTER_KIND);
  return poster === -1 ? 0 : poster;
}

function localProvider(value: string): LocalProvider | null {
  if (value === "ollama" || value === "lmstudio") return value;
  return null;
}

async function resolveConnection(
  dependencies: MediaUnderstandingQueryDependencies,
): Promise<
  | {
      ok: true;
      connection: {
        provider: LocalProvider;
        modelId: string;
        apiKey: string | null;
        baseUrl?: string;
      };
    }
  | { ok: false; reason: "model_unavailable" | "model_not_vision" }
> {
  const prefs = await dependencies.getPrefs();
  const provider = localProvider(prefs.ai.mediaUnderstandingProvider);
  if (!provider) return { ok: false, reason: "model_unavailable" };

  const modelId = prefs.ai.mediaUnderstandingModelId.trim();
  if (!modelId) return { ok: false, reason: "model_unavailable" };
  const configured = connectionFor(
    provider,
    {
      ollamaBaseUrl: prefs.agent.ollamaBaseUrl,
      lmstudioBaseUrl: prefs.agent.lmstudioBaseUrl,
    },
    modelId,
  );

  const listed = await dependencies.listProviderModels(provider);
  const model = listed.models.find(
    (candidate) => candidate.id === modelId && candidate.available !== false,
  );
  if (!model) return { ok: false, reason: "model_unavailable" };
  if (!visionEnabled(model)) return { ok: false, reason: "model_not_vision" };

  return {
    ok: true,
    connection: {
      provider,
      modelId,
      apiKey: await dependencies.keyFor(provider),
      baseUrl: configured.baseUrl,
    },
  };
}

export function createMediaUnderstandingQueries(
  dependencies: Partial<MediaUnderstandingQueryDependencies> = {},
) {
  const resolved = { ...defaultDependencies, ...dependencies };
  return {
    "saves.understandMedia": query(
      MediaUnderstandInputSchema,
      async ({ saveId, task }) => {
        const target = await resolved.resolvePickedSaveFilePath(
          saveId,
          pickMediaUnderstandingFile,
        );
        if (!target.ok) return target;

        const mimeType = IMAGE_MIME.get(extname(target.path).toLowerCase());
        if (!mimeType) {
          return { ok: false as const, reason: "unsupported_media" as const };
        }

        let bytes: Buffer;
        try {
          const metadata = await resolved.libraryMediaMetadata(target.path);
          if (metadata.originalSize > MAX_IMAGE_BYTES) {
            return { ok: false as const, reason: "too_large" as const };
          }
          bytes = await resolved.readLibraryMedia(target.path);
        } catch (error) {
          log.warn("[pond ipc] saves.understandMedia could not read media", {
            saveId,
            error,
          });
          return { ok: false as const, reason: "read_failed" as const };
        }
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          return { ok: false as const, reason: "too_large" as const };
        }

        let connection: Awaited<ReturnType<typeof resolveConnection>>;
        try {
          connection = await resolveConnection(resolved);
        } catch (error) {
          log.warn("[pond ipc] saves.understandMedia model discovery failed", {
            saveId,
            error,
          });
          return { ok: false as const, reason: "model_unavailable" as const };
        }
        if (!connection.ok) return connection;

        try {
          const result = await resolved.service[task]({
            mimeType,
            bytes,
            signal: new AbortController().signal,
            connection: connection.connection,
          });
          return { ok: true as const, ...result };
        } catch (error) {
          if (error instanceof MediaUnderstandingError) {
            const failed = {
              ok: false as const,
              reason: QUERY_FAILURE_REASON[error.reason],
            };
            return error.operationalMetric
              ? { ...failed, operation: error.operationalMetric }
              : failed;
          }
          log.warn("[pond ipc] saves.understandMedia failed", {
            saveId,
            task,
            outcome: "unexpected_error",
          });
          return { ok: false as const, reason: "internal_error" as const };
        }
      },
    ),
  } satisfies QueryHandlerMap;
}

export const mediaUnderstandingQueries = createMediaUnderstandingQueries();
