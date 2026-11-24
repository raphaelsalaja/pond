/** Not Library-scoped: moving the Library can change its id across the relaunch. */
const RESUME_KEY = "pondSetupResume";

/** Renaming or moving the Library relaunches Pond, so setup remembers to reopen on the import step. */
export const setupResume = {
  mark(): void {
    try {
      localStorage.setItem(RESUME_KEY, "import");
    } catch {
      /** Storage can be full or disabled; setup then opens on its first step. */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch {
      /** Storage can be disabled; there is nothing to clear then. */
    }
  },
  take(): boolean {
    try {
      const pending = localStorage.getItem(RESUME_KEY) === "import";
      localStorage.removeItem(RESUME_KEY);
      return pending;
    } catch {
      return false;
    }
  },
};
