import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import type { AppleSchema } from "./apple-schema";

const HELPER = "pond-apple-model";
const TIMEOUT_MS = 120_000;
const DEFAULT_CONTEXT_SIZE = 4096;

export type AppleRequest =
  | { command: "status" }
  | {
      command: "count" | "generate";
      instructions: string;
      prompt: string;
      schema: AppleSchema;
    };

const replySchema = z.union([
  z.object({ ok: z.literal(true) }).catchall(z.unknown()),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    message: z.string().optional(),
  }),
]);
export type AppleReply = z.infer<typeof replySchema>;

export function parseHelperReply(stdout: string): AppleReply {
  try {
    return replySchema.parse(JSON.parse(stdout));
  } catch {
    return { ok: false, error: "failed" };
  }
}

const MESSAGES = new Map([
  ["unsupportedOS", "Apple Intelligence needs macOS 26 or later."],
  ["deviceNotEligible", "This Mac can't run Apple Intelligence."],
  [
    "appleIntelligenceNotEnabled",
    "Turn on Apple Intelligence in System Settings, then try again.",
  ],
  [
    "modelNotReady",
    "Apple Intelligence is still downloading. Try again when it's ready.",
  ],
  [
    "contextSizeExceeded",
    "This chat is too long for Apple Intelligence. Start a new chat or choose another model.",
  ],
  [
    "guardrailViolation",
    "Apple Intelligence declined this request. Rephrase it or choose another model.",
  ],
  ["missing", "Pond can't find its Apple Intelligence helper. Reinstall Pond."],
]);

export function appleErrorMessage(code: string): string {
  return MESSAGES.get(code) ?? "Apple Intelligence couldn't reply. Try again.";
}

function helperPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", HELPER);
  }
  const bundled = join(app.getAppPath(), "resources", "bin", HELPER);
  const candidates = [bundled, join(process.cwd(), "resources", "bin", HELPER)];
  return candidates.find((path) => existsSync(path)) ?? bundled;
}

export function runAppleHelper(
  request: AppleRequest,
  signal?: AbortSignal,
): Promise<AppleReply> {
  const path = helperPath();
  if (!existsSync(path)) {
    return Promise.resolve({ ok: false, error: "missing" });
  }
  return new Promise((resolve) => {
    const child = spawn(path, [], {
      stdio: ["pipe", "pipe", "ignore"],
      signal,
      timeout: TIMEOUT_MS,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stdin.on("error", () => {
      /** The helper can exit before it reads stdin; its reply still arrives on close. */
    });
    child.on("error", () => resolve({ ok: false, error: "failed" }));
    child.on("close", () => resolve(parseHelperReply(stdout)));
    child.stdin.end(JSON.stringify(request));
  });
}

interface StatusDeps {
  platform?: NodeJS.Platform;
  run?: typeof runAppleHelper;
}

export async function appleStatus(
  deps: StatusDeps = {},
  signal?: AbortSignal,
): Promise<{ ok: true; contextSize: number } | { ok: false; error: string }> {
  if ((deps.platform ?? process.platform) !== "darwin") {
    return { ok: false, error: "Apple Intelligence is only on Mac." };
  }
  const reply = await (deps.run ?? runAppleHelper)(
    { command: "status" },
    signal,
  );
  if (!reply.ok) {
    return { ok: false, error: appleErrorMessage(reply.error) };
  }
  const size = z.number().int().positive().safeParse(reply.contextSize);
  return {
    ok: true,
    contextSize: size.success ? size.data : DEFAULT_CONTEXT_SIZE,
  };
}
