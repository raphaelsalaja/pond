import {
  IconArrowRight,
  IconChatBubble,
  IconCircleInfo,
  IconMoveObjDown,
  IconMoveObjUp,
  IconPencil,
  IconPinTack,
  IconPlus,
  IconSection,
  IconTrash,
} from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import {
  DEFAULT_FISH_ID,
  type Fish,
  type FishPatch,
  type FishPlacement,
  type FishRoutine,
  type FishSection,
} from "@shared/fish-contracts";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { fishIntroDialog } from "@/shared/state/fish-intro";
import { fish } from "../state/fish";
import {
  fishLayout,
  LOOSE,
  layoutPlacements,
  moveFish,
  shelfOf,
} from "./layout";

async function runFishAction(
  action: () => Promise<void>,
  title = "Couldn't update this fish",
): Promise<void> {
  try {
    await action();
  } catch (error) {
    notify({
      id: "fish-action",
      title,
      description: errorCopy(error, "Try again."),
    });
  }
}

export function arrangeFish(placements: FishPlacement[]): void {
  void runFishAction(
    () => fish.arrange(placements),
    "Couldn't move this fish",
  );
}

/** Moves a fish to the end of a shelf: a section id or `LOOSE`. */
export function moveFishTo(id: string, shelf: string): Promise<void> {
  const sections = fish.sections();
  const layout = fishLayout(fish.snapshot(), sections);
  return fish.arrange(layoutPlacements(moveFish(layout, id, shelf), sections));
}

export function createFish(section?: string): void {
  void runFishAction(async () => {
    const created = await fish.create();
    if (section) await moveFishTo(created.id, section);
    fish.open(created.id);
    fish.startEditing(created.id);
  });
}

export function createSection(then?: (section: FishSection) => void): void {
  Dialog.prompt({
    title: "New Section",
    placeholder: "Name",
    confirmLabel: "Create",
    emptyError: "Give the section a name.",
    onConfirm: (name) =>
      runFishAction(async () => {
        const section = { id: crypto.randomUUID(), name: name.trim() };
        await fish.setSections([...fish.sections(), section]);
        then?.(section);
      }, "Couldn't create the section"),
  });
}

function renameSection(section: FishSection): void {
  Dialog.prompt({
    title: "Rename Section",
    placeholder: "Name",
    confirmLabel: "Rename",
    initialValue: section.name,
    emptyError: "Give the section a name.",
    onConfirm: (name) =>
      runFishAction(
        () =>
          fish.setSections(
            fish
              .sections()
              .map((entry) =>
                entry.id === section.id ? { ...entry, name: name.trim() } : entry,
              ),
          ),
        "Couldn't rename the section",
      ),
  });
}

function shiftSection(section: FishSection, by: -1 | 1): void {
  const sections = [...fish.sections()];
  const from = sections.findIndex((entry) => entry.id === section.id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= sections.length) return;
  sections.splice(from, 1);
  sections.splice(to, 0, section);
  void runFishAction(
    () => fish.setSections(sections),
    "Couldn't move the section",
  );
}

/** Deleting a section keeps its fish; they move back above every section. */
function deleteSection(section: FishSection): void {
  void runFishAction(
    () =>
      fish.setSections(
        fish.sections().filter((entry) => entry.id !== section.id),
      ),
    "Couldn't delete the section",
  );
}

export function fishSectionItems(section: FishSection): MenuItemSpec[] {
  const sections = fish.sections();
  const index = sections.findIndex((entry) => entry.id === section.id);
  return [
    {
      label: "New Fish",
      icon: <IconPlus />,
      onClick: () => createFish(section.id),
    },
    {
      label: "Rename Section",
      icon: <IconPencil />,
      onClick: () => renameSection(section),
    },
    { type: "separator" },
    {
      label: "Move Up",
      icon: <IconMoveObjUp />,
      disabled: index <= 0,
      onClick: () => shiftSection(section, -1),
    },
    {
      label: "Move Down",
      icon: <IconMoveObjDown />,
      disabled: index < 0 || index >= sections.length - 1,
      onClick: () => shiftSection(section, 1),
    },
    { type: "separator" },
    {
      label: "Delete Section",
      icon: <IconTrash />,
      variant: "destructive",
      onClick: () => deleteSection(section),
    },
  ];
}

function moveToItems(target: Fish): MenuItemSpec {
  const sections = fish.sections();
  const shelf = target.pinned
    ? null
    : shelfOf(fishLayout(fish.snapshot(), sections), target.id);
  const move = (to: string) =>
    void runFishAction(() => moveFishTo(target.id, to));
  return {
    type: "submenu",
    label: "Move To",
    icon: <IconArrowRight />,
    items: [
      {
        label: "No Section",
        disabled: shelf === LOOSE,
        onClick: () => move(LOOSE),
      },
      ...sections.map(
        (section): MenuItemSpec => ({
          label: section.name,
          icon: <IconSection />,
          disabled: shelf === section.id,
          onClick: () => move(section.id),
        }),
      ),
      { type: "separator" },
      {
        label: "New Section",
        icon: <IconPlus />,
        onClick: () => createSection((section) => move(section.id)),
      },
    ],
  };
}

export function runRoutine(target: Fish, routine: FishRoutine): void {
  void runFishAction(async () => {
    await fish.run(target.id, routine.id);
    notify({
      id: "fish-run",
      title: `${target.name} is on it`,
      description: "The result shows up in its chat.",
    });
  }, "Couldn't start the routine");
}

export function updateFish(target: Fish, patch: FishPatch): void {
  void runFishAction(async () => {
    await fish.update(target.id, patch);
  });
}

export function setRoutinePaused(
  target: Fish,
  routine: FishRoutine,
  paused: boolean,
): void {
  void runFishAction(() => fish.pauseRoutine(target.id, routine.id, paused));
}

export function confirmDeleteRoutine(target: Fish, routine: FishRoutine): void {
  Dialog.confirm({
    title: `Delete "${routine.name}"`,
    description: `${target.name} stops running it. You can't undo this.`,
    confirmLabel: "Delete",
    confirmVariant: "destructive",
    onConfirm: () =>
      runFishAction(
        () => fish.deleteRoutine(target.id, routine.id),
        "Couldn't delete the routine",
      ),
  });
}

function confirmDeleteFish(target: Fish): void {
  Dialog.confirm({
    title: `Delete "${target.name}"`,
    description: `This deletes its conversation. Your Saves stay in your Library.`,
    confirmLabel: "Delete",
    confirmVariant: "destructive",
    onConfirm: () => runFishAction(() => fish.remove(target.id)),
  });
}

export function newItems(): MenuItemSpec[] {
  return [
    { label: "New Fish", icon: <IconPlus />, onClick: () => createFish() },
    {
      label: "New Section",
      icon: <IconSection />,
      onClick: () => createSection(),
    },
  ];
}

export function sectionItems(): MenuItemSpec[] {
  return [
    { label: "New Fish", icon: <IconPlus />, onClick: () => createFish() },
    {
      label: "New Section",
      icon: <IconSection />,
      onClick: () => createSection(),
    },
    {
      label: "About Fish",
      icon: <IconCircleInfo />,
      onClick: () => fishIntroDialog.open(),
    },
  ];
}

/** Actions for the fish whose conversation is open. */
export function fishPaneItems(target: Fish): MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    {
      label: "Edit Fish",
      icon: <IconPencil />,
      onClick: () => fish.startEditing(target.id),
    },
    {
      label: target.pinned ? "Unpin" : "Pin",
      icon: <IconPinTack />,
      onClick: () => updateFish(target, { pinned: !target.pinned }),
    },
    moveToItems(target),
    { type: "separator" },
    { label: "New Fish", icon: <IconPlus />, onClick: () => createFish() },
  ];
  if (target.id !== DEFAULT_FISH_ID)
    items.push(
      { type: "separator" },
      {
        label: "Delete",
        icon: <IconTrash />,
        variant: "destructive",
        onClick: () => confirmDeleteFish(target),
      },
    );
  return items;
}

export function fishItems(target: Fish): MenuItemSpec[] {
  return [
    {
      label: "Open Chat",
      icon: <IconChatBubble />,
      onClick: () => fish.open(target.id),
    },
    ...fishPaneItems(target),
  ];
}
