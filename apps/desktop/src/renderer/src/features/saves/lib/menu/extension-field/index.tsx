import { Input } from "@pond/ui";
import { useState } from "react";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

export function ExtensionField({ ids }: { ids: Array<string> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const extension = value.trim().replace(/^\./, "");
    if (!extension || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.pond.query("saves.batchEditExtension", {
        ids,
        extension,
      });
      notify({
        id: "batch-extension",
        title: "Extensions changed",
        description: `${formatPlural(result.changedFiles, { one: "file", other: "files" })} changed. Use Undo to reverse this action.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={styles.field}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input.Root size="sm">
        <Input.Field
          aria-label="Extension"
          placeholder="png"
          value={value}
          disabled={busy}
          onValueChange={setValue}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </Input.Root>
    </form>
  );
}
