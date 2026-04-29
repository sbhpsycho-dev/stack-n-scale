"use client";

import { useState, useEffect } from "react";
import { type Resource, type ResourceType } from "@/lib/resources";
import { ExternalLink, Trash2, Plus, BookOpen, Wrench, FileText, Video, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const TYPE_ICONS: Record<ResourceType, React.ElementType> = {
  sop:      FileText,
  training: Video,
  tool:     Wrench,
  template: BookOpen,
};

const TYPE_COLORS: Record<ResourceType, string> = {
  sop:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  training: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  tool:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  template: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const RESOURCE_TYPES: ResourceType[] = ["sop", "training", "tool", "template"];
const TYPE_LABELS: Record<ResourceType, string> = {
  sop: "SOP", training: "Training", tool: "Tool", template: "Template",
};

const BLANK_FORM = { title: "", description: "", url: "", category: "", type: "tool" as ResourceType };

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResourceType | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/resources");
    if (res.ok) setResources(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.title || !form.url) return;
    setSaving(true);
    const body: Omit<Resource, "id" | "createdAt"> = {
      ...form,
      businessTypes: [],
    };
    await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setForm(BLANK_FORM);
    setShowAdd(false);
    await load();
    setSaving(false);
  }

  async function remove(id: string) {
    setDeleting(id);
    await fetch("/api/resources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setResources((prev) => prev.filter((r) => r.id !== id));
    setDeleting(null);
  }

  const filtered = resources.filter((r) => filter === "all" || r.type === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Resource Hub</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} resource{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd((o) => !o)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Resource
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card border border-border rounded-xl p-4 overflow-hidden"
          >
            <h2 className="text-sm font-semibold mb-3">New Resource</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Title *</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" placeholder="Resource title" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">URL *</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" placeholder="https://…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" placeholder="e.g. Onboarding" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ResourceType }))}
                  className="w-full h-8 px-2.5 text-xs bg-muted border border-border rounded-lg text-foreground"
                >
                  {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" placeholder="Short description" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={add} disabled={!form.title || !form.url || saving}
                className="h-8 px-4 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Save
              </button>
              <button onClick={() => { setShowAdd(false); setForm(BLANK_FORM); }}
                className="h-8 px-4 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70 transition-colors">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {(["all", ...RESOURCE_TYPES] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "h-7 px-3 rounded-lg text-xs font-medium transition-colors",
              filter === t ? "bg-orange-500/10 text-orange-400" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No resources yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => {
            const Icon = TYPE_ICONS[r.type];
            return (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2.5 group hover:border-orange-500/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-semibold truncate">{r.title}</p>
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", TYPE_COLORS[r.type])}>{TYPE_LABELS[r.type]}</Badge>
                </div>
                {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                {r.category && <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{r.category}</p>}
                <div className="flex items-center justify-between mt-auto pt-1">
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => remove(r.id)}
                    disabled={deleting === r.id}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {deleting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
