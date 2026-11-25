import { IconCalendar, IconChevronLeft, IconChevronRight } from "@pond/icons";
import { clsx as cn } from "clsx";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { Button } from "../button";
import type { ButtonProps } from "../button";
import { cssVars } from "../css-vars";
import { Popover } from "../popover";
import {
  addDays,
  addMonths,
  clampDay,
  formatDay,
  localeWeekStart,
  monthGrid,
  parseDay,
  sameDay,
  startOfDay,
} from "./calendar";
import styles from "./styles.module.css";

type PositionerProps = React.ComponentProps<typeof Popover.Positioner>;

export interface DatePickerProps {
  /** Local `YYYY-MM-DD`; empty shows the placeholder. */
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  size?: ButtonProps["size"];
  disabled?: boolean;
  locale?: string;
  className?: string;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onValueChange,
  min,
  max,
  placeholder = "Pick a Date",
  size = "sm",
  disabled,
  locale = navigator.language,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);
  const label = selected
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(selected)
    : placeholder;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
        render={
          <Button
            size={size}
            variant="secondary"
            className={cn(styles.trigger, className)}
          />
        }
      >
        <IconCalendar size={12} className={styles.icon} />
        <span data-placeholder={selected ? undefined : ""}>{label}</span>
      </Popover.Trigger>
      <CalendarPopup
        value={value}
        min={min}
        max={max}
        locale={locale}
        align="end"
        onSelect={(day) => {
          onValueChange(day);
          setOpen(false);
        }}
      />
    </Popover.Root>
  );
}

export interface DatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The calendar opens beside this element and returns focus to it on close. */
  anchor: RefObject<HTMLElement | null>;
  /** Local `YYYY-MM-DD`; empty starts on today. */
  value?: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  side?: PositionerProps["side"];
  align?: PositionerProps["align"];
  locale?: string;
}

export function DatePopover({
  open,
  onOpenChange,
  anchor,
  value = "",
  onValueChange,
  min,
  max,
  side = "bottom",
  align = "start",
  locale = navigator.language,
}: DatePopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <CalendarPopup
        value={value}
        min={min}
        max={max}
        locale={locale}
        anchor={anchor}
        side={side}
        align={align}
        onSelect={(day) => {
          onValueChange(day);
          onOpenChange(false);
        }}
      />
    </Popover.Root>
  );
}

function CalendarPopup({
  value,
  min,
  max,
  locale,
  anchor,
  side,
  align,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  locale: string;
  anchor?: RefObject<HTMLElement | null>;
  side?: PositionerProps["side"];
  align?: PositionerProps["align"];
  onSelect: (day: string) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Popover.Portal>
      <Popover.Positioner anchor={anchor} side={side} align={align}>
        <Popover.Popup
          ref={popup}
          aria-label="Choose Date"
          className={styles.popup}
          style={cssVars({ "--ds-popup-width": "max-content" })}
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>(
              '[role="gridcell"][tabindex="0"]',
            ) ?? true
          }
          finalFocus={anchor}
        >
          <Calendar
            selected={parseDay(value)}
            min={parseDay(min)}
            max={parseDay(max)}
            locale={locale}
            onSelect={(day) => onSelect(formatDay(day))}
          />
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

function keyTarget(event: KeyboardEvent, day: Date, weekStart: number) {
  const intoWeek = (day.getDay() - weekStart + 7) % 7;
  const months = event.shiftKey ? 12 : 1;
  switch (event.key) {
    case "ArrowLeft":
      return addDays(day, -1);
    case "ArrowRight":
      return addDays(day, 1);
    case "ArrowUp":
      return addDays(day, -7);
    case "ArrowDown":
      return addDays(day, 7);
    case "Home":
      return addDays(day, -intoWeek);
    case "End":
      return addDays(day, 6 - intoWeek);
    case "PageUp":
      return addMonths(day, -months);
    case "PageDown":
      return addMonths(day, months);
    default:
      return null;
  }
}

function Calendar({
  selected,
  min,
  max,
  locale,
  onSelect,
}: {
  selected: Date | null;
  min: Date | null;
  max: Date | null;
  locale: string;
  onSelect: (day: Date) => void;
}) {
  const [today] = useState(() => startOfDay(new Date()));
  const [focused, setFocused] = useState(() =>
    clampDay(selected ?? today, min, max),
  );
  const moved = useRef(false);
  const grid = useRef<HTMLTableElement>(null);
  const weekStart = localeWeekStart(locale);
  const days = monthGrid(focused, weekStart);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(focused);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const dayName = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const outside = (day: Date) =>
    (min !== null && day < min) || (max !== null && day > max);
  const previous = addMonths(focused, -1);
  const next = addMonths(focused, 1);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-day="${formatDay(focused)}"]`)
      ?.focus();
  }, [focused]);

  const move = (day: Date) => {
    moved.current = true;
    setFocused(clampDay(day, min, max));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!outside(focused)) onSelect(focused);
      return;
    }
    const target = keyTarget(event, focused, weekStart);
    if (!target) return;
    event.preventDefault();
    move(target);
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <span className={styles.month} aria-live="polite">
          {monthLabel}
        </span>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label="Previous Month"
          disabled={
            min !== null &&
            new Date(previous.getFullYear(), previous.getMonth() + 1, 0) < min
          }
          onClick={() => setFocused(clampDay(previous, min, max))}
        >
          <IconChevronLeft size={12} />
        </Button>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label="Next Month"
          disabled={
            max !== null &&
            new Date(next.getFullYear(), next.getMonth(), 1) > max
          }
          onClick={() => setFocused(clampDay(next, min, max))}
        >
          <IconChevronRight size={12} />
        </Button>
      </div>
      <table
        ref={grid}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- the WAI-ARIA date picker grid is a table with role="grid"
        role="grid"
        aria-label={monthLabel}
        className={styles.grid}
      >
        <thead>
          <tr>
            {days.slice(0, 7).map((day) => (
              <th
                key={day.getDay()}
                scope="col"
                abbr={weekdayName.format(day)}
                className={styles.weekday}
              >
                {weekday.format(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={formatDay(days[week * 7] ?? focused)}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const key = formatDay(day);
                const isSelected = sameDay(day, selected);
                const disabled = outside(day);
                return (
                  <td
                    key={key}
                    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- WAI-ARIA date picker days are explicit gridcells in the table
                    role="gridcell"
                    className={styles.day}
                    data-day={key}
                    data-selected={isSelected || undefined}
                    data-today={sameDay(day, today) || undefined}
                    data-outside={
                      day.getMonth() !== focused.getMonth() || undefined
                    }
                    data-disabled={disabled || undefined}
                    tabIndex={
                      disabled ? undefined : sameDay(day, focused) ? 0 : -1
                    }
                    aria-selected={isSelected}
                    aria-disabled={disabled || undefined}
                    aria-current={sameDay(day, today) ? "date" : undefined}
                    aria-label={dayName.format(day)}
                    onClick={disabled ? undefined : () => onSelect(day)}
                    onKeyDown={onKeyDown}
                    onFocus={() => {
                      if (!sameDay(day, focused)) setFocused(day);
                    }}
                  >
                    {day.getDate()}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
