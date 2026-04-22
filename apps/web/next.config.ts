import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@pond/schema"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.twimg.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.pinimg.com" },
      { protocol: "https", hostname: "**.are.na" },
      { protocol: "https", hostname: "**.arena-attachments.s3.amazonaws.com" },
      { protocol: "https", hostname: "**.cosmos.so" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
};

export default config;
