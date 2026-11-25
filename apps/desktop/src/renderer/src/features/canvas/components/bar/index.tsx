import { Button, Keyboard, Menu, Tooltip } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import type { CanvasColor } from "@shared/canvas-contracts";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import { Picker } from "../picker";
import styles from "./styles.module.css";

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  hidden?: boolean;
}

function Root({ hidden, className, ...props }: RootProps) {
  return (
    <Tooltip.Group>
      <div
        className={cn(styles.bar, className)}
        data-hidden={hidden || undefined}
        {...props}
      />
    </Tooltip.Group>
  );
}

type GroupProps = ComponentPropsWithoutRef<"fieldset">;

function Group({ className, ...props }: GroupProps) {
  return <fieldset className={cn(styles.group, className)} {...props} />;
}

interface ColorsProps {
  value: CanvasColor | null;
  onChange: (color: CanvasColor) => void;
}

function Colors({ value, onChange }: ColorsProps) {
  return <Picker.Colors value={value} size="xs" onChange={onChange} />;
}

interface ActionProps {
  label: string;
  shortcut?: Array<string>;
  pressed?: boolean;
  onClick: () => void;
  children: ReactElement;
}

function Action({ label, shortcut, pressed, onClick, children }: ActionProps) {
  return (
    <Tooltip
      label={label}
      shortcut={
        shortcut ? (
          <Keyboard.Cluster keys={platformGlyphs(shortcut)} />
        ) : undefined
      }
      side="top"
    >
      <Button
        icon
        size="xs"
        variant="ghost"
        rounding="full"
        aria-label={label}
        aria-pressed={pressed}
        data-pressed={pressed || undefined}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

interface BarMenuProps {
  label: string;
  buildItems: () => Array<MenuItemSpec>;
  children: ReactElement;
}

function BarMenu({ label, buildItems, children }: BarMenuProps) {
  return (
    <SpecMenu align="center" buildItems={buildItems}>
      <Tooltip label={label} side="top">
        <Menu.Trigger
          icon
          size="xs"
          variant="ghost"
          rounding="full"
          aria-label={label}
        >
          {children}
        </Menu.Trigger>
      </Tooltip>
    </SpecMenu>
  );
}

export const Bar = { Root, Group, Colors, Action, Menu: BarMenu };
