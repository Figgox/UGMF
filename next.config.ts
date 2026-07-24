import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Artist artwork is generated locally today. When the Spotify provider is
    // wired up, `Artist.imageUrl` starts carrying i.scdn.co URLs.
    remotePatterns: [{ protocol: "https", hostname: "i.scdn.co" }],
  },
};

export default nextConfig;
