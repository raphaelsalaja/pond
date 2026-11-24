import { z } from "zod";
import {
  FishMcpSaveInput,
  FishMcpToolAccess,
} from "../../../shared/fish-mcp-contracts";
import type { FishMcpServerStatus } from "../../../shared/fish-mcp-contracts";
import { userError } from "../../../shared/user-error";
import type { FishMcpManager } from "../../core/agent/fish-mcp/client";
import { fishMcp } from "../../core/agent/fish-mcp/live";
import { getFishMcpStore } from "../../core/agent/fish-mcp/store";
import type { FishMcpStore } from "../../core/agent/fish-mcp/store";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

const ServerId = z.object({ id: z.string().min(1) });

export function createFishMcpQueries(
  store: () => FishMcpStore,
  manager: Pick<FishMcpManager, "status" | "reset" | "ensure">,
) {
  async function statuses(): Promise<Array<FishMcpServerStatus>> {
    const servers = await store().list();
    const live = new Map(manager.status().map((s) => [s.server.id, s]));
    return servers.map((server) => {
      const current = live.get(server.id);
      return {
        server,
        state: current?.state ?? (server.enabled ? "idle" : "off"),
        error: current?.error,
        tools: (current?.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
          readOnlyHint: tool.annotations?.readOnlyHint === true,
          access: server.toolAccess[tool.name] ?? "review",
        })),
      };
    });
  }

  async function statusFor(id: string): Promise<FishMcpServerStatus> {
    const found = (await statuses()).find((s) => s.server.id === id);
    if (!found) {
      throw userError("That server no longer exists.");
    }
    return found;
  }

  return {
    "fishMcp.list": query(z.object({}), () => statuses()),
    "fishMcp.save": query(FishMcpSaveInput, async ({ server, secrets }) => {
      const saved = await store().save(server, secrets);
      await manager.reset(saved.id);
      await manager.ensure();
      return statusFor(saved.id);
    }),
    "fishMcp.remove": query(ServerId, async ({ id }) => {
      await manager.reset(id);
      await store().remove(id);
      return { ok: true as const };
    }),
    "fishMcp.test": query(ServerId, async ({ id }) => {
      await manager.reset(id);
      await manager.ensure();
      return statusFor(id);
    }),
    "fishMcp.setToolAccess": query(
      ServerId.extend({ tool: z.string().min(1), access: FishMcpToolAccess }),
      async ({ id, tool, access }) => {
        await store().setToolAccess(id, tool, access);
        return statusFor(id);
      },
    ),
  } satisfies QueryHandlerMap;
}

export const fishMcpQueries = createFishMcpQueries(getFishMcpStore, fishMcp);
