import type { CaptureWebDraft } from "@pond/schema/capture";
import { defineExtensionMessaging } from "@webext-core/messaging";
import type { CaptureOutcome } from "./outcome";
import type { ProbeResult } from "./probe";
import type { PondCapturePayload, PondLogEntry } from "./types";

export type CaptureTool = "page" | "visible" | "region" | "full" | "images";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
}

export interface Tag {
  name: string;
  starred: boolean;
  usageCount: number;
  lastUsedAt: number | null;
}

export interface FishTarget {
  id: string;
  name: string;
}

/** Everything a capture picker needs to offer folders, tags, and fish without a native round trip. */
export interface LibraryTargets {
  name: string;
  folders: Array<Folder>;
  tags: Array<Tag>;
  fish: Array<FishTarget>;
  recentFolderIds: Array<string>;
  recentTags: Array<string>;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type DetailsKind = "page" | "link" | "media" | "screenshot";

export interface DetailsPreview {
  src: string;
  width?: number;
  height?: number;
}

/** A capture waiting on its name, tags, and folders; the overlay hands it back untouched. */
export interface DetailsDraft {
  kind: DetailsKind;
  items: CaptureWebDraft["items"];
  title: string;
  url: string;
  originUrl?: string;
  trigger?: string;
  preview: DetailsPreview | null;
}

export interface DetailsMetadata {
  title: string;
  notes: string;
  rating: number;
  tags: Array<string>;
  folderIds: Array<string>;
  fishId: string | null;
}

export interface PageItem {
  kind: "media" | "link";
  url: string;
  title?: string;
}

/** What the in-page overlay reports back once the person finishes a pick. */
export type OverlayResult =
  | { kind: "region"; region: CaptureRegion }
  | {
      kind: "images";
      urls: Array<string>;
      tags: Array<string>;
      folderIds: Array<string>;
    }
  | { kind: "details"; draft: DetailsDraft; metadata: DetailsMetadata };

export interface Gesture {
  kind: "alt-click";
  item: PageItem;
}

export type ToolResult = { ok: true } | { ok: false; message: string };

interface PondProtocol {
  capture(payload: PondCapturePayload): CaptureOutcome;
  runTool(input: { tabId: number; tool: CaptureTool }): ToolResult;
  overlayResult(result: OverlayResult): void;
  gesture(gesture: Gesture): void;
  openPond(path: string | undefined): boolean;
  log(entry: PondLogEntry): void;
  probe(): ProbeResult;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<PondProtocol>();
