import { writeFile } from "node:fs/promises";
import { app, dialog, shell } from "electron";
import { z } from "zod";
import { assistantProvider, assistantSend } from "../../../shared/assistant";
import { conversationMarkdown } from "../../../shared/conversation-markdown";
import { FishIdSchema } from "../../../shared/fish-contracts";
import { MCP_HOST_IDS, MCP_INSTALL_HOSTS } from "../../../shared/mcp-hosts";
import type { QueryResult } from "../../../shared/query-contracts";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

const Params = z.looseObject({});

export const agentQueries = {
  "agent.keys": query(Params, async () => {
    const { listKeys } = await import("../../core/agent/keys");
    return await listKeys();
  }),

  "agent.saveKey": query(Params, async (params) => {
    const { parseProvider, saveKey } = await import("../../core/agent/keys");
    const provider = parseProvider(String(params.provider ?? ""));
    if (!provider) return { ok: false, error: "Unknown provider." };
    return await saveKey(provider, String(params.key ?? ""));
  }),

  "agent.removeKey": query(
    z.object({ provider: assistantProvider }),
    async (params): Promise<QueryResult<"agent.removeKey">> => {
      const { parseProvider, removeKey } =
        await import("../../core/agent/keys");
      const provider = parseProvider(String(params.provider ?? ""));
      if (!provider) return { ok: false, error: "Unknown provider." };
      return await removeKey(provider);
    },
  ),

  "agent.setKeyEnabled": query(
    z.object({ provider: assistantProvider, enabled: z.boolean() }),
    async (params): Promise<QueryResult<"agent.setKeyEnabled">> => {
      const { parseProvider, setKeyEnabled } =
        await import("../../core/agent/keys");
      const provider = parseProvider(String(params.provider ?? ""));
      if (!provider) return { ok: false, error: "Unknown provider." };
      return await setKeyEnabled(provider, Boolean(params.enabled));
    },
  ),

  "agent.verifyKey": query(Params, async (params) => {
    const { parseProvider, verifyKey } = await import("../../core/agent/keys");
    const provider = parseProvider(String(params.provider ?? ""));
    if (!provider) return { ok: false, error: "Unknown provider." };
    return await verifyKey(provider, String(params.key ?? ""));
  }),

  "agent.listModels": query(
    z.object({ provider: assistantProvider }),
    async (params): Promise<QueryResult<"agent.listModels">> => {
      const { listProviderModels, parseProvider } =
        await import("../../core/agent/keys");
      const provider = parseProvider(String(params.provider ?? ""));
      if (!provider) {
        return { ok: false, models: [], error: "Unknown provider." };
      }
      return await listProviderModels(provider);
    },
  ),

  "agent.listAvailableModels": query(Params, async () => {
    const { listAvailableModels } = await import("../../core/agent/keys");
    return await listAvailableModels();
  }),

  "agent.chats": query(
    z.object({ fishId: FishIdSchema.optional() }),
    async ({ fishId }) => {
      const { listChats } = await import("../../core/agent/persist");
      return await listChats(fishId);
    },
  ),

  "agent.messages": query(
    z.object({ chatId: z.string().min(1) }),
    async (params) => {
      const { listMessages } = await import("../../core/agent/persist");
      return await listMessages(String(params.chatId ?? ""));
    },
  ),

  "agent.newChat": query(
    z.object({ fishId: FishIdSchema.optional() }),
    async ({ fishId }) => {
      const { fishThread } = await import("../../core/agent/persist");
      const { created: _created, ...chat } = await fishThread(fishId);
      return chat;
    },
  ),

  "agent.renameChat": query(
    z.object({
      chatId: z.string().min(1),
      title: z.string().trim().min(1).max(120),
    }),
    async ({ chatId, title }) => {
      const { renameChat } = await import("../../core/agent/persist");
      return renameChat(chatId, title);
    },
  ),

  "agent.exportChat": query(
    z.object({ chatId: z.string().min(1) }),
    async ({ chatId }): Promise<QueryResult<"agent.exportChat">> => {
      const { listChats, listMessages } =
        await import("../../core/agent/persist");
      const chat = (await listChats()).find((chat) => chat.id === chatId);
      if (!chat) return { ok: false, error: "This chat no longer exists." };
      const content = conversationMarkdown(
        chat.title,
        await listMessages(chatId),
      );
      const picked = await dialog.showSaveDialog({
        title: "Export Conversation",
        defaultPath: "Conversation.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
        buttonLabel: "Export",
      });
      if (picked.canceled || !picked.filePath) {
        return { ok: false, reason: "cancelled" };
      }
      await writeFile(picked.filePath, content, "utf8");
      return { ok: true };
    },
  ),

  "agent.deleteChat": query(
    z.object({ chatId: z.string().min(1) }),
    async (params) => {
      const { deleteChat } = await import("../../core/agent/persist");
      return await deleteChat(String(params.chatId ?? ""));
    },
  ),

  "agent.regenerate": query(
    z.object({ chatId: z.string().min(1) }),
    async ({ chatId }): Promise<QueryResult<"agent.regenerate">> => {
      const { rewindLastTurn } = await import("../../core/agent/persist");
      const turn = await rewindLastTurn(chatId);
      if (!turn.ok) return turn;
      return {
        ok: true,
        content: turn.content,
        attachments: turn.metadata.attachments ?? [],
        files: turn.metadata.files ?? [],
        replyToQuestion: turn.metadata.replyToQuestion,
      };
    },
  ),

  "agent.send": query(Params, async (params) => {
    const { sendMessage } = await import("../../core/agent/chat");
    return await sendMessage(assistantSend.parse(params));
  }),

  "agent.stop": query(Params, async (params) => {
    const { stopMessage } = await import("../../core/agent/chat");
    return stopMessage(String(params.chatId), String(params.requestId));
  }),

  "agent.searchSaves": query(Params, async (params) => {
    const { searchLibrary, searchLibraryInput } =
      await import("../../core/agent/tools");
    return searchLibrary(searchLibraryInput.parse(params));
  }),

  "agent.attachments": query(Params, async (params) => {
    const { readSave } = await import("../../core/agent/tools");
    const ids = z.array(z.string()).max(200).parse(params.ids);
    return (await Promise.all(ids.map((id) => readSave({ id })))).flatMap(
      (result) => (result.save ? [result.save] : []),
    );
  }),

  "agent.pickAttachments": query(Params, async () => {
    const { pickLocalAttachments } =
      await import("../../core/agent/local-attachments");
    return pickLocalAttachments();
  }),

  "agent.review": query(Params, async (params) => {
    const { reviewChanges, reviewInput } =
      await import("../../core/agent/review");
    return reviewChanges(reviewInput.parse(params));
  }),

  "agent.mcpSnippet": query(
    z.looseObject({ host: z.enum(MCP_HOST_IDS).optional() }),
    async (params) => {
      const { pondMcpSnippet } = await import("../../core/agent/mcp-hosts");
      return {
        ...pondMcpSnippet(process.execPath, ["--mcp"], params.host ?? "other"),
        app: app.getName(),
      };
    },
  ),

  "agent.mcpClients": query(Params, async () => {
    const { mcpClientStatus } = await import("../../core/agent/mcp-hosts");
    return { clients: await mcpClientStatus() };
  }),

  "agent.openMcpInstall": query(
    z.object({ id: z.enum(MCP_INSTALL_HOSTS) }),
    async ({ id }): Promise<QueryResult<"agent.openMcpInstall">> => {
      if (id === "claude-desktop") {
        const { writePondMcpBundle } =
          await import("../../core/agent/mcp-bundle");
        const failure = await shell.openPath(await writePondMcpBundle());
        return failure
          ? {
              ok: false,
              error:
                "Claude Desktop didn't open the Pond extension. Copy the config instead.",
            }
          : { ok: true };
      }
      const { mcpDeeplinkUrl } = await import("../../core/agent/mcp-hosts");
      const url = mcpDeeplinkUrl(id);
      if (!url) {
        return {
          ok: false,
          error: "This client has no install link. Copy the config instead.",
        };
      }
      await shell.openExternal(url);
      return { ok: true };
    },
  ),
} satisfies QueryHandlerMap;
