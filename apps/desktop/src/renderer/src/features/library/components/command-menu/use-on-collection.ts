import { useRouter } from "@tanstack/react-router";
import { useOpenSaveId } from "@/features/saves/navigation";
import { routeMeta } from "@/shared/lib/route-meta";

/** True on a Library grid with no Save open over it, where actions target the collection. */
export function useOnCollection(pathname: string): boolean {
  const router = useRouter();
  const saveOpen = useOpenSaveId() !== null;
  return !saveOpen && routeMeta(router, pathname).surface === "grid";
}
