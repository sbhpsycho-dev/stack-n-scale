-- Whop payment automation: idempotency + audit log for the /api/whop-webhook endpoint.
-- Apply via the Supabase SQL editor, or `supabase db push` if the CLI is linked.

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  whop_event_id      text not null,                 -- idempotency key (Whop payment id, falls back to svix-id)
  customer_name      text,
  customer_email     text,
  amount             numeric(10,2),                 -- dollars
  amount_cents       integer,
  plan_name          text,
  tier               text,                          -- Intro Student | Student | VIP Student
  id_email_sent      boolean default false,
  welcome_email_sent boolean default false,
  discord_posted     boolean default false,
  status             text default 'processing',     -- processing | completed | error
  error              text,
  raw                jsonb,
  created_at         timestamptz default now()
);

-- Idempotency: a duplicate Whop delivery (retry) collides on this unique key.
-- The webhook uses upsert(..., { onConflict: 'whop_event_id', ignoreDuplicates: true });
-- an empty returned row means "already processed".
create unique index if not exists payments_whop_event_id_key on public.payments (whop_event_id);

create index if not exists payments_customer_email_idx on public.payments (customer_email);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

-- Writes happen only via the service-role key (bypasses RLS). Enable RLS with no
-- anon policies so the table is not exposed through the public/anon API.
alter table public.payments enable row level security;
