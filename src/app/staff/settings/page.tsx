"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, KeyRound, Check, X } from "lucide-react";

export default function StaffSettingsPage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (newPassword !== confirmPassword) {
      setMsg({ text: "New passwords do not match", ok: false });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ text: "Password must be at least 6 characters", ok: false });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/staff/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setMsg({ text: "Password updated successfully", ok: true });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setMsg({ text: data.error ?? "Failed to update password", ok: false });
      }
    } catch {
      setMsg({ text: "Network error — please try again", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Logged in as <span className="text-foreground font-medium">{session?.user?.name}</span>
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-orange-400" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Current Password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="h-9 text-sm bg-muted border-border"
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="h-9 text-sm bg-muted border-border"
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-9 text-sm bg-muted border-border"
                placeholder="Repeat new password"
              />
            </div>

            {msg && (
              <div className={`flex items-center gap-1.5 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {msg.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              className="h-9 px-5 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update Password
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
