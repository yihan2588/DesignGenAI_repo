import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { "/api/cowriter/*": ["./public/catalog/**"] },
  async headers() { return [{source:"/catalog/:path*",headers:[{key:"Cache-Control",value:"public, max-age=31536000, immutable"}]}]; },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  images: {
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
