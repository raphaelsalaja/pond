import { useEffect, useState } from "react";

export function useActiveTab(): chrome.tabs.Tab | null | undefined {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>();
  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) => setTab(active ?? null))
      .catch(() => setTab(null));
  }, []);
  return tab;
}

/** Chrome on macOS reports glyphs like `⌥⇧S`; elsewhere it joins key names with `+`. */
export function shortcutKeys(shortcut: string): Array<string> {
  if (shortcut.includes("+")) {
    return shortcut.split("+").filter(Boolean);
  }
  return Array.from(shortcut);
}

/** Maps each command name to its keys, leaving out commands with no shortcut set. */
export function useShortcuts(): ReadonlyMap<string, Array<string>> {
  const [shortcuts, setShortcuts] = useState<
    ReadonlyMap<string, Array<string>>
  >(new Map());
  useEffect(() => {
    void browser.commands
      ?.getAll()
      .then((all) =>
        setShortcuts(
          new Map(
            all.flatMap((command) =>
              command.name && command.shortcut
                ? [[command.name, shortcutKeys(command.shortcut)]]
                : [],
            ),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  return shortcuts;
}
