import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_LOCK_DIRECTORY = join(tmpdir(), "pond-dev-runtime.lock");
const OWNER_FILENAME = "owner.json";
const INITIALIZING_GRACE_MS = 5_000;
const SIGNAL_EXIT_CODES = new Map([
  ["SIGINT", 130],
  ["SIGTERM", 143],
]);

function ownerPath(lockDirectory) {
  return join(lockDirectory, OWNER_FILENAME);
}

function parseString(value) {
  const parsed = String(value ?? "");
  return parsed === value ? parsed : null;
}

function parseOwner(serialized) {
  const value = JSON.parse(serialized);
  const pid = value?.pid;
  const token = parseString(value?.token);
  const cwd = parseString(value?.cwd);
  const command = Array.isArray(value?.command)
    ? value.command.map(parseString)
    : null;

  if (
    !Number.isInteger(pid) ||
    pid <= 0 ||
    !token ||
    cwd === null ||
    !command ||
    command.includes(null)
  ) {
    return null;
  }

  return {
    pid,
    token,
    cwd,
    command,
    startedAt: parseString(value?.startedAt),
  };
}

async function readOwner(lockDirectory) {
  try {
    return parseOwner(await readFile(ownerPath(lockDirectory), "utf8"));
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function lockIsInitializing(lockDirectory, now = Date.now()) {
  try {
    const lockStat = await stat(lockDirectory);
    return now - lockStat.mtimeMs < INITIALIZING_GRACE_MS;
  } catch {
    return false;
  }
}

async function writeOwner(lockDirectory, owner) {
  await writeFile(
    ownerPath(lockDirectory),
    `${JSON.stringify(owner, null, 2)}\n`,
    "utf8",
  );
}

export async function acquireDevRuntime({
  command,
  cwd,
  lockDirectory = DEFAULT_LOCK_DIRECTORY,
  pid = process.pid,
}) {
  for (;;) {
    try {
      await mkdir(lockDirectory);
      const owner = {
        pid,
        token: randomUUID(),
        cwd,
        command,
        startedAt: new Date().toISOString(),
      };

      try {
        await writeOwner(lockDirectory, owner);
      } catch (error) {
        await rm(lockDirectory, { recursive: true, force: true });
        throw error;
      }

      return { status: "acquired", owner, lockDirectory };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }

    const owner = await readOwner(lockDirectory);
    if (owner && isProcessRunning(owner.pid)) {
      return { status: "running", owner, lockDirectory };
    }

    if (!owner && (await lockIsInitializing(lockDirectory))) {
      return { status: "running", owner: null, lockDirectory };
    }

    await rm(lockDirectory, { recursive: true, force: true });
  }
}

export async function releaseDevRuntime(acquisition) {
  const owner = await readOwner(acquisition.lockDirectory);
  if (!owner || owner.token !== acquisition.owner.token) {
    return false;
  }

  await rm(acquisition.lockDirectory, { recursive: true, force: true });
  return true;
}

async function updateOwnerPid(acquisition, pid) {
  const owner = await readOwner(acquisition.lockDirectory);
  if (!owner || owner.token !== acquisition.owner.token) {
    return;
  }

  acquisition.owner.pid = pid;
  await writeOwner(acquisition.lockDirectory, acquisition.owner);
}

function displayCommand(command) {
  return command.map((part) => JSON.stringify(part)).join(" ");
}

function printExistingRuntime(owner) {
  if (!owner) {
    console.log("Pond development runtime is already starting.");
    return;
  }

  console.log("Pond development runtime is already running.");
  console.log(`PID: ${owner.pid}`);
  console.log(`Command: ${displayCommand(owner.command)}`);
  console.log(`Working directory: ${owner.cwd}`);
  console.log("Use the designated runtime-owner chat to stop or restart it.");
}

function normalizedExecutable(command) {
  if (process.platform === "win32" && command === "pnpm") {
    return "pnpm.cmd";
  }
  return command;
}

function runCommand(command, token) {
  const [executable, ...args] = command;
  const child = spawn(normalizedExecutable(executable), args, {
    cwd: process.cwd(),
    env: { ...process.env, POND_DEV_RUNTIME_TOKEN: token },
    stdio: "inherit",
    // Node refuses to spawn .cmd files directly since CVE-2024-27980. The
    // arguments come from the package scripts, never from user input.
    shell: process.platform === "win32",
  });

  const forwardSignal = (signal) => {
    if (process.platform === "win32" && child.pid) {
      // child.kill() would only end cmd.exe, leaving the dev tree running.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      }).on("error", () => {});
      return;
    }
    if (!child.killed) {
      child.kill(signal);
    }
  };
  const forwardInterrupt = () => forwardSignal("SIGINT");
  const forwardTermination = () => forwardSignal("SIGTERM");
  const removeSignalListeners = () => {
    process.off("SIGINT", forwardInterrupt);
    process.off("SIGTERM", forwardTermination);
  };
  process.on("SIGINT", forwardInterrupt);
  process.on("SIGTERM", forwardTermination);

  return {
    child,
    completion: new Promise((resolve, reject) => {
      child.once("error", (error) => {
        removeSignalListeners();
        reject(error);
      });
      child.once("exit", (code, signal) => {
        removeSignalListeners();
        resolve(code ?? SIGNAL_EXIT_CODES.get(signal) ?? 1);
      });
    }),
  };
}

async function main() {
  const separatorIndex = process.argv.indexOf("--");
  const command = process.argv.slice(separatorIndex + 1);
  if (separatorIndex === -1 || command.length === 0) {
    console.error(
      "Usage: node scripts/run-dev-singleton.mjs -- <command> [arguments...]",
    );
    process.exitCode = 2;
    return;
  }

  const inheritedToken = process.env.POND_DEV_RUNTIME_TOKEN;
  const inheritedOwner = inheritedToken
    ? await readOwner(DEFAULT_LOCK_DIRECTORY)
    : null;
  if (inheritedOwner?.token === inheritedToken) {
    const { completion } = runCommand(command, inheritedToken);
    process.exitCode = await completion;
    return;
  }

  const acquisition = await acquireDevRuntime({
    command,
    cwd: process.cwd(),
  });
  if (acquisition.status === "running") {
    printExistingRuntime(acquisition.owner);
    return;
  }

  try {
    const { child, completion } = runCommand(command, acquisition.owner.token);
    if (child.pid) {
      await updateOwnerPid(acquisition, child.pid);
    }
    process.exitCode = await completion;
  } finally {
    await releaseDevRuntime(acquisition);
  }
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  await main();
}
