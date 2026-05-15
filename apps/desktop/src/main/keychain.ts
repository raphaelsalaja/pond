import { randomBytes } from "node:crypto";
import log from "electron-log/main.js";
import {
  KEYCHAIN_AI_GATEWAY_KEY,
  KEYCHAIN_INGEST_TOKEN,
  KEYCHAIN_SERVICE,
} from "../shared/constants";

interface KeyStore {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

const memoryStore = new Map<string, string>();

const inMemoryFallback: KeyStore = {
  async getPassword(service, account) {
    return memoryStore.get(`${service}:${account}`) ?? null;
  },
  async setPassword(service, account, password) {
    memoryStore.set(`${service}:${account}`, password);
  },
  async deletePassword(service, account) {
    return memoryStore.delete(`${service}:${account}`);
  },
};

let cached: KeyStore | null = null;

async function store(): Promise<KeyStore> {
  if (cached) return cached;
  try {
    const { Entry } = await import("@napi-rs/keyring");
    const adapter: KeyStore = {
      getPassword(service, account) {
        try {
          const entry = new Entry(service, account);
          return Promise.resolve(entry.getPassword() ?? null);
        } catch (err) {
          log.warn(
            "[pond] keyring getPassword failed, treating as missing",
            err,
          );
          return Promise.resolve(null);
        }
      },
      setPassword(service, account, password) {
        const entry = new Entry(service, account);
        entry.setPassword(password);
        return Promise.resolve();
      },
      deletePassword(service, account) {
        try {
          const entry = new Entry(service, account);
          return Promise.resolve(entry.deletePassword());
        } catch {
          return Promise.resolve(false);
        }
      },
    };
    cached = adapter;
  } catch (err) {
    log.warn(
      "[pond] @napi-rs/keyring unavailable, falling back to in-memory keystore",
      err,
    );
    cached = inMemoryFallback;
  }
  return cached;
}

export async function getIngestToken(): Promise<string | null> {
  const s = await store();
  return s.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_INGEST_TOKEN);
}

export async function setIngestToken(token: string): Promise<void> {
  const s = await store();
  await s.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_INGEST_TOKEN, token);
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

export async function getAiGatewayKey(): Promise<string | null> {
  const s = await store();
  return s.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_AI_GATEWAY_KEY);
}

export async function setAiGatewayKey(key: string): Promise<void> {
  const s = await store();
  await s.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_AI_GATEWAY_KEY, key);
}
