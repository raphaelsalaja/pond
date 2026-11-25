import type { Prefs } from "@pond/schema/db";
import type { SavesDerivedPatch } from "@shared/saves-contracts-shared";
import type { Save } from "@/features/saves/types";

export interface DerivedPatch {
  derived?: SavesDerivedPatch;
  optimistic?: Partial<Save>;
}

export interface Enricher {
  id: string;
  dependsOn?: Array<string>;
  hydrate?: () => Promise<void>;
  enabled: (prefs: Prefs | null) => boolean;
  eligible: (save: Save, prefs?: Prefs["ai"]) => boolean;
  run: (save: Save, prefs?: Prefs["ai"]) => Promise<DerivedPatch | null>;
}
