import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import log from "electron-log/main.js";
import type {
  OkResult,
  OpenSafariResult,
} from "../../shared/query-contracts-shared";

const execFileAsync = promisify(execFile);

const requireNative = createRequire(import.meta.url);

/**
 * Runs a command the way `execFile` does: resolves with what it printed, or rejects with
 * an `Error` carrying `stdout` and `stderr` when it exits non-zero.
 */
export type RunCommand = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const runCommand: RunCommand = async (command, args) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout, stderr };
};

/** `safari-settings.node`, built from `apps/extension/safari/safari-settings.m`. */
export interface SafariSettingsModule {
  /** Opens Safari's settings at the extension, or rejects with Safari's error. */
  showPreferences(identifier: string): Promise<void>;
}

/** What the Safari checks read from the running process; tests pass their own. */
interface SafariExtensionDeps {
  platform?: NodeJS.Platform;
  /** The app's `Contents/Resources`. */
  resourcesPath?: string;
  run?: RunCommand;
  /** The settings module, or null for a build without one. */
  settings?: SafariSettingsModule | null;
}

/** Safari's own UTI for web extensions; the only plug-in type this module looks at. */
const SAFARI_EXTENSION_POINT = "com.apple.Safari.web-extension";

/**
 * `enabled`      — Safari runs it.
 * `disabled`     — bundled and known to LaunchServices, but switched off in Safari settings.
 * `not_registered` — bundled, yet LaunchServices has not seen it (app was just installed).
 * `not_bundled`  — this build has no appex (dev builds without Xcode, and non-macOS).
 */
export type SafariExtensionState =
  | "enabled"
  | "disabled"
  | "not_registered"
  | "not_bundled";

/**
 * Safari builds its extension list from the code signature. A Developer ID build is listed
 * without help; an ad-hoc one is refused unless Safari's "Allow unsigned extensions" is on,
 * which is why a locally built app appears to have no extension at all.
 */
export type SafariExtensionSignature = "developer-id" | "ad-hoc" | "unknown";

export interface SafariExtensionStatus {
  state: SafariExtensionState;
  bundleId: string | null;
  signature: SafariExtensionSignature;
}

export interface RegisteredExtension {
  id: string;
  enabled: boolean;
  path: string | null;
}

/**
 * Parses `pluginkit -m -v`. Entries are one line each, with a marker column first:
 *
 * ```
 *      so.pond.desktop.Extension(1.0)\t<uuid>\t<date>\t/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
 * +    so.pond.desktop.Extension(1.0)\t<uuid>\t<date>\t/applications/.../
 * ```
 *
 * `+` means enabled; a space or `-` means registered but off. Some macOS builds print the
 * properties on their own indented lines instead, so both shapes are accepted. Kept pure
 * so it can be tested without `pluginkit` present.
 */
export function parsePluginkit(output: string): RegisteredExtension[] {
  const found: RegisteredExtension[] = [];
  let previous: RegisteredExtension | null = null;
  for (const line of output.split("\n")) {
    const single = line.match(/^([+ -]?)\s*(\S+)\((\d[\d.]*)\)(?:\t(.*))?$/);
    if (single) {
      const fields = (single[4] ?? "").split("\t").filter(Boolean);
      previous = {
        id: single[2] ?? "",
        enabled: single[1] === "+",
        path: fields.at(-1) ?? null,
      };
      found.push(previous);
      continue;
    }
    if (!previous) continue;
    const property = line.match(/^\s+(Path|Parent Bundle) = (.+?)\s*$/);
    if (property?.[1] === "Path") previous.path = property[2] ?? null;
  }
  return found;
}

/** The bundle's Info.plist as XML, converting if Xcode produced a binary plist. */
async function plistText(
  path: string,
  run: RunCommand,
): Promise<string | null> {
  try {
    const raw = readFileSync(path);
    if (raw.subarray(0, 8).toString("latin1").startsWith("bplist")) {
      const { stdout } = await run("plutil", [
        "-convert",
        "xml1",
        "-o",
        "-",
        path,
      ]);
      return stdout;
    }
    return raw.toString("utf8");
  } catch (cause) {
    log.warn("[pond safari] could not read Info.plist", path, cause);
    return null;
  }
}

/**
 * The Safari appex this copy of Pond ships, if any. `Contents/PlugIns` is a sibling of
 * `Contents/Resources`, which is what `process.resourcesPath` points at.
 */
async function bundledExtension(
  resources: string | undefined,
  run: RunCommand,
): Promise<{
  path: string;
  bundleId: string | null;
} | null> {
  if (!resources) return null;
  const plugIns = join(resources, "..", "PlugIns");
  if (!existsSync(plugIns)) return null;
  let entries: string[];
  try {
    entries = readdirSync(plugIns);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".appex")) continue;
    const path = join(plugIns, entry);
    const text = await plistText(join(path, "Contents", "Info.plist"), run);
    if (!text?.includes(SAFARI_EXTENSION_POINT)) continue;
    const bundleId =
      text.match(
        /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
      )?.[1] ?? null;
    return { path, bundleId };
  }
  return null;
}

async function registeredExtensions(
  run: RunCommand,
): Promise<RegisteredExtension[]> {
  try {
    const { stdout } = await run("pluginkit", [
      "-m",
      "-v",
      "-p",
      SAFARI_EXTENSION_POINT,
    ]);
    return parsePluginkit(stdout);
  } catch (cause) {
    /** pluginkit exits non-zero with empty output when nothing matches, so a failure means none. */
    log.debug("[pond safari] pluginkit returned nothing", cause);
    return [];
  }
}

/**
 * The output a failed `execFile` captured. Node rejects with an `Error` carrying `stdout`
 * and `stderr` strings, but the error type does not say so.
 */
function captureOf(cause: unknown) {
  /** SAFETY: execFile attaches both buffers to its rejection; the fallbacks cover a non-Error throw. */
  const captured = (cause ?? {}) as { stdout?: unknown; stderr?: unknown };
  return {
    stdout: String(captured.stdout ?? ""),
    stderr: String(captured.stderr ?? ""),
  };
}

/**
 * How the appex is signed, which decides whether Safari lists it unaided. `codesign -d`
 * writes its report to stderr whether or not it succeeds, so stdout alone is always empty.
 * A signature that is neither Developer ID nor ad hoc stays `unknown` rather than being
 * blamed on a missing signature.
 */
async function signatureKind(
  appexPath: string,
  run: RunCommand,
): Promise<SafariExtensionSignature> {
  const { stdout, stderr } = await run("codesign", ["-dvv", appexPath]).catch(
    captureOf,
  );
  const report = `${stdout}\n${stderr}`;
  if (report.includes("Authority=Developer ID Application"))
    return "developer-id";
  if (report.includes("Signature=adhoc")) return "ad-hoc";
  return "unknown";
}

export async function safariExtensionStatus(
  deps: SafariExtensionDeps = {},
): Promise<SafariExtensionStatus> {
  const run = deps.run ?? runCommand;
  if ((deps.platform ?? process.platform) !== "darwin") {
    return { state: "not_bundled", bundleId: null, signature: "unknown" };
  }
  const appex = await bundledExtension(
    deps.resourcesPath ?? process.resourcesPath,
    run,
  );
  if (!appex) {
    return { state: "not_bundled", bundleId: null, signature: "unknown" };
  }
  const [signature, registered] = await Promise.all([
    signatureKind(appex.path, run),
    registeredExtensions(run),
  ]);
  const match = appex.bundleId
    ? registered.find((extension) => extension.id === appex.bundleId)
    : registered.find((extension) => extension.path === appex.path);
  if (!match) {
    return { state: "not_registered", bundleId: appex.bundleId, signature };
  }
  return {
    state: match.enabled ? "enabled" : "disabled",
    bundleId: appex.bundleId,
    signature,
  };
}

/** Gives the dialog a way out if Safari never calls back. */
const SETTINGS_TIMEOUT_MS = 15_000;

/**
 * The settings module electron-builder copies to `Contents/Resources`. Safari answers
 * `SFSafariApplication` only for the main process of the app that holds the extension; a
 * helper executable gets `SFErrorNoExtensionFound` from anywhere in the bundle. So the call
 * runs here, in Electron's main process, through a Node-API module.
 */
function loadSettingsModule(
  resources: string | undefined,
): SafariSettingsModule | null {
  if (!resources) return null;
  const path = join(resources, "safari-settings.node");
  if (!existsSync(path)) return null;
  try {
    /** SAFETY: safari-settings.m exports exactly `showPreferences(identifier): Promise<void>`. */
    return requireNative(path) as SafariSettingsModule;
  } catch (cause) {
    log.warn("[pond safari] could not load the settings module", path, cause);
    return null;
  }
}

/** Rejects when Safari has not answered in time, so the dialog never waits forever. */
async function answeredInTime(request: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Safari did not answer")),
          SETTINGS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens Safari's settings at Pond's extension.
 *
 * `SFSafariApplication.showPreferencesForExtension` is the only supported way in. Safari
 * also refuses the call when it does not list the extension — which is exactly the case a
 * locally built, ad-hoc signed copy hits — so the failure is reported with the reason
 * instead of silently opening Safari's start page.
 */
export async function openSafariSettings(
  status: SafariExtensionStatus,
  deps: SafariExtensionDeps = {},
): Promise<OpenSafariResult> {
  if ((deps.platform ?? process.platform) !== "darwin") {
    return {
      ok: false,
      reason: "unsupported",
      error: "Safari is only on macOS.",
    };
  }
  if (!status.bundleId) {
    return {
      ok: false,
      reason: "not-bundled",
      error: "This build does not include the Safari extension.",
    };
  }

  const settings =
    deps.settings === undefined
      ? loadSettingsModule(deps.resourcesPath ?? process.resourcesPath)
      : deps.settings;
  if (!settings) {
    return {
      ok: false,
      reason: "helper-missing",
      error: "This build does not include the Safari settings helper.",
    };
  }

  try {
    await answeredInTime(settings.showPreferences(status.bundleId));
    return { ok: true };
  } catch (cause) {
    /** Safari's own text reads "SFErrorDomain error 1", which only belongs in the log. */
    log.warn("[pond safari] Safari did not open the settings", cause);
    /** An ad-hoc build is refused for the signature reason, so point at that setting. */
    return status.signature === "ad-hoc"
      ? {
          ok: false,
          reason: "unsigned-build",
          error:
            "Safari hides extensions from unsigned builds until you allow them in its Developer settings.",
        }
      : {
          ok: false,
          reason: "safari-refused",
          error:
            "Safari didn't open Pond's settings. Turn Pond on in Safari, under Extensions.",
        };
  }
}

/** Plain launch, used as the fallback when Safari will not jump to the extension. */
export async function openSafari(): Promise<OkResult> {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Safari is only available on macOS." };
  }
  const failure = await shell.openPath("/Applications/Safari.app");
  if (!failure) return { ok: true };
  try {
    await execFileAsync("open", ["-b", "com.apple.Safari"]);
    return { ok: true };
  } catch (cause) {
    log.warn("[pond safari] could not open Safari", cause);
    return {
      ok: false,
      error:
        "Pond couldn't open Safari. Open it yourself and enable Pond in Settings.",
    };
  }
}
