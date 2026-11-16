import { canvasIdFromPath } from "@/features/canvas";
import { fishIdFromPath } from "@/features/fish";
import { getLastListPath } from "@/features/saves";
import { saveIdFromPath } from "@/features/saves/navigation";

export function showsLibraryGrid(pathname: string): boolean {
  const isSave = saveIdFromPath(pathname) !== null;
  return (
    !pathname.startsWith("/sources") &&
    !pathname.startsWith("/downloads") &&
    fishIdFromPath(pathname) === null &&
    pathname !== "/tags" &&
    pathname !== "/split-posts" &&
    !pathname.startsWith("/settings") &&
    canvasIdFromPath(isSave ? getLastListPath() : pathname) === null
  );
}
