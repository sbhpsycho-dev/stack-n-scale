import { google } from "googleapis";

export const runtime = "nodejs";

type CheckInPayload = {
  fullName: string;
  programWeek: string;
  goalsCompleted: string;
  wentWell: string;
  struggled: string;
  hoursWorked: string;
  satisfactionScore: string;
  couldDoBetter: string;
  curriculumGaps?: string;
  dmsSent?: string;
  conversationsOpened?: string;
  callsBooked?: string;
  nextWeekGoals: string;
  needFromCoach: string;
  anythingElse?: string;
};

function getAuth() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key  = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) return null;
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function appendToSheet(payload: CheckInPayload, score: number, submittedAt: string) {
  const sheetId = process.env.GOOGLE_SHEETS_MASTER_LOG_ID;
  if (!sheetId) return;
  const auth = getAuth();
  if (!auth) return;
  const sheets = google.sheets({ version: "v4", auth });

  const row = [
    submittedAt,
    payload.fullName,
    payload.programWeek,
    payload.goalsCompleted,
    payload.wentWell,
    payload.struggled,
    payload.hoursWorked,
    score,
    payload.couldDoBetter,
    payload.curriculumGaps ?? "",
    payload.dmsSent ?? "",
    payload.conversationsOpened ?? "",
    payload.callsBooked ?? "",
    payload.nextWeekGoals,
    payload.needFromCoach,
    payload.anythingElse ?? "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Weekly Check-ins!A:P",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function sendDiscordAlert(payload: CheckInPayload, score: number) {
  const url = process.env.DISCORD_WEBHOOK_CHECKIN_ALERT;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "⚠️ LOW CHECK-IN SCORE",
        color: 0xFF4444,
        fields: [
          { name: "Client",      value: payload.fullName,    inline: true },
          { name: "Score",       value: `${score}/10`,       inline: true },
          { name: "Program Week", value: payload.programWeek, inline: true },
          { name: "Struggled with", value: payload.struggled.slice(0, 300) },
          { name: "Needs from Coach", value: payload.needFromCoach.slice(0, 300) },
        ],
        footer: { text: "Reach out ASAP — score 7 or below" },
        timestamp: new Date().toISOString(),
      }],
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.error("Discord checkin alert error:", e));
}

async function sendPositiveSms(payload: CheckInPayload, score: number) {
  const url = process.env.MAKE_SMS_WEBHOOK_URL;
  if (!url) return;
  const [firstName] = payload.fullName.split(" ");
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "checkin_positive",
      name: payload.fullName,
      firstName,
      score,
      message: `Hey ${firstName} — just saw your check-in. Keep going, you're doing great. Talk soon.`,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.error("Positive SMS error:", e));
}

export async function POST(req: Request) {
  let payload: CheckInPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const required: (keyof CheckInPayload)[] = [
    "fullName", "programWeek", "goalsCompleted", "wentWell", "struggled",
    "hoursWorked", "satisfactionScore", "couldDoBetter", "nextWeekGoals", "needFromCoach",
  ];
  for (const field of required) {
    if (!payload[field]?.toString().trim()) {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const score = parseInt(payload.satisfactionScore, 10);
  if (isNaN(score) || score < 1 || score > 10) {
    return Response.json({ error: "Invalid satisfaction score" }, { status: 400 });
  }

  const submittedAt = new Date().toISOString();

  await Promise.allSettled([
    appendToSheet(payload, score, submittedAt),
    score <= 7 ? sendDiscordAlert(payload, score) : Promise.resolve(),
    score >= 8 ? sendPositiveSms(payload, score) : Promise.resolve(),
  ]);

  return Response.json({ ok: true });
}
