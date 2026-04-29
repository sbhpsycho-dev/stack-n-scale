import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const APP_URL = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";
const REDIRECT_URI = `${APP_URL}/api/staff/calendar/outlook`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const action = url.searchParams.get("action");

  // Initiate OAuth flow
  if (action === "connect") {
    const stateToken = crypto.randomUUID();
    await kv.set(`sns:outlook:oauth:state:${stateToken}`, "valid", { ex: 600 });
    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    authUrl.searchParams.set("client_id", MS_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", "offline_access Calendars.Read");
    authUrl.searchParams.set("state", stateToken);
    return Response.redirect(authUrl.toString());
  }

  // OAuth callback
  if (code && state) {
    const valid = await kv.get(`sns:outlook:oauth:state:${state}`);
    if (!valid) return new Response("Invalid state", { status: 400 });
    await kv.del(`sns:outlook:oauth:state:${state}`);

    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        scope: "offline_access Calendars.Read",
      }),
    });

    if (!tokenRes.ok) return new Response("Token exchange failed", { status: 500 });

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    await Promise.all([
      kv.set("sns:outlook:access_token", tokens.access_token, { ex: tokens.expires_in }),
      kv.set("sns:outlook:refresh_token", tokens.refresh_token),
    ]);

    return Response.redirect(`${APP_URL}/staff/calendar?connected=outlook`);
  }

  // Disconnect
  if (action === "disconnect") {
    await Promise.all([
      kv.del("sns:outlook:access_token"),
      kv.del("sns:outlook:refresh_token"),
    ]);
    return Response.json({ ok: true });
  }

  // Status check
  const connected = !!(await kv.get("sns:outlook:access_token"));
  return Response.json({ connected });
}
