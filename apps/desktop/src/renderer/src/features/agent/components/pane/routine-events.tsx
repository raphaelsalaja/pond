import { IconCircleDashedClock } from "@pond/icons";
import { Chip } from "@pond/ui";
import type { AssistantRoutineEvent } from "@shared/assistant";
import { fish, useFish } from "@/features/fish";
import { ChatEvent } from "./chat-event";
import { routineChangeText } from "./chat-event/events";

function RoutineEvent({ event }: { event: AssistantRoutineEvent }) {
  const owner = useFish(event.fishId);
  const exists = owner?.routines.some(
    (routine) => routine.id === event.routineId,
  );
  return (
    <ChatEvent>
      {routineChangeText(event.kind)}
      {event.kind !== "deleted" && exists ? (
        <Chip.Action
          tone="mention"
          aria-label={`Open ${event.name}`}
          onClick={() => fish.openRoutine(event.fishId, event.routineId)}
        >
          <Chip.Icon>
            <IconCircleDashedClock size={12} />
          </Chip.Icon>
          <Chip.Label>{event.name}</Chip.Label>
        </Chip.Action>
      ) : (
        <span>{event.name}</span>
      )}
    </ChatEvent>
  );
}

/** Routines the fish set up or changed while replying, each opening in the side panel. */
export function RoutineEvents({
  events,
}: {
  events: ReadonlyArray<AssistantRoutineEvent>;
}) {
  return events.map((event, index) => (
    <RoutineEvent key={`${event.routineId}:${String(index)}`} event={event} />
  ));
}
