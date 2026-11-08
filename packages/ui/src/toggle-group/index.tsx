import { ToggleGroup as Base } from "@base-ui/react/toggle-group";
import { clsx as cn } from "clsx";
import { useLayoutEffect, useRef } from "react";
import styles from "./styles.module.css";

export interface ToggleGroupProps extends Base.Props {
  variant?: "raised" | "outline" | "tiles";
}

function pressedToggle(root: HTMLElement): HTMLElement | null {
  const pressed = root.querySelectorAll<HTMLElement>("[data-pressed]");
  return pressed.length === 1 ? pressed.item(0) : null;
}

function placeIndicator(
  indicator: HTMLElement,
  tab: HTMLElement | null,
  animate: boolean,
): void {
  if (!animate) indicator.dataset.snap = "";
  if (tab) {
    indicator.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.height = `${tab.offsetHeight}px`;
  } else {
    indicator.style.width = "0";
    indicator.style.height = "0";
  }
  if (!animate) {
    void indicator.offsetWidth;
    delete indicator.dataset.snap;
  }
}

export function ToggleGroup({
  className,
  children,
  multiple,
  variant = "raised",
  ...props
}: ToggleGroupProps) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicated = !multiple && variant === "raised";

  useLayoutEffect(() => {
    if (!indicated) return;
    const indicator = indicatorRef.current;
    const root = indicator?.parentElement;
    if (!indicator || !root) return;

    let ready = false;
    const sync = (animate: boolean) => {
      placeIndicator(indicator, pressedToggle(root), animate);
    };

    sync(false);

    const mo = new MutationObserver(() => sync(ready));
    mo.observe(root, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-pressed"],
    });

    const ro = new ResizeObserver(() => sync(false));
    ro.observe(root);

    ready = true;
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [indicated]);

  return (
    <Base
      data-pond-toggle-group=""
      data-variant={variant}
      className={cn(styles.root, className)}
      multiple={multiple}
      {...props}
    >
      {indicated ? (
        <span
          ref={indicatorRef}
          className={styles.indicator}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </Base>
  );
}
