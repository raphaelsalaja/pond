import type { ReactNode } from "react";
import { IS_MAC } from "@/shared/lib/platform";
import type { StepProps } from "../../model";
import { CaptionedPhoto, ScannedText, SimilarPhotos } from "./image";
import { SearchPalette, TitlesPalette } from "./results";
import { LoginDock, MenuBarStatus, SoundToast } from "./system";
import { SuggestedTags } from "./tags";
import { Tile } from "./tile";
import type { TileSpec } from "./tile";
import { TranscriptPlayer } from "./transcript";
import styles from "./styles.module.css";

const TILES: ReadonlyArray<TileSpec> = [
  {
    id: "semanticSearch",
    title: "Semantic Search",
    area: "search",
    visual: <SearchPalette />,
  },
  {
    id: "enableOcr",
    title: "Text in Images",
    area: "ocr",
    visual: <ScannedText />,
  },
  {
    id: "soundsEnabled",
    title: "Sounds",
    area: "sounds",
    visual: <SoundToast />,
  },
  {
    id: "launchAtLogin",
    title: "Launch at Login",
    area: "launch",
    visual: <LoginDock />,
  },
  {
    id: "enableTranscript",
    title: "Transcription",
    area: "transcript",
    visual: <TranscriptPlayer />,
  },
  {
    id: "enableCaption",
    title: "Image Captions",
    area: "caption",
    visual: <CaptionedPhoto />,
  },
  {
    id: "enableClip",
    title: "Visual Similarity",
    area: "similar",
    visual: <SimilarPhotos />,
  },
  {
    id: "enableSuggestedTags",
    title: "Suggested Tags",
    area: "tags",
    visual: <SuggestedTags />,
  },
  {
    id: "enableAutoTitle",
    title: "Generated Titles",
    area: "titles",
    visual: <TitlesPalette />,
  },
  {
    id: "menuBarIcon",
    title: IS_MAC ? "Menu Bar Icon" : "Notification Area Icon",
    area: "menu",
    visual: <MenuBarStatus />,
  },
];

export function Customize({
  children,
  ...props
}: StepProps & { children?: ReactNode }) {
  return (
    <div className={styles.grid}>
      <div className={styles.intro}>{children}</div>
      {TILES.map((tile) => (
        <Tile key={tile.id} {...props} {...tile} />
      ))}
    </div>
  );
}
