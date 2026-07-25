/**
 * Next's supported hook for running code once when the server process
 * starts — used here to kick off the background data-sync scheduler
 * (lib/sync/scheduler.ts) rather than anything request-triggered, so a
 * slow or rate-limited sync can never hold up a page load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncScheduler } = await import("@/lib/sync/scheduler");
    startSyncScheduler();
  }
}
