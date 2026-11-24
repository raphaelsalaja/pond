import { Button } from "@pond/ui";
import { downloadDialog } from "@/features/downloads/state/download-dialog";
import { Intro } from "@/shared/components/intro";
import { FEATURES, INTRO } from "./content";
import { DownloadsPreview } from "./preview";

export function DownloadsIntro() {
  return (
    <Intro.Page>
      <Intro.Hero>
        <Intro.Copy>
          <Intro.Title>{INTRO.title}</Intro.Title>
          <Intro.Description>{INTRO.description}</Intro.Description>
          <Intro.Actions>
            <Button
              variant="primary"
              size="sm"
              onClick={() => downloadDialog.open()}
            >
              Download Video or Audio
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <DownloadsPreview />
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
