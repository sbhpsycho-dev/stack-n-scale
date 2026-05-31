import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

const OPS_URL = process.env.APPS_SCRIPT_OPS_URL;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!OPS_URL) {
    return NextResponse.json({ error: "APPS_SCRIPT_OPS_URL not configured" }, { status: 503 });
  }
  try {
    const res = await fetch(OPS_URL, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!OPS_URL) {
    return NextResponse.json({ error: "APPS_SCRIPT_OPS_URL not configured" }, { status: 503 });
  }
  try {
    const body = await req.json();
    const res = await fetch(OPS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!OPS_URL) {
    return NextResponse.json({ error: "APPS_SCRIPT_OPS_URL not configured" }, { status: 503 });
  }
  try {
    const body = await req.json();
    const res = await fetch(OPS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "patch", ...body }),
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
