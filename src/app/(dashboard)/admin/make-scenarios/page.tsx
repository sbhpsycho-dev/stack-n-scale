"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Copy, Check, Play, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupResult {
  scenario: string;
  envVar: string;
  webhookUrl: string | null;
  scenarioId: number | null;
  status: "created" | "existing" | "error";
  error?: string;
}

interface TestResult {
  scenario: string;
  envVar: string;
  webhookUrl: string | null;
  status: "ok" | "error" | "timeout" | "not_configured";
  httpStatus: number | null;
  latencyMs: number | null;
  error?: string;
}

interface SetupResponse {
  results: SetupResult[];
  summary: { created: number; existing: number; errors: number };
  envSnippet: string | null;
  nextSteps: string[];
}

interface TestResponse {
  results: TestResult[];
  summary: { ok: number; error: number; timeout: number; not_configured: number };
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function SetupBadge({ status }: { status: SetupResult["status"] }) {
  if (status === "created")  return <Badge className="bg-green-600 text-white">Created</Badge>;
  if (status === "existing") return <Badge className="bg-blue-600 text-white">Existing</Badge>;
  return <Badge className="bg-red-600 text-white">Error</Badge>;
}

function TestBadge({ result }: { result: TestResult }) {
  if (result.status === "ok")
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm font-medium">
        <CheckCircle className="w-4 h-4" /> OK {result.httpStatus} ({result.latencyMs}ms)
      </span>
    );
  if (result.status === "not_configured")
    return (
      <span className="flex items-center gap-1 text-zinc-500 text-sm">
        <AlertTriangle className="w-4 h-4" /> Not configured
      </span>
    );
  if (result.status === "timeout")
    return (
      <span className="flex items-center gap-1 text-yellow-400 text-sm">
        <AlertTriangle className="w-4 h-4" /> Timeout
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-red-400 text-sm">
      <XCircle className="w-4 h-4" /> Error {result.httpStatus ?? ""}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MakeScenariosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [setupData,    setSetupData]    = useState<SetupResponse | null>(null);
  const [testData,     setTestData]     = useState<TestResponse | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [testLoading,  setTestLoading]  = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [setupError,   setSetupError]   = useState<string | null>(null);
  const [testError,    setTestError]    = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (session?.user?.role !== "admin") router.replace("/");
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (status !== "authenticated" || session?.user?.role !== "admin") return null;

  async function runSetup() {
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/admin/make-setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSetupError(data.error ?? "Setup failed");
        if (data.instructions) setSetupError(
          data.error + "\n\n" + (data.instructions as string[]).join("\n")
        );
      } else {
        setSetupData(data);
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSetupLoading(false);
    }
  }

  async function runTest() {
    setTestLoading(true);
    setTestError(null);
    try {
      const res = await fetch("/api/admin/make-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error ?? "Test failed");
      } else {
        setTestData(data);
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Network error");
    } finally {
      setTestLoading(false);
    }
  }

  async function copySnippet(snippet: string) {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push("/admin")}
        className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Admin
      </button>

      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Zap className="w-6 h-6 text-purple-400" /> Make.com Scenarios
      </h1>
      <p className="text-zinc-400 text-sm mb-8">
        Auto-create stub webhook scenarios in Make.com, then live-test all configured endpoints.
      </p>

      {/* ── Section 1: Setup ─────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" /> Create Missing Scenarios
          </CardTitle>
          <p className="text-zinc-500 text-xs">
            Calls Make.com API to create a stub webhook scenario for each unconfigured env var.
            Requires <code className="text-purple-300">MAKE_API_KEY</code> and{" "}
            <code className="text-purple-300">MAKE_TEAM_ID</code> in your environment.
          </p>
        </CardHeader>
        <CardContent>
          <button
            onClick={runSetup}
            disabled={setupLoading}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mb-4"
          >
            {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {setupLoading ? "Creating scenarios…" : "Create missing scenarios"}
          </button>

          {setupError && (
            <pre className="text-red-400 text-xs bg-red-950/30 border border-red-900 rounded p-3 whitespace-pre-wrap mb-4">
              {setupError}
            </pre>
          )}

          {setupData && (
            <>
              {/* Summary badges */}
              <div className="flex gap-3 mb-4 flex-wrap">
                {setupData.summary.created > 0 && (
                  <span className="text-green-400 text-sm font-medium">
                    ✅ {setupData.summary.created} created
                  </span>
                )}
                {setupData.summary.existing > 0 && (
                  <span className="text-blue-400 text-sm font-medium">
                    🔵 {setupData.summary.existing} existing
                  </span>
                )}
                {setupData.summary.errors > 0 && (
                  <span className="text-red-400 text-sm font-medium">
                    ❌ {setupData.summary.errors} errors
                  </span>
                )}
              </div>

              {/* Results table */}
              <div className="rounded border border-zinc-800 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-800 text-zinc-400">
                      <th className="text-left px-3 py-2">Scenario</th>
                      <th className="text-left px-3 py-2">Env Var</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Webhook URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setupData.results.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="px-3 py-2 text-zinc-200">{r.scenario}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-400">{r.envVar}</td>
                        <td className="px-3 py-2"><SetupBadge status={r.status} /></td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          {r.webhookUrl ? (
                            <span className="font-mono text-xs text-zinc-400 truncate block max-w-xs">
                              {r.webhookUrl}
                            </span>
                          ) : r.error ? (
                            <span className="text-red-400 text-xs">{r.error}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* .env snippet */}
              {setupData.envSnippet && (
                <div className="bg-zinc-950 border border-zinc-700 rounded p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">
                      Paste into .env.local + Vercel dashboard:
                    </span>
                    <button
                      onClick={() => copySnippet(setupData.envSnippet!)}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-green-400 text-xs whitespace-pre-wrap font-mono">
                    {setupData.envSnippet}
                  </pre>
                </div>
              )}

              {/* Next steps */}
              {setupData.nextSteps && (
                <ol className="text-zinc-400 text-xs space-y-1">
                  {setupData.nextSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Live Test ─────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4 text-green-400" /> Live Test All Webhooks
          </CardTitle>
          <p className="text-zinc-500 text-xs">
            Fires a sample payload to every configured Make.com webhook URL and reports HTTP status + latency.
            Payloads include <code className="text-yellow-300">_test: true</code> so Make.com can filter them.
          </p>
        </CardHeader>
        <CardContent>
          <button
            onClick={runTest}
            disabled={testLoading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mb-4"
          >
            {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {testLoading ? "Testing webhooks…" : "Test all webhooks"}
          </button>

          {testError && (
            <p className="text-red-400 text-xs mb-4">{testError}</p>
          )}

          {testData && (
            <>
              {/* Summary */}
              <div className="flex gap-4 mb-4 flex-wrap">
                <span className="text-green-400 text-sm font-medium">✅ {testData.summary.ok} ok</span>
                {testData.summary.error > 0 && (
                  <span className="text-red-400 text-sm font-medium">❌ {testData.summary.error} error</span>
                )}
                {testData.summary.timeout > 0 && (
                  <span className="text-yellow-400 text-sm font-medium">⏱ {testData.summary.timeout} timeout</span>
                )}
                <span className="text-zinc-500 text-sm">
                  ⚪ {testData.summary.not_configured} not configured
                </span>
              </div>

              {/* Results */}
              <div className="rounded border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-800 text-zinc-400">
                      <th className="text-left px-3 py-2">Scenario</th>
                      <th className="text-left px-3 py-2">Env Var</th>
                      <th className="text-left px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testData.results.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="px-3 py-2 text-zinc-200">{r.scenario}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-400">{r.envVar}</td>
                        <td className="px-3 py-2"><TestBadge result={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-zinc-600 text-xs mt-3">
                Check your Make.com dashboard → each scenario&apos;s execution history to see the received payloads.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
