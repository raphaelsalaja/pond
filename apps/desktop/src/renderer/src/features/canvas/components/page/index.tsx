import { Empty, EmptyPreview, Loader } from "@pond/ui";
import type { Canvas } from "@shared/canvas-contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/shared/components/button-link";
import { canvases } from "../../state/canvases";
import { Board } from "../board";
import styles from "./styles.module.css";

type Loaded =
  | { id: string; status: "ready"; canvas: Canvas }
  | { id: string; status: "missing" }
  | { id: string; status: "failed" };

export function CanvasPage({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    canvases.load(id).then(
      (canvas) => {
        if (!live) return;
        setLoaded(
          canvas ? { id, status: "ready", canvas } : { id, status: "missing" },
        );
      },
      () => {
        if (live) setLoaded({ id, status: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  const current = loaded?.id === id ? loaded : null;

  return (
    <div className={styles.page}>
      {current?.status === "ready" ? (
        <ReactFlowProvider key={id}>
          <Board canvas={current.canvas} />
        </ReactFlowProvider>
      ) : current ? (
        <Empty.Root className={styles.empty}>
          <Empty.Media>
            <EmptyPreview.Root shape="board" layout="single">
              <EmptyPreview.Column>
                <EmptyPreview.Row>
                  <EmptyPreview.Thumb />
                  <EmptyPreview.Line width={40} />
                </EmptyPreview.Row>
                <EmptyPreview.Block />
              </EmptyPreview.Column>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>
            {current.status === "missing"
              ? "Canvas Not Found"
              : "Canvas Could Not Be Opened"}
          </Empty.Title>
          <Empty.Description>
            {current.status === "missing"
              ? "It may have been deleted. Pick another canvas from the sidebar."
              : "The canvas file is damaged or unreadable. Pick another canvas from the sidebar."}
          </Empty.Description>
          <Empty.Action>
            <ButtonLink to="/" size="sm" variant="secondary">
              Go to Library
            </ButtonLink>
          </Empty.Action>
        </Empty.Root>
      ) : (
        <Empty.Root className={styles.empty} aria-busy="true">
          <Empty.Media>
            <Loader.Spinner />
          </Empty.Media>
          <Empty.Title>Loading Canvas</Empty.Title>
        </Empty.Root>
      )}
    </div>
  );
}
