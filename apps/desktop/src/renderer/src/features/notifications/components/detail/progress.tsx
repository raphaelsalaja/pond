import { Button, Loader } from "@pond/ui";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { openSettings } from "@/shared/lib/open-settings";
import type { InboxProgress } from "../../state/progress";
import { ignoresKey, navigationKey } from "./keys";
import { Detail } from "./layout";

interface ProgressDetailProps {
  progress: InboxProgress;
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
}

export function ProgressDetail({
  progress,
  onStep,
  onClose,
}: ProgressDetailProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (ignoresKey(event)) return;
    if (navigationKey(event, onStep, onClose)) event.preventDefault();
  }

  return (
    <Detail.Root ref={ref} aria-label={progress.title} onKeyDown={onKeyDown}>
      <Detail.Header>
        <Detail.Icon>
          <Loader.Spinner />
        </Detail.Icon>
        <Detail.Title>{progress.title}</Detail.Title>
        {progress.startedAt ? <Detail.Time at={progress.startedAt} /> : null}
      </Detail.Header>
      {progress.detail ? (
        <Detail.Summary aria-live="polite">{progress.detail}</Detail.Summary>
      ) : null}
      <Detail.Status>{progress.about}</Detail.Status>
      {progress.health ? (
        <Detail.Actions>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openSettings("health")}
          >
            Open Library Health
          </Button>
        </Detail.Actions>
      ) : null}
    </Detail.Root>
  );
}
