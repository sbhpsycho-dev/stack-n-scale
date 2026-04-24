import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  return NextResponse.next();
}

// Explicitly bypass any auth layer for inbound webhooks and cron triggers.
// These routes authenticate via their own mechanisms (Stripe signature, CRON_SECRET).
export const config = {
  matcher: ["/api/webhooks/:path*", "/api/cron/:path*"],
};
