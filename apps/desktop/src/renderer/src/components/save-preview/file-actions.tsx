import { Button, Tooltip } from "@pond/ui";
import { useState } from "react";
import type { Save } from "@/pool/types";
import { REVEAL_LABEL } from "./helpers";
import styles from "./styles.module.css";

export function FileActions({ save }: { save: Save }) {
  const [status, setStatus] = useState<
    "idle" | "revealing" | "opening" | "error"
  >("idle");
  const hasFile = save.files.length > 0;

  const onReveal = async () => {
    if (!hasFile) return;
    setStatus("revealing");
    try {
      const res = await window.pond.revealSave(save.id);
      setStatus(res.ok ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  };

  const onOpen = async () => {
    if (!hasFile) return;
    setStatus("opening");
    try {
      const res = await window.pond.openSaveFile(save.id);
      setStatus(res.ok ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  };

  const revealButton = (
    <Button
      size="sm"
      onClick={onReveal}
      disabled={!hasFile || status !== "idle"}
    >
      {status === "revealing" ? "Opening…" : REVEAL_LABEL}
    </Button>
  );

  return (
    <div className={styles.actions}>
      <div className={styles["actions-row"]}>
        {hasFile ? (
          revealButton
        ) : (
          <Tooltip.Root content="This save has no local file yet — nothing to reveal.">
            <span>{revealButton}</span>
          </Tooltip.Root>
        )}
        <Button
          size="sm"
          onClick={onOpen}
          disabled={!hasFile || status !== "idle"}
        >
          {status === "opening" ? "Opening…" : "Open with Default App"}
        </Button>
      </div>
      {status === "error" ? (
        <p className={styles.hint}>Couldn't open — the file may be missing.</p>
      ) : null}
    </div>
  );
}
