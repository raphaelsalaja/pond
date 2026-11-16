import { IconCircleCheck } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { WATCH_NEEDS_SESSION, watchSourceLabel } from "@pond/schema/watches";
import { Button, Dialog } from "@pond/ui";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { ConnectionVisual } from "@/features/sources/components/flow/connection-visual";
import { useAccounts } from "@/features/sources/hooks/use-accounts";
import { startConnect } from "@/features/sources/lib/create";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { useWatchSource, watchFlow } from "@/features/sources/state/watch-flow";
import { WatchTargetField } from "../target-field";
import { watchInputSource } from "./input-source";
import styles from "./styles.module.css";
import { watchTargets } from "./targets";

const FORM_ID = "watch-target";
/** Long enough for the merge into the check to settle before the dialog closes. */
const ADDED_HOLD_MS = 1100;

const AddWatchResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  watch: z.object({ id: z.string() }).optional(),
});

type AddWatchResult = z.infer<typeof AddWatchResultSchema>;

interface WatchTargetProviderProps {
  source: Source;
  connectedSources: readonly Source[];
  addWatch: (source: Source, input: string) => Promise<AddWatchResult>;
  onAdded: (id: string) => void;
  children: ReactNode;
}

function watchErrorMessage(reason: string | undefined, source: Source): string {
  const label = watchSourceLabel(source);
  switch (reason) {
    case "already_watching":
      return "You're already watching this.";
    case "needs_account":
      return `Connect an account on ${label} first.`;
    case "invalid":
      if (source === "web")
        return "No RSS or Atom feed was found. Check the feed URL.";
      return `Couldn't find that profile on ${label}. Check the link or handle.`;
    default:
      return "Couldn't start watching. Try again.";
  }
}

function useWatchTargetState({
  source,
  connectedSources,
  addWatch,
  onAdded,
}: Omit<WatchTargetProviderProps, "children">) {
  const label = watchSourceLabel(source);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(addedTimer.current), []);
  const input = value.trim();
  const detected = watchInputSource(input, source);
  const mismatch =
    detected.type === "unsupported" ||
    (detected.type === "link" && detected.source !== source)
      ? source === "web"
        ? "Enter a feed URL that starts with http:// or https://."
        : `This link isn't from ${label}. Paste a ${label} link or enter a handle.`
      : null;
  const needsSession =
    WATCH_NEEDS_SESSION.includes(source) && !connectedSources.includes(source);
  const canSubmit = !needsSession && !busy && !added;

  const change = (next: string) => {
    setValue(next);
    setError(null);
    setMissing(false);
  };

  const submit = async () => {
    if (!canSubmit || submitting.current) return;
    if (!input || mismatch) {
      setMissing(!input);
      inputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await addWatch(source, input);
      if (res.ok && res.watch) {
        const id = res.watch.id;
        setAdded(true);
        addedTimer.current = window.setTimeout(
          () => onAdded(id),
          ADDED_HOLD_MS,
        );
        return;
      }
      setError(watchErrorMessage(res.reason, source));
    } catch {
      setError(watchErrorMessage(undefined, source));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return {
    source,
    label,
    value,
    change,
    error,
    missing,
    mismatch,
    needsSession,
    busy,
    added,
    canSubmit,
    inputRef,
    submit,
  };
}

const WatchTargetContext = createContext<ReturnType<
  typeof useWatchTargetState
> | null>(null);

function useWatchTarget() {
  const state = useContext(WatchTargetContext);
  if (!state) throw new Error("WatchTarget parts need a WatchTargetProvider");
  return state;
}

export function WatchTargetProvider({
  children,
  ...props
}: WatchTargetProviderProps) {
  const state = useWatchTargetState(props);
  return (
    <WatchTargetContext.Provider value={state}>
      {children}
    </WatchTargetContext.Provider>
  );
}

async function addWatch(source: Source, handle: string) {
  return AddWatchResultSchema.parse(
    await window.pond.query("watches.add", { source, handle }),
  );
}

export function WatchTargetRoot({ children }: { children: ReactNode }) {
  const activeSource = useWatchSource();
  const { accounts } = useAccounts();
  const [source, setSource] = useState(activeSource);
  /** The flow clears its source on close, before the popup finishes animating out. */
  if (activeSource && activeSource !== source) setSource(activeSource);
  if (!source) return children;
  const connectedSources = accounts
    .filter((account) => account.connected)
    .map((account) => account.source);
  return (
    <WatchTargetProvider
      key={source}
      source={source}
      connectedSources={connectedSources}
      addWatch={addWatch}
      onAdded={(id) => {
        watchFlow.added(id);
        sourceFlow.close();
      }}
    >
      {children}
    </WatchTargetProvider>
  );
}

export function WatchTargetSection() {
  const {
    source,
    label,
    value,
    change,
    error,
    missing,
    mismatch,
    needsSession,
    busy,
    added,
    inputRef,
    submit,
  } = useWatchTarget();
  const message =
    error ??
    (missing
      ? `Enter a handle or paste a ${label} link.`
      : value.trim()
        ? mismatch
        : null);
  const { placeholder, kinds } = watchTargets(source);

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <form
      id={FORM_ID}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <ConnectionVisual
        source={source}
        state={
          added ? "connected" : error ? "failed" : busy ? "waiting" : "idle"
        }
      />
      <div className={styles.copy}>
        <h2 className={styles.title}>
          {source === "web" ? "Watch an RSS Feed" : `Watch on ${label}`}
        </h2>
        <p className={styles.description}>
          {source === "web"
            ? "Paste an RSS or Atom feed URL."
            : `Enter a handle or paste a ${label} link.`}
          <br />
          Pond adds new posts to your Library.
        </p>
      </div>
      <div className={styles.field}>
        <WatchTargetField
          inputRef={inputRef}
          value={value}
          placeholder={placeholder}
          disabled={busy || added}
          invalid={!!message}
          onChange={change}
        />
        {message ? (
          <p className={styles.message} role="alert">
            {message}
          </p>
        ) : null}
      </div>
      <div className={styles.details}>
        <p className={styles.heading}>You can watch</p>
        <ul className={styles.list}>
          {kinds.map((kind) => (
            <li key={kind.label} className={styles.kind}>
              <IconCircleCheck size={12} className={styles.check} />
              <span>{kind.label}</span>
              <span className={styles.example}>{kind.example}</span>
            </li>
          ))}
        </ul>
      </div>
      {needsSession ? (
        <div className={styles.notice}>
          <p className={styles.text}>Watching needs your {label} account.</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void startConnect(source)}
          >
            Connect
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function WatchTargetSubmit() {
  const { busy, canSubmit } = useWatchTarget();
  return (
    <Dialog.Confirm
      type="submit"
      form={FORM_ID}
      loading={busy}
      disabled={!canSubmit}
    >
      Watch
    </Dialog.Confirm>
  );
}
