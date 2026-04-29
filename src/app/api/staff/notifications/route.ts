import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type StaffNotification } from "@/lib/staff-types";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const stream = url.searchParams.get("stream") === "1";

  // SSE streaming mode
  if (stream) {
    const encoder = new TextEncoder();
    let closed = false;

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: string) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const poll = async () => {
          if (closed) return;
          try {
            const keys = await kv.keys("sns:notifications:staff:*");
            const notifs = await Promise.all(keys.map((k) => kv.get<StaffNotification>(k)));
            const valid = notifs
              .filter((n): n is StaffNotification => n !== null)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10);
            send(JSON.stringify(valid));
          } catch {
            send("[]");
          }
          if (!closed) setTimeout(poll, 10000);
        };

        await poll();
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Regular poll
  const keys = await kv.keys("sns:notifications:staff:*");
  if (!keys.length) return Response.json([]);

  const notifs = await Promise.all(keys.map((k) => kv.get<StaffNotification>(k)));
  const valid = notifs
    .filter((n): n is StaffNotification => n !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return Response.json(valid);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { id?: string; all?: boolean };

  if (body.all) {
    const keys = await kv.keys("sns:notifications:staff:*");
    if (keys.length) await Promise.all(keys.map((k) => kv.del(k)));
    return Response.json({ ok: true });
  }

  if (body.id) {
    await kv.del(body.id);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 400 });
}
