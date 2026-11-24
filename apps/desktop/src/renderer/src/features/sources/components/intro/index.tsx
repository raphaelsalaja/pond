import { Button, Menu } from "@pond/ui";
import { useState } from "react";
import { NewSourcePopup } from "@/features/sources/components/new-menu";
import {
  sourceNewMenu,
  useSourceNewMenuOpen,
} from "@/features/sources/state/source-new-menu";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { Intro } from "@/shared/components/intro";
import { FEATURES, INTRO } from "./content";
import { SourcesPreview } from "./preview";

/** Owns the New Source menu while the toolbar is gone, so openSources() still opens it. */
export function SourcesIntro() {
  const menuOpen = useSourceNewMenuOpen();
  const [extensionOpen, setExtensionOpen] = useState(false);

  return (
    <Intro.Page>
      <Intro.Hero>
        <Intro.Copy>
          <Intro.Title>{INTRO.title}</Intro.Title>
          <Intro.Description>{INTRO.description}</Intro.Description>
          <Intro.Actions>
            <Menu.Root
              open={menuOpen}
              onOpenChange={(next: boolean) => sourceNewMenu.setOpen(next)}
            >
              <Menu.Trigger variant="primary" size="sm">
                New Source
              </Menu.Trigger>
              <NewSourcePopup align="start" />
            </Menu.Root>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExtensionOpen(true)}
            >
              Get Extension
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <SourcesPreview />
      </Intro.Hero>
      <Intro.Features>
        {FEATURES.map(({ title, description, Icon }) => (
          <Intro.Feature key={title} icon={<Icon />} title={title}>
            {description}
          </Intro.Feature>
        ))}
      </Intro.Features>
      <BrowserExtensionDialog
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
      />
    </Intro.Page>
  );
}
