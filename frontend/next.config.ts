import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Fix block for Next.js 15+ HMR on Local/VPN IP
  // @ts-ignore: Next.js types might not be fully updated yet depending on version
  allowedDevOrigins: ['26.197.92.154'],
};

export default nextConfig;
