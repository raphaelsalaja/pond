import { Button } from "@pond/ui";
import { Intro } from "@/shared/components/intro";
import { FEATURES, INTRO } from "./content";
import { TagsPreview } from "./preview";

export function TagsIntro({ onCreate }: { onCreate: () => void }) {
  return (
    <Intro.Page>
      <Intro.Hero>
        <Intro.Copy>
          <Intro.Title>{INTRO.title}</Intro.Title>
          <Intro.Description>{INTRO.description}</Intro.Description>
          <Intro.Actions>
            <Button variant="primary" size="sm" onClick={onCreate}>
              New Tag
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <TagsPreview />
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
