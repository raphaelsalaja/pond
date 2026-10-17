import { spawn } from "node:child_process";
import { killProcessTree, trackChildProcess } from "../../lib/process-tree";

export interface ProcOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

export function runWithTimeout(
  bin: string,
  argv: string[],
  timeoutMs: number,
  signal?: AbortSignal,
  onLine?: (line: string) => void,
  maxMs?: number,
): Promise<ProcOutcome> {
  if (signal?.aborted) {
    return Promise.resolve({
      code: 125,
      stdout: "",
      stderr: "[pond yt-dlp] aborted",
    });
  }
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    trackChildProcess(child);
    let stderr = "";
    let stdout = "";
    let settled = false;
    let stdoutPending = "";
    let stderrPending = "";
    const stallEnabled = maxMs != null;
    let stallTimer: NodeJS.Timeout | undefined;
    let maxTimer: NodeJS.Timeout | undefined;

    function finish(code: number, extra = "") {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      clearTimeout(maxTimer);
      cleanupAbort();
      resolve({
        code,
        stdout,
        stderr: extra ? `${stderr}${extra}` : stderr,
      });
    }

    function killWith(code: number, extra: string) {
      try {
        killProcessTree(child, "SIGKILL");
      } catch {}
      finish(code, extra);
    }

    function armStall() {
      if (!stallEnabled) return;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => killWith(124, "\n[pond yt-dlp] timeout"),
        timeoutMs,
      );
    }

    function consumeLines(pending: string): string {
      const lines = pending.split(/\r?\n/);
      const remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (stallEnabled) armStall();
        onLine?.(line);
      }
      return remainder.slice(-16_000);
    }

    if (stallEnabled) {
      armStall();
      maxTimer = setTimeout(
        () => killWith(124, "\n[pond yt-dlp] timeout"),
        maxMs,
      );
    } else {
      stallTimer = setTimeout(
        () => killWith(124, "\n[pond yt-dlp] timeout"),
        timeoutMs,
      );
    }

    const onAbort = () => {
      killWith(125, "\n[pond yt-dlp] aborted");
    };
    const cleanupAbort = () => signal?.removeEventListener("abort", onAbort);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutPending = consumeLines(stdoutPending + chunk.toString("utf8"));
      stdout += chunk.toString("utf8");
      if (stdout.length > 1_000_000) stdout = stdout.slice(-1_000_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderrPending = consumeLines(stderrPending + chunk.toString("utf8"));
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on("error", (err) => {
      finish(-1, String(err));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (stdoutPending) onLine?.(stdoutPending);
      if (stderrPending) onLine?.(stderrPending);
      finish(code ?? -1);
    });
  });
}
