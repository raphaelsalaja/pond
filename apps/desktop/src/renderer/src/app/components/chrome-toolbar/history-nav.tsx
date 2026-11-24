import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Button } from "@pond/ui";
import type { NavigationDirection } from "@shared/constants";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import styles from "./styles.module.css";

export function ChromeHistoryNav() {
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCanBack(router.history.canGoBack());
      const index = router.history.location.state?.__TSR_index ?? 0;
      setCanForward(index < router.history.length - 1);
    };
    sync();
    return router.history.subscribe(sync);
  }, [router]);

  const navigate = useEffectEvent((direction: NavigationDirection) => {
    if (direction === "back") {
      if (canBack) {
        router.history.back();
      }
    } else if (canForward) {
      router.history.forward();
    }
  });

  useEffect(() => {
    /** Buttons 3 and 4 are a mouse's back and forward side buttons. */
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) {
        return;
      }
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
        disabled={!canBack}
        onClick={() => router.history.back()}
      >
        <IconArrowLeft />
      </Button>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Forward"
        disabled={!canForward}
        onClick={() => router.history.forward()}
      >
        <IconArrowRight />
      </Button>
    </div>
  );
}
