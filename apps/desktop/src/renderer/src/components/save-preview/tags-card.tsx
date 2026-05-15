import type { Save } from "@/pool/types";
import { CardSection } from "./card-section";
import { TagEditor } from "./tag-editor";

export function TagsCard({ save }: { save: Save }) {
  return (
    <CardSection label="Tags">
      <TagEditor save={save} />
    </CardSection>
  );
}
