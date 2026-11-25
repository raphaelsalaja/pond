import { Button } from "@pond/ui";
import { useState } from "react";
import styles from "./styles.module.css";

export function JsonBlock({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  return (
    <>
      <pre className={styles.code}>
        <code>{json}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        disabled={!json}
        loading={copying}
        onClick={() => {
          void (async () => {
            setCopying(true);
            setCopied(false);
            try {
              const result = await window.pond.query("clipboard.writeText", {
                text: json,
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
    </>
  );
}
