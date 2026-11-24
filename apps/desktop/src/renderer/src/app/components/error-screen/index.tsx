import { Button } from "@pond/ui";
import { z } from "zod";
import styles from "./styles.module.css";

const ThrownStringSchema = z.string();

function messageOf(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  const thrown = ThrownStringSchema.safeParse(cause);
  return thrown.success ? thrown.data : "Pond hit an unexpected error.";
}

function stackOf(cause: unknown): string | undefined {
  return cause instanceof Error ? cause.stack : undefined;
}

export function ErrorScreen({
  error,
  reset,
  componentStack,
}: {
  error: unknown;
  reset?: () => void;
  componentStack?: string | null;
}) {
  const message = messageOf(error);
  const stack = stackOf(error);
  const hasDetails = Boolean(stack || componentStack);

  return (
    <div className={styles.root} role="alert">
      <div className={styles.card}>
        <h1 className={styles.title}>Couldn&apos;t load this view</h1>
        <p className={styles.message}>{message}</p>

        {hasDetails ? (
          <details className={styles.details}>
            <summary className={styles.summary}>Technical Details</summary>
            <pre className={styles.stack}>
              {[stack, componentStack].filter(Boolean).join("\n\n")}
            </pre>
          </details>
        ) : null}

        <div className={styles.actions}>
          {reset ? (
            <Button variant="secondary" onClick={reset}>
              Try Again
            </Button>
          ) : null}
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    </div>
  );
}
