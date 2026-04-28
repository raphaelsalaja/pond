import { randomBytes } from "node:crypto";
import {
  KEYCHAIN_AI_GATEWAY_KEY,
  KEYCHAIN_INGEST_TOKEN,
  KEYCHAIN_SERVICE,
} from "../shared/constants";

/**
 * Lazy `keytar` loader. `keytar` is a native module; if it fails to load
 * (rebuild glitch, sandbox blocking it on CI) we fall back to an in-memory
 * store so the rest of the app still works. Tokens won't survive a restart
 * in that mode, but dev + CI stay green.
 */

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
    const mod = await import("keytar");
    cached = mod.default ?? (mod as unknown as KeyStore);
  } catch (err) {
    console.warn(
      "[pond] keytar unavailable, falling back to in-memory keystore",
      err,
    );
    cached = inMemoryFallback;
  }
  return cached;
}

/**
 * Read the bearer token used by the browser extension on `/api/v2/item/add`.
 * Generated on first launch via `ensureIngestToken()` and surfaced in the
 * onboarding UI so the user can paste it into the extension popup.
 */
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

/** AI Gateway key. `null` = AI enrichment disabled, app still works. */
export async function getAiGatewayKey(): Promise<string | null> {
  const s = await store();
  return s.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_AI_GATEWAY_KEY);
}

export async function setAiGatewayKey(key: string): Promise<void> {
  const s = await store();
  await s.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_AI_GATEWAY_KEY, key);
}
