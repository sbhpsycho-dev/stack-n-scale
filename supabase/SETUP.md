# Phase 0 — Supabase setup (one-time, ~10 min)

This unblocks the full backend migration. Do these steps, then run `npm run db:verify`.

## 1. Create the SNS Supabase project
- Go to https://supabase.com/dashboard → **New project**.
- Name it something like `stack-n-scale` (this is **separate** from the Leadwell/client-analytics project).
- Pick a region close to your Vercel deployment. Save the **database password** somewhere safe.

## 2. Grab the keys
Project → **Settings → API**:
- **Project URL** → `SUPABASE_URL`
- **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose to the browser)
- **anon/public** key → `SUPABASE_ANON_KEY`

## 3. Set env vars
Add to `.env.local` (local) **and** Vercel → Project → Settings → Environment Variables (Production + Preview):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_ANON_KEY=<anon key>
```

## 4. Apply the schema
Easiest path (no CLI): Supabase dashboard → **SQL Editor** → New query → paste the full contents of
each file below, in order, and click **Run**:
1. `supabase/migrations/0001_create_payments.sql`  (the Whop payments table)
2. `supabase/migrations/0002_backend_core.sql`     (all backend tables)

> CLI alternative: `npx supabase link --project-ref <ref>` then `npm run db:push`.

## 5. Enable Storage (for the later ID-photo move)
Dashboard → **Storage** → **New bucket** → name it `id-verification`, keep it **private**.

## 6. Verify
```
npm run db:verify
```
Expect ✅ for all 26 tables. If any show ❌, re-check step 4 (schema not applied) or step 3 (keys).

---

Once `db:verify` is green, tell me — I'll smoke-test the deals repo against your project, build the
data-migration script, and start cutting domains over (dual-write + parity checks, one at a time).
