"use client";

import Masonry from "react-masonry-css";

const breakpoints = {
  default: 4,
  1280: 4,
  1024: 3,
  768: 2,
  500: 1,
};

export function MasonryGrid({ children }: { children: React.ReactNode }) {
  return (
    <Masonry
      breakpointCols={breakpoints}
      className="masonry"
      columnClassName="masonry-col"
    >
      {children}
    </Masonry>
  );
}
