import { z } from "zod";

const envSchema = z.object({
  // ── Auth ──────────────────────────────────────────────────────────────
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 chars"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  ADMIN_PASSWORD_HASH: z.string().min(1, "ADMIN_PASSWORD_HASH is required"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 chars (rotate if shorter)"),

  // ── KV (Vercel Redis) ─────────────────────────────────────────────────
  KV_REST_API_URL: z.string().url("KV_REST_API_URL must be a valid URL"),
  KV_REST_API_TOKEN: z.string().min(1, "KV_REST_API_TOKEN is required"),

  // ── Blob storage ──────────────────────────────────────────────────────
  BLOB_READ_WRITE_TOKEN: z.string().min(1, "BLOB_READ_WRITE_TOKEN is required"),

  // ── Google (Sheets + Drive) ───────────────────────────────────────────
  GOOGLE_SA_EMAIL: z.string().email("GOOGLE_SA_EMAIL must be a valid email"),
  GOOGLE_SA_PRIVATE_KEY: z.string().min(1, "GOOGLE_SA_PRIVATE_KEY is required"),

  // ── Discord ───────────────────────────────────────────────────────────
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_PUBLIC_KEY: z.string().min(1, "DISCORD_PUBLIC_KEY is required"),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),

  // ── Stripe ────────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "STRIPE_SECRET_KEY must start with sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with whsec_"),

  // ── GHL (GoHighLevel) ─────────────────────────────────────────────────
  GHL_API_KEY: z.string().min(1, "GHL_API_KEY is required"),
  GHL_WEBHOOK_SECRET: z.string().min(1, "GHL_WEBHOOK_SECRET is required"),

  // ── Fanbasis ──────────────────────────────────────────────────────────
  FANBASIS_WEBHOOK_SECRET: z.string().min(1, "FANBASIS_WEBHOOK_SECRET is required"),

  // ── Sheets webhook ────────────────────────────────────────────────────
  SHEETS_WEBHOOK_SECRET: z.string().min(1, "SHEETS_WEBHOOK_SECRET is required"),

  // ── Checkin auth ──────────────────────────────────────────────────────
  CHECKIN_HMAC_SECRET: z.string().min(32, "CHECKIN_HMAC_SECRET must be at least 32 chars"),
});

// Optional vars — used at runtime but not required to boot
const optionalSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  APIFY_API_KEY: z.string().optional(),
  GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID: z.string().optional(),
  GOOGLE_SHEETS_MASTER_LOG_ID: z.string().optional(),
  GOOGLE_SHEETS_SETTER_KPI_ID: z.string().optional(),
  GOOGLE_SHEETS_ONBOARDING_ID: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DISCORD_ERROR_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  DISCORD_ADMIN_USER_ID: z.string().optional(),
  EVAN_DISCORD_USER_ID: z.string().optional(),
  MAKE_DEAL_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_DRIVE_DOCS_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_EMAIL_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_SMS_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_REPLOG_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_ONBOARDING_FORM_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_ID_SUBMIT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_VERIFICATION_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_PAYOUT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_NEW_LEAD_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_CHECKIN_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_STAFF_ONBOARDING_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MAKE_API_KEY: z.string().optional(),
  MAKE_TEAM_ID: z.string().optional(),
});

type RequiredEnv = z.infer<typeof envSchema>;
type OptionalEnv = z.infer<typeof optionalSchema>;
export type AppEnv = RequiredEnv & OptionalEnv;

function validateEnv(): AppEnv {
  // In non-production, allow missing required vars with a warning instead of crashing
  // so `npm run dev` works before all secrets are configured
  if (process.env.NODE_ENV !== "production") {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.issues.map((i) => `  • ${String(i.path[0])}: ${i.message}`).join("\n");
      console.warn(`\n⚠️  Missing or invalid env vars (app may behave unexpectedly):\n${missing}\n`);
    }
    return { ...process.env } as unknown as AppEnv;
  }

  // In production, hard crash on missing required vars
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `  • ${String(i.path[0])}: ${i.message}`).join("\n");
    throw new Error(`\n🚨 FATAL: Missing required environment variables:\n${missing}\n`);
  }

  return { ...result.data, ...process.env } as unknown as AppEnv;
}

export const env = validateEnv();
