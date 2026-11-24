import { Button } from "@pond/ui";
import {
  importPaths,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { openSources } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import { FEATURES, INTRO } from "./content";
import { LibraryPreview } from "./preview";

export function LibraryIntro() {
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
              onClick={() => openSources({ type: "new-source" })}
            >
              New Source
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runNewAction(() => importPaths("files"))}
            >
              Import Files
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <LibraryPreview />
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
