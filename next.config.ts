import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  images: {
    remotePatterns: process.env.SUPABASE_URL ? [{
      protocol: "https",
      hostname: new URL(process.env.SUPABASE_URL).hostname,
      pathname: "/storage/v1/object/public/**",
      search: "",
    }] : [],
  },
};

export default nextConfig;
