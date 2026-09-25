import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: process.env.SUPABASE_URL ? [{
      protocol: "https",
      hostname: new URL(process.env.SUPABASE_URL).hostname,
      pathname: "/storage/v1/object/public/food-photos/**",
      search: "",
    }] : [],
  },
};

export default nextConfig;
