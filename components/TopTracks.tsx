"use client";

import { useEffect, useRef, useState } from "react";
import type { Track } from "@/types";
import { formatDuration } from "@/lib/format";

/**
 * Top songs, with an inline preview where one exists.
 *
 * Preview URLs are absent for seed data and null for a large and growing share
 * of the real Spotify catalogue, so the row has to read as complete without a
 * play button rather than showing a dead control.
 */
export function TopTracks({ tracks }: { tracks: Track[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function toggle(track: Track) {
    if (!track.previewUrl) return;

    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(track.previewUrl);
    audio.addEventListener("ended", () => setPlayingId(null));
    void audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(track.id);
  }

  if (!tracks.length) {
    return <p className="text-sm text-[var(--color-fog)]">No tracks listed.</p>;
  }

  return (
    <ol className="divide-y divide-[var(--color-line)]">
      {tracks.map((track, index) => (
        <li key={track.id} className="flex items-center gap-3 py-2.5">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-[var(--color-fog)]">
            {index + 1}
          </span>

          {track.previewUrl ? (
            <button
              onClick={() => toggle(track)}
              aria-label={`${playingId === track.id ? "Pause" : "Play"} preview of ${track.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-bright)] text-[10px] text-[var(--color-acid)] hover:border-[var(--color-acid)]"
            >
              {playingId === track.id ? "❙❙" : "▶"}
            </button>
          ) : (
            <span aria-hidden className="w-7 shrink-0" />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--color-chalk)]">{track.name}</p>
            {track.album && (
              <p className="truncate text-xs text-[var(--color-fog)]">{track.album}</p>
            )}
          </div>

          <span className="shrink-0 font-mono text-xs text-[var(--color-fog)]">
            {formatDuration(track.durationMs)}
          </span>
        </li>
      ))}
    </ol>
  );
}
