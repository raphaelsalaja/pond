import type { Save, SaveFile } from "@/features/saves/types";

export interface ViewerProps {
  save: Save;
  file: SaveFile;
  fileIndex: number;
  active?: boolean;
}
