import {
  IconArchiveDownload,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconFile,
  IconFolder,
  IconFolderImport,
  IconFolderOpen,
  IconGlobe,
  IconImageSparkle,
  IconLibrary,
  IconLink2,
  IconUserPlus,
} from "@pond/icons";
import type { ReactNode } from "react";
import { ease, mix, progress } from "../../motion";
import { hit, type Placement, type Point } from "../geometry";
import styles from "./styles.module.css";

export interface MenuItem {
  label: string;
  icon: ReactNode;
  submenu?: boolean;
}

/** The New menu's top level, as `new-menu/spec.tsx` builds it. */
export const NEW_ITEMS: MenuItem[] = [
  { label: "New", icon: <IconFolder />, submenu: true },
  { label: "Import", icon: <IconDownload />, submenu: true },
  { label: "Sources", icon: <IconUserPlus />, submenu: true },
  { label: "Library", icon: <IconLibrary />, submenu: true },
];

export const IMPORT_ITEMS: MenuItem[] = [
  { label: "Import Files", icon: <IconFile /> },
  { label: "Import Folders", icon: <IconFolderOpen /> },
  { label: "Import from Links", icon: <IconLink2 /> },
  { label: "Import from Clipboard", icon: <IconCopy /> },
  { label: "Import Bookmarks", icon: <IconGlobe /> },
  { label: "Import mymind", icon: <IconFolderImport /> },
  { label: "Import Page Assets", icon: <IconImageSparkle /> },
  { label: "Import Eagle Package", icon: <IconArchiveDownload /> },
  { label: "Import Pond Package", icon: <IconArchiveDownload /> },
  { label: "Import Eagle Library", icon: <IconDownload /> },
  { label: "Import Legacy Library", icon: <IconFolderImport />, submenu: true },
];

interface PopupProps extends Placement {
  t: number;
  open: number;
  close: number;
  items: MenuItem[];
  highlighted: number;
  pressed?: number;
}

function Popup({
  t,
  open,
  close,
  left,
  top,
  width,
  items,
  highlighted,
  pressed = -1,
}: PopupProps) {
  if (t < open || t > close + 160) return null;
  const k =
    ease.out(progress(t, open, 140)) * (1 - ease.in(progress(t, close, 140)));
  return (
    <div
      className={styles.popup}
      style={{
        left,
        top,
        width,
        opacity: k,
        transform: `scale(${mix(0.96, 1, k)}) translateY(${(1 - k) * -2}px)`,
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={styles.item}
          data-highlighted={index === highlighted || undefined}
          data-pressed={index === pressed || undefined}
        >
          <span className={styles["item-icon"]}>{item.icon}</span>
          <span className={styles["item-label"]}>{item.label}</span>
          {item.submenu ? <IconChevronRight /> : null}
        </div>
      ))}
    </div>
  );
}

export interface MenuLevel extends Placement {
  items: MenuItem[];
}

interface MenuProps {
  t: number;
  pointer: Point;
  root: MenuLevel;
  sub: MenuLevel;
  /** The root item that owns `sub`; it stays highlighted while the submenu is open. */
  via: number;
  rootOpen: number;
  subOpen: number;
  close: number;
  click: number;
}

/** A Pond menu and one submenu, highlighting whatever the pointer is over and pressing at `click`. */
export function Menu({
  t,
  pointer,
  root,
  sub,
  via,
  rootOpen,
  subOpen,
  close,
  click,
}: MenuProps) {
  const subHit = hit(sub, sub.items.length, pointer);
  const rootHit = hit(root, root.items.length, pointer);
  const rootHighlight = t >= subOpen ? via : rootHit;
  const subHighlight = t >= subOpen ? subHit : -1;
  const pressed = t >= click && t < click + 90 ? subHighlight : -1;
  return (
    <>
      <Popup
        t={t}
        open={rootOpen}
        close={close}
        {...root}
        highlighted={rootHighlight}
      />
      <Popup
        t={t}
        open={subOpen}
        close={close}
        {...sub}
        highlighted={subHighlight}
        pressed={pressed}
      />
    </>
  );
}
