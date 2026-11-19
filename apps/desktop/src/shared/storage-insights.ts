import type { MediaType } from "@pond/schema/db";

export interface LargestSave {
  id: string;
  title: string | null;
  url: string;
  source: string;
  mediaType: MediaType | null;
  fileCount: number;
  fileSize: number;
}
