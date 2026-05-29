"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/ui/live-dot";
import { KpiSparkline } from "@/components/biz/kpi-sparkline";
import {
  type BizClient,
  type KpiEntry,
  BIZ_STATUS_COLORS,
  BIZ_STATUS_LABELS,
} from "@/lib/biz-client-types";
import { cn } from "@/lib/utils";
import { Loader2, LogOut, Users } from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

export default function ClientPortalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [client, setClient] = useState<BizClient | null>(null);
  const [kpiData, setKpiData] = useState<Record<string, KpiEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/client-portal/login"); return; }
    if (session.user.role !== "biz_client") {
      // Redirect other roles to their home
      if (session.user.role === "admin") router.replace("/");
      else router.replace("/staff");
    }
  }, [session, status, router]);

  const clientId = session?.user?.clientId;

  const load = useCallback(async (isInitial = false) => {
    if (!clientId) return;
    try {
      const [clientRes] = await Promise.all([
        fetch(`/api/manage-clients/${clientId}`),
      ]);
      if (clientRes.ok) {
        const clientData: BizClient = await clientRes.json();
        setClient(clientData);

        // Load KPIs for all team members
        if (clientData.teamMembers?.length) {
          const memberIds = clientData.teamMembers.map((m) => m.id).join(",");
          const kpiRes = await fetch(
            `/api/manage-clients/${clientId}/kpi?memberIds=${memberIds}&days=7`
          );
          if (kpiRes.ok) {
            setKpiData(await kpiRes.json());
          }
        }
        setLastUpdated(new Date());
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    load(true);
    const id = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, clientId]);

  if (status === "loading" || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!client) {
    return <p className="text-sm text-muted-foreground text-center py-16">Unable to load your portal. Please try again.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={cn("text-[10px]", BIZ_STATUS_COLORS[client.status])}>
              {BIZ_STATUS_LABELS[client.status]}
            </Badge>
            <LiveDot lastUpdated={lastUpdated} />
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/client-portal/login" })}
          className="h-8 px-3 rounded-lg bg-muted text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 hover:bg-muted/80 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      {/* Account info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2.5">
            <h2 className="text-sm font-semibold">Account Info</h2>
            {[
              { label: "Contact", value: client.contactName || "—" },
              { label: "Email", value: client.contactEmail || "—" },
              { label: "Start Date", value: client.startDate ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {client.services && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-semibold">Services</h2>
              <p className="text-xs text-foreground leading-relaxed">{client.services}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Team KPIs */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-orange-500" />
          Team Performance
        </h2>

        {(client.teamMembers ?? []).length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <p className="text-xs text-muted-foreground">No team members configured yet. Your account manager will set this up.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {client.teamMembers.map((member) => {
              const memberEntries = kpiData[member.id] ?? [];

              return (
                <Card key={member.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{member.name}</p>
                        <Badge className="text-[9px] mt-0.5 bg-muted text-muted-foreground border-border">{member.role}</Badge>
                      </div>
                    </div>

                    {member.kpis.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No KPIs configured for this member.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {member.kpis.map((kpi) => (
                          <KpiSparkline
                            key={kpi.key}
                            label={kpi.label}
                            unit={kpi.unit}
                            kpiKey={kpi.key}
                            entries={memberEntries.filter((e) => kpi.key in e.values)}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground pt-4 border-t border-border">
        Data refreshes every 30 seconds · Managed by Stack N Scale
      </p>
    </div>
  );
}
