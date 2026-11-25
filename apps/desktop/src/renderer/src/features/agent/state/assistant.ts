import type {
  AssistantActivity,
  AssistantFileAttachment,
  AssistantMessage,
  AssistantProvider,
  AssistantResultSet,
  AssistantSend,
  AssistantSource,
  AssistantToolStep,
} from "@shared/assistant";
import { assistantMessages, assistantSources } from "@shared/assistant";
import { DEFAULT_FISH_ID } from "@shared/fish-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import { folders, getOverlays } from "@/features/library/view-state";
import { stopAssistant } from "./assistant-runtime";
import { hydratePondChat, pondChatSession } from "./pond-chat";

const ChatsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string().nullable(),
    updatedAt: z.coerce.date().optional(),
  }),
);
const ChatSchema = z.object({ id: z.string() });

interface DraftSnapshot {
  content: string;
  attachments: AssistantSource[];
  files: AssistantFileAttachment[];
  provider: AssistantProvider;
  modelId?: AssistantSend["modelId"];
  controls?: AssistantSend["controls"];
  context: Pick<
    AssistantSend,
    "scope" | "attachmentIds" | "semanticQuery" | "visualSaveId"
  >;
  replyToQuestion?: string;
  keepDraft?: boolean;
}
export interface AssistantState {
  fishId: string;
  chatId: string | null;
  chats: z.infer<typeof ChatsSchema>;
  referenceMessageId: string | null;
  messages: AssistantMessage[];
  draft: string;
  attachments: AssistantSource[];
  files: AssistantFileAttachment[];
  busy: boolean;
  loading: boolean;
  requestId: string | null;
  sources: AssistantSource[];
  activity: AssistantActivity;
  results: AssistantResultSet[];
  steps: AssistantToolStep[];
  error: string | null;
  failed: DraftSnapshot | null;
  /** Sent on its own once the running reply finishes. */
  queued: DraftSnapshot | null;
  /** The chat the in-flight reply belongs to, which may differ from the open chat. */
  runChatId: string | null;
  /** Bumped when something outside the composer wants it focused. */
  focusRequest: number;
}
type AssistantWorkspace = Omit<AssistantState, "busy"> & {
  sending: boolean;
};
const store = new Store<AssistantWorkspace>({
  fishId: DEFAULT_FISH_ID,
  chatId: null,
  chats: [],
  referenceMessageId: null,
  messages: [],
  draft: "",
  attachments: [],
  files: [],
  sending: false,
  loading: false,
  requestId: null,
  sources: [],
  activity: "thinking",
  results: [],
  steps: [],
  error: null,
  failed: null,
  queued: null,
  runChatId: null,
  focusRequest: 0,
});
const patch = (value: Partial<AssistantWorkspace>) =>
  store.setState((state) => ({ ...state, ...value }));
let subscribers = 0;
let historyVersion = 0;
let cancelledRequest: string | null = null;
const isBusy = () => store.state.sending;
const currentMessages = () => store.state.messages;

function setMessages(messages: AssistantMessage[]) {
  patch({ messages });
}

async function refreshChats() {
  const { fishId } = store.state;
  const chats = ChatsSchema.parse(
    await window.pond.query("agent.chats", { fishId }),
  );
  if (store.state.fishId === fishId) patch({ chats });
}
async function loadMessages(chatId: string) {
  return assistantMessages.parse(
    await window.pond.query("agent.messages", { chatId }),
  );
}
async function refreshMessages(chatId: string, version = historyVersion) {
  const messages = await loadMessages(chatId);
  if (store.state.chatId === chatId && version === historyVersion) {
    setMessages(messages);
    if (!store.state.sending) hydratePondChat(chatId, messages);
  }
}

type ComposerSnapshot = Pick<
  AssistantWorkspace,
  "draft" | "attachments" | "files" | "failed" | "error" | "queued"
>;
const composers = new Map<string, ComposerSnapshot>();
let fishSelected = false;

function composerKey(chatId: string | null, fishId = store.state.fishId) {
  return chatId ?? `new:${fishId}`;
}

function saveComposer() {
  const { chatId, draft, attachments, files, failed, error, queued } =
    store.state;
  composers.set(composerKey(chatId), {
    draft,
    attachments,
    files,
    failed,
    error,
    queued,
  });
}

function composerFor(
  chatId: string | null,
  fishId = store.state.fishId,
): ComposerSnapshot {
  return (
    composers.get(composerKey(chatId, fishId)) ?? {
      draft: "",
      attachments: [],
      files: [],
      failed: null,
      error: null,
      queued: null,
    }
  );
}

function snapshotContext(
  attachments: AssistantSource[],
): DraftSnapshot["context"] {
  return {
    scope: { kind: "library" },
    attachmentIds: attachments.map((save) => save.id),
    ...getOverlays(),
  };
}

function restoreDraft(sent: DraftSnapshot) {
  if (
    !sent.keepDraft &&
    !store.state.draft &&
    !store.state.attachments.length &&
    !store.state.files.length
  )
    patch({
      draft: sent.content,
      attachments: sent.attachments,
      files: sent.files,
    });
}

export const assistant = {
  showReferences(messageId: string) {
    const message = currentMessages().find(
      (message) => message.id === messageId && message.role === "assistant",
    );
    if (message?.metadata?.sources?.length)
      patch({ referenceMessageId: messageId });
  },
  closeReferences() {
    patch({ referenceMessageId: null });
  },
  setDraft(draft: string) {
    patch({ draft });
  },
  requestFocus() {
    patch({ focusRequest: store.state.focusRequest + 1 });
  },
  appendDraft(content: string) {
    const draft = [store.state.draft, content].filter(Boolean).join("\n\n");
    if (draft.length > 32000) {
      patch({
        error: "This text is too long to add. Shorten the message first.",
      });
      return false;
    }
    patch({ draft });
    return true;
  },
  quote(content: string) {
    const quote = content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const draft = `${[store.state.draft, quote].filter(Boolean).join("\n\n")}\n\n`;
    if (draft.length > 32000) {
      patch({
        error:
          "This quote is too long for the message. Copy a shorter passage instead.",
      });
      return false;
    }
    patch({ draft });
    return true;
  },
  clearError() {
    patch({ error: null });
  },
  attach(saves: AssistantSource[]) {
    const merged = [
      ...new Map(
        [...store.state.attachments, ...saves].map((save) => [save.id, save]),
      ).values(),
    ];
    patch({
      attachments: merged.slice(0, 200),
      error:
        merged.length > 200
          ? "You can attach up to 200 Saves per message."
          : null,
    });
  },
  removeAttachment(id: string) {
    patch({
      attachments: store.state.attachments.filter((save) => save.id !== id),
    });
  },
  attachFiles(files: AssistantFileAttachment[]) {
    const merged = [
      ...new Map(
        [...store.state.files, ...files].map((file) => [file.id, file]),
      ).values(),
    ];
    patch({
      files: merged.slice(0, 10),
      error:
        merged.length > 10
          ? "You can attach up to 10 files per message."
          : null,
    });
  },
  removeFile(id: string) {
    patch({ files: store.state.files.filter((file) => file.id !== id) });
  },
  async attachIds(ids: string[]) {
    try {
      assistant.attach(
        assistantSources.parse(
          await window.pond.query("agent.attachments", {
            ids: ids.slice(0, 200),
          }),
        ),
      );
    } catch {
      patch({ error: "Could not load these Saves. Try again." });
    }
  },
  fishId() {
    return store.state.fishId;
  },
  selectFish(fishId: string) {
    if (fishSelected && store.state.fishId === fishId) return;
    fishSelected = true;
    /** A reply from another fish can still be running. Keep it running, but stop showing its chat here. */
    const wasBusy = isBusy();
    saveComposer();
    const version = ++historyVersion;
    patch({
      fishId,
      chats: [],
      chatId: null,
      messages: [],
      referenceMessageId: null,
      ...composerFor(null, fishId),
      sources: [],
      results: [],
      steps: [],
      loading: true,
    });
    const settle = () => {
      if (version === historyVersion) patch({ loading: false });
    };
    void refreshChats()
      .then(() => {
        if (version !== historyVersion) return settle();
        const chatId = store.state.chats[0]?.id;
        if (!chatId) return settle();
        if (!wasBusy) return void assistant.openChat(chatId);
        /** openChat is blocked while a reply runs, so load this fish's own chat directly. */
        void loadMessages(chatId)
          .then((messages) => {
            if (version !== historyVersion) return;
            hydratePondChat(chatId, messages);
            patch({
              chatId,
              messages,
              ...composerFor(chatId, fishId),
              loading: false,
            });
          })
          .catch(settle);
      })
      .catch(() => {
        settle();
        patch({ error: "Could not load recent chats." });
      });
  },
  newChat() {
    if (isBusy()) return;
    saveComposer();
    historyVersion++;
    patch({
      chatId: null,
      messages: [],
      referenceMessageId: null,
      ...composerFor(null),
      sources: [],
      results: [],
      steps: [],
      loading: false,
    });
  },
  async deleteChat(chatId: string) {
    if (isBusy()) throw new Error("Wait for the reply to finish.");
    const result = await window.pond.query("agent.deleteChat", { chatId });
    if (!result.ok)
      throw new Error(result.error || "Could not delete this chat.");
    if (store.state.chatId === chatId) assistant.newChat();
    composers.delete(chatId);
    await refreshChats();
  },
  async openChat(chatId: string) {
    if (isBusy()) return;
    saveComposer();
    const version = ++historyVersion;
    patch({ loading: true });
    try {
      const messages = await loadMessages(chatId);
      if (version !== historyVersion) return;
      hydratePondChat(chatId, messages);
      patch({
        chatId,
        messages,
        ...composerFor(chatId),
        referenceMessageId: null,
        sources: [],
        results: [],
        steps: [],
        loading: false,
      });
    } catch {
      if (version === historyVersion)
        patch({
          error: "Could not load this conversation. Try again.",
          loading: false,
        });
    }
  },
  async send(
    provider: AssistantProvider,
    run?: Pick<AssistantSend, "modelId" | "controls">,
    snapshot?: DraftSnapshot,
  ) {
    if (isBusy() || store.state.loading) return;
    const sent = snapshot ?? {
      content: store.state.draft.trim(),
      attachments: store.state.attachments,
      files: store.state.files,
      context: snapshotContext(store.state.attachments),
      provider,
      modelId: run?.modelId,
      controls: run?.controls,
    };
    if (!sent.content) return;
    const requestId = crypto.randomUUID();
    patch({
      sending: true,
      error: null,
      failed: null,
      sources: [],
      activity: "thinking",
      results: [],
      steps: [],
      requestId,
    });
    if (
      !snapshot ||
      (!snapshot.keepDraft &&
        store.state.draft === sent.content &&
        store.state.attachments === sent.attachments &&
        store.state.files === sent.files)
    )
      patch({
        draft: "",
        attachments: [],
        files: [],
      });
    let chatId = store.state.chatId;
    try {
      if (!chatId) {
        const chat = ChatSchema.parse(
          await window.pond.query("agent.newChat", {
            fishId: store.state.fishId,
          }),
        );
        chatId = chat.id;
        composers.delete(composerKey(null));
        patch({ chatId });
      }
      if (!chatId || cancelledRequest === requestId) {
        if (cancelledRequest === requestId) restoreDraft(sent);
        return;
      }
      const threadId = chatId;
      patch({ runChatId: threadId });
      const message: AssistantMessage = {
        id: requestId,
        chatId: threadId,
        role: "user",
        content: sent.content,
        metadata: {
          attachments: sent.attachments,
          files: sent.files,
          replyToQuestion: sent.replyToQuestion,
        },
      };
      const session = pondChatSession(threadId);
      await session.sendMessage(
        {
          text: message.content,
          metadata: message.metadata,
        },
        {
          body: {
            requestId,
            provider: sent.provider,
            modelId: sent.modelId,
            controls: sent.controls,
            attachmentIds: sent.context.attachmentIds,
            fileAttachmentIds: sent.files.map((file) => file.id),
            scope: sent.context.scope,
            semanticQuery: sent.context.semanticQuery,
            visualSaveId: sent.context.visualSaveId,
            replyToQuestion: sent.replyToQuestion,
          },
        },
      );
      if (session.error) throw session.error;
      patch({ error: null });
    } catch (error) {
      if (cancelledRequest !== requestId) {
        restoreDraft(sent);
        patch({
          error:
            error instanceof Error
              ? error.message
              : "Could not finish the request. Check the conversation before trying again.",
          failed: sent,
        });
      }
    } finally {
      if (cancelledRequest === requestId) cancelledRequest = null;
      patch({
        sending: false,
        requestId: null,
        runChatId: null,
        sources: [],
      });
      await Promise.all([
        chatId
          ? refreshMessages(chatId).catch(() => undefined)
          : Promise.resolve(),
        refreshChats().catch(() => undefined),
      ]);
      const next = store.state.queued;
      if (next && !store.state.error && !isBusy()) {
        patch({ queued: null });
        void assistant.send(
          next.provider,
          { modelId: next.modelId, controls: next.controls },
          next,
        );
      }
    }
  },
  /** While a reply runs, holds the draft to send next instead of dropping the keypress. */
  async queue(
    provider: AssistantProvider,
    run?: Pick<AssistantSend, "modelId" | "controls">,
  ) {
    if (!isBusy()) return assistant.send(provider, run);
    const content = store.state.draft.trim();
    if (!content) return;
    const previous = store.state.queued;
    const attachments = [
      ...new Map(
        [...(previous?.attachments ?? []), ...store.state.attachments].map(
          (save) => [save.id, save],
        ),
      ).values(),
    ].slice(0, 200);
    patch({
      queued: {
        content: previous ? `${previous.content}\n\n${content}` : content,
        attachments,
        files: [...(previous?.files ?? []), ...store.state.files].slice(0, 10),
        context: snapshotContext(attachments),
        provider,
        modelId: run?.modelId,
        controls: run?.controls,
        keepDraft: true,
      },
      draft: "",
      attachments: [],
      files: [],
    });
  },
  unqueue() {
    patch({ queued: null });
  },
  /** Stops the running reply; the queued message goes out as soon as it settles. */
  sendQueuedNow() {
    if (store.state.queued && isBusy()) assistant.stop();
  },
  async answerQuestion(
    messageId: string,
    content: string,
    provider: AssistantProvider,
    run?: Pick<AssistantSend, "modelId" | "controls">,
  ) {
    if (currentMessages().at(-1)?.id !== messageId) return;
    await assistant.send(provider, run, {
      content,
      attachments: [],
      files: [],
      context: snapshotContext([]),
      provider,
      modelId: run?.modelId,
      controls: run?.controls,
      replyToQuestion: messageId,
      keepDraft: true,
    });
  },
  async suggest(content: string, provider: AssistantProvider) {
    await assistant.send(provider, undefined, {
      content,
      attachments: [],
      files: [],
      context: snapshotContext([]),
      provider,
      keepDraft: true,
    });
  },
  stop() {
    cancelledRequest = store.state.requestId;
    stopAssistant(store.state.chatId, store.state.requestId);
  },
  async retry() {
    const sent = store.state.failed;
    if (sent)
      await assistant.send(
        sent.provider,
        { modelId: sent.modelId, controls: sent.controls },
        sent,
      );
  },
  /** Replaces the latest reply by running its request again with the current model. */
  async regenerate(
    provider: AssistantProvider,
    run?: Pick<AssistantSend, "modelId" | "controls">,
  ) {
    const chatId = store.state.chatId;
    if (!chatId || isBusy() || store.state.loading) return;
    const result = await window.pond.query("agent.regenerate", { chatId });
    if (!result.ok) {
      patch({ error: result.error });
      return;
    }
    await refreshMessages(chatId).catch(() => undefined);
    await assistant.send(provider, run, {
      content: result.content,
      attachments: result.attachments,
      files: result.files,
      context: snapshotContext(result.attachments),
      provider,
      modelId: run?.modelId,
      controls: run?.controls,
      replyToQuestion: result.replyToQuestion,
      keepDraft: true,
    });
  },
  async review(
    messageId: string,
    changeIds: string[],
    action: "apply" | "undo" | "dismiss",
  ) {
    const result = await window.pond.query("agent.review", {
      messageId,
      changeIds,
      action,
    });
    const messages = currentMessages().map((m) =>
      m.id === messageId
        ? { ...m, metadata: { ...m.metadata, changes: result.changes } }
        : m,
    );
    setMessages(messages);
    if (store.state.chatId) hydratePondChat(store.state.chatId, messages);
    await folders.refresh();
  },
  async refresh() {
    const chatId = store.state.chatId;
    if (chatId) await refreshMessages(chatId);
    await refreshChats();
  },
};

export function useAssistant() {
  useEffect(() => {
    if (subscribers++ === 0) {
      void refreshChats().catch(() =>
        patch({ error: "Could not load recent chats." }),
      );
    }
    const unsubscribe = window.pond.onAgentChunk((chunk) => {
      /** A reply can finish in a chat the user has since left. */
      if (store.state.runChatId && chunk.chatId !== store.state.runChatId)
        return;
      if (chunk.type === "activity") patch({ activity: chunk.activity });
      if (chunk.type === "sources") patch({ sources: chunk.sources });
      if (chunk.type === "results") patch({ results: chunk.results });
      if (chunk.type === "steps") patch({ steps: chunk.steps });
    });
    return () => {
      unsubscribe();
      --subscribers;
    };
  }, []);
  const state = useSelector(store, (state) => state);
  return {
    ...state,
    /** Only the chat that owns the reply is busy; another fish stays usable. */
    busy:
      state.sending && (!state.runChatId || state.runChatId === state.chatId),
  };
}
