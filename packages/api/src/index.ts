import {
  ApiAppInfoSchema,
  ApiEditResultSchema,
  ApiEnqueueResultSchema,
  ApiErrorBodySchema,
  ApiErrorSchema,
  ApiFolderSchema,
  ApiJsonSchema,
  ApiLibraryInfoSchema,
  ApiLibrarySchema,
  ApiOperationPreviewSchema,
  ApiOperationSchema,
  ApiQueryPageSchema,
  ApiSaveSchema,
  ApiSaveStateSchema,
  ApiSaveTextSchema,
  ApiSearchResultSchema,
  ApiSourceSchema,
  ApiSwitchResultSchema,
  ApiTagSchema,
  ApiViewSchema,
  apiSuccessSchema,
} from "@pond/schema/api";
import type { EnqueueRequest } from "@pond/schema/ingest";
import type { JsonObject, JsonValue } from "@pond/schema/json";

export type {
  ApiAppInfo,
  ApiCursor,
  ApiEditFoldersRequest,
  ApiEditTagsRequest,
  ApiErrorCode,
  ApiFolder,
  ApiLibrary,
  ApiLibraryInfo,
  ApiLibraryQueryInput,
  ApiQueryPage,
  ApiSave,
  ApiSaveState,
  ApiSavesGetParams,
  ApiSaveText,
  ApiSearchRequest,
  ApiSource,
  ApiTag,
  ApiThumbnailSize,
  ApiView,
} from "@pond/schema/api";
export {
  API_ERROR_CODES,
  API_SAVE_STATUSES,
  API_THUMBNAIL_SIZES,
  API_VERSION,
} from "@pond/schema/api";
export type { JsonObject, JsonValue } from "@pond/schema/json";
export {
  hostToSource,
  SOURCES,
  type Source,
  sourceLabel,
} from "@pond/schema/source-ids";

import type {
  ApiEditFoldersRequest,
  ApiEditTagsRequest,
  ApiFavoriteRequest,
  ApiLibraryQueryInput,
  ApiNoteRequest,
  ApiOperationRunRequest,
  ApiRatingRequest,
  ApiSaveIdsRequest,
  ApiSavesGetParams,
  ApiSearchRequest,
  ApiSwitchLibraryRequest,
  ApiThumbnailSize,
} from "@pond/schema/api";

type ApiRequestBody =
  | ApiEditFoldersRequest
  | ApiEditTagsRequest
  | ApiFavoriteRequest
  | ApiLibraryQueryInput
  | ApiNoteRequest
  | ApiOperationRunRequest
  | ApiRatingRequest
  | ApiSaveIdsRequest
  | ApiSavesGetParams
  | ApiSearchRequest
  | ApiSwitchLibraryRequest
  | EnqueueRequest
  | JsonObject;

interface Schema<Output> {
  safeParse(
    value: JsonValue,
  ): { success: true; data: Output } | { success: false };
}

interface ApiHeaders {
  [key: string]: string;
  "content-type": string;
}

export interface ApiBinary {
  type: string;
  bytes: Uint8Array;
  etag: string | null;
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) search.set(key, String(value));
  return search.toString();
}

export type ApiFailure =
  | "authentication"
  | "connection"
  | "conflict"
  | "internal"
  | "invalid"
  | "not-found"
  | "response";

export class PondApiError extends Error {
  readonly kind: ApiFailure;
  readonly status?: number;
  /** Stable machine-readable reason. Absent for connection failures and Pond before 2.1. */
  readonly code?: string;

  constructor(
    message: string,
    kind: ApiFailure,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "PondApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface PondApiOptions {
  baseUrl?: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
  ensureAvailable?: () => void | Promise<void>;
  allowRemote?: boolean;
}

function endpoint(value: string, allowRemote: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PondApiError("Enter a valid Local API URL.", "connection");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "http:" || (!loopback && !allowRemote)) {
    throw new PondApiError(
      "The Local API URL must use loopback HTTP.",
      "connection",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

function failureKind(status: number, code?: string): ApiFailure {
  if (code === "invalid_json" || code === "invalid_request") return "invalid";
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "not-found";
  if (status === 409 || status === 422 || status === 429) return "conflict";
  return status >= 500 ? "internal" : "response";
}

export class PondApi {
  readonly baseUrl: string;
  private readonly token: () => string | Promise<string> | undefined;
  private readonly fetcher: typeof fetch;
  private readonly ensureAvailable?: () => void | Promise<void>;

  constructor(options: PondApiOptions = {}) {
    this.baseUrl = endpoint(
      options.baseUrl ?? "http://127.0.0.1:41610/api/v2",
      options.allowRemote ?? false,
    );
    if (options.token instanceof Function) {
      this.token = options.token;
    } else {
      const token = options.token;
      this.token = () => token;
    }
    this.fetcher = options.fetch ?? fetch;
    this.ensureAvailable = options.ensureAvailable;
  }

  private async authorization(): Promise<string | undefined> {
    const token = await this.token();
    return token ? `Bearer ${token}` : undefined;
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureAvailable?.();
    const authorization = await this.authorization();
    const headers: ApiHeaders = {
      "content-type": "application/json",
    };
    if (authorization) headers.authorization = authorization;
    Object.assign(headers, Object.fromEntries(new Headers(init.headers)));
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new PondApiError(
        error instanceof Error ? error.message : "Pond is unavailable.",
        "connection",
      );
    }
  }

  private async failure(response: Response): Promise<PondApiError> {
    const decoded = ApiJsonSchema.safeParse(
      await response.json().catch(() => null),
    );
    const parsed = ApiErrorSchema.safeParse(
      decoded.success ? decoded.data : null,
    );
    const body = ApiErrorBodySchema.safeParse(
      parsed.success ? parsed.data.error : null,
    );
    if (body.success)
      return new PondApiError(
        body.data.message,
        failureKind(response.status, body.data.code),
        response.status,
        body.data.code,
      );
    const message = parsed.success
      ? Object(parsed.data.error) === parsed.data.error
        ? (JSON.stringify(parsed.data.error) ?? String(parsed.data.error))
        : String(parsed.data.error)
      : `Pond returned ${response.status}.`;
    return new PondApiError(
      message,
      failureKind(response.status),
      response.status,
    );
  }

  async request<Output>(
    path: string,
    schema: Schema<Output>,
    init: RequestInit = {},
  ): Promise<Output> {
    const response = await this.send(path, init);
    if (!response.ok) throw await this.failure(response);
    const decoded = ApiJsonSchema.safeParse(
      await response.json().catch(() => null),
    );
    const payload = decoded.success ? decoded.data : null;
    const envelope = apiSuccessSchema(ApiJsonSchema).safeParse(payload);
    if (!envelope.success)
      throw new PondApiError(
        "Pond returned an unexpected response.",
        "response",
        response.status,
      );
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success)
      throw new PondApiError(
        "Pond returned an unexpected response.",
        "response",
        response.status,
      );
    return parsed.data;
  }

  private post<Output>(
    path: string,
    schema: Schema<Output>,
    body: ApiRequestBody,
  ) {
    return this.request(path, schema, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async binary(path: string): Promise<ApiBinary> {
    const response = await this.send(path);
    if (!response.ok) throw await this.failure(response);
    return {
      type: response.headers.get("content-type") ?? "application/octet-stream",
      bytes: new Uint8Array(await response.arrayBuffer()),
      etag: response.headers.get("etag"),
    };
  }

  appInfo() {
    return this.request("/app/info", ApiAppInfoSchema);
  }

  libraryInfo() {
    return this.request("/library/info", ApiLibraryInfoSchema);
  }

  libraries() {
    return this.request("/library/recent", ApiLibrarySchema.array());
  }

  switchLibrary(path: string) {
    return this.post("/library/switch", ApiSwitchResultSchema, { path });
  }

  query(input: ApiLibraryQueryInput) {
    return this.post("/library/query", ApiQueryPageSchema, input);
  }

  search(input: ApiSearchRequest) {
    return this.post("/library/search", ApiSearchResultSchema, input);
  }

  tags() {
    return this.request("/library/tags", ApiTagSchema.array());
  }

  folders() {
    return this.request("/library/folders", ApiFolderSchema.array());
  }

  views() {
    return this.request("/library/views", ApiViewSchema.array());
  }

  sources() {
    return this.request("/library/sources", ApiSourceSchema.array());
  }

  saves(input: ApiSavesGetParams) {
    return this.post("/saves/get", ApiSaveSchema.array(), input);
  }

  save(id: string) {
    return this.request(`/saves/info?${params({ id })}`, ApiSaveSchema);
  }

  text(id: string) {
    return this.request(`/saves/text?${params({ id })}`, ApiSaveTextSchema);
  }

  related(id: string, limit?: number) {
    return this.request(
      `/saves/related?${params({ id, limit })}`,
      ApiSaveSchema.array(),
    );
  }

  status(ids: readonly string[]) {
    return this.request(
      `/saves/status?${params({ ids: ids.join(",") })}`,
      ApiSaveStateSchema.array(),
    );
  }

  /** Resolves `null` when the Save has no image cover. */
  async thumbnail(
    id: string,
    size: ApiThumbnailSize = "original",
  ): Promise<ApiBinary | null> {
    try {
      const thumbnail = await this.binary(
        `/saves/thumb?${params({ id, size })}`,
      );
      if (!thumbnail.type.startsWith("image/"))
        throw new PondApiError(
          "Pond returned an unexpected response.",
          "response",
        );
      return thumbnail;
    } catch (error) {
      if (error instanceof PondApiError && error.code === "no_thumbnail")
        return null;
      if (
        error instanceof PondApiError &&
        error.code === undefined &&
        error.status === 404
      )
        return null;
      throw error;
    }
  }

  file(id: string, index = 0) {
    return this.binary(`/saves/file?${params({ id, index })}`);
  }

  enqueue(input: EnqueueRequest) {
    return this.post("/enqueue", ApiEnqueueResultSchema, input);
  }

  editTags(input: ApiEditTagsRequest) {
    return this.post("/saves/tags", ApiEditResultSchema, input);
  }

  editFolders(input: ApiEditFoldersRequest) {
    return this.post("/saves/folders", ApiEditResultSchema, input);
  }

  trash(ids: readonly string[], libraryId?: string) {
    return this.post("/saves/trash", ApiEditResultSchema, {
      ids: [...ids],
      libraryId,
    });
  }

  restore(ids: readonly string[], libraryId?: string) {
    return this.post("/saves/restore", ApiEditResultSchema, {
      ids: [...ids],
      libraryId,
    });
  }

  setNote(id: string, note: string | null, libraryId?: string) {
    return this.post("/saves/note", ApiEditResultSchema, {
      id,
      note,
      libraryId,
    });
  }

  setRating(ids: readonly string[], rating: number, libraryId?: string) {
    return this.post("/saves/rating", ApiEditResultSchema, {
      ids: [...ids],
      rating,
      libraryId,
    });
  }

  setFavorite(ids: readonly string[], favorite: boolean, libraryId?: string) {
    return this.post("/saves/favorite", ApiEditResultSchema, {
      ids: [...ids],
      favorite,
      libraryId,
    });
  }

  operations() {
    return this.request("/operations", ApiOperationSchema.array());
  }

  previewOperation(operation: string, args: JsonObject) {
    return this.post("/operations/preview", ApiOperationPreviewSchema, {
      operation,
      arguments: args,
    });
  }

  runOperation(operation: string, args: JsonObject, token?: string) {
    return this.post("/operations/run", ApiJsonSchema, {
      operation,
      arguments: args,
      token,
    });
  }

  conversionCapabilities() {
    return this.request("/library/conversion/capabilities", ApiJsonSchema);
  }

  conversionPresets() {
    return this.request("/library/conversion/presets", ApiJsonSchema);
  }

  saveConversionPreset(preset: JsonObject) {
    return this.post("/library/conversion/presets", ApiJsonSchema, preset);
  }

  startConversion(input: JsonObject) {
    return this.post("/library/conversion/start", ApiJsonSchema, input);
  }

  compressImages(input: JsonObject) {
    return this.post("/library/conversion/compress", ApiJsonSchema, input);
  }

  conversion(id: string) {
    return this.request(
      `/library/conversion/${encodeURIComponent(id)}`,
      ApiJsonSchema,
    );
  }

  cancelConversion(id: string) {
    return this.post(
      `/library/conversion/${encodeURIComponent(id)}/cancel`,
      ApiJsonSchema,
      {},
    );
  }
}
