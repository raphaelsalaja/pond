import { IconChevronLeft, IconTrash, IconXmark } from "@pond/icons";
import { Button, Pane, Tooltip } from "@pond/ui";
import type { FishRoutine, FishSummary } from "@shared/fish-contracts";
import { describeWhen, nextRun } from "@shared/fish-routine";
import { Section } from "@/shared/components/inspector-section";
import { PropertyList } from "@/shared/components/property-list";
import {
  confirmDeleteRoutine,
  runRoutine,
  setRoutinePaused,
} from "../../../lib/menu";
import { rowTime } from "../../../lib/row";
import { nextRunValue } from "../../../lib/runs";
import styles from "./styles.module.css";

interface RoutineViewProps {
  fish: FishSummary;
  routine: FishRoutine;
  onBack: () => void;
  onClose: () => void;
  onEdit?: (routine: FishRoutine) => void;
}

/** A routine reads here; it changes by asking its fish in chat. */
export function RoutineView({
  fish,
  routine,
  onBack,
  onClose,
  onEdit,
}: RoutineViewProps) {
  const run = routine.lastRun;
  const working = Boolean(fish.activity);
  const now = new Date();
  const nextAt = routine.paused
    ? null
    : nextRun(routine.when, run?.at ?? routine.createdAt, now.getTime());
  return (
    <>
      <Pane.Header
        className={styles.header}
        title={
          <Button type="button" size="sm" variant="ghost" onClick={onBack}>
            <IconChevronLeft size={14} />
            {fish.name}
          </Button>
        }
      >
        <Button
          type="button"
          icon
          size="sm"
          variant="ghost"
          aria-label="Close Details"
          onClick={onClose}
        >
          <IconXmark />
        </Button>
      </Pane.Header>
      <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
        <h2 className={styles.title}>{routine.name}</h2>
        <Section title="Instruction" collapsible={false}>
          <p className={styles.text}>{routine.instruction}</p>
        </Section>
        <Section title="When to Run" collapsible={false}>
          <p className={styles.text}>{describeWhen(routine.when)}</p>
          {routine.paused ? (
            <p className={styles.muted}>Paused. It runs only when you ask.</p>
          ) : null}
          {nextAt !== null ? (
            <PropertyList.Root>
              <PropertyList.Row>
                <PropertyList.Label>Next Run</PropertyList.Label>
                <PropertyList.Value>
                  {nextRunValue(nextAt, now)}
                </PropertyList.Value>
              </PropertyList.Row>
            </PropertyList.Root>
          ) : null}
        </Section>
        {run ? (
          <Section title="Last Run" collapsible={false}>
            <PropertyList.Root>
              <PropertyList.Row>
                <PropertyList.Label>Status</PropertyList.Label>
                <PropertyList.Value>
                  {run.status === "failed" ? "Failed" : "Done"}
                </PropertyList.Value>
              </PropertyList.Row>
              <PropertyList.Row>
                <PropertyList.Label>Ran</PropertyList.Label>
                <PropertyList.Value>
                  {rowTime(run.at, new Date())}
                </PropertyList.Value>
              </PropertyList.Row>
              <PropertyList.Row>
                <PropertyList.Label>Changes</PropertyList.Label>
                <PropertyList.Value>{run.changes || "None"}</PropertyList.Value>
              </PropertyList.Row>
            </PropertyList.Root>
          </Section>
        ) : null}
      </Pane.Body>
      <div className={styles.footer}>
        <Button
          type="button"
          width="full"
          variant="secondary"
          onClick={() => setRoutinePaused(fish, routine, !routine.paused)}
        >
          {routine.paused ? "Resume" : "Pause"}
        </Button>
        <Button
          type="button"
          width="full"
          variant="secondary"
          disabled={working}
          onClick={() => runRoutine(fish, routine)}
        >
          {working ? "Running" : "Run Now"}
        </Button>
        {onEdit ? (
          <Button
            type="button"
            width="full"
            variant="secondary"
            onClick={() => onEdit(routine)}
          >
            Edit
          </Button>
        ) : null}
        <Tooltip label="Delete Routine">
          <Button
            type="button"
            icon
            variant="ghost"
            aria-label="Delete Routine"
            onClick={() => confirmDeleteRoutine(fish, routine)}
          >
            <IconTrash />
          </Button>
        </Tooltip>
      </div>
    </>
  );
}
