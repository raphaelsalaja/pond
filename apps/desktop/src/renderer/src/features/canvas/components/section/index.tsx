import { IconPlus } from "@pond/icons";
import { Button, Sidebar } from "@pond/ui";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import { usePrefs } from "@/shared/state/prefs";
import { createCanvas, sectionItems } from "../../lib/menu";
import {
  useCanvasEditingId,
  useCanvases,
  useHydrateCanvases,
} from "../../state/canvases";
import { CanvasRow } from "../row";

export function CanvasesSection({ activeId }: { activeId: string | null }) {
  useHydrateCanvases();
  const list = useCanvases();
  const editingId = useCanvasEditingId();
  const [sidebar] = usePrefs("sidebar");
  useRevealSidebarSection("canvases", editingId !== null);

  if (!sidebar.sections.canvases) return null;

  return (
    <Sidebar.Group>
      <SidebarSectionMenu
        section="canvases"
        search
        searchLabel="Search Canvas operations"
        buildItems={sectionItems}
      >
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Canvases</Sidebar.GroupLabel>
          <Button
            icon
            size="sm"
            variant="ghost"
            aria-label="New Canvas"
            onClick={() => createCanvas()}
          >
            <IconPlus />
          </Button>
        </Sidebar.GroupHeader>
      </SidebarSectionMenu>
      <Sidebar.GroupContent aria-label="Canvases">
        {list.map((canvas) => (
          <CanvasRow
            key={canvas.id}
            canvas={canvas}
            active={canvas.id === activeId}
            renaming={canvas.id === editingId}
          />
        ))}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}
