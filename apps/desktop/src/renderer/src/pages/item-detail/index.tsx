import { Link, useParams } from "react-router-dom";
import { SavePreview } from "../../components/save-preview";
import { useSave } from "../../pool/hooks";

/**
 * Dedicated `/item/:id` page. Used for deep-links (e.g. from the tray
 * menu, system notifications, or the `pond://` protocol). The list
 * views select via `?id=` which opens the side `<PreviewPane>`
 * instead of routing here.
 *
 * Shares its body with `<PreviewPane>` via `<SavePreview>` so the
 * detail content stays in lock-step.
 */
export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);

  if (!save) {
    return (
      <div className="pond-empty">
        <p>Save not found.</p>
        <Link to="/">← back to library</Link>
      </div>
    );
  }

  return <SavePreview save={save} variant="page" />;
}
