import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { dataStatus } from "@/lib/providers";

export const metadata: Metadata = {
  title: {
    default: "UGMF — Underground Music Finder",
    template: "%s · UGMF",
  },
  description:
    "Find hidden and underground musicians near you, and the small shows they are playing. Filter by how well known they are, not how popular.",
};

export const viewport: Viewport = {
  themeColor: "#08080a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await dataStatus();
  const usingPlaceholders = status.placeholderArtists || status.placeholderEvents;
  const rateLimited = status.syncErrorCode === "RATE_LIMITED";

  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-20 pt-6">{children}</main>

        <footer className="border-t border-[var(--color-line)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6">
            <span className="label">UGMF</span>
            <span className="label">
              Artists: {status.music} · Events: {status.events}
            </span>
            {status.music === "seed" && status.events === "seed" && (
              <span className="label">
                Demo dataset — set Spotify / Ticketmaster keys to go live
              </span>
            )}
            {usingPlaceholders && (
              <span className="label text-[var(--color-tier-rising)]">
                ● Showing placeholder data
                {rateLimited
                  ? " — Spotify rate limited, retrying automatically"
                  : " — waiting on the first sync"}
              </span>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
