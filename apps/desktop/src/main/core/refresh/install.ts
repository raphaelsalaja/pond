import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";

/**
 * Re-runs the same postinstall script that ships yt-dlp into
 * `apps/desktop/resources/bin/`. Triggered from the settings page
 * "Reinstall yt-dlp" button so the user can recover from a network
 * blip during the first `pnpm install`, or pull a fresh build after
 * we bump the pinned version.
 *
 * Implementation:
 *  - Dev: shells out to `node apps/desktop/scripts/download-yt-dlp.mjs`.
 *  - Packaged: the same script ships under `process.resourcesPath/scripts`.
 * Either way we capture stdout/stderr so the UI can surface a one-line
 * outcome message instead of a generic "ok" / "error".
 */

export interface ReinstallResult {
  ok: boolean;
  /** Short user-facing summary. Includes stderr tail on failure. */
  message: string;
}

const HARD_TIMEOUT_MS = 120_000;

export async function reinstallYtDlp(): Promise<ReinstallResult> {
  const scriptPath = locateScript();
  if (!scriptPath) {
    return {
      ok: false,
      message:
        "Couldn't find download-yt-dlp.mjs. " +
        "Try `pnpm --filter @pond/desktop run postinstall` from the repo root.",
    };
  }

  log.info("[pond install] running", scriptPath);
  const { code, stdout, stderr } = await runWithTimeout(
    process.execPath,
    [scriptPath],
    HARD_TIMEOUT_MS,
    // Electron processes need this env to be node-compatible when we
    // shell out to a .mjs script. ELECTRON_RUN_AS_NODE makes
    // `process.execPath` behave like a vanilla node binary.
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
  );

  // The script intentionally never exits non-zero — yt-dlp is a soft
  // dep — so we sniff its log output to distinguish "installed" from
  // "couldn't reach github / sha mismatch / etc.". The script always
  // logs `[pond yt-dlp] installed` on a successful write or
  // `[pond yt-dlp] already installed` on a no-op.
  const tail = `${stdout}\n${stderr}`;
  if (
    tail.includes("[pond yt-dlp] installed") ||
    tail.includes("[pond yt-dlp] already installed")
  ) {
    return {
      ok: true,
      message: extractTailLine(tail) ?? "yt-dlp installed.",
    };
  }
  if (tail.includes("[pond yt-dlp] sha256 mismatch")) {
    return {
      ok: false,
      message:
        "Downloaded yt-dlp had an unexpected sha256. " +
        "Update the pinned release in scripts/download-yt-dlp.mjs.",
    };
  }
  if (tail.includes("[pond yt-dlp] download failed")) {
    return {
      ok: false,
      message:
        "Couldn't reach the yt-dlp release on GitHub. Check your network.",
    };
  }

  return {
    ok: code === 0,
    message:
      extractTailLine(tail) ??
      `Postinstall exited ${code} with no recognised output.`,
  };
}

function locateScript(): string | null {
  const candidates: string[] = [];
  if (app.isPackaged) {
    // Packaged builds: copy the script into Resources/scripts via
    // electron-builder's `extraResources`. We don't currently ship
    // it; this path will be empty for packaged builds until we wire
    // it up. The reinstall button is most useful in dev anyway.
    candidates.push(
      resolve(process.resourcesPath, "scripts/download-yt-dlp.mjs"),
    );
  }
  candidates.push(
    resolve(__dirname, "../../../../scripts/download-yt-dlp.mjs"),
  );
  candidates.push(
    resolve(process.cwd(), "apps/desktop/scripts/download-yt-dlp.mjs"),
  );
  candidates.push(resolve(process.cwd(), "scripts/download-yt-dlp.mjs"));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

interface ProcOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

function runWithTimeout(
  bin: string,
  argv: string[],
  timeoutMs: number,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<ProcOutcome> {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: opts.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      resolve({
        code: 124,
        stdout,
        stderr: `${stderr}\n[pond install] timeout`,
      });
    }, timeoutMs);
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
      if (stdout.length > 32_000) stdout = stdout.slice(-32_000);
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
      if (stderr.length > 32_000) stderr = stderr.slice(-32_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function extractTailLine(s: string): string | null {
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("[pond yt-dlp]"));
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
}
