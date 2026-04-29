"use client";

import { useState, useEffect } from "react";
import { MessageThread } from "@/components/staff/message-thread";
import { type StudentChannel } from "@/lib/staff-types";
import { Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const [channels, setChannels] = useState<StudentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<StudentChannel | null>(null);

  useEffect(() => {
    fetch("/api/staff/messages")
      .then((r) => r.json())
      .then((data: StudentChannel[]) => {
        setChannels(data);
        if (data.length > 0) setActiveChannel(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Messages</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Discord student channels · {channels.length} connected</p>
      </div>

      {channels.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground mb-1">No Discord channels found</p>
          <p className="text-xs text-muted-foreground">Students need to connect their Discord accounts first</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
          <div className="flex h-full">
            {/* Channel list */}
            <div className="w-56 border-r border-border flex flex-col shrink-0">
              <p className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                Students
              </p>
              <div className="flex-1 overflow-y-auto py-1">
                {channels.map((ch) => (
                  <button
                    key={ch.channelId}
                    onClick={() => setActiveChannel(ch)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      activeChannel?.channelId === ch.channelId
                        ? "bg-orange-500/10"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-xs font-medium truncate", activeChannel?.channelId === ch.channelId ? "text-orange-400" : "text-foreground")}>
                        {ch.studentName ?? ch.email}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">#{ch.channelName ?? ch.channelId}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Message thread */}
            <div className="flex-1 min-w-0">
              {activeChannel ? (
                <MessageThread
                  key={activeChannel.channelId}
                  channelId={activeChannel.channelId}
                  channelName={activeChannel.channelName ?? activeChannel.channelId}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Select a student to view messages</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
