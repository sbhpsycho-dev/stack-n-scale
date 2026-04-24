import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { updateContact } from "@/lib/ghl";
import { triggerEmail } from "@/lib/email";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email, action, notes } = await req.json() as {
    email: string;
    action: "approve" | "reject";
    notes?: string;
  };

  if (!email || !action) return new Response("Missing fields", { status: 400 });

  const clientKey = `sns:coaching:client:${email}`;
  const client = await kv.get<Record<string, unknown>>(clientKey);
  if (!client) return new Response("Client not found", { status: 404 });

  const ghlContactId = client.ghlContactId as string;

  const clientEmail = client.email as string;
  const clientName = client.name as string;

  if (action === "approve") {
    await updateContact(ghlContactId, {
      customField: [{ id: "id_verification_status", value: "approved" }],
    });
    await kv.set(clientKey, { ...client, idVerification: "approved", status: "id_verified" });
    triggerEmail("approval", clientEmail, clientName).catch(console.error);
    return Response.json({ ok: true, action: "approved" });
  }

  if (action === "reject") {
    await updateContact(ghlContactId, {
      customField: [
        { id: "id_verification_status", value: "rejected" },
        { id: "id_rejection_reason", value: notes ?? "" },
      ],
    });
    await kv.set(clientKey, {
      ...client,
      idVerification: "rejected",
      status: "id_pending",
      rejectionReason: notes,
    });
    triggerEmail("rejection", clientEmail, clientName, { reason: notes ?? "" }).catch(console.error);
    return Response.json({ ok: true, action: "rejected" });
  }

  return new Response("Invalid action", { status: 400 });
}
