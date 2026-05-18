import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import log from "electron-log/main.js";
import { KEYCHAIN_INGEST_TOKEN, KEYCHAIN_SERVICE } from "../shared/constants";

const SECRETS_FILE = "secrets.json";

type SecretMap = Record<string, string>;

function secretsPath(): string {
  return join(app.getPath("userData"), SECRETS_FILE);
}

function entryKey(service: string, account: string): string {
  return `${service}:${account}`;
}

async function readAll(): Promise<SecretMap> {
  try {
    const buf = await readFile(secretsPath(), "utf8");
    const parsed = JSON.parse(buf) as unknown;
    if (parsed && typeof parsed === "object") return parsed as SecretMap;
    return {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    log.warn("[pond] failed to read secrets file, starting empty", err);
    return {};
  }
}

async function writeAll(map: SecretMap): Promise<void> {
  await writeFile(secretsPath(), JSON.stringify(map), { mode: 0o600 });
}

function encrypt(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString("base64")}`;
  }
  // Linux without libsecret, or first-run before Electron has wired up
  // a keychain backend. Tag the value so future reads don't try to
  // decrypt plaintext as a Buffer.
  log.warn(
    "[pond] safeStorage encryption unavailable, persisting secret in plaintext",
  );
  return `raw:${Buffer.from(plain, "utf8").toString("base64")}`;
}

function decrypt(value: string): string | null {
  try {
    if (value.startsWith("enc:")) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
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

export async function getIngestToken(): Promise<string | null> {
  const all = await readAll();
  const value = all[entryKey(KEYCHAIN_SERVICE, KEYCHAIN_INGEST_TOKEN)];
  if (!value) return null;
  return decrypt(value);
}

export async function setIngestToken(token: string): Promise<void> {
  const all = await readAll();
  all[entryKey(KEYCHAIN_SERVICE, KEYCHAIN_INGEST_TOKEN)] = encrypt(token);
  await writeAll(all);
}

export async function ensureIngestToken(): Promise<string> {
  const existing = await getIngestToken();
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  await setIngestToken(token);
  return token;
}

export async function rotateIngestToken(): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await setIngestToken(token);
  return token;
}
