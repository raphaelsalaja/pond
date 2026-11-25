import { Settings } from "@pond/ui";
import { useReducedMotion } from "motion/react";
import { Suspense, useEffect } from "react";
import { SettingsSectionView } from "@/features/settings/components/engine";
import {
  isBespokeSection,
  sectionForPath,
} from "@/features/settings/lib/registry";
import styles from "./styles.module.css";

function useScrollToHashField(hash: string | null) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!hash) return;
    let frame = 0;
    let tries = 0;
    let clearHighlight = 0;
    const attempt = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({
          block: "center",
          behavior: reduceMotion ? "auto" : "smooth",
        });
        el.setAttribute("data-highlight", "true");
        clearHighlight = window.setTimeout(
          () => el.removeAttribute("data-highlight"),
          1600,
        );
        return;
      }
      if (tries++ < 40) frame = requestAnimationFrame(attempt);
    };
    frame = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(clearHighlight);
    };
  }, [hash, reduceMotion]);
}

export function SettingsDetail({
  section,
  hash = null,
}: {
  section: string;
  hash?: string | null;
}) {
  useScrollToHashField(hash);
  const def = sectionForPath(section);
  if (!def) return null;

  const bespoke = isBespokeSection(def);
  return (
    <Suspense fallback={null}>
      {bespoke ? (
        <SettingsSectionView config={def.config} sectionId={def.id} />
      ) : (
        <div className={styles.body}>
          <Settings.Page>
            {def.config.title ? (
              <Settings.Header>
                <Settings.HeaderText>
                  <Settings.Title>{def.config.title}</Settings.Title>
                  {def.config.description ? (
                    <Settings.Description>
                      {def.config.description}
                    </Settings.Description>
                  ) : null}
                </Settings.HeaderText>
              </Settings.Header>
            ) : null}
            <SettingsSectionView config={def.config} sectionId={def.id} />
          </Settings.Page>
        </div>
      )}
    </Suspense>
  );
}
