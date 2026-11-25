import { IconBroom, IconCopy, IconDots, IconDownload } from "@pond/icons";
import { Dialog, Menu, Tooltip } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import type { AssistantMessage } from "@shared/assistant";
import { conversationMarkdown } from "@shared/conversation-markdown";
import { DEFAULT_FISH_NAME } from "@shared/fish-contracts";
import { fishPaneItems, useFish } from "@/features/fish";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { assistant, useAssistant } from "../../state/assistant";

export function FishChatActions() {
  const state = useAssistant();
  const target = useFish(state.fishId);
  return (
    <ChatActions
      chatId={state.chatId}
      title={target?.name ?? DEFAULT_FISH_NAME}
      messages={state.messages}
      disabled={state.busy || state.loading}
      items={target ? fishPaneItems(target) : undefined}
    />
  );
}

export function ChatActions({
  chatId,
  title,
  messages,
  disabled,
  items = [],
}: {
  chatId: string | null;
  title: string | null;
  messages: Array<AssistantMessage>;
  disabled: boolean;
  items?: Array<MenuItemSpec>;
}) {
  async function transfer(kind: "copy" | "export") {
    if (!chatId) return;
    try {
      const result =
        kind === "copy"
          ? await window.pond.query("clipboard.writeText", {
              text: conversationMarkdown(title, messages),
            })
          : await window.pond.query("agent.exportChat", { chatId });
      if (!result.ok) {
        if (result.reason === "cancelled") return;
        throw new Error(result.error);
      }
      notify({
        id: "chat-transfer",
        title:
          kind === "copy" ? "Conversation copied" : "Conversation exported",
      });
    } catch (error) {
      notify({
        id: "chat-transfer",
        title:
          kind === "copy"
            ? "Could not copy conversation"
            : "Could not export conversation",
        description: errorCopy(error, "Try again."),
      });
    }
  }
  return (
    <Menu.Root>
      <Tooltip label="Fish Actions" side="bottom">
        <Menu.Trigger icon size="sm" variant="ghost" aria-label="Fish Actions">
          <IconDots />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end">
          <Menu.Popup>
            <Menu.Items
              items={[
                {
                  label: "Copy Conversation",
                  icon: <IconCopy />,
                  disabled: disabled || !messages.length,
                  onClick: () => void transfer("copy"),
                },
                {
                  label: "Export Markdown",
                  icon: <IconDownload />,
                  disabled: disabled || !messages.length,
                  onClick: () => void transfer("export"),
                },
                { type: "separator" },
                {
                  label: "Clear Conversation",
                  icon: <IconBroom />,
                  variant: "destructive",
                  disabled: disabled || !chatId,
                  onClick: () => {
                    if (!chatId) return;
                    Dialog.confirm({
                      title: "Clear Conversation",
                      description:
                        "This permanently deletes every message. Your Saves stay in your Library.",
                      confirmLabel: "Clear",
                      confirmVariant: "destructive",
                      onConfirm: () => assistant.deleteChat(chatId),
                    });
                  },
                },
                ...(items.length
                  ? [{ type: "separator" } as const, ...items]
                  : []),
              ]}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
