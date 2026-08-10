import { Shell } from "@pond/ui";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { AppShell } from "@/components/shell/app-shell";
import {
  ScrollRestorationContext,
  useScrollRestoration,
} from "@/hooks/use-scroll-restoration";
import { routeSwapTransition } from "@/lib/ui/motion";
import { useActiveTabId } from "@/stores/tabs";
import styles from "./styles.module.css";

/** Mirrors the dock's nav order so travel direction matches the tab you aimed at. */
const SECTION_ORDER = ["library", "sources", "analytics", "trash"] as const;

type Section = (typeof SECTION_ORDER)[number];

function sectionFor(pathname: string): Section {
  if (pathname.startsWith("/sources")) return "sources";
  if (pathname.startsWith("/analytics")) return "analytics";
  if (pathname === "/trash") return "trash";
  return "library";
}

/** The dock ease front-loads so hard the fade was invisible; opacity gets its own linear ramp to stay perceptible. */
const routeTransition = {
  ...routeSwapTransition,
  opacity: { duration: 0.25, ease: "linear" as const },
};

/** Remounts routed content per section with a short fade-slide toward the direction of travel. */
function RoutedContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reduceMotion = useReducedMotion();
  const section = sectionFor(pathname);

  const prev = useRef(section);
  const direction = useRef(0);
  /** False on first paint (incl. remount after leaving save detail) so that path stays instant. */
  const hasMounted = useRef(false);
  let animateEnter = false;
  if (prev.current !== section) {
    direction.current = Math.sign(
      SECTION_ORDER.indexOf(section) - SECTION_ORDER.indexOf(prev.current),
    );
    prev.current = section;
    animateEnter = hasMounted.current;
  }
  hasMounted.current = true;

  return (
    <motion.div
      key={section}
      className={styles.route}
      initial={
        animateEnter
          ? { opacity: 0, x: reduceMotion ? 0 : 16 * direction.current }
          : false
      }
      animate={{ opacity: 1, x: 0 }}
      transition={routeTransition}
    >
      <Outlet />
    </motion.div>
  );
}

export function Library() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const activeTabId = useActiveTabId();
  const restoration = useScrollRestoration(
    `${activeTabId}:${pathname}${search}`,
  );
  const isSave = pathname.startsWith("/save/");

  if (isSave) return <Outlet />;

  return (
    <AppShell.Content>
      <ScrollRestorationContext.Provider value={restoration}>
        <Shell.Main ref={restoration.ref} className={styles.main}>
          <RoutedContent />
        </Shell.Main>
      </ScrollRestorationContext.Provider>
    </AppShell.Content>
  );
}
