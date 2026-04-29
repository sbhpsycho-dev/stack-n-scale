import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { setupClientFolder, uploadTextToDrive } from "@/lib/drive";
import { type CoachingClient } from "@/app/api/onboarding/clients/route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return Response.json({ ok: false, error: "email is required" }, { status: 400 });
    }

    const key = email.toLowerCase();
    const formData = await kv.get<Record<string, string>>(`sns:onboarding:form:${key}`);
    if (!formData) {
      return Response.json({ ok: false, error: "No form data found for this email" }, { status: 404 });
    }

    const client = await kv.get<CoachingClient>(`sns:coaching:client:${key}`);
    const clientName = client?.name ?? formData.name ?? email;

    const formText = [
      `ONBOARDING FORM — ${clientName}`,
      `Email: ${formData.email}`,
      ``,
      `What motivated you to get started?`,
      formData.motivation ?? "",
      ``,
      `Why Stack N Scale Enterprises?`,
      formData.whySNS ?? "",
      ``,
      `30-Day Goal`,
      formData.goal30Days ?? "",
      ``,
      `3-Month Goal`,
      formData.goal3Months ?? "",
      ``,
      `6-Month Goal`,
      formData.goal6Months ?? "",
      ``,
      `1-Year Goal`,
      formData.goal1Year ?? "",
      ``,
      `Biggest Challenge`,
      formData.biggestChallenge ?? "",
      ``,
      `Success in 90 Days`,
      formData.successIn90Days ?? "",
      formData.additionalNotes ? `\nAdditional Notes\n${formData.additionalNotes}` : "",
    ].join("\n");

    let onboardingFolderId = client?.driveFolder?.onboardingFolderId;

    if (!onboardingFolderId) {
      if (!process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
        return Response.json({ ok: false, error: "GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID is not configured" }, { status: 500 });
      }
      const folders = await setupClientFolder(clientName);
      const driveFolder = {
        url: folders.folderUrl,
        id: folders.folderId,
        idVerificationFolderId: folders.idVerificationFolderId,
        onboardingFolderId: folders.onboardingFolderId,
        notesFolderId: folders.notesFolderId,
        docs: folders.docs,
      };
      if (client) {
        await kv.set(`sns:coaching:client:${key}`, { ...client, driveFolder });
      }
      onboardingFolderId = folders.onboardingFolderId;
    }

    const fileId = await uploadTextToDrive(onboardingFolderId, "Onboarding Form.txt", formText);
    return Response.json({ ok: true, fileId });
  } catch (err) {
    console.error("Retry upload error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
