import { IconClipboard, IconLink2 } from "@pond/icons";
import { Button, Dialog, Input, Reveal, Shimmer } from "@pond/ui";
import styles from "./styles.module.css";

export interface LinkError {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface LinkPageProps {
  value: string;
  onValueChange: (value: string) => void;
  onPaste: () => void;
  busy: boolean;
  error: LinkError | null;
}

export function LinkPage({
  value,
  onValueChange,
  onPaste,
  busy,
  error,
}: LinkPageProps) {
  return (
    <div className={styles.page}>
      <Dialog.Description className={styles.description}>
        Paste a link to a video, song or playlist. Pond saves it to your
        library.
      </Dialog.Description>
      <div className={styles.row}>
        <Input.Root size="lg" className={styles.input}>
          <Input.Icon>
            <IconLink2 size={14} />
          </Input.Icon>
          <Input.Field
            autoFocus
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            aria-label="Link"
            aria-invalid={error ? true : undefined}
            placeholder="https://"
            value={value}
            disabled={busy}
            onValueChange={onValueChange}
          />
        </Input.Root>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          disabled={busy}
          onClick={onPaste}
        >
          <IconClipboard size={14} />
          Paste
        </Button>
      </div>
      <div role="status" className={styles.status}>
        <Reveal visible={busy} initial={false}>
          <div className={styles.skeleton}>
            <span className={styles.poster} />
            <span className={styles.lines}>
              <Shimmer.Root className={styles.reading}>
                Reading link
              </Shimmer.Root>
              <span className={styles.line} />
            </span>
          </div>
        </Reveal>
        <Reveal visible={!busy && error != null} initial={false}>
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
    </div>
  );
}
