"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type ClientIntegrations } from "@/lib/integrations";
import { StepNav } from "./step-nav";
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";

interface Props {
  integrations: ClientIntegrations;
  onChange: (i: ClientIntegrations) => void;
  onBack: () => void;
  onFinish: () => void;
}

type SyncStatus = "idle" | "syncing" | "done" | "error";

function IntegrationCard({
  title,
  description,
  connected,
  syncing,
  children,
  onSync,
}: {
  title: string;
  description: string;
  connected: boolean;
  syncing: boolean;
  children: React.ReactNode;
  onSync: () => void;
}) {
  return (
    <div className={`border rounded-xl p-4 transition-colors ${connected ? "border-orange-500/40 bg-orange-500/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            {connected ? (
              <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-6">{description}</p>
        </div>
        {connected && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSync}
            disabled={syncing}
            className="h-7 gap-1.5 text-orange-400 hover:text-orange-300 shrink-0"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync Now
          </Button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function StepIntegrations({ integrations, onChange, onBack, onFinish }: Props) {
  const [status, setStatus] = useState<Record<string, SyncStatus>>({});
  const [saving, setSaving] = useState(false);

  async function syncIntegration(source: string) {
    setStatus((s) => ({ ...s, [source]: "syncing" }));
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrations),
      });
      await fetch(`/api/sync/${source}`, { method: "POST" });
      setStatus((s) => ({ ...s, [source]: "done" }));
    } catch {
      setStatus((s) => ({ ...s, [source]: "error" }));
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrations),
      });
    } catch { /* ignore */ }
    setSaving(false);
    onFinish();
  }

  const meta = integrations.meta ?? { accessToken: "", adAccountId: "" };
  const ghl = integrations.ghl ?? { apiKey: "", locationId: "" };
  const stripe = integrations.stripe ?? { secretKey: "" };
  const sheets = integrations.sheets ?? { sheetUrl: "" };

  const metaConnected = !!(meta.accessToken && meta.adAccountId);
  const ghlConnected = !!(ghl.apiKey && ghl.locationId);
  const stripeConnected = !!stripe.secretKey;
  const sheetsConnected = !!sheets.sheetUrl;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Connect Integrations</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Link your tools so your dashboard updates automatically every day. You can skip any you don&apos;t use.
        </p>
      </div>

      <div className="space-y-3">
        <IntegrationCard
          title="Meta / Facebook Ads"
          description="Auto-pulls ad spend, leads, CPL, ROAS, CTR"
          connected={metaConnected}
          syncing={status.meta === "syncing"}
          onSync={() => syncIntegration("meta")}
        >
          <div>
            <Label className="text-xs text-muted-foreground">Access Token</Label>
            <Input
              type="password"
              value={meta.accessToken}
              onChange={(e) => onChange({ ...integrations, meta: { ...meta, accessToken: e.target.value } })}
              placeholder="EAAxxxx..."
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ad Account ID</Label>
            <Input
              value={meta.adAccountId}
              onChange={(e) => onChange({ ...integrations, meta: { ...meta, adAccountId: e.target.value } })}
              placeholder="123456789"
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
        </IntegrationCard>

        <IntegrationCard
          title="GoHighLevel (GHL)"
          description="Auto-pulls pipeline stages, rep leaderboard, leads"
          connected={ghlConnected}
          syncing={status.ghl === "syncing"}
          onSync={() => syncIntegration("ghl")}
        >
          <div>
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={ghl.apiKey}
              onChange={(e) => onChange({ ...integrations, ghl: { ...ghl, apiKey: e.target.value } })}
              placeholder="your-api-key"
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Location ID</Label>
            <Input
              value={ghl.locationId}
              onChange={(e) => onChange({ ...integrations, ghl: { ...ghl, locationId: e.target.value } })}
              placeholder="location-id"
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
        </IntegrationCard>

        <IntegrationCard
          title="Stripe"
          description="Auto-pulls cash collected, MRR, refunds"
          connected={stripeConnected}
          syncing={status.stripe === "syncing"}
          onSync={() => syncIntegration("stripe")}
        >
          <div>
            <Label className="text-xs text-muted-foreground">Secret Key</Label>
            <Input
              type="password"
              value={stripe.secretKey}
              onChange={(e) => onChange({ ...integrations, stripe: { secretKey: e.target.value } })}
              placeholder="sk_live_..."
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
        </IntegrationCard>

        <IntegrationCard
          title="Google Sheets"
          description="Maps your spreadsheet columns to dashboard fields"
          connected={sheetsConnected}
          syncing={status.sheets === "syncing"}
          onSync={() => syncIntegration("sheets")}
        >
          <div>
            <Label className="text-xs text-muted-foreground">Sheet URL (must be publicly viewable)</Label>
            <Input
              value={sheets.sheetUrl}
              onChange={(e) => onChange({ ...integrations, sheets: { sheetUrl: e.target.value } })}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="bg-muted border-border h-8 text-xs mt-1"
            />
          </div>
        </IntegrationCard>
      </div>

      <StepNav
        step={5}
        totalSteps={6}
        onBack={onBack}
        onContinue={handleFinish}
        continueLabel="Finish Setup"
        loading={saving}
      />
    </div>
  );
}
