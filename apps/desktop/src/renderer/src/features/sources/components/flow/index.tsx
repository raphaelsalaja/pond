import { Dialog } from "@pond/ui";
import { type CSSProperties, type JSX, useState } from "react";
import { ConnectGlow } from "@/features/sources/components/flow/connect/glow";
import {
  ConnectActions,
  ConnectWaitSection,
} from "@/features/sources/components/flow/connect/wait";
import {
  ImportScopeConfirm,
  ImportScopeSection,
} from "@/features/sources/components/flow/import-scope";
import {
  WatchTargetRoot,
  WatchTargetSection,
  WatchTargetSubmit,
} from "@/features/sources/components/flow/watch/target";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  connectFlow,
  useConnectSource,
} from "@/features/sources/state/connect-flow";
import {
  type SourceFlowPage,
  sourceFlow,
  useSourceFlowDepth,
  useSourceFlowPage,
} from "@/features/sources/state/source-flow";
import { useWatchSource, watchFlow } from "@/features/sources/state/watch-flow";

const PAGES = {
  "connect-wait": ConnectWaitSection,
  "import-scope": ImportScopeSection,
  "watch-target": WatchTargetSection,
} satisfies Record<SourceFlowPage, () => JSX.Element | null>;

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function usePageTitle(page: SourceFlowPage): string {
  const connectingSource = useConnectSource();
  const watchSource = useWatchSource();

  switch (page) {
    case "connect-wait":
      return connectingSource ? "Connection Request" : "Add Connection";
    case "import-scope":
      return "Choose What to Import";
    case "watch-target":
      return watchSource
        ? `Watch on ${getSourceDef(watchSource).label}`
        : "New Watch";
  }
}

export function SourceFlowHost() {
  const activePage = useSourceFlowPage();
  const activeDepth = useSourceFlowDepth();
  const open = activePage != null;
  const [presentation, setPresentation] = useState({
    page: activePage,
    depth: activeDepth,
  });
  /** Base UI needs the popup mounted through its exit to release the portal. */
  if (
    activePage &&
    (activePage !== presentation.page || activeDepth !== presentation.depth)
  ) {
    setPresentation({ page: activePage, depth: activeDepth });
  }
  const page = activePage ?? presentation.page;
  const depth = open ? activeDepth : presentation.depth;
  const title = usePageTitle(page ?? "connect-wait");
  const Page = page ? PAGES[page] : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        sourceFlow.close();
        connectFlow.clear();
        watchFlow.clear();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        {page && Page ? (
          <Dialog.Popup pageId={page} depth={depth}>
            {page === "connect-wait" ? <ConnectGlow /> : null}
            <WatchTargetRoot>
              <Dialog.Header data-empty>
                <Dialog.Title style={visuallyHidden}>{title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Viewport>
                <Page />
              </Dialog.Viewport>
              <Dialog.Footer>
                {page === "connect-wait" ? (
                  <ConnectActions />
                ) : page === "import-scope" ? (
                  <>
                    <Dialog.Cancel />
                    <ImportScopeConfirm />
                  </>
                ) : (
                  <>
                    <Dialog.Cancel />
                    <WatchTargetSubmit />
                  </>
                )}
              </Dialog.Footer>
            </WatchTargetRoot>
          </Dialog.Popup>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
