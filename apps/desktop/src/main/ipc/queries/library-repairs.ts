import {
  LibraryRepairApplyRequestSchema,
  LibraryRepairJobRequestSchema,
  LibraryRepairPreviewRequestSchema,
} from "../../../shared/library-repair-contracts";
import {
  cancelLibraryRepairJob,
  getLibraryRepairJob,
  startLibraryRepairApply,
  startLibraryRepairPreview,
} from "../../core/library-repair-jobs";
import { query } from "./params";

export const libraryRepairQueries = {
  "libraryRepairs.preview": query(
    LibraryRepairPreviewRequestSchema,
    ({ kind, saveIds }) => startLibraryRepairPreview(kind, saveIds),
  ),
  "libraryRepairs.apply": query(LibraryRepairApplyRequestSchema, ({ token }) =>
    startLibraryRepairApply(token),
  ),
  "libraryRepairs.cancel": query(LibraryRepairJobRequestSchema, ({ id }) =>
    cancelLibraryRepairJob(id),
  ),
  "libraryRepairs.get": query(LibraryRepairJobRequestSchema, ({ id }) =>
    getLibraryRepairJob(id),
  ),
};
