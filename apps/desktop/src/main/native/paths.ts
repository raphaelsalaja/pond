import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, posix } from "node:path";
import { promisify } from "node:util";
import { SAFARI_APP_GROUP, SHARE_INBOX_DIR } from "@pond/schema/native";

const WINDOWS_SID = /^S-\d+(?:-\d+)+$/;
export const WINDOWS_SID_LOOKUP_TIMEOUT_MS = 3_000;
const execFileAsync = promisify(execFile);

export type WindowsSidLoader = () => Promise<string>;

export function parseWindowsUserSid(output: string): string {
  const match = /,"(S-\d+(?:-\d+)+)"\s*$/.exec(output.trim());
  const sid = match?.[1];
  if (!sid || !WINDOWS_SID.test(sid)) {
    throw new Error("Could not resolve the current Windows user SID.");
  }
  return sid;
}

async function loadWindowsUserSid(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      /** An absolute path, since Git Bash's whoami can shadow the system one on PATH. */
      join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: WINDOWS_SID_LOOKUP_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      },
    );
    return parseWindowsUserSid(stdout);
  } catch (cause) {
    throw new Error("Could not resolve the current Windows user SID.", {
      cause,
    });
  }
}

export function createWindowsUserSidResolver(
  load: WindowsSidLoader = loadWindowsUserSid,
): WindowsSidLoader {
  let cached: string | null = null;
  let pending: Promise<string> | null = null;
  return () => {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    const lookup = load()
      .then((sid) => {
        if (!WINDOWS_SID.test(sid)) {
          throw new Error("Could not resolve the current Windows user SID.");
        }
        cached = sid;
        return sid;
      })
      .finally(() => {
        if (pending === lookup) pending = null;
      });
    pending = lookup;
    return lookup;
  };
}

const resolveWindowsUserSid = createWindowsUserSidResolver();

export function windowsNativePipePath(sid: string): string {
  if (!WINDOWS_SID.test(sid)) throw new Error("Invalid Windows user SID.");
  return `\\\\.\\pipe\\pond-native-host-${sid}`;
}

/** Safari extension connect path; keep in lockstep with `SafariWebExtensionHandler.swift`. */
export function safariSocketPath(home: string = homedir()): string {
  return posix.join(
    home,
    "Library/Group Containers",
    SAFARI_APP_GROUP,
    "native.sock",
  );
}

/** Share extension drop folder; keep in lockstep with `PondSocket.swift`. */
export function shareInboxPath(home: string = homedir()): string {
  return posix.join(
    home,
    "Library/Group Containers",
    SAFARI_APP_GROUP,
    SHARE_INBOX_DIR,
  );
}

/**
 * Linux has no fixed per-user socket directory. Prefer the session runtime
 * directory, then the XDG config root; `pond-native-host.c` repeats this order.
 */
function linuxNativeSocketPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  for (const root of [env.XDG_RUNTIME_DIR, env.XDG_CONFIG_HOME]) {
    if (root && isAbsolute(root)) return join(root, "pond", "native.sock");
  }
  return join(home, ".config", "pond", "native.sock");
}

/** Chrome native-host connect path; keep in lockstep with `pond-native-host.c`. */
export async function nativeSocketPath(
  platform: NodeJS.Platform = process.platform,
  sidResolver: WindowsSidLoader = resolveWindowsUserSid,
  sandbox: string | undefined = process.env.POND_SANDBOX,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): Promise<string> {
  if (platform === "win32") {
    const pipe = windowsNativePipePath(await sidResolver());
    /** Pipe names are machine-global, so a sandbox gets its own and never takes the installed app's pipe. */
    if (!sandbox) return pipe;
    const id = createHash("sha256").update(sandbox).digest("hex").slice(0, 16);
    return `${pipe}-sandbox-${id}`;
  }
  if (sandbox) {
    return join(sandbox, "native.sock");
  }
  if (platform === "linux") return linuxNativeSocketPath(env, home);
  return join(home, "Library/Application Support/Pond", "native.sock");
}
