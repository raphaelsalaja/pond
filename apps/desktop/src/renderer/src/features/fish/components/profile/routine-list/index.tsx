import { Badge, Button, HoverHighlight, Switch } from "@pond/ui";
import type { FishRoutine, FishSummary } from "@shared/fish-contracts";
import { describeWhen, isRoutineDue, nextRun } from "@shared/fish-routine";
import { setRoutinePaused } from "../../../lib/menu";
import { lastRunText, nextRunText, useRunClock } from "../../../lib/runs";
import { fish as fishStore } from "../../../state/fish";
import styles from "./styles.module.css";

function scheduleText(routine: FishRoutine, now: Date) {
  if (routine.paused) {
    return "Paused";
  }
  const next = nextRunText(
    nextRun(
      routine.when,
      routine.lastRun?.at ?? routine.createdAt,
      now.getTime(),
    ),
    now,
  );
  return [describeWhen(routine.when), next].filter(Boolean).join(" · ");
}

/** Presence says the fish is busy, not which routine; a due routine is the one it picked up. */
function RunLine({
  fish,
  routine,
  now,
}: {
  fish: FishSummary;
  routine: FishRoutine;
  now: Date;
}) {
  const running =
    Boolean(fish.activity) && isRoutineDue(routine, now.getTime());
  const run = routine.lastRun;
  if (!running && !run) {
    return null;
  }
  return (
    <span className={styles.run}>
      <Badge.Dot
        tone={
          running ? "accent" : run?.status === "failed" ? "negative" : "neutral"
        }
        live={running}
      />
      {running ? "Running" : run ? lastRunText(run, now) : null}
    </span>
  );
}

export function RoutineList({ fish }: { fish: FishSummary }) {
  const now = useRunClock();
  if (!fish.routines.length) {
    return <p className={styles.empty}>Ask in chat to set a routine.</p>;
  }
  return (
    <ul className={styles.list}>
      {fish.routines.map((routine) => (
        <li key={routine.id} className={styles.row} data-hover-row="">
          <Button
            variant="bare"
            className={styles.open}
            onClick={() => fishStore.openRoutine(fish.id, routine.id)}
          >
            <span className={styles.name}>{routine.name}</span>
            <span className={styles.schedule}>
              {scheduleText(routine, now)}
            </span>
            <RunLine fish={fish} routine={routine} now={now} />
          </Button>
          <Switch.Root
            className={styles.switch}
            checked={!routine.paused}
            aria-label={`${routine.paused ? "Resume" : "Pause"} ${routine.name}`}
            onCheckedChange={(checked) =>
              setRoutinePaused(fish, routine, !checked)
            }
          />
        </li>
      ))}
      <HoverHighlight render={<li />} />
    </ul>
  );
}
