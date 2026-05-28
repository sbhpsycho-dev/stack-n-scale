import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { list } from "@vercel/blob";
import { getOrCreateDriveFolder, uploadFileToDriveWithRetry, uploadTextToDrive } from "@/lib/drive";
import { sendErrorAlert } from "@/lib/alert";
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
    const clientKey = `sns:coaching:client:${key}`;
    const [formData, client, idSubmit] = await Promise.all([
      kv.get<Record<string, string>>(`sns:onboarding:form:${key}`),
      kv.get<CoachingClient>(clientKey),
      kv.get<{ name: string; email: string; hasSig: boolean }>(`sns:onboarding:id-submit:${key}`),
    ]);

    if (!formData && !idSubmit) {
      return Response.json({ ok: false, error: "No form or ID data found for this email" }, { status: 404 });
    }

    const clientName = client?.name ?? formData?.name ?? idSubmit?.name ?? email;

    // Ensure Drive folder exists — create it if missing rather than returning 500
    let folder = client?.driveFolder ?? null;
    if (!folder) {
      try {
        folder = await getOrCreateDriveFolder(clientKey, clientName);
      } catch (folderErr) {
        await sendErrorAlert("retry-upload: Drive folder creation failed", folderErr, { email: key, name: clientName });
        return Response.json(
          { ok: false, error: "Could not create Drive folder. Check GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID." },
          { status: 500 }
        );
      }
    }

    const results: Record<string, string | null> = {};
    const errors: Record<string, string> = {};

    // Re-upload onboarding form text
    if (formData && folder.onboardingFolderId) {
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

      try {
        results.formFileId = await uploadTextToDrive(folder.onboardingFolderId, "Onboarding Form.txt", formText);
      } catch (err) {
        errors.formFile = err instanceof Error ? err.message : String(err);
        console.error("retry-upload: form text upload failed:", err);
      }
    }

    // Re-upload ID photos from Vercel Blob
    if (idSubmit && folder.idVerificationFolderId) {
      const slug = key.replace(/[^a-z0-9]/gi, "-");
      const { blobs } = await list({ prefix: `id-verification/${slug}/` });

      await Promise.all(blobs.map(async (blob) => {
        const filename = blob.pathname.split("/").pop()!;
        try {
          const res = await fetch(blob.url);
          const buf = Buffer.from(await res.arrayBuffer());
          const contentType = filename === "signature" ? "image/png" : "image/jpeg";
          const ext = contentType.split("/")[1] ?? "jpg";

          let label: string;
          if (filename === "id-front")       label = `ID Front — ${clientName}.${ext}`;
          else if (filename === "selfie")     label = `Selfie — ${clientName}.${ext}`;
          else if (filename === "signature")  label = `Signature — ${clientName}.png`;
          else                               label = `${filename} — ${clientName}.${ext}`;

          const fileId = await uploadFileToDriveWithRetry(folder!.idVerificationFolderId!, label, buf, contentType);
          results[filename] = fileId;
        } catch (err) {
          errors[filename] = err instanceof Error ? err.message : String(err);
          console.error(`retry-upload: blob re-upload failed for ${filename}:`, err);
        }
      }));
    }

    const hasErrors = Object.keys(errors).length > 0;
    const hasResults = Object.keys(results).length > 0;

    if (hasErrors) {
      await sendErrorAlert("retry-upload: partial failure", new Error(JSON.stringify(errors)), { email: key, name: clientName });
    }

    // If all uploads succeeded (no errors), clear the failure marker from KV
    if (!hasErrors && hasResults) {
      await kv.del(`sns:drive:failed:${key}`);
    }

    return Response.json({
      ok: !hasErrors,
      succeeded: results,
      ...(hasErrors ? { failed: errors } : {}),
    });
  } catch (err) {
    console.error("Retry upload error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
