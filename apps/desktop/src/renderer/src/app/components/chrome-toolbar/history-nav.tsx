import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Button } from "@pond/ui";
import type { NavigationDirection } from "@shared/constants";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import { libraryChrome } from "@/features/library/state/library-chrome";
import {
  navigationHistory,
  useNavigationHistory,
} from "@/features/library/state/navigation-history";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import styles from "./styles.module.css";

export function ChromeHistoryNav() {
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [saveForwardTarget, setSaveForwardTarget] = useState<{
    routerIndex: number;
    libraryIndex: number;
    libraryEntries: ReturnType<typeof navigationHistory.snapshot>["entries"];
  } | null>(null);
  const history = useNavigationHistory();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routerIndex = router.state.location.state?.__TSR_index ?? 0;
  const isSave = saveIdFromPath(pathname) !== null;
  const hasRouterForwardTarget =
    saveForwardTarget !== null &&
    routerIndex < saveForwardTarget.routerIndex &&
    canForward;
  const libraryBranchMatches =
    saveForwardTarget?.libraryEntries === history.entries;
  const hasSaveAhead =
    hasRouterForwardTarget &&
    libraryBranchMatches &&
    history.index === saveForwardTarget.libraryIndex;
  const hasStaleSaveAhead = hasRouterForwardTarget && !libraryBranchMatches;

  useEffect(() => {
    let previousLocation = router.history.location;
    const syncAvailability = () => {
      setCanBack(router.history.canGoBack());
      const index = router.history.location.state?.__TSR_index ?? 0;
      setCanForward(index < router.history.length - 1);
    };

    syncAvailability();

    return router.history.subscribe(({ action, location }) => {
      const previousIndex = previousLocation.state?.__TSR_index ?? 0;
      const nextIndex = location.state?.__TSR_index ?? 0;
      const leftSaveGoingBack =
        saveIdFromPath(previousLocation.pathname) !== null &&
        saveIdFromPath(location.pathname) === null &&
        (action.type === "BACK" || (action.type === "GO" && action.index < 0));

      setSaveForwardTarget((current) => {
        if (leftSaveGoingBack) {
          const library = navigationHistory.snapshot();
          return {
            routerIndex: previousIndex,
            libraryIndex: library.index,
            libraryEntries: library.entries,
          };
        }
        if (
          action.type === "PUSH" ||
          (current !== null && nextIndex >= current.routerIndex)
        )
          return null;
        return current;
      });
      previousLocation = location;
      syncAvailability();
    });
  }, [router]);

  const backDisabled = isSave ? !canBack : history.index === 0 && !canBack;
  const forwardDisabled = isSave
    ? !canForward
    : !hasSaveAhead &&
      history.index >= history.entries.length - 1 &&
      (!canForward || hasStaleSaveAhead);

  const goBack = () => {
    if (isSave) {
      router.history.back();
      return;
    }
    const target = navigationHistory.back();
    if (target) libraryChrome.setNav(target);
    else router.history.back();
  };

  const goForward = () => {
    if (isSave || hasSaveAhead) {
      router.history.forward();
      return;
    }
    const target = navigationHistory.forward();
    if (target) libraryChrome.setNav(target);
    else if (!hasStaleSaveAhead) router.history.forward();
  };

  const navigate = useEffectEvent((direction: NavigationDirection) => {
    if (direction === "back") {
      if (!backDisabled) goBack();
    } else if (!forwardDisabled) goForward();
  });

  useEffect(() => {
    // Buttons 3 and 4 are a mouse's back and forward side buttons.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigate(event.button === 3 ? "back" : "forward");
    };
    window.addEventListener("mouseup", onMouseUp);
    const stopSwipes = window.pond.onNavigationSwipe((direction) =>
      navigate(direction),
    );
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      stopSwipes();
    };
  }, []);

  return (
    <div className={styles.nav}>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Back"
        disabled={backDisabled}
        onClick={goBack}
      >
        <IconArrowLeft />
      </Button>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Forward"
        disabled={forwardDisabled}
        onClick={goForward}
      >
        <IconArrowRight />
      </Button>
    </div>
  );
}
