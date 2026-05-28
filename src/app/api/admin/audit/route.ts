import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { AuditEntry } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const entityId = searchParams.get("entityId");
  const entityType = searchParams.get("entityType");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let ids: string[];

  if (entityId && entityType) {
    ids = await kv.lrange(`sns:audit:entity:${entityType}:${entityId}`, offset, offset + limit - 1);
  } else {
    ids = await kv.lrange("sns:audit:index", offset, offset + limit - 1);
  }

  const entries = (await Promise.all(ids.map(id => kv.get<AuditEntry>(`sns:audit:${id}`)))).filter(Boolean) as AuditEntry[];

  return NextResponse.json({ entries, total: ids.length });
}
