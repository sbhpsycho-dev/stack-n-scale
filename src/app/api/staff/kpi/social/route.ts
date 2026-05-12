import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

const APIFY_KEY = process.env.APIFY_API_KEY ?? "";
const CACHE_KEY = "sns-social-stats-v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SocialAccount {
  platform: "instagram" | "tiktok" | "youtube" | "twitter";
  handle: string;
  brand: "personal" | "sns";
  displayName: string;
  followers: number;
  following: number;
  posts: number;
  error?: string;
}

interface CachedSocialStats {
  accounts: SocialAccount[];
  refreshedAt: string;
}

async function apifyRunSync(actorId: string, input: unknown): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_KEY}&timeout=60&memory=128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} failed: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function fetchInstagramStats(handles: string[]): Promise<Map<string, { followers: number; following: number; posts: number }>> {
  const map = new Map<string, { followers: number; following: number; posts: number }>();
  try {
    const items = await apifyRunSync("apify~instagram-profile-scraper", { usernames: handles }) as Array<Record<string, unknown>>;
    for (const item of items) {
      const username = (item.username as string | undefined)?.toLowerCase();
      if (username) {
        map.set(username, {
          followers: (item.followersCount as number) ?? 0,
          following: (item.followsCount as number) ?? 0,
          posts: (item.postsCount as number) ?? 0,
        });
      }
    }
  } catch { /* returns empty map — error surfaced per-account */ }
  return map;
}

async function fetchTikTokStats(handles: string[]): Promise<Map<string, { followers: number; following: number; posts: number }>> {
  const map = new Map<string, { followers: number; following: number; posts: number }>();
  try {
    const profiles = handles.map(h => `https://www.tiktok.com/@${h.replace(/^@/, "")}`);
    const items = await apifyRunSync("clockworks~free-tiktok-scraper", { profiles, resultsType: "users", maxProfilesPerQuery: handles.length }) as Array<Record<string, unknown>>;
    for (const item of items) {
      const stats = item.stats as Record<string, number> | undefined;
      const authorMeta = item.authorMeta as Record<string, unknown> | undefined;
      const name = ((authorMeta?.name as string) ?? (item.uniqueId as string) ?? "").toLowerCase().replace(/^@/, "");
      if (name && stats) {
        map.set(name, {
          followers: stats.followerCount ?? 0,
          following: stats.followingCount ?? 0,
          posts: stats.videoCount ?? 0,
        });
      }
    }
  } catch { /* returns empty map */ }
  return map;
}

async function fetchYouTubeStats(channelUrls: { key: string; url: string }[]): Promise<Map<string, { followers: number; posts: number }>> {
  const map = new Map<string, { followers: number; posts: number }>();
  try {
    const startUrls = channelUrls.map(c => ({ url: c.url }));
    const items = await apifyRunSync("bernardo~youtube-channel-scraper", { startUrls, maxResults: 0 }) as Array<Record<string, unknown>>;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = channelUrls[i]?.key ?? "";
      map.set(key, {
        followers: (item.numberOfSubscribers as number) ?? 0,
        posts: (item.numberOfVideos as number) ?? 0,
      });
    }
  } catch { /* returns empty map */ }
  return map;
}

async function fetchTwitterStats(handle: string): Promise<{ followers: number; following: number; posts: number } | null> {
  try {
    const items = await apifyRunSync("quacker~twitter-scraper", { handle, tweetsDesired: 0 }) as Array<Record<string, unknown>>;
    const user = items[0] as Record<string, unknown> | undefined;
    if (!user) return null;
    return {
      followers: (user.followers_count as number) ?? 0,
      following: (user.friends_count as number) ?? 0,
      posts: (user.statuses_count as number) ?? 0,
    };
  } catch { return null; }
}

async function refreshSocialStats(): Promise<CachedSocialStats> {
  const [igMap, ttMap, ytMap, twitterStats] = await Promise.all([
    fetchInstagramStats(["charris_00", "stacknscaleent"]),
    fetchTikTokStats(["charris00_", "stacknscaleent"]),
    fetchYouTubeStats([
      { key: "caelum", url: "https://www.youtube.com/@CaelumHarrisENT" },
      { key: "sns",    url: "https://www.youtube.com/@StackNScaleEnterprises" },
    ]),
    fetchTwitterStats("Charris0"),
  ]);

  const accounts: SocialAccount[] = [
    // Personal brand
    {
      platform: "instagram", handle: "@charris_00", brand: "personal", displayName: "Caelum Harris ENT",
      followers: igMap.get("charris_00")?.followers ?? 0,
      following: igMap.get("charris_00")?.following ?? 0,
      posts:     igMap.get("charris_00")?.posts     ?? 0,
      ...(!igMap.has("charris_00") ? { error: "Could not fetch" } : {}),
    },
    {
      platform: "tiktok", handle: "@charris00_", brand: "personal", displayName: "Caelum Harris ENT",
      followers: ttMap.get("charris00_")?.followers ?? 0,
      following: ttMap.get("charris00_")?.following ?? 0,
      posts:     ttMap.get("charris00_")?.posts     ?? 0,
      ...(!ttMap.has("charris00_") ? { error: "Could not fetch" } : {}),
    },
    {
      platform: "youtube", handle: "Caelum Harris ENT", brand: "personal", displayName: "Caelum Harris ENT",
      followers: ytMap.get("caelum")?.followers ?? 0,
      following: 0,
      posts:     ytMap.get("caelum")?.posts     ?? 0,
      ...(!ytMap.has("caelum") ? { error: "Could not fetch" } : {}),
    },
    {
      platform: "twitter", handle: "@Charris0", brand: "personal", displayName: "Caelum Harris ENT",
      followers: twitterStats?.followers ?? 0,
      following: twitterStats?.following ?? 0,
      posts:     twitterStats?.posts     ?? 0,
      ...(twitterStats === null ? { error: "Could not fetch" } : {}),
    },
    // SNS brand
    {
      platform: "instagram", handle: "@stacknscaleent", brand: "sns", displayName: "StackNScale Enterprises",
      followers: igMap.get("stacknscaleent")?.followers ?? 0,
      following: igMap.get("stacknscaleent")?.following ?? 0,
      posts:     igMap.get("stacknscaleent")?.posts     ?? 0,
      ...(!igMap.has("stacknscaleent") ? { error: "Account not found — confirm handle" } : {}),
    },
    {
      platform: "tiktok", handle: "@stacknscaleent", brand: "sns", displayName: "StackNScale Enterprises",
      followers: ttMap.get("stacknscaleent")?.followers ?? 0,
      following: ttMap.get("stacknscaleent")?.following ?? 0,
      posts:     ttMap.get("stacknscaleent")?.posts     ?? 0,
      ...(!ttMap.has("stacknscaleent") ? { error: "Account not found — confirm handle" } : {}),
    },
    {
      platform: "youtube", handle: "StackNScale Enterprises", brand: "sns", displayName: "StackNScale Enterprises",
      followers: ytMap.get("sns")?.followers ?? 0,
      following: 0,
      posts:     ytMap.get("sns")?.posts     ?? 0,
      ...(!ytMap.has("sns") ? { error: "Account not found — confirm channel URL" } : {}),
    },
  ];

  const result: CachedSocialStats = { accounts, refreshedAt: new Date().toISOString() };
  await kv.set(CACHE_KEY, result, { ex: 60 * 60 * 25 }); // cache 25h in KV
  return result;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  const cached = await kv.get<CachedSocialStats>(CACHE_KEY);
  const isStale = !cached || (Date.now() - new Date(cached.refreshedAt).getTime()) > CACHE_TTL_MS;

  if (!forceRefresh && cached && !isStale) {
    return Response.json({ ...cached, fromCache: true });
  }

  const stats = await refreshSocialStats();
  return Response.json({ ...stats, fromCache: false });
}
