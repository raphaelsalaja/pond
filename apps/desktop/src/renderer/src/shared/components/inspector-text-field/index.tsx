import { IconChevronDown } from "@pond/icons";
import { Button, Input } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

interface ClampStyle extends CSSProperties {
  "--clamp-lines": number;
}

interface Draft {
  value: string;
  pending: boolean;
  error: string | null;
}
export type InspectorDrafts = Map<string, Draft>;
export function InspectorTextField({
  className,
  drafts,
  cacheKey,
  label,
  value,
  multiline,
  readOnly,
  disabled,
  size = "sm",
  variant = "secondary",
  appearance,
  padding,
  suffix,
  placeholder,
  mixedPlaceholder,
  maxLength,
  clamp,
  inputRef,
  commit,
}: {
  className?: string;
  drafts: InspectorDrafts;
  cacheKey: string;
  label: string;
  value: string | null;
  multiline?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  size?: React.ComponentProps<typeof Input.Root>["size"];
  variant?: React.ComponentProps<typeof Input.Root>["variant"];
  appearance?: React.ComponentProps<typeof Input.Field>["appearance"];
  padding?: React.ComponentProps<typeof Input.Textarea>["padding"];
  suffix?: ReactNode;
  placeholder?: string;
  mixedPlaceholder?: string;
  maxLength?: number;
  clamp?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  commit(value: string): Promise<void>;
}) {
  const [, update] = useState(0);
  const cancelled = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const draft = drafts.get(cacheKey);
  const current = draft?.value ?? value ?? "";
  const clamped = Boolean(clamp) && !expanded;

  useLayoutEffect(() => {
    void current;
    const area = rootRef.current?.querySelector("textarea");
    if (!clamped || !area) {
      setOverflowing(false);
      return;
    }
    const measure = () =>
      setOverflowing(area.scrollHeight > area.clientHeight + 1);
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [clamped, current]);

  function refresh() {
    update((count) => count + 1);
  }
  async function save() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = drafts.get(cacheKey);
    if (!next || next.pending || readOnly || disabled) return;
    if (next.value === value) {
      drafts.delete(cacheKey);
      refresh();
      return;
    }
    next.pending = true;
    next.error = null;
    refresh();
    try {
      await commit(next.value);
      drafts.delete(cacheKey);
    } catch (error) {
      next.pending = false;
      next.error = errorCopy(error, "Couldn't save changes. Try again.");
    }
    refresh();
  }
  const props = {
    "aria-label": label,
    value: current,
    placeholder:
      value === null
        ? (mixedPlaceholder ?? `Multiple ${label.toLowerCase()}`)
        : (placeholder ?? label),
    disabled,
    readOnly: readOnly || draft?.pending,
    onValueChange: (text: string) => {
      if (disabled) return;
      drafts.set(cacheKey, { value: text, pending: false, error: null });
      refresh();
    },
    onBlur: () => void save(),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        cancelled.current = true;
        drafts.delete(cacheKey);
        refresh();
        event.currentTarget.blur();
      } else if (
        event.key === "Enter" &&
        !multiline &&
        !event.nativeEvent.isComposing
      )
        event.currentTarget.blur();
    },
  };
  const clampStyle: ClampStyle | undefined = clamp
    ? { "--clamp-lines": clamp }
    : undefined;
  return (
    <div
      ref={rootRef}
      className={cn(styles.root, className)}
      data-clamped={clamped || undefined}
      data-overflowing={overflowing || undefined}
      style={clampStyle}
    >
      <Input.Root size={size} variant={variant} className={styles.field}>
        {multiline ? (
          <Input.Textarea
            {...props}
            className={styles.area}
            appearance={appearance}
            padding={padding}
            sizing="content"
            rows={2}
            maxLength={maxLength ?? 8192}
          />
        ) : (
          <Input.Field
            {...props}
            ref={inputRef}
            appearance={appearance}
            maxLength={maxLength ?? 255}
          />
        )}
        {suffix ? <Input.Suffix>{suffix}</Input.Suffix> : null}
      </Input.Root>
      {overflowing ? (
        <Button
          className={styles.more}
          size="sm"
          variant="ghost"
          onClick={() => setExpanded(true)}
        >
          Read More
          <IconChevronDown size={12} />
        </Button>
      ) : null}
      {draft?.error ? (
        <div role="alert" className={styles.error}>
          {draft.error}
          <Button size="sm" variant="ghost" onClick={() => void save()}>
            Try Again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
