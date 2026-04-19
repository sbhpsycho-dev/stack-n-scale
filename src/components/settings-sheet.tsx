"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { type ClientIntegrations } from "@/lib/integrations";
import {
  CheckCircle2, Circle, Loader2, RefreshCw, Eye, EyeOff,
  User, KeyRound, Plug, ExternalLink
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

type SaveState = "idle" | "saving" | "ok" | "error";

function StatusMsg({ state, error }: { state: SaveState; error?: string }) {
  if (state === "saving") return <p className="text-xs text-muted-foreground">Saving…</p>;
  if (state === "ok") return <p className="text-xs text-emerald-400">✓ Saved successfully</p>;
  if (state === "error") return <p className="text-xs text-red-400">{error ?? "Something went wrong"}</p>;
  return null;
}

// ─── Account Tab ────────────────────────────────────────────────────────────
function AccountTab({ clientId, initialName }: { clientId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [state, setState] = useState<SaveState>("idle");
  const [errMsg, setErrMsg] = useState("");

  async function save() {
    setState("saving");
    setErrMsg("");
    try {
      const res = await fetch("/api/settings/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (json.ok) { setState("ok"); setTimeout(() => setState("idle"), 3000); }
      else { setState("error"); setErrMsg(json.error ?? "Failed to save"); }
    } catch {
      setState("error"); setErrMsg("Network error");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Account Info</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setState("idle"); }}
              className="bg-muted border-border h-9 text-sm mt-1"
              placeholder="Your business name"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Client ID</Label>
            <div className="mt-1">
              <Badge className="bg-muted text-muted-foreground border-border font-mono text-xs">{clientId}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">This is your unique identifier and cannot be changed.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={save}
          disabled={state === "saving" || !name.trim()}
          className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
        >
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Changes"}
        </Button>
        <StatusMsg state={state} error={errMsg} />
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Need to re-run initial setup?{" "}
          <a href="/setup" className="text-orange-400 hover:text-orange-300 underline inline-flex items-center gap-0.5">
            Go to Setup Wizard <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Password Tab ────────────────────────────────────────────────────────────
function PasswordTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [errMsg, setErrMsg] = useState("");

  const mismatch = next && confirm && next !== confirm;

  async function save() {
    if (next !== confirm) { setState("error"); setErrMsg("Passwords don't match"); return; }
    if (!current || !next) { setState("error"); setErrMsg("All fields are required"); return; }
    setState("saving"); setErrMsg("");
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json();
      if (json.ok) {
        setState("ok");
        setCurrent(""); setNext(""); setConfirm("");
        setTimeout(() => setState("idle"), 3000);
      } else {
        setState("error"); setErrMsg(json.error ?? "Failed to update password");
      }
    } catch {
      setState("error"); setErrMsg("Network error");
    }
  }

  function PwField({ label, value, onChange, show, onToggle }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void }) {
    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="relative mt-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => { onChange(e.target.value); setState("idle"); setErrMsg(""); }}
            className="bg-muted border-border h-9 text-sm pr-9"
          />
          <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Change Password</p>
        <div className="space-y-3">
          <PwField label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent((s) => !s)} />
          <PwField label="New Password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext((s) => !s)} />
          <div>
            <Label className="text-xs text-muted-foreground">Confirm New Password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setState("idle"); setErrMsg(""); }}
              className={`bg-muted border-border h-9 text-sm mt-1 ${mismatch ? "border-red-500/50" : ""}`}
            />
            {mismatch && <p className="text-[10px] text-red-400 mt-1">Passwords don&apos;t match</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={save}
          disabled={state === "saving" || !current || !next || !confirm || !!mismatch}
          className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
        >
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update Password"}
        </Button>
        <StatusMsg state={state} error={errMsg} />
      </div>
    </div>
  );
}

// ─── API Keys Tab ────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const [integrations, setIntegrations] = useState<ClientIntegrations>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErr, setSaveErr] = useState("");
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    fetch("/api/integrations").then((r) => r.json()).then((d) => {
      if (d && typeof d === "object") setIntegrations(d);
    }).catch(() => {});
  }, []);

  async function saveIntegrations() {
    setSaveState("saving"); setSaveErr("");
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrations),
      });
      const json = await res.json();
      if (json.ok) { setSaveState("ok"); setTimeout(() => setSaveState("idle"), 3000); }
      else { setSaveState("error"); setSaveErr("Failed to save"); }
    } catch {
      setSaveState("error"); setSaveErr("Network error");
    }
  }

  async function sync(source: string) {
    setSyncingSource(source); setSyncMsg("");
    try {
      const res = await fetch(`/api/sync/${source}`, { method: "POST" });
      setSyncMsg(res.ok ? `✓ ${source} synced` : `✗ ${source} sync failed`);
    } catch {
      setSyncMsg(`✗ ${source} sync failed`);
    }
    setSyncingSource(null);
    setTimeout(() => setSyncMsg(""), 4000);
  }

  async function syncAll() {
    setSyncingSource("all"); setSyncMsg("");
    try {
      await fetch("/api/sync/all", { method: "POST" });
      setSyncMsg("✓ All integrations synced");
    } catch {
      setSyncMsg("✗ Sync failed");
    }
    setSyncingSource(null);
    setTimeout(() => setSyncMsg(""), 4000);
  }

  const meta = integrations.meta ?? { accessToken: "", adAccountId: "" };
  const ghl = integrations.ghl ?? { apiKey: "", locationId: "" };
  const stripe = integrations.stripe ?? { secretKey: "" };
  const sheets = integrations.sheets ?? { sheetUrl: "" };

  const configs = [
    {
      key: "meta" as const,
      title: "Meta / Facebook Ads",
      desc: "Ad spend, leads, CPL, ROAS, CTR",
      connected: !!(meta.accessToken && meta.adAccountId),
      fields: (
        <>
          <div>
            <Label className="text-[10px] text-muted-foreground">Access Token</Label>
            <Input type="password" value={meta.accessToken} onChange={(e) => setIntegrations((i) => ({ ...i, meta: { ...meta, accessToken: e.target.value } }))}
              placeholder="EAAxxxx…" className="bg-muted border-border h-8 text-xs mt-0.5" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Ad Account ID</Label>
            <Input value={meta.adAccountId} onChange={(e) => setIntegrations((i) => ({ ...i, meta: { ...meta, adAccountId: e.target.value } }))}
              placeholder="123456789" className="bg-muted border-border h-8 text-xs mt-0.5" />
          </div>
        </>
      ),
    },
    {
      key: "ghl" as const,
      title: "GoHighLevel (GHL)",
      desc: "Pipeline, rep leaderboard, leads",
      connected: !!(ghl.apiKey && ghl.locationId),
      fields: (
        <>
          <div>
            <Label className="text-[10px] text-muted-foreground">API Key</Label>
            <Input type="password" value={ghl.apiKey} onChange={(e) => setIntegrations((i) => ({ ...i, ghl: { ...ghl, apiKey: e.target.value } }))}
              placeholder="your-api-key" className="bg-muted border-border h-8 text-xs mt-0.5" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Location ID</Label>
            <Input value={ghl.locationId} onChange={(e) => setIntegrations((i) => ({ ...i, ghl: { ...ghl, locationId: e.target.value } }))}
              placeholder="location-id" className="bg-muted border-border h-8 text-xs mt-0.5" />
          </div>
        </>
      ),
    },
    {
      key: "stripe" as const,
      title: "Stripe",
      desc: "Cash collected, MRR, refunds",
      connected: !!stripe.secretKey,
      fields: (
        <div>
          <Label className="text-[10px] text-muted-foreground">Secret Key</Label>
          <Input type="password" value={stripe.secretKey} onChange={(e) => setIntegrations((i) => ({ ...i, stripe: { secretKey: e.target.value } }))}
            placeholder="sk_live_…" className="bg-muted border-border h-8 text-xs mt-0.5" />
        </div>
      ),
    },
    {
      key: "sheets" as const,
      title: "Google Sheets",
      desc: "CSV column mapping to dashboard fields",
      connected: !!sheets.sheetUrl,
      fields: (
        <div>
          <Label className="text-[10px] text-muted-foreground">Sheet URL (publicly viewable)</Label>
          <Input value={sheets.sheetUrl} onChange={(e) => setIntegrations((i) => ({ ...i, sheets: { sheetUrl: e.target.value } }))}
            placeholder="https://docs.google.com/spreadsheets/d/…" className="bg-muted border-border h-8 text-xs mt-0.5" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">API Keys</p>
        <Button size="sm" variant="ghost" onClick={syncAll} disabled={!!syncingSource}
          className="h-7 gap-1 text-orange-400 hover:text-orange-300 text-xs">
          {syncingSource === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sync All
        </Button>
      </div>

      {syncMsg && <p className={`text-xs ${syncMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{syncMsg}</p>}

      {configs.map(({ key, title, desc, connected, fields }) => (
        <div key={key} className={`border rounded-xl p-3 ${connected ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {connected ? <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-xs font-semibold">{title}</span>
              {connected && <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5">Connected</Badge>}
            </div>
            {connected && (
              <Button size="sm" variant="ghost" onClick={() => sync(key)} disabled={!!syncingSource}
                className="h-6 gap-1 text-orange-400 hover:text-orange-300 text-[10px]">
                {syncingSource === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                Sync
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">{desc}</p>
          <div className="space-y-2">{fields}</div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" onClick={saveIntegrations} disabled={saveState === "saving"}
          className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8">
          {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save API Keys"}
        </Button>
        <StatusMsg state={saveState} error={saveErr} />
      </div>
    </div>
  );
}

// ─── Admin API Keys Tab ───────────────────────────────────────────────────────
function AdminApiKeysTab() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [integrations, setIntegrations] = useState<ClientIntegrations>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErr, setSaveErr] = useState("");
  const [loadingClient, setLoadingClient] = useState(false);

  // Load client registry from admin data
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((d) => {
        const registry = d?.clientRegistry ?? [];
        setClients(registry.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  // Load integrations when client selection changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingClient(true);
    fetch(`/api/admin/integrations?clientId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => { if (d && typeof d === "object") setIntegrations(d); })
      .catch(() => {})
      .finally(() => setLoadingClient(false));
  }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    setSaveState("saving"); setSaveErr("");
    try {
      const res = await fetch(`/api/admin/integrations?clientId=${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrations),
      });
      const json = await res.json();
      if (json.ok) { setSaveState("ok"); setTimeout(() => setSaveState("idle"), 3000); }
      else { setSaveState("error"); setSaveErr("Failed to save"); }
    } catch {
      setSaveState("error"); setSaveErr("Network error");
    }
  }

  const meta = integrations.meta ?? { accessToken: "", adAccountId: "" };
  const ghl = integrations.ghl ?? { apiKey: "", locationId: "" };
  const stripe = integrations.stripe ?? { secretKey: "" };
  const sheets = integrations.sheets ?? { sheetUrl: "" };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Select Client</Label>
        <select
          value={selectedId}
          onChange={(e) => { setSelectedId(e.target.value); setIntegrations({}); setSaveState("idle"); }}
          className="mt-1 w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">— choose a client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedId && (
        loadingClient ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Meta */}
            <div className={`border rounded-xl p-3 ${meta.accessToken && meta.adAccountId ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
              <div className="flex items-center gap-1.5 mb-2">
                {meta.accessToken && meta.adAccountId ? <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold">Meta / Facebook Ads</span>
              </div>
              <div className="space-y-2">
                <div><Label className="text-[10px] text-muted-foreground">Access Token</Label>
                  <Input type="password" value={meta.accessToken} onChange={(e) => setIntegrations((i) => ({ ...i, meta: { ...meta, accessToken: e.target.value } }))}
                    placeholder="EAAxxxx…" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
                <div><Label className="text-[10px] text-muted-foreground">Ad Account ID</Label>
                  <Input value={meta.adAccountId} onChange={(e) => setIntegrations((i) => ({ ...i, meta: { ...meta, adAccountId: e.target.value } }))}
                    placeholder="123456789" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
              </div>
            </div>

            {/* GHL */}
            <div className={`border rounded-xl p-3 ${ghl.apiKey && ghl.locationId ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
              <div className="flex items-center gap-1.5 mb-2">
                {ghl.apiKey && ghl.locationId ? <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold">GoHighLevel (GHL)</span>
              </div>
              <div className="space-y-2">
                <div><Label className="text-[10px] text-muted-foreground">API Key</Label>
                  <Input type="password" value={ghl.apiKey} onChange={(e) => setIntegrations((i) => ({ ...i, ghl: { ...ghl, apiKey: e.target.value } }))}
                    placeholder="your-api-key" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
                <div><Label className="text-[10px] text-muted-foreground">Location ID</Label>
                  <Input value={ghl.locationId} onChange={(e) => setIntegrations((i) => ({ ...i, ghl: { ...ghl, locationId: e.target.value } }))}
                    placeholder="location-id" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
              </div>
            </div>

            {/* Stripe */}
            <div className={`border rounded-xl p-3 ${stripe.secretKey ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
              <div className="flex items-center gap-1.5 mb-2">
                {stripe.secretKey ? <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold">Stripe</span>
              </div>
              <div><Label className="text-[10px] text-muted-foreground">Secret Key</Label>
                <Input type="password" value={stripe.secretKey} onChange={(e) => setIntegrations((i) => ({ ...i, stripe: { secretKey: e.target.value } }))}
                  placeholder="sk_live_…" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
            </div>

            {/* Sheets */}
            <div className={`border rounded-xl p-3 ${sheets.sheetUrl ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
              <div className="flex items-center gap-1.5 mb-2">
                {sheets.sheetUrl ? <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold">Google Sheets</span>
              </div>
              <div><Label className="text-[10px] text-muted-foreground">Sheet URL (publicly viewable)</Label>
                <Input value={sheets.sheetUrl} onChange={(e) => setIntegrations((i) => ({ ...i, sheets: { sheetUrl: e.target.value } }))}
                  placeholder="https://docs.google.com/spreadsheets/d/…" className="bg-muted border-border h-8 text-xs mt-0.5" /></div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button size="sm" onClick={save} disabled={saveState === "saving"}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8">
                {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save API Keys"}
              </Button>
              <StatusMsg state={saveState} error={saveErr} />
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Admin Settings View ─────────────────────────────────────────────────────
function AdminSettingsView() {
  return (
    <Tabs defaultValue="account">
      <TabsList className="bg-muted border border-border h-8 mb-5 w-full">
        <TabsTrigger value="account" className="text-xs flex-1 gap-1">
          <User className="h-3 w-3" /> Account
        </TabsTrigger>
        <TabsTrigger value="apikeys" className="text-xs flex-1 gap-1">
          <Plug className="h-3 w-3" /> API Keys
        </TabsTrigger>
      </TabsList>

      <TabsContent value="account">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Account</p>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <div className="mt-1">
                <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">Admin</Badge>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Password</p>
            <div className="bg-muted/50 border border-border rounded-xl p-4">
              <p className="text-sm font-medium mb-1">Managed via environment variables</p>
              <p className="text-xs text-muted-foreground">
                Update <code className="bg-muted px-1 py-0.5 rounded text-orange-400">SNS_PASSWORD</code> in Vercel → Environment Variables, then redeploy.
              </p>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="apikeys">
        <AdminApiKeysTab />
      </TabsContent>
    </Tabs>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function SettingsSheet({ open, onClose }: Props) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const clientId = session?.user?.clientId ?? "";
  const clientName = session?.user?.name ?? "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[420px] overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-bold">
            <div className="h-6 w-6 rounded-md bg-orange-500/10 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-orange-400" />
            </div>
            Settings
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4">
          {isAdmin ? (
            <AdminSettingsView />
          ) : (
            <Tabs defaultValue="account">
              <TabsList className="bg-muted border border-border h-8 mb-5 w-full">
                <TabsTrigger value="account" className="text-xs flex-1 gap-1">
                  <User className="h-3 w-3" /> Account
                </TabsTrigger>
                <TabsTrigger value="password" className="text-xs flex-1 gap-1">
                  <KeyRound className="h-3 w-3" /> Password
                </TabsTrigger>
                <TabsTrigger value="apikeys" className="text-xs flex-1 gap-1">
                  <Plug className="h-3 w-3" /> API Keys
                </TabsTrigger>
              </TabsList>

              <TabsContent value="account">
                <AccountTab clientId={clientId} initialName={clientName} />
              </TabsContent>
              <TabsContent value="password">
                <PasswordTab />
              </TabsContent>
              <TabsContent value="apikeys">
                <ApiKeysTab />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
