import { Input } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

export function InlineNameEditor({
  name,
  ariaLabel,
  className,
  placeholder,
  errorTitle = "Couldn't rename. Try again.",
  empty = "keep",
  onSave,
  onFinish,
}: {
  name: string;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
  errorTitle?: string;
  empty?: "keep" | "cancel";
  onSave: (name: string) => Promise<void>;
  onFinish: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    input.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  async function commit() {
    if (settled.current) return;
    settled.current = true;
    const trimmed = input.current?.value.trim() ?? "";
    const next = trimmed || (empty === "keep" ? name : "");
    if (!next) {
      onFinish();
      return;
    }
    try {
      if (next !== name) await onSave(next);
      onFinish();
    } catch {
      settled.current = false;
      setError(true);
      input.current?.focus();
    }
  }

  return (
    <Input.Root className={styles.root} size="sm" variant="borderless">
      <Input.Field
        ref={input}
        className={cn(styles.input, className)}
        defaultValue={name}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        title={error ? errorTitle : undefined}
        onClick={(event) => event.stopPropagation()}
        onChange={() => setError(false)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            settled.current = true;
            onFinish();
          }
        }}
      />
    </Input.Root>
  );
}
