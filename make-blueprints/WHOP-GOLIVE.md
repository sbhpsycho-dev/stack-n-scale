# Whop Payment Automation — Go Live (Make.com)

This scenario is the **no-code owner** of the Whop payment flow. When a Whop payment succeeds it:
create Google Drive folders → record the deal/client in the SNS backend (record-only) → send the
**Welcome** + **ID-Verification** emails → post 3 Discord notifications.

Blueprint: `make-blueprints/whop-payment.json` (already finalized — do not edit the JSON by hand).

> **What's automated vs. manual:** the blueprint is import-ready, but Make does not let an API
> authorize Google/Gmail connections — that's an interactive OAuth step. So steps 2–5 below are
> yours (a few minutes in the Make UI).

---

## Module map (what the scenario does)
| # | Module | Action | Needs from you |
|---|--------|--------|----------------|
| 1 | Custom webhook | Whop trigger (expects `email`, `name`, `amount` cents, `payment_id`) | — |
| 2–5 | Google Drive | Create `client - {name}` + ID Verification / Onboarding / Notes subfolders | **Google Drive connection** |
| 6 | HTTP POST | → `…/api/whop-webhook` with `x-skip-notify: 1` (records deal/client/lead + Supabase idempotency; sends NO email/Discord) | the real `WHOP_WEBHOOK_SECRET` in the header |
| 7 | Gmail | Welcome email | **Gmail connection** |
| 11 | Gmail | ID-Verification email (link to `/onboarding/id-submit`) | same Gmail connection |
| 8–10 | HTTP POST | Discord: payment ping, deal-closed ping, new-client embed | **3 Discord webhook URLs** |

---

## Steps

### 1. Import the blueprint
Make.com → **Create a new scenario** → top-right **⋯** → **Import Blueprint** → upload
`make-blueprints/whop-payment.json`. (Make auto-assigns the scenario to your account's region —
the `zone` in the file is just a default.)

### 2. Authorize connections
- Click each **Google Drive** module (2–5) → **Add/Select connection** → sign in with the Google
  account that owns your client Drive. Reuse the same connection for all four.
- Click each **Gmail** module (7 and 11) → connect the Google account you send client email from.
  Reuse the same connection for both.

### 3. Fill the secrets/placeholders
- **Module 6** header `x-webhook-secret`: replace `YOUR_WHOP_WEBHOOK_SECRET_HERE` with your real
  `WHOP_WEBHOOK_SECRET` (same value set in Vercel). This is what authorizes the backend call.
- **Module 2** parent folder: replace `YOUR_GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID` with your clients
  root folder ID (same as `GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID`).
- **Modules 8–10** URLs: paste your 3 Discord webhook URLs (channel → Integrations → Webhooks).
  These map to `DISCORD_WEBHOOK_PAYMENT` (8), `DISCORD_WEBHOOK_DEAL_CLOSED` (9),
  `DISCORD_WEBHOOK_NEW_CLIENT` (10).

### 4. Wire Whop → Make
Copy the **webhook URL** Make shows on module 1 (Custom webhook). In the **Whop dashboard →
Developer/Webhooks**, add a webhook to that URL for **payment succeeded / membership valid**.
Make sure Whop sends `email`, `name`, `amount` (cents), `payment_id` (map Whop's fields if needed).

### 5. Turn it ON
Toggle the scenario **ON** (bottom-left). Set scheduling to **Immediately** (instant webhook).

---

## Test before relying on it
1. In Make, click **Run once**, then trigger a Whop **test** payment (or use the payload shape in
   `scripts/test-whop-webhook.mjs`). Watch every module light green.
2. Confirm: Drive client folder + 3 subfolders created · **Welcome + ID emails** arrive · **3
   Discord posts** land · a Whop **deal/client shows in the SNS dashboard** · a row appears in the
   Supabase `payments` table.
3. Re-fire the same `payment_id` → the backend (module 6) de-dupes via Supabase (no duplicate
   deal); Make modules re-run harmlessly for the test.

## Notes
- **Record-only backend call (module 6):** the SNS backend records data but stays silent on
  email/Discord (Make owns those) — no double-sends. If you ever want zero backend involvement,
  delete module 6; you'll lose Whop deals in the dashboards/payouts.
- The custom `/api/whop-webhook` is **not** Whop's front door here — Whop points at Make. The route
  only runs when module 6 calls it. Don't also point Whop directly at it, or you'd double-process.
