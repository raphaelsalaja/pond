import "./switcher.js";
import { Fragment, useEffect, useRef, useState } from "react";
import { CornerCard } from "./corner-card";
import { FeatureStories } from "./feature-stories";
import { FullChangelog } from "./full-changelog";
import { FullPage } from "./full-page";
import { GroupedDigest } from "./grouped-digest";
import { HeroCard } from "./hero-card";
import { HighlightsGrid } from "./highlights-grid";
import { ReleaseTimeline } from "./release-timeline";
import { SplitStepper } from "./split-stepper";
import styles from "./styles.module.css";
import { UpdateWindow } from "./update-window";
import { VersionTabs } from "./version-tabs";

interface VariantProps {
  label: string;
  note: string;
  children: React.ReactNode;
}

/** Remounts on the switcher's replay so step and expand state reset with the entrance. */
function Variant({ label, note, children }: VariantProps) {
  const ref = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const replay = () => setRun((n) => n + 1);
    section.addEventListener("prototype-replay", replay);
    return () => section.removeEventListener("prototype-replay", replay);
  }, []);

  return (
    <section
      ref={ref}
      className={styles.variant}
      data-variant={label}
      data-note={note}
    >
      <Fragment key={run}>{children}</Fragment>
    </section>
  );
}

export function WhatsNewPrototype() {
  return (
    <prototype-switcher class={styles.switcher}>
      <Variant
        label="Full Changelog"
        note="Wins when people want every fix in one place. Costs a long scroll, and the headline feature reads like a bullet."
      >
        <FullChangelog />
      </Variant>
      <Variant
        label="Split Stepper"
        note="Wins when each release has a story to show. Costs a click per release, and fixes never appear."
      >
        <SplitStepper />
      </Variant>
      <Variant
        label="Hero Card"
        note="Wins for one headline release. Costs the older releases, which hide behind a button."
      >
        <HeroCard />
      </Variant>
      <Variant
        label="Highlights Grid"
        note="Wins for scanning six features at a glance. Costs every improvement and fix, which go to the web."
      >
        <HighlightsGrid />
      </Variant>
      <Variant
        label="Version Tabs"
        note="Wins when releases stay distinct. Costs a tab per version, so the latest hides the rest."
      >
        <VersionTabs />
      </Variant>
      <Variant
        label="Feature Stories"
        note="Wins for showing features one at a time with motion. Costs control, since it advances on its own."
      >
        <FeatureStories />
      </Variant>
      <Variant
        label="Corner Card"
        note="Wins when an update shouldn't interrupt. Costs attention, since it's easy to ignore."
      >
        <CornerCard />
      </Variant>
      <Variant
        label="Full Page"
        note="Wins for big releases with media. Costs the whole window for a minor update."
      >
        <FullPage />
      </Variant>
      <Variant
        label="Grouped Digest"
        note="Wins after several skipped updates. Costs which release each change came from, now a small tag."
      >
        <GroupedDigest />
      </Variant>
      <Variant
        label="Release Timeline"
        note="Wins for pacing several releases newest first. Costs a click to open each older one."
      >
        <ReleaseTimeline />
      </Variant>
      <Variant
        label="Update Window"
        note="Wins when the notes and the install are one decision. Costs the media, and the changes read as a checklist."
      >
        <UpdateWindow />
      </Variant>
    </prototype-switcher>
  );
}
