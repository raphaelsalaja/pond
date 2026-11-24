import type { SavesDerivedPatch } from "@shared/saves-contracts-shared";
import type { WireSave } from "@shared/wire";

export type { SaveFile } from "@pond/schema/db";

type SaveIdentity =
  | "id"
  | "source"
  | "sourceId"
  | "url"
  | "title"
  | "description"
  | "author"
  | "notes"
  | "mediaUrl"
  | "mediaType"
  | "files"
  | "tags"
  | "savedAt"
  | "createdAt"
  | "deletedAt";

/** Pool rows arrive as sync patches, so only identity fields are guaranteed; heavy derived fields exist only after local enrichment. */
export type Save = Pick<WireSave, SaveIdentity> &
  Partial<Omit<WireSave, SaveIdentity>> &
  Pick<SavesDerivedPatch, "transcript" | "clipEmbedding"> & {
    folderIds?: Array<string>;
  };
