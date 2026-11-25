import type { Query } from "@pond/schema/filters/types";
import type { RawJson } from "@pond/schema/raw";
import type { LibraryQueryPage, LibraryQueryRequest } from "./library-query";
import type { EmptyInput, OkResult } from "./query-contracts-shared";
import type {
  SavesFileInput,
  SavesIdInput,
  SavesIdsInput,
  SavesRetrievalInput,
} from "./saves-contracts-shared";
import type { LibrarySidebarCounts } from "./sidebar-counts";
import type { SplitPostSummary } from "./split-posts";
import type { WireSave } from "./wire";

export interface SavesReadQueryInputs {
  "saves.sidebarCounts": { recentIds?: Array<string> };
  "saves.queryPage": LibraryQueryRequest;
  "saves.queryIds": LibraryQueryRequest;
  "saves.queryCount": { query: Query };
  "saves.splitPosts": EmptyInput;
  "saves.get": SavesIdInput;
  "saves.list": { limit?: number };
  "saves.listPage": {
    limit?: number;
    cursor?: { savedAt: number; id: string } | null;
  };
  "saves.searchFts": {
    q: string;
    limit?: number;
    deletedOnly?: boolean;
    mode?: "all" | "any";
  };
  "saves.retrieve": SavesRetrievalInput;
  "saves.related": { id: string; limit?: number };
  "saves.semanticClusters": {
    saveIds?: Array<string>;
    folderId?: string;
    distance: number;
    limit: number;
  };
  "saves.classifyLabels": { saveIds: Array<string>; labels: Array<string> };
  "saves.query": {
    query: Query;
    deletedOnly?: boolean;
    sortKey?: string;
    sortDir?: string;
    limit?: number;
  };
  "saves.getMany": SavesIdsInput;
  "saves.rawJson": SavesIdInput;
  "saves.filePath": SavesFileInput;
  "saves.getEmbedding": SavesIdInput;
  "saves.publicImageUrl": SavesIdInput;
  "saves.fontStatus": SavesIdInput;
  "saves.embeddings": EmptyInput;
  "saves.clipEmbeddings": EmptyInput;
}

export interface SavesReadQueryResults {
  "saves.sidebarCounts": LibrarySidebarCounts;
  "saves.queryPage": LibraryQueryPage;
  "saves.queryIds": { ids: Array<string>; revision: number; libraryId: string };
  "saves.queryCount": { count: number };
  "saves.splitPosts": Array<SplitPostSummary>;
  "saves.get": WireSave | null;
  "saves.list": Array<WireSave>;
  "saves.listPage": {
    rows: Array<WireSave>;
    nextCursor: { savedAt: number; id: string } | null;
    total: number | null;
  };
  "saves.searchFts": { ids: Array<string>; scores: Record<string, number> };
  "saves.related": {
    items: Array<{
      id: string;
      score: number;
      reason: "semantically-related" | "already-organized";
    }>;
  };
  "saves.semanticClusters": {
    clusters: Array<{
      id: string;
      labels: Array<string>;
      memberIds: Array<string>;
    }>;
    unclustered: Array<string>;
  };
  "saves.classifyLabels": {
    items: Array<{
      id: string;
      scores: Array<{ label: string; score: number }>;
    }>;
    excludedIds: Array<string>;
  };
  "saves.query": { ids: Array<string> };
  "saves.getMany": Array<WireSave>;
  "saves.rawJson": { id: string; rawJson: RawJson | null };
  "saves.filePath": { ok: true; path: string } | { ok: false; reason: string };
  "saves.getEmbedding": {
    id: string;
    embedding: Array<number> | null;
    embeddingModel: string | null;
  };
  "saves.publicImageUrl": OkResult<{ url: string | null }>;
  "saves.fontStatus": { activated: boolean; path?: string };
  "saves.embeddings": Array<{
    id: string;
    embedding: null;
    embeddingModel: string | null;
  }>;
  "saves.clipEmbeddings": Array<{
    id: string;
    clipEmbedding: null;
    clipModel: string | null;
  }>;
}
