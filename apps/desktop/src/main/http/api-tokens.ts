import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { ApiTokenInfoSchema } from "@pond/schema/api";
import type { ApiTokenInfo, ApiTokenScope } from "@pond/schema/api";
import { z } from "zod";
import { KEYCHAIN_API_TOKENS } from "../../shared/constants";
import { getSecret, setSecret } from "../keychain";

const TOKEN_PREFIX = "pond_";
const LAST_USED_RESOLUTION_MS = 60_000;

const StoredTokenSchema = ApiTokenInfoSchema.extend({ hash: z.string() });
type StoredToken = z.infer<typeof StoredTokenSchema>;

export interface ApiTokenStorage {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
}

function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function publicInfo({ hash: _hash, ...info }: StoredToken): ApiTokenInfo {
  return info;
}

function parseStored(raw: string | null): Array<StoredToken> {
  if (!raw) {
    return [];
  }
  try {
    const parsed = z.array(StoredTokenSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Only a SHA-256 digest is kept, so a token is shown once, at creation. */
export function createApiTokenStore(
  storage: ApiTokenStorage,
  now: () => number = Date.now,
) {
  let cache: Array<StoredToken> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Array<StoredToken>> {
    cache ??= parseStored(await storage.read());
    return cache;
  }

  function mutate<T>(
    change: (tokens: Array<StoredToken>) => {
      tokens: Array<StoredToken>;
      result: T;
    },
  ): Promise<T> {
    const next = queue.then(async () => {
      const { tokens, result } = change(await load());
      await storage.write(JSON.stringify(tokens));
      cache = tokens;
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }

  async function list(): Promise<Array<ApiTokenInfo>> {
    return (await load()).map(publicInfo);
  }

  function create(
    name: string,
    scopes: ReadonlyArray<ApiTokenScope>,
  ): Promise<{ token: string; info: ApiTokenInfo }> {
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
    const stored: StoredToken = {
      id: randomUUID(),
      name,
      scopes: [...new Set(scopes)],
      createdAt: now(),
      lastUsedAt: null,
      hash: digest(token).toString("hex"),
    };
    return mutate((tokens) => ({
      tokens: [...tokens, stored],
      result: { token, info: publicInfo(stored) },
    }));
  }

  function revoke(id: string): Promise<boolean> {
    return mutate((tokens) => ({
      tokens: tokens.filter((entry) => entry.id !== id),
      result: tokens.some((entry) => entry.id === id),
    }));
  }

  async function authenticate(presented: string): Promise<ApiTokenInfo | null> {
    if (!presented.startsWith(TOKEN_PREFIX)) {
      return null;
    }
    const presentedDigest = digest(presented);
    const match = (await load()).find((entry) => {
      const stored = Buffer.from(entry.hash, "hex");
      return (
        stored.length === presentedDigest.length &&
        timingSafeEqual(stored, presentedDigest)
      );
    });
    if (!match) {
      return null;
    }
    const usedAt = now();
    if (
      match.lastUsedAt === null ||
      usedAt - match.lastUsedAt > LAST_USED_RESOLUTION_MS
    ) {
      void mutate((tokens) => ({
        tokens: tokens.map((entry) =>
          entry.id === match.id ? { ...entry, lastUsedAt: usedAt } : entry,
        ),
        result: undefined,
      })).catch(() => {});
    }
    return publicInfo(match);
  }

  return { authenticate, create, list, revoke };
}

export const apiTokens = createApiTokenStore({
  read: () => getSecret(KEYCHAIN_API_TOKENS),
  write: (value) => setSecret(KEYCHAIN_API_TOKENS, value),
});
