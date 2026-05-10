import { randomBytes } from "node:crypto";
import log from "electron-log/main.js";
import {
  KEYCHAIN_AI_GATEWAY_KEY,
  KEYCHAIN_INGEST_TOKEN,
  KEYCHAIN_SERVICE,
} from "../shared/constants";

/**
 * Lazy `@napi-rs/keyring` loader. The module is NAPI/prebuilt — there's
 * nothing to rebuild against the current Electron ABI — but it is still
 * native code, so we wrap the import in `try`/`catch` and fall back to
 * an in-memory store if it fails to load (sandbox blocking it on CI,
 * unsupported platform, etc.). Tokens won't survive a restart in that
 * mode, but dev + CI stay green.
 *
 * `@napi-rs/keyring` exposes a synchronous `Entry` API. We wrap each
 * call in `Promise.resolve(...)` to keep the existing async `KeyStore`
 * interface that the rest of the app already speaks.
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
    const { Entry } = await import("@napi-rs/keyring");
    const adapter: KeyStore = {
      getPassword(service, account) {
        try {
          const entry = new Entry(service, account);
          // Returns `string | null` synchronously; we normalise an
          // accidental `undefined` (older platforms) to `null`.
          return Promise.resolve(entry.getPassword() ?? null);
        } catch (err) {
          // OS-level `entry not found` errors raise on some platforms
          // instead of returning null; treat all read failures as
          // "no token stored".
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
