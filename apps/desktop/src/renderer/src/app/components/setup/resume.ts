/** Not Library-scoped: moving the Library can change its id across the reopen. */
const RESUME_KEY = "pondSetupResume";

/** Renaming or moving the Library reloads the window, so setup remembers to reopen on the import step. */
export const setupResume = {
  mark(): void {
    try {
      localStorage.setItem(RESUME_KEY, "import");
    } catch {}
  },
  clear(): void {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch {}
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
