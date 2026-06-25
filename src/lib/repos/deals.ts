import { getSupabaseAdmin } from "@/lib/supabase";
import type { Deal, DealPayout } from "@/lib/deal-types";

/**
 * Deals repository — Supabase-backed replacement for the KV `sns:deals:*` namespace.
 * Returns the exact `Deal` shape routes already consume, so route bodies swap
 * `kv.*` calls for `dealsRepo.*` with minimal reshaping. Filtering is pushed into
 * SQL (replacing the lrange + N×get + in-memory filter pattern).
 */

function admin() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("[repos/deals] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return sb;
}

// Postgres `numeric` comes back as a string via supabase-js — coerce to number.
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

type DealRow = {
  id: string;
  date: string;
  client_name: string;
  client_email: string | null;
  offer: string;
  gross_amount: string | number;
  processor: string;
  processor_fee: string | number;
  net_amount: string | number;
  lead_source: string;
  dm_setter: string | null;
  setter: string | null;
  closer: string | null;
  dm_setter_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  contract_value: string | number | null;
  payout_status: string;
  notes: string | null;
  deal_payouts: PayoutRow | PayoutRow[] | null;
};

type PayoutRow = {
  caelum: string | number;
  media_buyer: string | number;
  dm_setter: string | number;
  setter: string | number;
  closer: string | number;
  total_payouts: string | number;
  company_reinvestment: string | number;
  evan_take_home: string | number;
};

const BLANK_PAYOUT: DealPayout = {
  caelum: 0, mediaBuyer: 0, dmSetter: 0, setter: 0, closer: 0,
  totalPayouts: 0, companyReinvestment: 0, evanTakeHome: 0,
};

function rowToDeal(row: DealRow): Deal {
  const p = Array.isArray(row.deal_payouts) ? row.deal_payouts[0] : row.deal_payouts;
  const payouts: DealPayout = p
    ? {
        caelum: num(p.caelum),
        mediaBuyer: num(p.media_buyer),
        dmSetter: num(p.dm_setter),
        setter: num(p.setter),
        closer: num(p.closer),
        totalPayouts: num(p.total_payouts),
        companyReinvestment: num(p.company_reinvestment),
        evanTakeHome: num(p.evan_take_home),
      }
    : { ...BLANK_PAYOUT };

  return {
    id: row.id,
    date: row.date,
    clientName: row.client_name,
    clientEmail: row.client_email,
    offer: row.offer as Deal["offer"],
    grossAmount: num(row.gross_amount),
    processor: row.processor as Deal["processor"],
    processorFee: num(row.processor_fee),
    netAmount: num(row.net_amount),
    leadSource: row.lead_source as Deal["leadSource"],
    dmSetter: row.dm_setter,
    setter: row.setter,
    closer: row.closer,
    dmSetterId: row.dm_setter_id,
    setterId: row.setter_id,
    closerId: row.closer_id,
    contractValue: numOrNull(row.contract_value),
    payouts,
    payoutStatus: row.payout_status as Deal["payoutStatus"],
    notes: row.notes ?? "",
  };
}

const SELECT = "*, deal_payouts(*)";

export interface DealFilters {
  from?: string | null;       // YYYY-MM-DD inclusive
  to?: string | null;         // YYYY-MM-DD inclusive
  processor?: string | null;
  source?: string | null;     // leadSource
  rep?: string | null;        // matches setter OR closer
}

/** List deals with SQL-side filtering, newest first. */
export async function listDeals(filters: DealFilters = {}): Promise<Deal[]> {
  let q = admin().from("deals").select(SELECT).order("date", { ascending: false });

  if (filters.from)      q = q.gte("date", filters.from);
  if (filters.to)        q = q.lte("date", filters.to);
  if (filters.processor) q = q.eq("processor", filters.processor);
  if (filters.source)    q = q.eq("lead_source", filters.source);
  if (filters.rep)       q = q.or(`setter.eq.${filters.rep},closer.eq.${filters.rep}`);

  const { data, error } = await q;
  if (error) throw new Error(`[repos/deals] listDeals: ${error.message}`);
  return (data as DealRow[]).map(rowToDeal);
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await admin().from("deals").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`[repos/deals] getDeal: ${error.message}`);
  return data ? rowToDeal(data as DealRow) : null;
}

export async function dealExists(id: string): Promise<boolean> {
  const { data, error } = await admin().from("deals").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`[repos/deals] dealExists: ${error.message}`);
  return !!data;
}

/**
 * Insert (or upsert) a deal + its payouts. Idempotent on deal id via upsert —
 * mirrors the KV `nx`/dedup guards in the webhooks.
 */
export async function upsertDeal(deal: Deal): Promise<void> {
  const sb = admin();
  const { error: dealErr } = await sb.from("deals").upsert({
    id: deal.id,
    date: deal.date,
    client_name: deal.clientName,
    client_email: deal.clientEmail ?? null,
    offer: deal.offer,
    gross_amount: deal.grossAmount,
    processor: deal.processor,
    processor_fee: deal.processorFee,
    net_amount: deal.netAmount,
    lead_source: deal.leadSource,
    dm_setter: deal.dmSetter ?? null,
    setter: deal.setter ?? null,
    closer: deal.closer ?? null,
    dm_setter_id: deal.dmSetterId ?? null,
    setter_id: deal.setterId ?? null,
    closer_id: deal.closerId ?? null,
    contract_value: deal.contractValue ?? null,
    payout_status: deal.payoutStatus,
    notes: deal.notes ?? "",
  }, { onConflict: "id" });
  if (dealErr) throw new Error(`[repos/deals] upsertDeal(deal): ${dealErr.message}`);

  const p = deal.payouts ?? BLANK_PAYOUT;
  const { error: payErr } = await sb.from("deal_payouts").upsert({
    deal_id: deal.id,
    caelum: p.caelum,
    media_buyer: p.mediaBuyer,
    dm_setter: p.dmSetter,
    setter: p.setter,
    closer: p.closer,
    total_payouts: p.totalPayouts,
    company_reinvestment: p.companyReinvestment,
    evan_take_home: p.evanTakeHome,
  }, { onConflict: "deal_id" });
  if (payErr) throw new Error(`[repos/deals] upsertDeal(payouts): ${payErr.message}`);
}

export async function setPayoutStatus(id: string, status: Deal["payoutStatus"]): Promise<void> {
  const { error } = await admin().from("deals").update({ payout_status: status }).eq("id", id);
  if (error) throw new Error(`[repos/deals] setPayoutStatus: ${error.message}`);
}

/** Deals with a pending payout (replaces the KV `sns:payouts:pending` list). */
export async function listPendingPayoutDeals(): Promise<Deal[]> {
  const { data, error } = await admin().from("deals").select(SELECT).eq("payout_status", "pending");
  if (error) throw new Error(`[repos/deals] listPendingPayoutDeals: ${error.message}`);
  return (data as DealRow[]).map(rowToDeal);
}
