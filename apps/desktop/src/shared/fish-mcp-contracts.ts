import { z } from "zod";
import type { EmptyInput, OkResult } from "./query-contracts-shared";

export const FishMcpServerName = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,31}$/,
    "Use lowercase letters, numbers, and dashes.",
  );

export const FishMcpSecretName = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/,
    "Use letters, numbers, dashes, and underscores.",
  );

export const FishMcpToolAccess = z.enum(["review", "read", "off"]);
export type FishMcpToolAccess = z.infer<typeof FishMcpToolAccess>;

const base = {
  id: z.string().min(1),
  name: FishMcpServerName,
  enabled: z.boolean(),
  secretNames: z.array(FishMcpSecretName).max(20),
  toolAccess: z.record(z.string(), FishMcpToolAccess),
};

const StdioServer = z.object({
  ...base,
  transport: z.literal("stdio"),
  command: z.string().trim().min(1).max(1024),
  args: z.array(z.string().max(4096)).max(64),
  cwd: z.string().max(4096).optional(),
});

const HttpServer = z.object({
  ...base,
  transport: z.literal("http"),
  url: z.url({ protocol: /^https?$/ }),
});

export const FishMcpServerConfig = z.discriminatedUnion("transport", [
  StdioServer,
  HttpServer,
]);
export type FishMcpServerConfig = z.infer<typeof FishMcpServerConfig>;

const draftId = { id: z.string().min(1).optional() };

/** A server as Settings submits it; a new server has no id yet. */
export const FishMcpServerDraft = z.discriminatedUnion("transport", [
  StdioServer.extend(draftId),
  HttpServer.extend(draftId),
]);
export type FishMcpServerDraft = z.infer<typeof FishMcpServerDraft>;

export const FishMcpSaveInput = z.object({
  server: FishMcpServerDraft,
  /** Blank values keep what the keychain already has. */
  secrets: z.record(z.string(), z.string().max(8192)),
});
export type FishMcpSaveInput = z.infer<typeof FishMcpSaveInput>;

export const FishMcpToolInfo = z.object({
  name: z.string(),
  description: z.string(),
  readOnlyHint: z.boolean(),
  access: FishMcpToolAccess,
});
export type FishMcpToolInfo = z.infer<typeof FishMcpToolInfo>;

export const FishMcpServerState = z.enum([
  "off",
  "idle",
  "connected",
  "failed",
]);
export type FishMcpServerState = z.infer<typeof FishMcpServerState>;

export const FishMcpServerStatus = z.object({
  server: FishMcpServerConfig,
  state: FishMcpServerState,
  error: z.string().optional(),
  tools: z.array(FishMcpToolInfo),
});
export type FishMcpServerStatus = z.infer<typeof FishMcpServerStatus>;

export interface FishMcpQueryInputs {
  "fishMcp.list": EmptyInput;
  "fishMcp.save": FishMcpSaveInput;
  "fishMcp.remove": { id: string };
  "fishMcp.test": { id: string };
  "fishMcp.setToolAccess": {
    id: string;
    tool: string;
    access: FishMcpToolAccess;
  };
}

export interface FishMcpQueryResults {
  "fishMcp.list": Array<FishMcpServerStatus>;
  "fishMcp.save": FishMcpServerStatus;
  "fishMcp.remove": OkResult;
  "fishMcp.test": FishMcpServerStatus;
  "fishMcp.setToolAccess": FishMcpServerStatus;
}
