import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPipelineLastmod } from "@/lib/sheets-sync";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const lastmod = await getPipelineLastmod();
  return Response.json({ lastmod });
}
