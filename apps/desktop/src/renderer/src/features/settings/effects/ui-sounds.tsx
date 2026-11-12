import { useEffect } from "react";
import {
  playUiSoft,
  playUiTap,
  playUiToggle,
  warmUiSounds,
} from "@/shared/lib/sounds";

const WARM_DELAY_MS = 2000;
const WARM_IDLE_MS = 3000;

const INTERACTIVE_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  "a[href]",
].join(",");

const TOGGLE_SELECTOR = [
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="menuitemcheckbox"]',
  'input[type="checkbox"]',
  "[aria-pressed]",
].join(",");

const TEXT_FIELD_SELECTOR = "input, textarea, select, [contenteditable]";

const SOFT_VARIANTS = new Set(["ghost", "tertiary", "link"]);

function asElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Node)) return null;
  return target instanceof Element ? target : target.parentElement;
}

function closestControl(el: Element | null): Element | null {
  return el?.closest(INTERACTIVE_SELECTOR) ?? null;
}

function shouldSkip(control: Element, from: Element): boolean {
  if (from.closest('[data-sound="none"]')) return true;
  if (control.closest('[data-sound="none"]')) return true;
  if (from.closest(TEXT_FIELD_SELECTOR) && !control.matches(TOGGLE_SELECTOR)) {
    return true;
  }
  if (
    control.matches(TEXT_FIELD_SELECTOR) &&
    !control.matches(TOGGLE_SELECTOR)
  ) {
    return true;
  }
  if (
    control instanceof HTMLButtonElement ||
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLOptionElement
  ) {
    if (control.disabled) return true;
  }
  if (control.getAttribute("aria-disabled") === "true") return true;
  return false;
}

function isSoft(control: Element): boolean {
  const variant = control.getAttribute("data-variant");
  return variant !== null && SOFT_VARIANTS.has(variant);
}

function isToggle(control: Element): boolean {
  return control.matches(TOGGLE_SELECTOR);
}

/**
 * A checkbox flips before the browser dispatches the click, but ARIA state is committed by React
 * afterwards, so a capture listener still reads the value the control is leaving.
 */
export function toggleTurnsOn(control: Element): boolean {
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.checked;
  }
  const pressed = control.getAttribute("aria-pressed");
  if (pressed !== null) return pressed !== "true";
  const checked = control.getAttribute("aria-checked");
  if (checked !== null) return checked !== "true";
  return false;
}

export function UiSounds() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const from = asElement(event.target);
      if (!from) return;
      const control = closestControl(from);
      if (!control || shouldSkip(control, from)) return;
      if (isToggle(control)) return;
      if (isSoft(control)) playUiSoft();
      else playUiTap();
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const from = asElement(event.target);
      if (!from) return;
      const control = from.closest(TOGGLE_SELECTOR) ?? closestControl(from);
      if (!control || !isToggle(control) || shouldSkip(control, from)) return;
      playUiToggle(toggleTurnsOn(control));
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    /** Stays clear of startup work, which the device open would otherwise stall. */
    let idle: number | undefined;
    const warm = setTimeout(() => {
      idle = requestIdleCallback(warmUiSounds, { timeout: WARM_IDLE_MS });
    }, WARM_DELAY_MS);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      clearTimeout(warm);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, []);

  return null;
}
