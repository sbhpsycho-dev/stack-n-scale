import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { NextRequest } from "next/server";
import type { Lead, LeadState } from "@/lib/lead-types";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const lead = await kv.get<Lead>(`sns:leads:${id}`);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  let body: { state: LeadState; notes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updated: Lead = {
    ...lead,
    state:     body.state,
    notes:     body.notes ?? lead.notes,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(`sns:leads:${id}`, updated);

  // If moved to no_show — queue for follow-up
  if (body.state === "no_show") {
    const queue = (await kv.get<string[]>("sns:leads:followup:queue")) ?? [];
    if (!queue.includes(id)) {
      await kv.set("sns:leads:followup:queue", [...queue, id]);
    }
  }

  return Response.json({ lead: updated });
}
