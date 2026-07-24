import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { providerStatus } from "@/lib/providers";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const providers = providerStatus();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-20 pt-6">{children}</main>

        <footer className="border-t border-[var(--color-line)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6">
            <span className="label">UGMF</span>
            <span className="label">
              Artists: {providers.music} · Events: {providers.events}
            </span>
            {providers.music === "seed" && (
              <span className="label">
                Demo dataset — set Spotify / Ticketmaster keys to go live
              </span>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
