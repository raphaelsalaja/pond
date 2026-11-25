import { isHTMLElement } from "@pond/ui/dom";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useLayoutEffect, useRef } from "react";
import type { ResultDirection } from "@/features/saves";
import {
  clearSaveSelection,
  collectionOwnsKeyboard,
  selectOnlySave,
  selectResults,
} from "@/features/saves";
import {
  openSave,
  openSaveId,
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { ensureSaves } from "@/features/saves/pool";
import { findScrollParent } from "@/shared/lib/dom";
import { eventFromEditable } from "@/shared/lib/editable-target";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";

type Movement = ResultDirection | "first" | "last";

function canNavigate(event: KeyboardEvent): boolean {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    !eventFromEditable(event) &&
    collectionOwnsKeyboard() &&
    !openSaveId()
  );
}

export function useGridHotkeys(filteredIds: ReadonlyArray<string>): void {
  const shortcuts = useShortcutBindings();
  const idsRef = useRef(filteredIds);
  useLayoutEffect(() => {
    idsRef.current = filteredIds;
  });
  const movementQueue = useRef(Promise.resolve());

  const move = async (
    direction: Movement,
    extend: boolean,
    key: string | undefined,
    focusOnly: boolean,
  ) => {
    if (key !== resultNavigation.key() || !collectionOwnsKeyboard()) {
      return;
    }
    let ids: ReadonlyArray<string> = idsRef.current;
    if (!ids.length) {
      return;
    }
    const cursor = selection.getCursor();
    const base = cursor && ids.includes(cursor) ? cursor : null;
    const forward =
      direction === "right" ||
      direction === "down" ||
      direction === "page-down";
    const active = document.activeElement;
    const parent = findScrollParent(isHTMLElement(active) ? active : null);
    let next: string | null;
    if (direction === "first") {
      next = ids[0] ?? null;
    } else if (direction === "last") {
      ids = await resultNavigation.ids();
      next = ids.at(-1) ?? null;
    } else if (!base) {
      next = forward ? (ids[0] ?? null) : (ids.at(-1) ?? null);
    } else {
      next = resultNavigation.neighbor(
        base,
        direction,
        parent?.clientHeight ?? 600,
      );
      if ((!next || direction === "page-down") && forward) {
        if (await resultNavigation.loadNextPage()) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          ids = idsRef.current;
          next = resultNavigation.neighbor(
            base,
            direction,
            parent?.clientHeight ?? 600,
          );
        }
      }
      if (!next && (direction === "left" || direction === "right")) {
        next = await resultNavigation.next(
          base,
          direction === "right" ? 1 : -1,
        );
      }
    }
    if (!next || key !== resultNavigation.key() || !collectionOwnsKeyboard()) {
      return;
    }
    await ensureSaves([next]);
    if (key !== resultNavigation.key() || !collectionOwnsKeyboard()) {
      return;
    }
    if (focusOnly) {
      selection.setCursor(next);
    } else if (extend) {
      if (!ids.includes(next)) {
        ids = await resultNavigation.ids();
      }
      if (key !== resultNavigation.key() || !collectionOwnsKeyboard()) {
        return;
      }
      const anchor = selection.getAnchor();
      const from = anchor && ids.includes(anchor) ? anchor : (base ?? next);
      selection.setAnchor(from);
      selection.setRange(ids, from, next);
      selection.setCursor(next);
      primarySelection.set(next);
    } else {
      selectOnlySave(next);
    }
    await resultNavigation.reveal(next, { focus: true });
  };

  const enqueueMove = (
    direction: Movement,
    extend: boolean,
    event: KeyboardEvent,
    focusOnly = false,
  ) => {
    if (!canNavigate(event)) return;
    event.preventDefault();
    const key = resultNavigation.key();
    movementQueue.current = movementQueue.current
      .then(() => move(direction, extend, key, focusOnly))
      .catch(() => {
        notify({
          id: "result-navigation",
          title: "Couldn't navigate Saves",
          description: "Try again.",
        });
      });
  };

  useHotkeys(
    [
      {
        hotkey: bindingKeys(shortcuts, "grid.prev"),
        callback: (event) => enqueueMove("left", false, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.next"),
        callback: (event) => enqueueMove("right", false, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.extend-prev"),
        callback: (event) => enqueueMove("left", true, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.extend-next"),
        callback: (event) => enqueueMove("right", true, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.up"),
        callback: (event) => enqueueMove("up", false, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.down"),
        callback: (event) => enqueueMove("down", false, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.extend-up"),
        callback: (event) => enqueueMove("up", true, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.extend-down"),
        callback: (event) => enqueueMove("down", true, event),
      },
      {
        hotkey: "Alt+ArrowLeft",
        callback: (event) => enqueueMove("left", false, event, true),
      },
      {
        hotkey: "Alt+ArrowRight",
        callback: (event) => enqueueMove("right", false, event, true),
      },
      {
        hotkey: "Alt+ArrowUp",
        callback: (event) => enqueueMove("up", false, event, true),
      },
      {
        hotkey: "Alt+ArrowDown",
        callback: (event) => enqueueMove("down", false, event, true),
      },
      {
        hotkey: "Shift+Space",
        callback: (event) => {
          if (!canNavigate(event)) return;
          const cursor = selection.getCursor();
          if (!cursor) return;
          event.preventDefault();
          selection.toggle(cursor);
          selection.setAnchor(cursor);
          const primary = selection.has(cursor)
            ? cursor
            : (selection.snapshot()[0] ?? null);
          primarySelection.set(primary);
        },
      },
      {
        hotkey: "Home",
        callback: (event) => enqueueMove("first", false, event),
      },
      { hotkey: "End", callback: (event) => enqueueMove("last", false, event) },
      {
        hotkey: "Shift+Home",
        callback: (event) => enqueueMove("first", true, event),
      },
      {
        hotkey: "Shift+End",
        callback: (event) => enqueueMove("last", true, event),
      },
      {
        hotkey: "PageUp",
        callback: (event) => enqueueMove("page-up", false, event),
      },
      {
        hotkey: "PageDown",
        callback: (event) => enqueueMove("page-down", false, event),
      },
      {
        hotkey: "Shift+PageUp",
        callback: (event) => enqueueMove("page-up", true, event),
      },
      {
        hotkey: "Shift+PageDown",
        callback: (event) => enqueueMove("page-down", true, event),
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.open"),
        callback: (event) => {
          if (!canNavigate(event)) return;
          const cursor = selection.getCursor();
          if (!cursor || !idsRef.current.includes(cursor)) return;
          event.preventDefault();
          openSave(cursor);
        },
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.select-all"),
        callback: (event) => {
          if (!canNavigate(event)) return;
          event.preventDefault();
          void selectResults("all");
        },
      },
      {
        hotkey: bindingKeys(shortcuts, "grid.clear"),
        callback: (event) => {
          if (!canNavigate(event)) return;
          event.preventDefault();
          clearSaveSelection();
        },
      },
    ],
    { ignoreInputs: true, preventDefault: false },
  );
}
