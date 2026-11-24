import { IconLink2 } from "@pond/icons";
import { Button, Dialog, Input, Reveal, Shimmer } from "@pond/ui";
import { extractLinks } from "@shared/downloader-contracts";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

export interface LinkError {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface LinkFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  error: LinkError | null;
  autoFocus?: boolean;
  className?: string;
}

export function LinkField({
  value,
  onValueChange,
  error,
  autoFocus,
  className,
}: LinkFieldProps) {
  return (
    <Input.Root className={cn(styles.input, className)}>
      <Input.Icon>
        <IconLink2 size={14} />
      </Input.Icon>
      <Input.Field
        autoFocus={autoFocus}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label="Link"
        aria-invalid={error ? true : undefined}
        placeholder="https://"
        value={value}
        onValueChange={onValueChange}
        /** A single-line field drops the newlines between pasted links. */
        onPaste={(event) => {
          const links = extractLinks(event.clipboardData.getData("text"));
          if (links.length < 2) {
            return;
          }
          event.preventDefault();
          onValueChange(links.join(" "));
        }}
      />
    </Input.Root>
  );
}

interface LinkStatusProps {
  busy?: boolean;
  error: LinkError | null;
}

/** Reading row or the reason a link failed, under the link field. */
export function LinkStatus({ busy = false, error }: LinkStatusProps) {
  return (
    <div role="status" className={styles.status}>
      <Reveal visible={busy} initial={false}>
        <div className={styles.skeleton}>
          <span className={styles.poster} />
          <span className={styles.lines}>
            <Shimmer.Root className={styles.reading}>Reading link</Shimmer.Root>
            <span className={styles.line} />
          </span>
        </div>
      </Reveal>
      <Reveal visible={!busy && error !== null} initial={false}>
        <div className={styles.failure}>
          <p className={styles.error}>{error?.message}</p>
          {error?.action ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={error.action.onClick}
            >
              {error.action.label}
            </Button>
          ) : null}
        </div>
      </Reveal>
    </div>
  );
}

interface LinkPageProps {
  value: string;
  onValueChange: (value: string) => void;
  busy: boolean;
  error: LinkError | null;
}

export function LinkPage({ value, onValueChange, busy, error }: LinkPageProps) {
  return (
    <div className={styles.page}>
      <Dialog.Description className={styles.description}>
        Paste a link to a video, post, page, file or playlist. Pond saves it to
        your library.
      </Dialog.Description>
      <LinkField
        autoFocus
        value={value}
        onValueChange={onValueChange}
        error={error}
      />
      <LinkStatus busy={busy} error={error} />
    </div>
  );
}
