import { clsx as cn } from "clsx";
import { SearchComposer } from "@/features/search";
import styles from "./styles.module.css";

interface LibrarySearchProps {
  className?: string;
}

export function LibrarySearch({ className }: LibrarySearchProps) {
  return (
    <div className={cn(styles.search, className)}>
      <SearchComposer />
    </div>
  );
}
