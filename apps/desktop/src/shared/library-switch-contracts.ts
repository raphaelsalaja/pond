export interface LibrarySwitchTarget {
  name: string;
  icon: string | null;
}

export type LibrarySwitchEvent =
  | {
      phase: "opening";
      library: LibrarySwitchTarget;
      waiting: "transfer" | null;
    }
  | { phase: "failed"; library: LibrarySwitchTarget; error: string };
