import { lazy, Suspense, useEffect, useState } from "react";
import { useBootReady, useSavePaging } from "@/features/saves/hooks/use-saves";
import { loadPrefs } from "@/shared/state/prefs";
import { setupFlow, useSetupFlow } from "@/shared/state/setup";
import type { SetupProfile, SetupStart } from "@/shared/state/setup";
import { choicesFrom, parentFolder, SETUP_VERSION, STEP_IDS } from "./model";
import type { Session } from "./model";
import { setupResume } from "./resume";

const SetupDialog = lazy(() =>
  import("./dialog").then((module) => ({ default: module.SetupDialog })),
);

async function startSession(
  profile: SetupProfile,
  start: SetupStart | null,
): Promise<Session> {
  const [prefs, info] = await Promise.all([
    loadPrefs(),
    window.pond.query("library.info", {}),
  ]);
  const library = {
    name: info.name,
    path: info.path,
    parent: parentFolder(info.path),
    saves: 0,
  };
  const choices = choicesFrom(prefs, library, profile);
  return {
    profile,
    library,
    initial: choices,
    choices,
    index: start ? Math.max(0, STEP_IDS.indexOf(start)) : 0,
    direction: 1,
    busy: false,
    error: "",
  };
}

let launchChecked = false;

/** Opens setup once the Library has booted, for any install that hasn't finished the current version. */
function useLaunchCheck(): void {
  const bootReady = useBootReady();
  const { total, loaded } = useSavePaging();
  useEffect(() => {
    if (!bootReady || launchChecked) {
      return;
    }
    launchChecked = true;
    if (setupResume.take()) {
      setupFlow.open(total > 0 || loaded > 0 ? "existing" : "new", "import");
      return;
    }
    void loadPrefs()
      .then((prefs) => {
        if (prefs.setup.version >= SETUP_VERSION) {
          return;
        }
        const used =
          total > 0 ||
          loaded > 0 ||
          Object.keys(prefs.sync.accounts).length > 0;
        setupFlow.open(used ? "existing" : "new");
      })
      .catch(() => {
        launchChecked = false;
      });
  }, [bootReady, total, loaded]);
}

export function SetupHost() {
  useLaunchCheck();
  const { open, profile, start } = useSetupFlow();
  const { total } = useSavePaging();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    startSession(profile, start).then(
      (next) => {
        if (!cancelled) {
          setSession(next);
        }
      },
      () => {
        if (!cancelled) {
          setupFlow.close();
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, profile, start]);

  if (!session) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <SetupDialog
        open={open}
        session={{ ...session, library: { ...session.library, saves: total } }}
        setSession={setSession}
      />
    </Suspense>
  );
}
