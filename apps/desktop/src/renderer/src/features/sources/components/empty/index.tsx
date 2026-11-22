import { IconNodes3 } from "@pond/icons";
import { Button, Empty } from "@pond/ui";
import { useState } from "react";
import { sourceNewMenu } from "@/features/sources/state/source-new-menu";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";

export function SourcesEmpty() {
  const [extensionOpen, setExtensionOpen] = useState(false);
  return (
    <Empty.Root>
      <Empty.Media>
        <IconNodes3 size={14} />
      </Empty.Media>
      <Empty.Title>No sources yet</Empty.Title>
      <Empty.Description>
        Connect an account or watch a public one to keep Pond in sync.
        Connecting an account needs the Pond browser extension.
      </Empty.Description>
      <Empty.Action>
        <Button variant="text" size="sm" onClick={() => setExtensionOpen(true)}>
          Get Extension
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => sourceNewMenu.open()}
        >
          New Source
        </Button>
      </Empty.Action>
      <BrowserExtensionDialog
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
      />
    </Empty.Root>
  );
}
