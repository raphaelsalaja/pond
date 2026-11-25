import {
  createTokenInputController,
  fromText,
  type Token,
  type TokenCodec,
  TokenInputEditor,
  TokenInput as TokenInputRoot,
  TokenInputToken,
  TokenInputTokenRemove,
  type TokenInputValue,
  toText,
} from "@ui-sdk/react/token-input";
import {
  createTriggerMenuController,
  type TriggerDefinition,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
  TriggerMenuStatus,
} from "@ui-sdk/react/trigger-menu";
import { clsx as cn } from "clsx";
import type { ComponentProps, ComponentPropsWithoutRef } from "react";
import { withClass } from "../shared/state-class";
import styles from "./styles.module.css";

type EditorProps = ComponentProps<typeof TokenInputEditor>;

/** The editable text. Shows `placeholder` while it's empty. */
function Editor({ className, ...props }: EditorProps) {
  return (
    <TokenInputEditor
      className={withClass(styles.editor, className)}
      {...props}
    />
  );
}

type TokenProps = ComponentProps<typeof TokenInputToken>;

/** A token's content, inside `renderToken`. Moves and deletes as one piece. */
function TokenPart({ className, ...props }: TokenProps) {
  return (
    <TokenInputToken
      className={withClass(styles.token, className)}
      {...props}
    />
  );
}

type PopupProps = ComponentProps<typeof TriggerMenuContent>;

/** The suggestion list's popup, in the top layer. Opens above the anchor by default. */
function Popup({
  className,
  side = "top",
  align = "start",
  sideOffset = 8,
  collisionPadding = 16,
  ...props
}: PopupProps) {
  return (
    <TriggerMenuContent
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={withClass(styles.popup, className)}
      {...props}
    />
  );
}

type ListProps = ComponentProps<typeof TriggerMenuList>;

function List({ className, ...props }: ListProps) {
  return (
    <TriggerMenuList className={withClass(styles.list, className)} {...props} />
  );
}

type ItemProps = ComponentProps<typeof TriggerMenuItem>;

function Item({ className, ...props }: ItemProps) {
  return (
    <TriggerMenuItem className={withClass(styles.item, className)} {...props} />
  );
}

type ItemIconProps = ComponentProps<typeof TriggerMenuItemIcon>;

function ItemIcon({ className, ...props }: ItemIconProps) {
  return (
    <TriggerMenuItemIcon
      className={withClass(styles.icon, className)}
      {...props}
    />
  );
}

function ItemLabel({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn(styles.label, className)} {...props} />;
}

type GroupLabelProps = ComponentProps<typeof TriggerMenuGroupLabel>;

function GroupLabel({ className, ...props }: GroupLabelProps) {
  return (
    <TriggerMenuGroupLabel
      className={withClass(styles.heading, className)}
      {...props}
    />
  );
}

type EmptyProps = ComponentProps<typeof TriggerMenuEmpty>;

/** Keeps the popup open with a message while nothing matches or items load. */
function Empty({ className, ...props }: EmptyProps) {
  return (
    <TriggerMenuEmpty
      className={withClass(styles.empty, className)}
      {...props}
    />
  );
}

type StatusProps = ComponentProps<typeof TriggerMenuStatus>;

/** Says the count and loading state to screen readers; visually hidden. */
function Status({ className, ...props }: StatusProps) {
  return (
    <TriggerMenuStatus
      className={withClass(styles.status, className)}
      {...props}
    />
  );
}

export const TokenInput = {
  Root: TokenInputRoot,
  Editor,
  Token: TokenPart,
  TokenRemove: TokenInputTokenRemove,
  Menu: TriggerMenu,
  Popup,
  List,
  Item,
  ItemIcon,
  ItemLabel,
  Group: TriggerMenuGroup,
  GroupLabel,
  Empty,
  Status,
  createController: createTokenInputController,
  createMenuController: createTriggerMenuController,
  toText,
  fromText,
};

export type { Token, TokenCodec, TokenInputValue, TriggerDefinition };
