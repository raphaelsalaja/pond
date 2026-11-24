import { Button } from "@pond/ui";
import { Navigate } from "@tanstack/react-router";
import { Intro } from "@/shared/components/intro";
import { createCanvas } from "../../lib/menu";
import { useCanvases, useCanvasesLoaded } from "../../state/canvases";
import { BoardPreview } from "./board-preview";
import { FEATURES, INTRO } from "./content";

/** Canvases opens on the intro only while there are none; otherwise it lands on a canvas. */
export function CanvasIntro() {
  const list = useCanvases();
  const loaded = useCanvasesLoaded();
  if (!loaded) {
    return null;
  }
  const first = list[0];
  if (first) {
    return <Navigate to="/canvas/$id" params={{ id: first.id }} replace />;
  }
  return (
    <Intro.Page>
      <Intro.Hero>
        <Intro.Copy>
          <Intro.Title>{INTRO.title}</Intro.Title>
          <Intro.Description>{INTRO.description}</Intro.Description>
          <Intro.Actions>
            <Button variant="primary" size="sm" onClick={() => createCanvas()}>
              New Canvas
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <BoardPreview />
      </Intro.Hero>
      <Intro.Features>
        {FEATURES.map(({ title, description, Icon }) => (
          <Intro.Feature key={title} icon={<Icon />} title={title}>
            {description}
          </Intro.Feature>
        ))}
      </Intro.Features>
    </Intro.Page>
  );
}
