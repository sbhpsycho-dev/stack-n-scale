import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// Make.com scenarios POST to this endpoint after completing async work.
// Body: { key: string, value?: object }
// The key should match a pattern like:
//   sns:sheets:synced:{dealId}
//   sns:drive:confirmed:{email}
//   sns:payouts:dispatched:{weekId}

export async function POST(req: Request) {
  // Verify it's from Make.com using a shared secret
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.MAKE_CALLBACK_SECRET ?? process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { key: string; value?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.key || typeof body.key !== "string") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  // Validate key pattern — only allow sns:* keys to prevent arbitrary KV writes
  if (!body.key.startsWith("sns:")) {
    return NextResponse.json({ error: "Invalid key prefix" }, { status: 400 });
  }

  await kv.set(body.key, {
    ...(body.value ?? {}),
    confirmedAt: new Date().toISOString(),
  }, { ex: 60 * 60 * 24 * 7 }); // 7 day TTL

  return NextResponse.json({ ok: true, key: body.key });
}
