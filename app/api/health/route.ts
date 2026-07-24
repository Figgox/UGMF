import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/providers";

/**
 * GET /api/health — container healthcheck.
 *
 * Also reports which data source is live, so `docker inspect` or a NAS
 * dashboard shows at a glance whether the app is on seed data or real APIs.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    providers: providerStatus(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
