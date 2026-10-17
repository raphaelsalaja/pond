import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { KEYCHAIN_INGEST_TOKEN, KEYCHAIN_SERVICE } from "../shared/constants";
import { renameWithRetry } from "./lib/rename-retry";

const SECRETS_FILE = "secrets.json";

const SecretMapSchema = z.record(z.string(), z.string());

type SecretMap = z.infer<typeof SecretMapSchema>;

/** Thrown instead of persisting a secret the operating system cannot protect. */
export class KeychainUnavailableError extends Error {
  constructor() {
    super(
      "Windows could not protect this secret, so it was not saved. Sign in to Windows normally (not a restricted or service session) and try again.",
    );
    this.name = "KeychainUnavailableError";
  }
}

export interface KeychainPort {
  platform: NodeJS.Platform;
  userDataPath: () => string;
  encryptionAvailable: () => boolean;
  protect: (value: string) => Buffer;
  unprotect: (value: Buffer) => string;
}

const electronKeychainPort: KeychainPort = {
  platform: process.platform,
  userDataPath: () => app.getPath("userData"),
  encryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  protect: (value) => safeStorage.encryptString(value),
  unprotect: (value) => safeStorage.decryptString(value),
};

function secretsPath(port: KeychainPort): string {
  return join(port.userDataPath(), SECRETS_FILE);
}

function entryKey(service: string, account: string): string {
  return `${service}:${account}`;
}

/** Returns null when the file exists but is unreadable, so callers can keep it instead of overwriting it. */
async function readAll(port: KeychainPort): Promise<SecretMap | null> {
  try {
    const buf = await readFile(secretsPath(port), "utf8");
    const parsed = SecretMapSchema.safeParse(JSON.parse(buf));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return {};
    }
    log.warn("[pond] failed to read secrets file", cause);
    return null;
  }
}

async function readForUpdate(port: KeychainPort): Promise<SecretMap> {
  const map = await readAll(port);
  if (map) return map;
  const aside = `${secretsPath(port)}.damaged-${Date.now()}`;
  await rename(secretsPath(port), aside);
  log.error("[pond] secrets file was unreadable; kept a copy at", aside);
  return {};
}

async function writeAll(port: KeychainPort, map: SecretMap): Promise<void> {
  const file = secretsPath(port);
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(map), { mode: 0o600 });
    await renameWithRetry(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function encrypt(port: KeychainPort, plain: string): string {
  if (port.encryptionAvailable()) {
    return `enc:${port.protect(plain).toString("base64")}`;
  }
  /** Windows has no plaintext fallback: file modes do nothing on NTFS, so refuse rather than store a reversible copy. */
  if (port.platform === "win32") throw new KeychainUnavailableError();
  /** No keychain backend (Linux/first-run); tag the value so reads don't decrypt plaintext. */
  log.warn(
    "[pond] safeStorage encryption unavailable, persisting secret in plaintext",
  );
  return `raw:${Buffer.from(plain, "utf8").toString("base64")}`;
}

function decrypt(port: KeychainPort, value: string): string | null {
  try {
    if (value.startsWith("enc:")) {
      if (!port.encryptionAvailable()) return null;
      return port.unprotect(Buffer.from(value.slice(4), "base64"));
    }
    if (value.startsWith("raw:")) {
      return Buffer.from(value.slice(4), "base64").toString("utf8");
    }
    return null;
  } catch (err) {
    log.warn("[pond] failed to decrypt secret", err);
    return null;
  }
}

export function createKeychain(port: KeychainPort) {
  async function getSecret(account: string): Promise<string | null> {
    const all = await getSecrets([account]);
    return all[account] ?? null;
  }

  async function getSecrets(
    accounts: string[],
  ): Promise<Record<string, string | null>> {
    const all = (await readAll(port)) ?? {};
    const out: Record<string, string | null> = {};
    for (const account of accounts) {
      const value = all[entryKey(KEYCHAIN_SERVICE, account)];
      out[account] = value ? decrypt(port, value) : null;
    }
    return out;
  }

  /** Serializes read-modify-write cycles so concurrent updates never drop each other's entries. */
  let updates: Promise<void> = Promise.resolve();
  function update(change: (all: SecretMap) => void): Promise<void> {
    const next = updates.then(async () => {
      const all = await readForUpdate(port);
      change(all);
      await writeAll(port, all);
    });
    updates = next.catch(() => {});
    return next;
  }

  async function setSecret(account: string, plain: string): Promise<void> {
    const stored = encrypt(port, plain);
    await update((all) => {
      all[entryKey(KEYCHAIN_SERVICE, account)] = stored;
    });
  }

  async function deleteSecret(account: string): Promise<void> {
    await update((all) => {
      delete all[entryKey(KEYCHAIN_SERVICE, account)];
    });
  }

  async function getIngestToken(): Promise<string | null> {
    return getSecret(KEYCHAIN_INGEST_TOKEN);
  }

  async function setIngestToken(token: string): Promise<void> {
    await setSecret(KEYCHAIN_INGEST_TOKEN, token);
  }

  async function ensureIngestToken(): Promise<string> {
    const existing = await getIngestToken();
    if (existing) return existing;
    /** Pond's own local token, not a provider credential: an undecryptable one is replaced, and update() leaves every other entry untouched. */
    const token = randomBytes(24).toString("hex");
    await setIngestToken(token);
    return token;
  }

  async function rotateIngestToken(): Promise<string> {
    const token = randomBytes(24).toString("hex");
    await setIngestToken(token);
    return token;
  }

  return {
    deleteSecret,
    ensureIngestToken,
    getIngestToken,
    getSecret,
    getSecrets,
    rotateIngestToken,
    setSecret,
  };
}

export const {
  deleteSecret,
  ensureIngestToken,
  getIngestToken,
  getSecret,
  getSecrets,
  rotateIngestToken,
  setSecret,
} = createKeychain(electronKeychainPort);
