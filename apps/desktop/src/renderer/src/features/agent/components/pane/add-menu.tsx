import { IconFile, IconPaperclip, IconPlus } from "@pond/icons";
import { Menu, Tooltip } from "@pond/ui";
import type { AssistantFileAttachment } from "@shared/assistant";
import { useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";

interface AddMenuProps {
  disabled?: boolean;
  onAttach: (files: AssistantFileAttachment[]) => void | Promise<void>;
  onAddSaves: () => void;
}

export function AddMenu({
  disabled = false,
  onAttach,
  onAddSaves,
}: AddMenuProps) {
  const [busy, setBusy] = useState(false);
  const chose = useRef(false);

  async function pickFiles() {
    setBusy(true);
    try {
      const picked = await window.pond.query("agent.pickAttachments", {});
      if (!picked.ok) throw new Error(picked.error);
      if (picked.files.length === 0) return;
      await onAttach(picked.files);
    } catch (error) {
      notify({
        id: "agent-attach-files",
        title: "Could not attach files",
        description: errorCopy(error, "Try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) chose.current = false;
      }}
    >
      <Tooltip label="Add" side="top">
        <Menu.Trigger
          icon
          size="sm"
          variant="tertiary"
          rounding="full"
          aria-label="Add"
          aria-busy={busy || undefined}
          disabled={disabled || busy}
        >
          <IconPlus size={14} />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8}>
          <Menu.Popup finalFocus={() => !chose.current}>
            <Menu.Items
              items={[
                {
                  label: "Add Files",
                  icon: <IconPaperclip />,
                  onClick: () => {
                    chose.current = true;
                    void pickFiles();
                  },
                },
                {
                  label: "Add Saves",
                  icon: <IconFile />,
                  onClick: () => {
                    chose.current = true;
                    onAddSaves();
                  },
                },
              ]}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
