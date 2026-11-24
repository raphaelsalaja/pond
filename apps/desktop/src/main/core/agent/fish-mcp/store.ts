import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { FishMcpServerConfig } from "../../../../shared/fish-mcp-contracts";
import type {
  FishMcpServerDraft,
  FishMcpToolAccess,
} from "../../../../shared/fish-mcp-contracts";
import { userError } from "../../../../shared/user-error";
import { deleteSecret, getSecret, setSecret } from "../../../keychain";
import { renameWithRetry } from "../../../lib/rename-retry";

interface Keychain {
  getSecret(account: string): Promise<string | null>;
  setSecret(account: string, value: string): Promise<void>;
  deleteSecret(account: string): Promise<void>;
}

const FileSchema = z.object({
  version: z.literal(1),
  servers: z.array(FishMcpServerConfig),
});
const SecretsSchema = z.record(z.string(), z.string());
const ErrorCodeSchema = z.object({ code: z.string() });

const account = (id: string) => `fish-mcp:${id}`;

export function createFishMcpStore(
  file: string,
  keychain: Keychain,
  newId: () => string = randomUUID,
) {
  let queue: Promise<unknown> = Promise.resolve();

  /** Saves and access changes rewrite the whole file, so they run one at a time. */
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }

  async function list(): Promise<Array<FishMcpServerConfig>> {
    try {
      return FileSchema.parse(JSON.parse(await readFile(file, "utf8"))).servers;
    } catch (error) {
      if (ErrorCodeSchema.safeParse(error).data?.code !== "ENOENT") {
        log.warn("[pond fish-mcp] unreadable config", error);
      }
      return [];
    }
  }

  async function write(servers: Array<FishMcpServerConfig>): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify({ version: 1, servers }, null, 2), {
      mode: 0o600,
    });
    await renameWithRetry(temp, file);
  }

  async function secrets(id: string): Promise<Record<string, string>> {
    const raw = await keychain.getSecret(account(id));
    if (!raw) {
      return {};
    }
    try {
      return SecretsSchema.parse(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  function save(
    input: FishMcpServerDraft,
    incoming: Record<string, string>,
  ): Promise<FishMcpServerConfig> {
    return serial(async () => {
      const servers = await list();
      const id = input.id ?? newId();
      if (servers.some((s) => s.name === input.name && s.id !== id)) {
        throw userError(`A server named ${input.name} already exists.`);
      }
      const server = FishMcpServerConfig.parse({ ...input, id });
      const previous = await secrets(id);
      const next: Record<string, string> = {};
      for (const name of server.secretNames) {
        const value = incoming[name]?.trim() ? incoming[name] : previous[name];
        if (value) {
          next[name] = value;
        }
      }
      await keychain.setSecret(account(id), JSON.stringify(next));
      await write([...servers.filter((s) => s.id !== id), server]);
      return server;
    });
  }

  function remove(id: string): Promise<void> {
    return serial(async () => {
      await write((await list()).filter((s) => s.id !== id));
      await keychain.deleteSecret(account(id));
    });
  }

  function setToolAccess(
    id: string,
    tool: string,
    access: FishMcpToolAccess,
  ): Promise<FishMcpServerConfig> {
    return serial(async () => {
      const servers = await list();
      const server = servers.find((s) => s.id === id);
      if (!server) {
        throw userError("That server no longer exists.");
      }
      const updated = {
        ...server,
        toolAccess: { ...server.toolAccess, [tool]: access },
      };
      await write(servers.map((s) => (s.id === id ? updated : s)));
      return updated;
    });
  }

  return { list, save, remove, secrets, setToolAccess };
}

export type FishMcpStore = ReturnType<typeof createFishMcpStore>;

let live: FishMcpStore | undefined;

/** Startup may move `userData`, so the path resolves on first use rather than at import. */
export function getFishMcpStore(): FishMcpStore {
  live ??= createFishMcpStore(
    join(app.getPath("userData"), "fish-mcp-servers.json"),
    { getSecret, setSecret, deleteSecret },
  );
  return live;
}
