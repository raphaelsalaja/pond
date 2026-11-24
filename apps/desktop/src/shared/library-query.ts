import { ApiLibraryQueryRequestSchema } from "@pond/schema/api";
import type { ApiLibraryQueryRequest, ApiQueryPage } from "@pond/schema/api";
import { QuerySchema } from "@pond/schema/filters";

export type LibraryQueryRequest = ApiLibraryQueryRequest;
export type LibraryQueryPage = ApiQueryPage;

export const LibraryFilterSchema = QuerySchema;
export const LibraryQueryRequestSchema = ApiLibraryQueryRequestSchema;
