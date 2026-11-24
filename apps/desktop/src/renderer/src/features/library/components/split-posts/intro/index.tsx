import { Button } from "@pond/ui";
import { Intro } from "@/shared/components/intro";
import { openSettings } from "@/shared/lib/open-settings";
import { FEATURES, INTRO } from "./content";
import { SplitPostsPreview } from "./preview";

export function SplitPostsIntro() {
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
              onClick={() =>
                openSettings("images", "setting-images-splitPosts")
              }
            >
              Open Carousel Settings
            </Button>
          </Intro.Actions>
        </Intro.Copy>
        <SplitPostsPreview />
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
