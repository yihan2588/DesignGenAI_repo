import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  images: {
    // Uploads are already resized and re-encoded. Serve these bounded assets
    // from Supabase directly: the Services preview's /_next/image returns 404.
    unoptimized: true,
    remotePatterns: process.env.SUPABASE_URL ? [{
      protocol: "https",
      hostname: new URL(process.env.SUPABASE_URL).hostname,
      pathname: "/storage/v1/object/public/**",
      search: "",
    }] : [],
  },
};

export default nextConfig;
