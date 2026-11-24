"use client";

import { cn } from "@pond/ui";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Nav } from "../nav";
import { Pager } from "../pager";
import { INTRODUCTION } from "../pages";
import { ThemeContext } from "../theme";
import type { Theme, ThemePreference } from "../theme";
import styles from "./styles.module.css";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useSystemTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light"),
    () => "light",
  );
}

type FrameProps = React.ComponentPropsWithoutRef<"div">;

export function Frame({ className, children, ...props }: FrameProps) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const system = useSystemTheme();
  const theme = preference === "system" ? system : preference;
  const pathname = usePathname();
  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference],
  );

  const scroller = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const id = window.location.hash.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (target) {
        target.scrollIntoView({ behavior: "instant" });
      } else {
        scroller.current?.scrollTo({ top: 0, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  /** Popups portal into `body`, outside the frame, so the root carries the theme too. */
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (previous === undefined) {
        delete root.dataset.theme;
      } else {
        root.dataset.theme = previous;
      }
    };
  }, [theme]);

  return (
    <ThemeContext value={value}>
      <div
        className={cn(styles.frame, className)}
        data-theme={theme}
        {...props}
      >
        <Nav />
        {pathname === INTRODUCTION.href ? (
          <main ref={scroller} className={styles.tiles}>
            {children}
          </main>
        ) : (
          <div className={styles.panel}>
            <main ref={scroller} className={styles.content}>
              <div className={styles.column}>
                {children}
                <Pager />
              </div>
            </main>
          </div>
        )}
      </div>
    </ThemeContext>
  );
}
