import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { app } from "electron";

// Tiny side-car that holds the user's chosen library folder. Lives in
// userData so we can read it synchronously before the DB opens, and so
// it survives a corrupted index.db. Same pattern Lightroom/Photos use:
// the app data folder holds a pointer to wherever the user wants their
// actual library to sit.
const POINTER_FILE = "library-location.json";

interface PointerFile {
  path: string;
  updatedAt: number;
  schemaVersion: 1;
}

function pointerPath(): string {
  return join(app.getPath("userData"), POINTER_FILE);
}

export function readLibraryPointer(): string | null {
  try {
    const raw = readFileSync(pointerPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<PointerFile>;
    const candidate = parsed?.path;
    if (typeof candidate !== "string" || candidate.length === 0) return null;
    const abs = isAbsolute(candidate) ? candidate : resolve(candidate);
    // Refuse to honor a pointer into our own userData — that would
    // create infinite recursion (library inside its own metadata dir).
    if (abs.startsWith(`${app.getPath("userData")}/`)) return null;
    return abs;
  } catch {
    return null;
  }
}

export function writeLibraryPointer(absPath: string): void {
  if (!isAbsolute(absPath)) {
    throw new Error("library pointer requires an absolute path");
  }
  const body: PointerFile = {
    path: absPath,
    updatedAt: Date.now(),
    schemaVersion: 1,
  };
  const file = pointerPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body, null, 2));
}

// Returns true if `target` looks safe to use as a library root:
// - the folder exists or can be created
// - it sits outside userData
// - it's not equal to the current resolution (caller decides what to
//   do with that — we just report)
export interface PointerSafetyReport {
  ok: boolean;
  reason?:
    | "inside_user_data"
    | "not_writable"
    | "not_a_directory"
    | "unknown_error";
}

export function checkPointerSafety(target: string): PointerSafetyReport {
  const abs = isAbsolute(target) ? target : resolve(target);
  if (abs.startsWith(`${app.getPath("userData")}/`)) {
    return { ok: false, reason: "inside_user_data" };
  }
  try {
    if (existsSync(abs)) {
      const st = statSync(abs);
      if (!st.isDirectory()) return { ok: false, reason: "not_a_directory" };
    } else {
      mkdirSync(abs, { recursive: true });
    }
    // Probe-write to catch read-only mounts, sandboxed paths, etc.
    const probe = join(abs, `.pond-probe-${Date.now()}`);
    writeFileSync(probe, "ok");
    try {
      readFileSync(probe);
    } finally {
      try {
        const { unlinkSync } = require("node:fs") as typeof import("node:fs");
        unlinkSync(probe);
      } catch {
        // probe cleanup best-effort
      }
    }
    return { ok: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EACCES") {
      return { ok: false, reason: "not_writable" };
    }
    return { ok: false, reason: "unknown_error" };
  }
}

// Marker substrings let us spot when a user has parked their library
// in a synced folder. We surface this in the relocate dialog so people
// understand the trade-off (files sync across devices; the SQLite
// index stays per-machine).
const CLOUD_MARKERS: ReadonlyArray<{
  kind: CloudKind;
  patterns: ReadonlyArray<string>;
}> = [
  {
    kind: "iCloud",
    patterns: [
      "/Library/Mobile Documents/com~apple~CloudDocs/",
      "/Library/Mobile Documents/iCloud~",
    ],
  },
  { kind: "Dropbox", patterns: ["/Dropbox/", "/Dropbox (", "/.dropbox/"] },
  {
    kind: "Google Drive",
    patterns: ["/Google Drive/", "/GoogleDrive/", "/CloudStorage/GoogleDrive-"],
  },
  {
    kind: "OneDrive",
    patterns: ["/OneDrive/", "/OneDrive - ", "/CloudStorage/OneDrive-"],
  },
  { kind: "Box", patterns: ["/Box/", "/Box Sync/"] },
];

export type CloudKind =
  | "iCloud"
  | "Dropbox"
  | "Google Drive"
  | "OneDrive"
  | "Box";

export function detectCloudKind(absPath: string): CloudKind | null {
  const norm = absPath.endsWith("/") ? absPath : `${absPath}/`;
  for (const entry of CLOUD_MARKERS) {
    if (entry.patterns.some((p) => norm.includes(p))) return entry.kind;
  }
  return null;
}

// "Does this folder already look like a Pond library?" — used so we
// can default the relocate dialog to "adopt" (skip the copy) when the
// user is pointing at, say, an iCloud folder that's already synced
// from another Mac. Pond libraries have `items/` and `metadata.json`
// at the root; either is a strong signal.
export interface ExistingLibraryProbe {
  exists: boolean;
  hasItemsDir: boolean;
  hasMetadataFile: boolean;
  itemCount: number;
  looksLikePondLibrary: boolean;
}

export function probeExistingLibrary(absPath: string): ExistingLibraryProbe {
  const out: ExistingLibraryProbe = {
    exists: false,
    hasItemsDir: false,
    hasMetadataFile: false,
    itemCount: 0,
    looksLikePondLibrary: false,
  };
  if (!existsSync(absPath)) return out;
  out.exists = true;
  const itemsDir = join(absPath, "items");
  const metadataFile = join(absPath, "metadata.json");
  out.hasMetadataFile = existsSync(metadataFile);
  if (existsSync(itemsDir)) {
    out.hasItemsDir = true;
    try {
      const entries = readdirSync(itemsDir).filter((e) => e.endsWith(".info"));
      out.itemCount = entries.length;
    } catch {
      // Best-effort — a permission error here is the same outcome as
      // an empty folder for our purposes.
    }
  }
  out.looksLikePondLibrary = out.hasItemsDir || out.hasMetadataFile;
  return out;
}
