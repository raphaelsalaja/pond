import {
  IconArrowRotateClockwise,
  IconChatBubble,
  IconCheck,
  IconCopy,
} from "@pond/icons";
import { useEffect, useState } from "react";
import { Button } from "../button";
import { ActionHint } from "../shared/action-hint";
import { Tooltip } from "../tooltip";
import styles from "./styles.module.css";

export function ActionBar({
  text,
  onCopy,
  onQuote,
  onRetry,
}: {
  text?: string;
  /** Writes the text through the host app; without it the browser clipboard is used. */
  onCopy?: (text: string) => Promise<void>;
  onQuote?: () => void;
  onRetry?: () => void;
} = {}) {
  const [copied, setCopied] = useState(false);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Tooltip.Provider>
      <div className={styles.actions}>
        <ActionHint label={copied ? "Copied" : "Copy"}>
          <Button
            icon
            size="xs"
            variant="text"
            aria-label="Copy"
            disabled={!text}
            onClick={() => {
              if (!text) {
                return;
              }
              const write =
                onCopy ?? ((value) => navigator.clipboard.writeText(value));
              void write(text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </Button>
        </ActionHint>
        {onQuote ? (
          <ActionHint label="Quote">
            <Button
              icon
              variant="text"
              size="xs"
              aria-label="Quote"
              onClick={onQuote}
            >
              <IconChatBubble />
            </Button>
          </ActionHint>
        ) : null}
        {onRetry ? (
          <ActionHint label="Retry">
            <Button
              icon
              variant="text"
              size="xs"
              aria-label="Retry"
              className={styles.retry}
              data-spinning={spinning || undefined}
              onAnimationEnd={() => setSpinning(false)}
              onClick={() => {
                setSpinning(true);
                onRetry();
              }}
            >
              <IconArrowRotateClockwise />
            </Button>
          </ActionHint>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
