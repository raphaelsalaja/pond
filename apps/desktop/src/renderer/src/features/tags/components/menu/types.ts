import type { CSSProperties } from "react";
import type { TagGroupRow } from "@/features/tags/state/tag-groups";
import type { TagRow } from "@/features/tags/state/tags";

export type CreateInfo =
  | { kind: "batch"; labels: Array<string>; label: string }
  | { kind: "group"; group: string; label: string }
  | { kind: "plain"; label: string };

export type TagPickerRow =
  | { id: string; kind: "tag"; tag: TagRow; depth?: number }
  | { id: string; kind: "group"; group: TagGroupRow }
  | { id: string; kind: "create"; create: CreateInfo };

export interface TagRowStyle extends CSSProperties {
  "--tag-depth": number;
}

export interface TagSection {
  id: string;
  label: string;
  items: Array<TagRow>;
  open: boolean;
  collapsible: boolean;
  toggle(): void;
}
