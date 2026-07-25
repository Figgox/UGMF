import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/providers";
import { getSyncStatus } from "@/lib/sync/scheduler";

/**
 * GET /api/health — container healthcheck.
 *
 * Also reports which data source is live and, when a background sync is
 * running, when it last succeeded — so `docker inspect` or a NAS dashboard
 * shows at a glance whether the app is on seed data, a real-but-stale cache,
 * or freshly synced data.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    providers: providerStatus(),
    sync: await getSyncStatus(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
