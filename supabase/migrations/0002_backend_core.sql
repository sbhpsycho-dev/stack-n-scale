-- Stack N Scale backend migration → Supabase (Phase 1: schema).
-- Relational tables that replace the Vercel KV namespaces (system of record),
-- plus a kv_store table for genuinely ephemeral key/value state.
-- All writes go through the service-role key (getSupabaseAdmin); RLS is enabled with
-- NO policies so the table is not reachable via the anon/public API.
-- Apply via the Supabase SQL editor or `supabase db push`.

-- ─────────────────────────────────────────────────────────────────────────────
-- DEALS  (KV: sns:deals:{id}, sns:deals:index)  — shape: @/lib/deal-types Deal
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.deals (
  id             text primary key,
  date           date not null,
  client_name    text not null,
  client_email   text,
  offer          text not null,                 -- "5K" | "10K"
  gross_amount   numeric(12,2) not null,
  processor      text not null,                 -- stripe | fanbasis | whop
  processor_fee  numeric(12,2) not null,
  net_amount     numeric(12,2) not null,
  lead_source    text not null,                 -- ad | organic
  dm_setter      text,
  setter         text,
  closer         text,
  dm_setter_id   text,
  setter_id      text,
  closer_id      text,
  contract_value numeric(12,2),
  payout_status  text not null default 'pending', -- pending | approved | paid
  notes          text default '',
  created_at     timestamptz not null default now()
);
create index if not exists deals_date_idx          on public.deals (date desc);
create index if not exists deals_processor_idx      on public.deals (processor);
create index if not exists deals_setter_idx         on public.deals (setter);
create index if not exists deals_closer_idx         on public.deals (closer);
create index if not exists deals_payout_status_idx  on public.deals (payout_status);
create index if not exists deals_client_email_idx   on public.deals (client_email);

-- DEAL PAYOUTS (1:1)  — shape: @/lib/deal-types DealPayout
create table if not exists public.deal_payouts (
  deal_id              text primary key references public.deals(id) on delete cascade,
  caelum               numeric(12,2) not null default 0,
  media_buyer          numeric(12,2) not null default 0,
  dm_setter            numeric(12,2) not null default 0,
  setter               numeric(12,2) not null default 0,
  closer               numeric(12,2) not null default 0,
  total_payouts        numeric(12,2) not null default 0,
  company_reinvestment numeric(12,2) not null default 0,
  evan_take_home       numeric(12,2) not null default 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LEADS  (KV: sns:leads:{id}, sns:leads:index)  — shape: @/lib/lead-types Lead
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id          text primary key,
  name        text not null,
  email       text not null,
  phone       text,
  source      text not null,                    -- fanbasis | stripe | whop
  state       text not null,                    -- LeadState
  call_url    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists leads_state_idx on public.leads (state);
create index if not exists leads_email_idx on public.leads (email);

create table if not exists public.lead_contacts (
  id           bigserial primary key,
  lead_id      text not null references public.leads(id) on delete cascade,
  type         text not null,                   -- sms | call | email
  touch_number integer not null,
  sent_at      timestamptz not null,
  message      text
);
create index if not exists lead_contacts_lead_idx on public.lead_contacts (lead_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- COACHING CLIENTS  (KV: sns:coaching:client:{email})  — @/lib/coaching-types
-- email is the natural key used throughout the app.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.coaching_clients (
  email            text primary key,
  ghl_contact_id   text,
  name             text not null,
  phone            text,
  status           text not null,               -- CoachingStatus
  id_verification  text not null default 'pending',
  drive_folder     jsonb,
  active_date      date,
  coach_assigned   text,
  rejection_reason text,
  reported_income  numeric(12,2),
  discord_id       text,
  created_at       timestamptz not null default now()
);
create index if not exists coaching_clients_status_idx on public.coaching_clients (status);

create table if not exists public.progress_notes (
  id           bigserial primary key,
  client_email text not null references public.coaching_clients(email) on delete cascade,
  text         text not null,
  author       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists progress_notes_client_idx on public.progress_notes (client_email);

-- ID VERIFICATIONS  (Vercel Blob → Supabase Storage paths)
create table if not exists public.id_verifications (
  client_email   text primary key references public.coaching_clients(email) on delete cascade,
  front_path     text,
  selfie_path    text,
  signature_path text,
  status         text not null default 'pending', -- pending | submitted | approved | rejected
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EXPENSES  (KV: sns:expenses:{id}, sns:expenses:index)  — @/lib/expense-types
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id          text primary key,
  date        text not null,                    -- "YYYY-MM" (fixed) or "YYYY-MM-DD" (variable)
  vendor      text not null,
  description text not null,
  amount      numeric(12,2) not null,
  category    text not null,                    -- ExpenseCategory
  recurrence  text not null,                    -- fixed | variable
  is_seeded   boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (date);

-- ─────────────────────────────────────────────────────────────────────────────
-- STAFF  (KV: sns-staff-registry)  — @/lib/staff-registry StaffMeta
-- (credentials move to Supabase Auth in Phase 6; this table holds staff metadata)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.staff (
  id         text primary key,                  -- slugified name
  name       text not null,
  email      text,
  password   text,                              -- hashed (retired after Phase 6)
  role       text,
  sheet_id   text,
  discord_id text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- BIZ CLIENTS  (KV: sns:biz-clients)  — @/lib/biz-client-types BizClient
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.biz_clients (
  id                    text primary key,
  name                  text not null,
  contact_name          text,
  contact_email         text,
  contact_phone         text,
  status                text not null,          -- BizClientStatus
  start_date            date,
  monthly_value         numeric(12,2),
  services              text,
  notes                 text,
  portal_username       text,
  portal_password_hash  text,
  created_at            timestamptz not null default now()
);

create table if not exists public.team_members (
  id            text primary key,
  biz_client_id text not null references public.biz_clients(id) on delete cascade,
  name          text not null,
  role          text not null,
  kpis          jsonb not null default '[]'::jsonb
);
create index if not exists team_members_client_idx on public.team_members (biz_client_id);

-- Biz KPI entries (KV: sns:biz-kpi:{clientId}:{memberId}:{date})
create table if not exists public.biz_kpi_entries (
  biz_client_id text not null,
  member_id     text not null,
  date          date not null,
  values        jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (biz_client_id, member_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYOUTS  (KV: sns:payouts:weekly:{weekId}; pending is derived from deals)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.weekly_payouts (
  week_id     text primary key,
  week_start  date,
  week_end    date,
  deal_ids    jsonb not null default '[]'::jsonb,
  totals      jsonb,
  status      text not null default 'pending',  -- pending | approved | paid
  approved_at timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOG  (KV: sns:audit:*  + Prisma AuditLog)  — @/lib/audit AuditEntry
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          text primary key,
  actor_id    text not null,
  actor_name  text not null,
  action      text not null,
  entity_id   text not null,
  entity_type text not null,
  before      jsonb,
  after       jsonb,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_idx  on public.audit_logs (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS  (KV: sns:notifications:staff:*)  — @/lib/staff-types
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         text primary key,
  staff_id   text,
  message    text not null,
  link       text,
  type       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_staff_idx on public.notifications (staff_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIG  (KV: sns:config:{key})
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.config (
  key   text primary key,
  value jsonb
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ONBOARDING SUBMISSIONS  (consolidates KV sns:onboarding:* + sns:drive:file-ids:*)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_submissions (
  email          text primary key,
  form           jsonb,
  id_submit      jsonb,
  discord        jsonb,
  drive_file_ids jsonb,
  sig_form       text,
  sig_id         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECKINS  (KV: sns:checkins:{studentId})
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.checkins (
  id         bigserial primary key,
  student_id text not null,
  payload    jsonb not null,
  flagged    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists checkins_student_idx on public.checkins (student_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- REPLOG ENTRIES  (KV: sns-replog-{staffId} arrays)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.replog_entries (
  id         bigserial primary key,
  staff_id   text not null,
  date       date not null,
  entry      jsonb not null,
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DAILY METRICS  (KV counters: sns:metrics:{type}:{date}, campaign variant)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_metrics (
  date        date not null,
  metric_type text not null,                    -- leads | booked | noshow | campaign
  campaign    text not null default '',
  count       integer not null default 0,
  primary key (date, metric_type, campaign)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LEAD PIPELINE PENDING  (KV HSET: sns:stl:pending)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.stl_pending (
  contact_id text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPUTED-AGGREGATE CACHES (JSONB blobs — not worth normalizing)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_sync_data (
  client_id  text primary key,                  -- KV: sns-client-{clientId}
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.dashboard_cache (
  id         text primary key default 'v1',      -- KV: sns-dashboard-v1
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.meta_spend (
  date       date primary key,                   -- KV: sns:meta:spend:{date}
  total      numeric(12,2) not null default 0,
  campaigns  jsonb not null default '{}'::jsonb
);
create table if not exists public.ads_scorecard_cache (
  id         text primary key default 'current', -- KV: sns:ads:scorecard:cache
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- KV_STORE  — durable key/value home for ephemeral namespaces
-- (OAuth state, Outlook tokens, rate limits, dedup flags, locks, webhook:last:*,
--  drive:confirmed, setup-done, etc.). TTL via expires_at + read-time filter.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kv_store (
  key        text primary key,
  value      jsonb,
  expires_at timestamptz
);
create index if not exists kv_store_expires_idx on public.kv_store (expires_at) where expires_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — enable on every table; no policies ⇒ only the service-role key has access.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'deals','deal_payouts','leads','lead_contacts','coaching_clients','progress_notes',
        'id_verifications','expenses','staff','biz_clients','team_members','biz_kpi_entries',
        'weekly_payouts','audit_logs','notifications','config','onboarding_submissions',
        'checkins','replog_entries','daily_metrics','stl_pending','client_sync_data',
        'dashboard_cache','meta_spend','ads_scorecard_cache','kv_store'
      )
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;
