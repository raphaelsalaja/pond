export interface LocalIngestExtras {
  mediaFiles?: Array<{
    path: string;
    mimeType?: string;
    kind?: "poster";
  }>;
  force?: boolean;
  trustAuthoritative?: boolean;
  coverDims?: { width: number; height: number };
}
