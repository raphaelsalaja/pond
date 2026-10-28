declare module "*.mdx" {
  import type { MDXContent } from "mdx/types";

  export const post: {
    title: string;
    date: string;
    summary: string;
  };

  const Content: MDXContent;
  export default Content;
}
