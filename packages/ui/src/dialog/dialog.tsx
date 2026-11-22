import { AlertDialog as Alert } from "@base-ui/react/alert-dialog";
import { Dialog as Base } from "@base-ui/react/dialog";
import { IconChevronLeft, IconCircleQuestion, IconXmark } from "@pond/icons";
import { clsx as cn } from "clsx";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  createContext,
  type Dispatch,
  type ForwardedRef,
  forwardRef,
  type ReactNode,
  type SetStateAction,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, type ButtonProps } from "../button";
import { Tooltip } from "../tooltip";
import { DialogPageContext, useDialogPage } from "./context";
import styles from "./styles.module.css";

const PAGE_EASE = [0.26, 0.08, 0.25, 1] as const;

type PortalContainer = HTMLElement | null;

const DialogPortalContext = createContext<{
  container: PortalContainer;
  setContainer: Dispatch<SetStateAction<PortalContainer>>;
}>({
  container: null,
  setContainer: () => {},
});

const DialogPreviewContext = createContext(false);

const scaleVariants = {
  enter: (deeper: boolean) => ({
    opacity: 0,
    scale: deeper ? 0.96 : 1.04,
  }),
  show: { opacity: 1, scale: 1 },
  exit: (deeper: boolean) => ({
    opacity: 0,
    scale: deeper ? 1.04 : 0.96,
    position: "absolute" as const,
    top: 0,
    left: 0,
    pointerEvents: "none" as const,
  }),
};

const fadeVariants = {
  enter: { opacity: 0 },
  show: { opacity: 1 },
  exit: {
    opacity: 0,
    position: "absolute" as const,
    top: 0,
    left: 0,
    pointerEvents: "none" as const,
  },
};

type RootProps<Payload> =
  | ({ variant?: "dialog" } & Base.Root.Props<Payload>)
  | ({ variant: "alert" } & Alert.Root.Props<Payload>);

function Root<Payload = unknown>(props: RootProps<Payload>) {
  if (props.variant === "alert") {
    const { variant: _variant, ...rest } = props;
    return <Alert.Root {...rest} />;
  }
  const { variant: _variant, ...rest } = props;
  return <Base.Root {...rest} />;
}

function PortalProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<PortalContainer>(null);
  const value = useMemo(() => ({ container, setContainer }), [container]);
  return <DialogPortalContext value={value}>{children}</DialogPortalContext>;
}

function Portal({
  className,
  container: providedContainer,
  ...props
}: Base.Portal.Props) {
  const { container } = use(DialogPortalContext);
  const resolvedContainer =
    providedContainer === undefined ? container : providedContainer;
  return (
    <Base.Portal
      className={cn(styles.portal, className)}
      {...(resolvedContainer ? { container: resolvedContainer } : {})}
      data-contained={resolvedContainer ? "" : undefined}
      {...props}
    />
  );
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (!ref) return;
  if ("current" in ref) ref.current = value;
  else ref(value);
}

const PortalTarget = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function PortalTarget({ children, ...props }, forwardedRef) {
  const { setContainer } = use(DialogPortalContext);
  const localRef = useRef<HTMLDivElement>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const node = localRef.current;
    if (!node) return;
    setContainer(node);
    return () => {
      setContainer((current) => (current === node ? null : current));
    };
  }, [setContainer]);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
});

function Backdrop({ className, ...props }: Base.Backdrop.Props) {
  return (
    <Base.Backdrop className={cn(styles.backdrop, className)} {...props} />
  );
}

type PopupProps = Base.Popup.Props &
  ({ pageId: string; depth: number } | { pageId?: never; depth?: never });

function Popup(props: PopupProps) {
  if (props.pageId !== undefined)
    return <PagedPopup {...props} pageId={props.pageId} depth={props.depth} />;
  const { pageId: _pageId, depth: _depth, className, ...rest } = props;
  return <Base.Popup className={cn(styles.popup, className)} {...rest} />;
}

function PagedPopup({
  className,
  style,
  pageId,
  depth,
  children,
  ...props
}: Base.Popup.Props & { pageId: string; depth: number }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [navigation, setNavigation] = useState({ pageId, depth, deeper: true });
  if (navigation.pageId !== pageId || navigation.depth !== depth) {
    setNavigation({ pageId, depth, deeper: depth >= navigation.depth });
  }
  const { deeper } = navigation;
  const [size, setSizeState] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [animateSize, setAnimateSize] = useState(false);

  const setSize = useCallback((width: number, height: number) => {
    setSizeState((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  useEffect(() => {
    if (!size) return;
    const id = requestAnimationFrame(() => setAnimateSize(true));
    return () => cancelAnimationFrame(id);
  }, [size]);

  const value = useMemo(
    () => ({ pageId, depth, deeper, reduceMotion, setSize }),
    [pageId, depth, deeper, reduceMotion, setSize],
  );

  const popupStyle: CSSProperties & {
    "--width"?: string;
    "--height"?: string;
  } = {
    ...style,
  };
  if (size) {
    popupStyle["--width"] = `${size.width}px`;
    popupStyle["--height"] = `${size.height}px`;
  }

  return (
    <Base.Popup
      className={cn(styles.popup, className)}
      data-sized={animateSize || undefined}
      style={popupStyle}
      {...props}
    >
      <DialogPageContext value={value}>{children}</DialogPageContext>
    </Base.Popup>
  );
}

interface HeaderProps extends ComponentPropsWithoutRef<"header"> {}

function Header({ className, ...props }: HeaderProps) {
  return <header className={cn(styles.header, className)} {...props} />;
}

interface PreviewProps extends ComponentPropsWithoutRef<"div"> {}

/** Popup chrome without a dialog root, for inert specimens in docs and galleries. */
function Preview({ className, ...props }: PreviewProps) {
  return (
    <DialogPreviewContext value>
      <div className={cn(styles.popup, className)} {...props} />
    </DialogPreviewContext>
  );
}

function Title({ className, children, ...props }: Base.Title.Props) {
  const page = use(DialogPageContext);
  const preview = use(DialogPreviewContext);
  if (preview)
    return <h2 className={cn(styles.title, className)}>{children}</h2>;
  if (!page)
    return (
      <Base.Title className={cn(styles.title, className)} {...props}>
        {children}
      </Base.Title>
    );
  const { pageId, reduceMotion } = page;
  return (
    <Base.Title className={cn(styles.title, className)} {...props}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={pageId}
          className={styles.heading}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.17,
            ease: PAGE_EASE,
          }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </Base.Title>
  );
}

interface DescriptionProps extends ComponentPropsWithoutRef<"p"> {}

/** An exiting page keeps a plain paragraph so its unmount can't clear the incoming page's `aria-describedby`. */
function Description({ className, ...props }: DescriptionProps) {
  const preview = use(DialogPreviewContext);
  const present = useIsPresent();
  if (preview || !present)
    return <p className={cn(styles.description, className)} {...props} />;
  return (
    <Base.Description
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

interface ViewportProps extends ComponentPropsWithoutRef<"div"> {}

function Viewport({ className, children, ...props }: ViewportProps) {
  const { pageId, deeper } = useDialogPage();
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousPage = useRef(pageId);

  useLayoutEffect(() => {
    if (previousPage.current === pageId) return;
    previousPage.current = pageId;
    viewportRef.current
      ?.querySelector<HTMLElement>("[data-dialog-page]:not([inert])")
      ?.focus({ preventScroll: true });
  }, [pageId]);

  return (
    <div
      ref={viewportRef}
      className={cn(styles.viewport, className)}
      {...props}
    >
      <AnimatePresence initial={false} custom={deeper}>
        <Page key={pageId}>{children}</Page>
      </AnimatePresence>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  const { deeper, reduceMotion, setSize } = useDialogPage();
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !present) return;
    const viewport = node.parentElement;
    const chrome = Array.from(viewport?.parentElement?.children ?? []).filter(
      (element): element is HTMLElement =>
        element !== viewport && element instanceof HTMLElement,
    );
    const measure = () =>
      setSize(
        node.offsetWidth,
        node.offsetHeight +
          (chrome.reduce(
            (height, element) => height + element.offsetHeight,
            0,
          ) || 52),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const element of chrome) observer.observe(element);
    return () => observer.disconnect();
  }, [present, setSize]);

  return (
    <motion.div
      ref={ref}
      data-dialog-page=""
      inert={!present}
      aria-hidden={!present || undefined}
      tabIndex={-1}
      className={styles.page}
      data-scroll-fade="vertical"
      custom={deeper}
      variants={reduceMotion ? fadeVariants : scaleVariants}
      initial="enter"
      animate="show"
      exit="exit"
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: PAGE_EASE }}
    >
      {children}
    </motion.div>
  );
}

interface ActionProps extends ComponentPropsWithoutRef<"button"> {
  position?: "start" | "end";
}

function Action({ className, position = "start", ...props }: ActionProps) {
  return (
    <button
      type="button"
      data-position={position}
      className={cn(styles.action, className)}
      {...props}
    />
  );
}

function Back(props: ComponentPropsWithoutRef<"button">) {
  return (
    <Action aria-label="Back" {...props}>
      <IconChevronLeft size={12} strokeWidth={2} />
    </Action>
  );
}

function Help(props: ComponentPropsWithoutRef<"button">) {
  return (
    <Action aria-label="Help" {...props}>
      <IconCircleQuestion size={12} strokeWidth={2} />
    </Action>
  );
}

function Close(props: Base.Close.Props) {
  return (
    <Base.Close
      render={
        <button
          type="button"
          className={styles.action}
          data-position="end"
          aria-label="Close"
        >
          <IconXmark size={12} strokeWidth={2} />
        </button>
      }
      {...props}
    />
  );
}

function Content({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(styles.content, className)}
      data-scroll-fade="vertical"
      {...props}
    />
  );
}

interface FooterProps extends ComponentPropsWithoutRef<"div"> {
  leading?: ReactNode;
  layout?: "end" | "fill";
}

function Footer({
  className,
  children,
  leading,
  layout = "end",
  ...props
}: FooterProps) {
  return (
    <div
      className={cn(styles.footer, className)}
      data-leading={leading ? "" : undefined}
      data-layout={layout}
      {...props}
    >
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.actions}>{children}</div>
    </div>
  );
}

function Cancel({ className, children = "Cancel", ...props }: ButtonProps) {
  return (
    <Base.Close
      render={
        <Button type="button" variant="secondary" className={className}>
          {children}
        </Button>
      }
      {...props}
    />
  );
}

function Confirm({ className, children, ...props }: ButtonProps) {
  return (
    <Button variant="primary" className={className} {...props}>
      {children ?? "Confirm"}
    </Button>
  );
}

export const DialogParts = {
  Trigger: Base.Trigger,
  Content,
  Root,
  PortalProvider,
  PortalTarget,
  Portal,
  Backdrop,
  Popup,
  Preview,
  Header,
  Title,
  Description,
  Viewport,
  Back,
  Help,
  Info: Tooltip.Info,
  Close,
  Footer,
  Cancel,
  Confirm,
  Action,
  createHandle: Base.createHandle,
  createAlertHandle: Alert.createHandle,
  Handle: Base.Handle,
};
