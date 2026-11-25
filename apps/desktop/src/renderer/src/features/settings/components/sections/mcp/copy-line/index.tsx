import { Button } from "@pond/ui";
import { useState } from "react";
import styles from "./styles.module.css";

export function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  return (
    <div className={styles.step}>
      <p className={styles.merge}>{label}</p>
      <div className={styles.command}>
        <code className={styles.value} title={value}>
          {value}
        </code>
        <Button
          size="xs"
          variant="ghost"
          disabled={!value}
          loading={copying}
          onClick={() => {
            void (async () => {
              setCopying(true);
              setCopied(false);
              try {
                const result = await window.pond.query("clipboard.writeText", {
                  text: value,
                });
                if (!result.ok) throw new Error("Clipboard write failed");
                setCopied(true);
              } finally {
                setCopying(false);
              }
            })();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
