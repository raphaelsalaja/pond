import { IconDots } from "@pond/icons";
import { ContextMenu, Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { isElement } from "@pond/ui/dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { filterMenuItems } from "./filter";
import styles from "./styles.module.css";

type RootProps = ComponentProps<typeof ContextMenu.Root>;
type OpenChangeDetails = Parameters<NonNullable<RootProps["onOpenChange"]>>[1];
type FilterProviderProps = ComponentProps<typeof Menu.FilterProvider>;

interface PopupStyle extends CSSProperties {
  "--ds-popup-width"?: string;
  "--ds-popup-min-width": string;
}

const DEFAULT_POPUP_STYLE: PopupStyle = {
  "--ds-popup-min-width": "180px",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }
  return target.closest('input, textarea, [contenteditable="true"]') !== null;
}

export interface SpecMenuChromeProps {
  buildItems: () => Array<MenuItemSpec>;
  search?: boolean;
  searchLabel?: string;
  onOpen?: (eventDetails: OpenChangeDetails) => void;
  className?: string;
  minWidth?: string;
  children: ReactElement;
}

function useMenuBodyHeight<LayoutKey>(
  bodyRef: RefObject<HTMLDivElement | null>,
  layoutKey: LayoutKey,
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [sized, setSized] = useState(false);

  useLayoutEffect(() => {
    void layoutKey;
    const content = contentRef.current;
    const body = bodyRef.current;
    if (!content || !body) return;
    const popup = body.parentElement;
    if (!popup) return;

    const measure = () => {
      const cap = Number.parseFloat(getComputedStyle(popup).maxHeight);
      const bodyStyle = getComputedStyle(body);
      const natural =
        content.offsetHeight +
        Number.parseFloat(bodyStyle.paddingTop || "0") +
        Number.parseFloat(bodyStyle.paddingBottom || "0");
      const next = Math.min(
        natural,
        Number.isFinite(cap) && cap > 0 ? cap : natural,
      );
      if (next <= 0) return;
      setHeight((prev) => (prev === next ? prev : next));
      const width = popup.offsetWidth;
      if (width <= 0) return;
      const locked = Number.parseFloat(
        popup.style.getPropertyValue("--popup-locked-width"),
      );
      if (!Number.isFinite(locked) || width > locked) {
        const nextWidth = `${width}px`;
        popup.style.setProperty("--popup-locked-width", nextWidth);
        popup.style.setProperty("--ds-popup-width", nextWidth);
        popup.style.setProperty("--ds-popup-min-width", nextWidth);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [bodyRef, layoutKey]);

  useEffect(() => {
    if (height === null) {
      return;
    }
    const id = requestAnimationFrame(() => setSized(true));
    return () => cancelAnimationFrame(id);
  }, [height]);

  const style: CSSProperties & { "--body-height"?: string } = {};
  if (height !== null) {
    style["--body-height"] = `${height}px`;
  }
  return { contentRef, sized, style };
}

function SearchResults({
  items,
  Items,
}: {
  items: Array<MenuItemSpec>;
  Items: typeof ContextMenu.Items;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { contentRef, sized, style } = useMenuBodyHeight(bodyRef, items);

  return (
    <Menu.FilterList
      ref={bodyRef}
      className={styles.body}
      data-menu-body=""
      data-sized={sized || undefined}
      style={style}
    >
      <div ref={contentRef}>
        <Items items={items} />
        <Menu.Empty>No matching operations</Menu.Empty>
      </div>
    </Menu.FilterList>
  );
}

function SearchFilter({
  search,
  query,
  onValueChange,
  children,
}: {
  search: boolean;
  query: string;
  onValueChange: FilterProviderProps["onValueChange"];
  children: ReactNode;
}) {
  if (!search) return children;
  return (
    <Menu.FilterProvider
      filter={null}
      autoHighlight
      value={query}
      onValueChange={onValueChange}
    >
      {children}
    </Menu.FilterProvider>
  );
}

export function SpecContextMenu({
  buildItems,
  search = false,
  searchLabel = "Search operations",
  onOpen,
  className,
  minWidth,
  children,
}: SpecMenuChromeProps) {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const [mounted, setMounted] = useState(false);
  const items = mounted ? filterMenuItems(buildItems(), query) : [];
  const popupStyle: PopupStyle = minWidth
    ? { "--ds-popup-width": minWidth, "--ds-popup-min-width": minWidth }
    : DEFAULT_POPUP_STYLE;

  return (
    <SearchFilter search={search} query={query} onValueChange={onValueChange}>
      <ContextMenu.Root
        onOpenChange={(open, eventDetails) => {
          if (!open) return;
          if (isEditableTarget(eventDetails.event?.target ?? null)) {
            eventDetails.cancel();
            return;
          }
          reset();
          setMounted(true);
          onOpen?.(eventDetails);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setMounted(false);
        }}
      >
        <ContextMenu.Trigger render={children} />
        <ContextMenu.Portal>
          <ContextMenu.Positioner style={popupStyle}>
            <ContextMenu.Popup
              className={className ?? (search ? styles.popup : undefined)}
            >
              {search ? (
                <>
                  <ContextMenu.Input
                    autoFocus
                    aria-label={searchLabel}
                    placeholder="Search…"
                  />
                  <SearchResults items={items} Items={ContextMenu.Items} />
                </>
              ) : (
                <ContextMenu.Items items={items} />
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </SearchFilter>
  );
}

interface SpecMenuProps {
  buildItems: () => Array<MenuItemSpec>;
  search?: boolean;
  searchLabel?: string;
  onOpen?: () => void;
  className?: string;
  align?: "start" | "center" | "end";
  minWidth?: string;
  children: ReactElement;
}

export function SpecMenu({
  buildItems,
  search = false,
  searchLabel = "Search operations",
  onOpen,
  className,
  align = "start",
  minWidth,
  children,
}: SpecMenuProps) {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const [mounted, setMounted] = useState(false);
  const items = mounted ? filterMenuItems(buildItems(), query) : [];
  const popupStyle: PopupStyle = minWidth
    ? { "--ds-popup-width": minWidth, "--ds-popup-min-width": minWidth }
    : DEFAULT_POPUP_STYLE;

  return (
    <SearchFilter search={search} query={query} onValueChange={onValueChange}>
      <Menu.Root
        onOpenChange={(next) => {
          if (!next) return;
          reset();
          setMounted(true);
          onOpen?.();
        }}
        onOpenChangeComplete={(next) => {
          if (!next) setMounted(false);
        }}
      >
        {children}
        <Menu.Portal>
          <Menu.Positioner align={align} sideOffset={6} style={popupStyle}>
            <Menu.Popup
              className={className ?? (search ? styles.popup : undefined)}
            >
              {search ? (
                <>
                  <Menu.Input
                    autoFocus
                    aria-label={searchLabel}
                    placeholder="Search…"
                  />
                  <SearchResults items={items} Items={Menu.Items} />
                </>
              ) : (
                <Menu.Items items={items} />
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </SearchFilter>
  );
}

/** A panel header's ⋯ button: its actions without needing a right-click. */
export function SpecMoreMenu({
  label,
  buildItems,
}: {
  label: string;
  buildItems: () => Array<MenuItemSpec>;
}) {
  return (
    <SpecMenu align="end" buildItems={buildItems}>
      <Menu.Trigger icon size="sm" variant="ghost" aria-label={label}>
        <IconDots size={12} />
      </Menu.Trigger>
    </SpecMenu>
  );
}
