import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, win32 } from "node:path";
import { app } from "electron";
import { z } from "zod";

const POINTER_FILE = "library-location.json";

interface PointerFile {
  path: string;
  updatedAt: number;
  schemaVersion: 1;
}

const StoredPointerSchema = z.object({ path: z.string().min(1) });

function pointerPath(): string {
  return join(app.getPath("userData"), POINTER_FILE);
}

export function isPathInside(
  root: string,
  target: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "win32") return target.startsWith(`${root}/`);
  const child = win32.relative(root, target);
  return (
    child === "" ||
    (child !== ".." && !child.startsWith("..\\") && !win32.isAbsolute(child))
  );
}

export function readLibraryPointer(): string | null {
  try {
    const raw = readFileSync(pointerPath(), "utf-8");
    const parsed = StoredPointerSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const candidate = parsed.data.path;
    const abs = isAbsolute(candidate) ? candidate : resolve(candidate);
    if (isPathInside(app.getPath("userData"), abs)) return null;
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

interface PointerSafetyReport {
  ok: boolean;
  reason?:
    | "inside_user_data"
    | "not_writable"
    | "not_a_directory"
    | "unknown_error";
}

export function checkPointerSafety(target: string): PointerSafetyReport {
  const abs = isAbsolute(target) ? target : resolve(target);
  if (isPathInside(app.getPath("userData"), abs)) {
    return { ok: false, reason: "inside_user_data" };
  }
  try {
    if (existsSync(abs)) {
      const st = statSync(abs);
      if (!st.isDirectory()) return { ok: false, reason: "not_a_directory" };
    } else {
      mkdirSync(abs, { recursive: true });
    }
    const probe = join(abs, `.pond-probe-${Date.now()}`);
    writeFileSync(probe, "ok");
    try {
      readFileSync(probe);
    } finally {
      try {
        unlinkSync(probe);
      } catch {}
    }
    return { ok: true };
  } catch (cause) {
    if (errnoCode(cause) === "EACCES") {
      return { ok: false, reason: "not_writable" };
    }
    return { ok: false, reason: "unknown_error" };
  }
}

function errnoCode(cause: unknown): string | null {
  return cause instanceof Error && "code" in cause ? String(cause.code) : null;
}
