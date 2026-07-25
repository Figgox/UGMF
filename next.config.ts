import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone — a self-contained server with only the node_modules
  // it actually uses. This is what the Docker image runs; see Dockerfile.
  output: "standalone",
  images: {
    remotePatterns: [
      // Spotify artist artwork.
      { protocol: "https", hostname: "i.scdn.co" },
      // Ticketmaster attraction images, used as a fallback when an event's
      // headliner/support has no Spotify link to hydrate real artwork from.
      { protocol: "https", hostname: "s1.ticketmaster.com" },
    ],
  },
};

export default nextConfig;
