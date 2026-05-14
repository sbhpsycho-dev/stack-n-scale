import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { list } from "@vercel/blob";
import { getOrCreateDriveFolder, uploadFileToDrive, uploadTextToDrive } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";

export const runtime = "nodejs";
// Backfill can take a while — give it plenty of time
export const maxDuration = 300;

type BackfillResult = {
  email: string;
  status: "ok" | "skipped" | "error";
  formUploaded: boolean;
  idFilesUploaded: number;
  error?: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
    return Response.json({ ok: false, error: "GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID is not configured" }, { status: 500 });
  }

  // Collect every email that has any onboarding data in KV
  const [formKeys, idKeys] = await Promise.all([
    kv.keys("sns:onboarding:form:*"),
    kv.keys("sns:onboarding:id-submit:*"),
  ]);

  const emails = new Set<string>();
  for (const key of formKeys)  emails.add((key as string).replace("sns:onboarding:form:", ""));
  for (const key of idKeys)    emails.add((key as string).replace("sns:onboarding:id-submit:", ""));

  if (emails.size === 0) {
    return Response.json({ ok: true, total: 0, succeeded: 0, failed: 0, results: [] });
  }

  const results: BackfillResult[] = [];

  for (const email of emails) {
    const result: BackfillResult = { email, status: "ok", formUploaded: false, idFilesUploaded: 0 };

    try {
      const clientKey = `sns:coaching:client:${email}`;
      const [formData, client, idSubmit] = await Promise.all([
        kv.get<Record<string, string>>(`sns:onboarding:form:${email}`),
        kv.get<CoachingClient>(clientKey),
        kv.get<{ name: string; email: string; hasSig: boolean }>(`sns:onboarding:id-submit:${email}`),
      ]);

      if (!formData && !idSubmit) {
        result.status = "skipped";
        results.push(result);
        continue;
      }

      const clientName = client?.name ?? formData?.name ?? idSubmit?.name ?? email;

      // Create Drive folder if it doesn't exist yet
      const folder = await getOrCreateDriveFolder(clientKey, clientName);
      if (!folder) {
        result.status = "error";
        result.error = "Could not create Drive folder";
        results.push(result);
        continue;
      }

      // Upload onboarding form text
      if (formData && folder.onboardingFolderId) {
        const formText = [
          `ONBOARDING FORM — ${clientName}`,
          `Email: ${formData.email ?? email}`,
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

        await uploadTextToDrive(folder.onboardingFolderId, "Onboarding Form.txt", formText)
          .catch(e => { throw new Error(`Form upload failed: ${e.message}`); });
        result.formUploaded = true;
      }

      // Upload ID photos from Vercel Blob
      if (idSubmit && folder.idVerificationFolderId) {
        const slug = email.replace(/[^a-z0-9]/gi, "-");
        const { blobs } = await list({ prefix: `id-verification/${slug}/` });

        await Promise.all(blobs.map(async (blob) => {
          const filename = blob.pathname.split("/").pop()!;
          const res = await fetch(blob.url);
          const buf = await res.arrayBuffer();
          const contentType = filename === "signature" ? "image/png" : "image/jpeg";
          const ext = contentType.split("/")[1] ?? "jpg";

          let label: string;
          if (filename === "id-front")      label = `ID Front — ${clientName}.${ext}`;
          else if (filename === "selfie")    label = `Selfie — ${clientName}.${ext}`;
          else if (filename === "signature") label = `Signature — ${clientName}.png`;
          else                              label = `${filename} — ${clientName}.${ext}`;

          await uploadFileToDrive(folder.idVerificationFolderId!, label, contentType, buf);
          result.idFilesUploaded++;
        }));
      }

      results.push(result);
    } catch (e) {
      result.status = "error";
      result.error = e instanceof Error ? e.message : String(e);
      results.push(result);
    }
  }

  const succeeded = results.filter(r => r.status === "ok").length;
  const failed    = results.filter(r => r.status === "error").length;
  const skipped   = results.filter(r => r.status === "skipped").length;

  return Response.json({
    ok: true,
    total: emails.size,
    succeeded,
    failed,
    skipped,
    results,
  });
}
