"use client";

import { IconAlbum2, IconClockPlus, IconNodes3 } from "@pond/icons";
import { cssVars, Window } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { findSave, LIBRARY } from "@/lib/library";
import { Details } from "./details";
import { FishChat, FishProfile } from "./fish";
import { ImportToast } from "./import";
import {
  DETAILS_WIDTH,
  SIDEBAR_WIDTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./layout";
import { Library } from "./library";
import { ReplicaSidebar, type SidebarTarget } from "./sidebar";
import { SourcesScene } from "./sources";
import styles from "./styles.module.css";
import { type Crumb, Toolbar } from "./toolbar";

export type ReplicaScene = "library" | "sources" | "fish" | "import";

export interface ReplicaSelection {
  id: string;
  tags: string[];
  folder: string;
}

interface ReplicaProps {
  scene?: ReplicaScene;
  /** Opens Details for this save in the library scene. */
  selected?: ReplicaSelection;
  className?: string;
  label?: string;
}

const RECENT = [...LIBRARY].reverse();

interface SceneConfig {
  active: SidebarTarget;
  crumbs: Crumb[];
  rightOpen: boolean;
}

const SCENES = {
  library: {
    active: "all",
    crumbs: [{ label: "All", Icon: IconAlbum2 }],
    rightOpen: false,
  },
  sources: {
    active: "sources",
    crumbs: [{ label: "Sources", Icon: IconNodes3 }],
    rightOpen: false,
  },
  fish: {
    active: "fish:koi",
    crumbs: [{ label: "Fish" }, { label: "Koi" }],
    rightOpen: true,
  },
  import: {
    active: "folder:recent",
    crumbs: [{ label: "Recently Added", Icon: IconClockPlus }],
    rightOpen: false,
  },
} satisfies Record<ReplicaScene, SceneConfig>;

function useStageScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / STAGE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, scale };
}

export function Replica({
  scene = "library",
  selected,
  className,
  label = "The Pond library window",
}: ReplicaProps) {
  const { ref, scale } = useStageScale();
  const config = SCENES[scene];
  const save = scene === "library" && selected ? findSave(selected.id) : null;
  const rightOpen = config.rightOpen || save !== null;

  return (
    <div
      ref={ref}
      className={cn(styles.frame, className)}
      role="img"
      aria-label={label}
      data-ready={scale !== null || undefined}
      style={cssVars({
        "--replica-scale": String(scale ?? 1),
        "--replica-width": `${STAGE_WIDTH}px`,
        "--replica-height": `${STAGE_HEIGHT}px`,
      })}
    >
      <div className={styles.stage} aria-hidden inert>
        <Window.Root
          className={styles.window}
          leftOpen
          rightOpen={rightOpen}
          data-scene={scene}
          style={cssVars({
            "--window-left-track": `${SIDEBAR_WIDTH}px`,
            "--window-right-track": `${DETAILS_WIDTH}px`,
          })}
        >
          <Window.Left open>
            <ReplicaSidebar active={config.active} />
          </Window.Left>
          <Window.Top>
            <Toolbar crumbs={config.crumbs} detailsToggle={rightOpen} />
          </Window.Top>
          <Window.Center>
            {scene === "sources" ? (
              <SourcesScene />
            ) : scene === "fish" ? (
              <FishChat />
            ) : (
              <Library
                saves={scene === "import" ? RECENT : LIBRARY}
                selected={save?.id ?? null}
                detailsOpen={rightOpen}
              />
            )}
          </Window.Center>
          <Window.Right open={rightOpen}>
            {scene === "fish" ? (
              <FishProfile />
            ) : save && selected ? (
              <Details
                save={save}
                tags={selected.tags}
                folder={selected.folder}
              />
            ) : null}
          </Window.Right>
        </Window.Root>
        {scene === "import" ? <ImportToast /> : null}
      </div>
    </div>
  );
}
