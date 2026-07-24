import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone — a self-contained server with only the node_modules
  // it actually uses. This is what the Docker image runs; see Dockerfile.
  output: "standalone",
  images: {
    // Artist artwork is generated locally today. When the Spotify provider is
    // wired up, `Artist.imageUrl` starts carrying i.scdn.co URLs.
    remotePatterns: [{ protocol: "https", hostname: "i.scdn.co" }],
  },
};

export default nextConfig;
