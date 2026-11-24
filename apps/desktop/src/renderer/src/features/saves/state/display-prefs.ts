import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type DisplayPrefKey = "name" | "date" | "fileCount" | "source" | "type";

export interface DisplayPrefs {
  name: boolean;
  date: boolean;
  fileCount: boolean;
  source: boolean;
  type: boolean;
}

const STORAGE_KEYS = {
  name: "pond.display.name",
  date: "pond.display.date",
  fileCount: "pond.display.fileCount",
  source: "pond.display.source",
  type: "pond.display.type",
} satisfies Record<DisplayPrefKey, string>;

const DISPLAY_DEFAULTS: DisplayPrefs = {
  name: true,
  date: true,
  fileCount: true,
  source: true,
  type: true,
};

function readKey(key: DisplayPrefKey): boolean {
  if (!globalThis.window) {
    return DISPLAY_DEFAULTS[key];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (raw === null) {
      return DISPLAY_DEFAULTS[key];
    }
    return raw === "1";
  } catch {
    return DISPLAY_DEFAULTS[key];
  }
}

function readAll(): DisplayPrefs {
  return {
    name: readKey("name"),
    date: readKey("date"),
    fileCount: readKey("fileCount"),
    source: readKey("source"),
    type: readKey("type"),
  };
}

const store = new Store<DisplayPrefs>(readAll());

export function setDisplayPref(key: DisplayPrefKey, value: boolean): void {
  if (globalThis.window) {
    try {
      window.localStorage.setItem(STORAGE_KEYS[key], value ? "1" : "0");
    } catch {
      /** Storage can be full or blocked; the pref still applies for this session. */
    }
  }
  store.setState((s) => (s[key] === value ? s : { ...s, [key]: value }));
}

export function useDisplayPrefs(): DisplayPrefs {
  return useSelector(store, (s) => s);
}

export type ItemInfoField =
  | "dimensions"
  | "fileSize"
  | "tags"
  | "rating"
  | "modified"
  | "created"
  | "published";

export interface ItemInfo {
  field: ItemInfoField;
  visible: boolean;
}

const ITEM_INFO_FIELD_KEY = "pond.display.itemInfoField";
const ITEM_INFO_VISIBLE_KEY = "pond.display.itemInfo";
const ITEM_INFO_FIELDS: ReadonlyArray<ItemInfoField> = [
  "dimensions",
  "fileSize",
  "tags",
  "rating",
  "modified",
  "created",
  "published",
];

function readItemInfoField(value: string | null): ItemInfoField {
  return ITEM_INFO_FIELDS.find((field) => field === value) ?? "created";
}

function readItemInfo(): ItemInfo {
  if (!globalThis.window) {
    return { field: "created", visible: true };
  }
  try {
    const field = window.localStorage.getItem(ITEM_INFO_FIELD_KEY);
    const visible = window.localStorage.getItem(ITEM_INFO_VISIBLE_KEY);
    return {
      field: readItemInfoField(field),
      visible: visible === null ? readKey("date") : visible === "1",
    };
  } catch {
    return { field: "created", visible: true };
  }
}

const itemInfoStore = new Store<ItemInfo>(readItemInfo());

export function useItemInfo(): ItemInfo {
  return useSelector(itemInfoStore, (info) => info);
}

export function setItemInfoField(field: ItemInfoField): void {
  if (globalThis.window) {
    try {
      window.localStorage.setItem(ITEM_INFO_FIELD_KEY, field);
    } catch {
      /** Storage can be full or blocked; the pref still applies for this session. */
    }
  }
  itemInfoStore.setState((info) =>
    info.field === field ? info : { ...info, field },
  );
}

export function setItemInfoVisible(visible: boolean): void {
  if (globalThis.window) {
    try {
      window.localStorage.setItem(ITEM_INFO_VISIBLE_KEY, visible ? "1" : "0");
    } catch {
      /** Storage can be full or blocked; the pref still applies for this session. */
    }
  }
  itemInfoStore.setState((info) =>
    info.visible === visible ? info : { ...info, visible },
  );
}
