import { useState } from "react";
import styles from "./styles.module.css";

interface ResponseAnnouncementProps {
  running: boolean;
  responseId?: string;
  requiredAction?: string;
  error?: string | null;
}

function nextAnnouncement(
  before: ResponseAnnouncementProps,
  { running, responseId, requiredAction, error }: ResponseAnnouncementProps,
): string | null {
  if (
    error &&
    (error !== before.error ||
      before.running ||
      responseId !== before.responseId)
  ) {
    return `Response failed: ${error}`;
  }
  if (running) {
    return "";
  }
  if (
    requiredAction &&
    (before.running ||
      requiredAction !== before.requiredAction ||
      responseId !== before.responseId)
  ) {
    return requiredAction;
  }
  if (responseId && (before.running || responseId !== before.responseId)) {
    return "Response complete.";
  }
  return null;
}

export function ResponseAnnouncement({
  running,
  responseId,
  requiredAction,
  error,
}: ResponseAnnouncementProps) {
  const current = { running, responseId, requiredAction, error };
  const [previous, setPrevious] = useState(current);
  const [announcement, setAnnouncement] = useState(
    () => nextAnnouncement(current, current) ?? "",
  );
  if (
    running !== previous.running ||
    responseId !== previous.responseId ||
    requiredAction !== previous.requiredAction ||
    error !== previous.error
  ) {
    setPrevious(current);
    const next = nextAnnouncement(previous, current);
    if (next !== null) {
      setAnnouncement(next);
    }
  }
  return (
    <span
      className={styles.announcement}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </span>
  );
}
