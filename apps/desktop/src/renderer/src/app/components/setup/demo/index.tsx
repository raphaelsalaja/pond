import { IconArrowLeft, IconArrowRight, IconDots } from "@pond/icons";
import type { SidebarDestination } from "@pond/schema";
import { buildThemeTokens } from "@pond/theme/tokens";
import type { ThemeInput } from "@pond/theme/tokens";
import { useReducedMotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { displayGamut } from "@/shared/lib/paint-theme";
import { Art } from "./art";
import type { ArtKind } from "./art";
import { Chat } from "./chat";
import { Downloads } from "./downloads";
import { Inspector } from "./inspector";
import type { InspectorField } from "./inspector";
import { Sidebar } from "./sidebar";
import { Toolbar } from "./toolbar";
import styles from "./styles.module.css";

export { Art, type ArtKind } from "./art";

const DEMO_STATES = [
  "harvest",
  "library",
  "preview",
  "enrich",
  "agent",
] as const;

export type DemoState = (typeof DEMO_STATES)[number];

/** Each hold outlasts its scene's staggered entrance so nothing cuts off mid-motion. */
const HOLD = {
  harvest: 3400,
  library: 2800,
  preview: 2600,
  enrich: 3400,
  agent: 4000,
} satisfies Record<DemoState, number>;

interface CardStyle extends CSSProperties {
  "--i": number;
}

function useDemoCycle(paused = false) {
  const reduceMotion = useReducedMotionConfig();
  const [state, setState] = useState<DemoState>(() =>
    reduceMotion ? "library" : "harvest",
  );
  useEffect(() => {
    if (reduceMotion || paused) return;
    const id = setTimeout(() => {
      const next = (DEMO_STATES.indexOf(state) + 1) % DEMO_STATES.length;
      setState(DEMO_STATES[next] ?? "harvest");
    }, HOLD[state]);
    return () => clearTimeout(id);
  }, [state, reduceMotion, paused]);
  return [state, setState] as const;
}
const saves: ReadonlyArray<{
  id: string;
  kind: ArtKind;
  title: string;
  meta: string;
}> = [
  { id: "trail", kind: "mountain", title: "Mountain trail", meta: "2m ago" },
  { id: "sunset", kind: "sunset", title: "Sunset over the bay", meta: "Now" },
  { id: "brand", kind: "doc", title: "Brand guidelines", meta: "1h ago" },
  { id: "tour", kind: "video", title: "Studio tour", meta: "Yesterday" },
  { id: "font", kind: "font", title: "Inter Display", meta: "Yesterday" },
  { id: "palette", kind: "swatch", title: "Spring palette", meta: "Monday" },
];

export function Demo({
  state,
  name,
  hidden,
  theme,
  fields,
  connected,
  framing = "bleed",
}: {
  state?: DemoState;
  name?: string;
  hidden?: ReadonlyArray<SidebarDestination>;
  /** Omitted to follow the app theme. */
  theme?: ThemeInput;
  fields?: ReadonlyArray<InspectorField>;
  connected?: boolean;
  /** `bleed` squares the bottom corners for a frame that crops it; `whole` rounds all four. */
  framing?: "bleed" | "whole";
}) {
  const [cycled] = useDemoCycle(state !== undefined);
  const painted = useMemo(
    () => (theme ? buildThemeTokens(theme, displayGamut()) : undefined),
    [theme],
  );
  return (
    <div
      className={styles.window}
      data-state={state ?? cycled}
      data-framing={framing}
      data-theme={painted?.mode}
      style={painted?.tokens}
    >
      <Toolbar />
      <Sidebar name={name} hidden={hidden} />
      <div className={styles.panel}>
        <Downloads />
        <div className={styles.grid}>
          {saves.map((save, index) => {
            const cardStyle: CardStyle = { "--i": index };
            return (
              <div className={styles.card} key={save.id} style={cardStyle}>
                <span className={styles.frame}>
                  <Art kind={save.kind} />
                </span>
                <span className={styles.name}>{save.title}</span>
                <span className={styles.meta}>{save.meta}</span>
              </div>
            );
          })}
        </div>
        <div className={styles.viewer}>
          <span className={styles.icons}>
            <IconArrowLeft />
            <IconArrowRight />
          </span>
          <span className={styles.title}>Sunset over the bay</span>
          <IconDots />
        </div>
      </div>
      <aside className={styles.pane}>
        <Inspector fields={fields} />
        <Chat connected={connected} />
      </aside>
      <span className={styles.save}>
        <Art kind="sunset" size="fill" />
      </span>
    </div>
  );
}
