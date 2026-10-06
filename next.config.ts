import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/certificates/*/pdf": ["./assets/fonts/*"],
  },
};

export default nextConfig;
