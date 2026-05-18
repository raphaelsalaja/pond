import { useCallback, useEffect, useRef, useState } from "react";
import type { PondApi } from "../../../../preload";
import type {
  SuggestionAction,
  SuggestionPayload,
  SuggestionShortcut,
} from "../../../../shared/suggestion";
import styles from "./styles.module.css";

declare global {
  interface Window {
    pond: PondApi;
  }
}

const ICON_LIMIT = 6;

export function SuggestionToast() {
  const [payload, setPayload] = useState<SuggestionPayload | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible">(
    "hidden",
  );
  const enterTimer = useRef<number | null>(null);

  useEffect(() => {
    window.pond.suggestions.ready();
    const off = window.pond.suggestions.onShow((next) => {
      setPayload(next);
      setPhase("entering");
      if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
      enterTimer.current = window.setTimeout(() => setPhase("visible"), 16);
    });
    return () => {
      off();
      if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
    };
  }, []);

  const handleAction = useCallback((action: SuggestionAction) => {
    window.pond.suggestions.act(action.id);
  }, []);

  const handleDismiss = useCallback(() => {
    window.pond.suggestions.dismiss();
  }, []);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const escAction = payload.actions.find((a) => a.shortcut === "esc");
        if (escAction) handleAction(escAction);
        else handleDismiss();
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const enterAction = payload.actions.find((a) => a.shortcut === "enter");
        if (enterAction) {
          handleAction(enterAction);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, handleAction, handleDismiss]);

  if (!payload) return null;

  const icons = (payload.icons ?? []).slice(0, ICON_LIMIT);

  return (
    <div
      className={styles.card}
      data-phase={phase}
      role="alertdialog"
      aria-labelledby="suggestion-title"
      aria-describedby={payload.body ? "suggestion-body" : undefined}
    >
      <header className={styles.header}>
        <h1 id="suggestion-title" className={styles.title}>
          {payload.title}
        </h1>
        <div className={styles.headerEnd}>
          {icons.length > 0 ? (
            <ul className={styles.icons} aria-hidden>
              {icons.map((src) => (
                <li key={src} className={styles.iconCell}>
                  <img
                    src={src}
                    alt=""
                    className={styles.icon}
                    referrerPolicy="no-referrer"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className={styles.collapse}
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <ChevronDown />
          </button>
        </div>
      </header>

      {payload.body ? (
        <p id="suggestion-body" className={styles.body}>
          {payload.body}
        </p>
      ) : null}

      <footer className={styles.actions}>
        {payload.actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            onClick={() => handleAction(action)}
          />
        ))}
      </footer>
    </div>
  );
}

function ActionButton({
  action,
  onClick,
}: {
  action: SuggestionAction;
  onClick: () => void;
}) {
  const variant = action.variant ?? inferVariant(action);
  return (
    <button
      type="button"
      data-variant={variant}
      className={styles.action}
      onClick={onClick}
    >
      <span className={styles.actionLabel}>{action.label}</span>
      {action.shortcut ? <ShortcutChip shortcut={action.shortcut} /> : null}
    </button>
  );
}

function inferVariant(action: SuggestionAction) {
  if (action.shortcut === "enter") return "primary";
  if (action.shortcut === "esc") return "ghost";
  return "secondary";
}

function ShortcutChip({ shortcut }: { shortcut: SuggestionShortcut }) {
  const label = shortcut === "esc" ? "ESC" : "↵";
  return (
    <kbd className={styles.kbd} aria-hidden>
      {label}
    </kbd>
  );
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <title>Dismiss</title>
      <path
        d="M4 6.5L8 10.5L12 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
