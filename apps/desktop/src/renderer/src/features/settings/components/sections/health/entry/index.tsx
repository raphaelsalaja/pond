import { IconChevronRight } from "@pond/icons";
import { Badge, Button, Reveal } from "@pond/ui";
import type { QueueAttempt } from "@shared/queue-contracts";
import { type ReactNode, useId, useState } from "react";
import { formatNumber } from "@/shared/lib/format";
import {
  describeFinding,
  describeSize,
  type HealthEntry,
  RESOLUTION_LABELS,
  STATUS_LABELS,
} from "../categories";
import { STATUS_TONES } from "../tones";
import styles from "./styles.module.css";

const ORIGINALS = {
  usable: "Usable. Pond can rebuild from them.",
  unusable: "Missing or damaged.",
  none: "This Save has no original files.",
  unknown: null,
} satisfies Record<HealthEntry["originals"], string | null>;

const ATTEMPT_LIMIT = 10;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function attemptLabel(attempt: QueueAttempt): string {
  const when = new Date(attempt.ts).toLocaleString();
  const error = attempt.errorMessage?.trim();
  return error ? `${when}: ${error}` : `${when}: ${attempt.outcome}`;
}

function Attempts({ saveId }: { saveId: string }) {
  const [attempts, setAttempts] = useState<QueueAttempt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    setFailed(false);
    try {
      setAttempts(
        await window.pond.query("queue.attempts", {
          saveId,
          limit: ATTEMPT_LIMIT,
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (!attempts) {
    return (
      <div className={styles.history}>
        <Button
          size="xs"
          variant="text"
          loading={loading}
          onClick={() => void load()}
        >
          Show Attempts
        </Button>
        {failed ? (
          <span className={styles.error}>Couldn't load attempts.</span>
        ) : null}
      </div>
    );
  }
  if (attempts.length === 0) {
    return <p className={styles.note}>No attempts recorded yet.</p>;
  }
  return (
    <ol className={styles.attempts} aria-label="Attempts">
      {attempts.map((attempt) => (
        <li key={attempt.id}>{attemptLabel(attempt)}</li>
      ))}
    </ol>
  );
}

export function HealthEntryRow({
  entry,
  actions,
  history = false,
}: {
  entry: HealthEntry;
  actions: ReactNode;
  history?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const originals = ORIGINALS[entry.originals];
  return (
    <li className={styles.entry} data-open={open || undefined}>
      <div className={styles.head}>
        <Button
          className={styles.toggle}
          variant="bare"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          <IconChevronRight className={styles.chevron} size={12} />
          <span className={styles.title} title={entry.title}>
            {entry.title}
          </span>
          <span className={styles.summary}>{entry.summary}</span>
        </Button>
        <Badge tone={STATUS_TONES[entry.status]}>
          {STATUS_LABELS[entry.status]}
        </Badge>
      </div>
      <Reveal visible={open}>
        <div id={detailsId} className={styles.details}>
          <dl className={styles.facts}>
            <Fact label="Expected">{entry.expected}</Fact>
            <Fact label="Found">{entry.found}</Fact>
            {entry.reason ? <Fact label="Reason">{entry.reason}</Fact> : null}
            {originals ? <Fact label="Originals">{originals}</Fact> : null}
            <Fact label="Next Step">{RESOLUTION_LABELS[entry.resolution]}</Fact>
            {entry.nextAttemptAt ? (
              <Fact label="Next Attempt">
                {new Date(entry.nextAttemptAt).toLocaleString()}
              </Fact>
            ) : null}
            {entry.attempts ? (
              <Fact label="Attempts">
                {entry.attempts.max
                  ? `${formatNumber(entry.attempts.count)} of ${formatNumber(entry.attempts.max)}`
                  : formatNumber(entry.attempts.count)}
              </Fact>
            ) : null}
          </dl>
          {entry.files.length > 0 ? (
            <table className={styles.files}>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Found</th>
                </tr>
              </thead>
              <tbody>
                {entry.files.map((file) => (
                  <tr
                    key={`${file.kind}:${file.path}`}
                    data-problem={file.finding !== "ok" || undefined}
                  >
                    <td title={file.path}>{file.path}</td>
                    <td>{describeSize(file.expectedSize)}</td>
                    <td>
                      {file.finding === "ok"
                        ? describeSize(file.foundSize)
                        : file.renameTo
                          ? `Rename to ${file.renameTo}`
                          : describeFinding(file)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {history ? <Attempts saveId={entry.saveId} /> : null}
          <div className={styles.actions}>{actions}</div>
        </div>
      </Reveal>
    </li>
  );
}
