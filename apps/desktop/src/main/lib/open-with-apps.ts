import { basename, extname } from "node:path";
import { z } from "zod";

const PayloadSchema = z.object({
  defaultPath: z.string().nullable(),
  paths: z.array(z.string()),
});

type OpenWithPayload = z.infer<typeof PayloadSchema>;

export interface OpenWithAppInfo {
  name: string;
  path: string;
  isDefault: boolean;
}

export function parseOpenWithPayload(raw: string): OpenWithPayload {
  try {
    const parsed = PayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { defaultPath: null, paths: [] };
    }
    return parsed.data;
  } catch {
    return { defaultPath: null, paths: [] };
  }
}

function appDisplayName(path: string): string {
  return basename(path);
}

/** Same-extension files share Launch Services handlers, so listing can reuse that set. */
export function openWithListingKey(filePath: string): string {
  return extname(filePath).toLowerCase() || filePath;
}

export function rankOpenWithApps(
  input: { defaultPath: string | null; paths: Array<string> },
  limit = 24,
): Array<OpenWithAppInfo> {
  const seen = new Set<string>();
  const apps: Array<OpenWithAppInfo> = [];
  const add = (path: string, isDefault: boolean) => {
    if (!path.endsWith(".app") || seen.has(path)) {
      return;
    }
    seen.add(path);
    apps.push({ path, name: appDisplayName(path), isDefault });
  };
  if (input.defaultPath) {
    add(input.defaultPath, true);
  }
  const rest = [...input.paths].sort((a, b) =>
    appDisplayName(a).localeCompare(appDisplayName(b)),
  );
  for (const path of rest) {
    add(path, path === input.defaultPath);
  }
  return apps.slice(0, limit);
}
