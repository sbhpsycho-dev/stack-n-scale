"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { type DiscordMessage } from "@/lib/staff-types";
import { cn } from "@/lib/utils";

interface Props {
  channelId: string;
  channelName: string;
}

export function MessageThread({ channelId, channelName }: Props) {
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/staff/messages?channelId=${channelId}`);
      if (res.ok) {
        const data = await res.json() as DiscordMessage[];
        setMessages(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/staff/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, content }),
      });
      setContent("");
      await load();
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <p className="text-sm font-semibold"># {channelName}</p>
        <p className="text-[11px] text-muted-foreground">Discord private channel</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No messages yet</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2.5">
            {m.authorAvatar ? (
              <img src={m.authorAvatar} alt={m.author} className="h-7 w-7 rounded-full shrink-0" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {m.author[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold">{m.author}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-foreground/90 mt-0.5 break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Message #${channelName}…`}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={send}
            disabled={!content.trim() || sending}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-md transition-colors shrink-0",
              content.trim() && !sending
                ? "bg-orange-500 text-white hover:bg-orange-600"
                : "text-muted-foreground cursor-not-allowed"
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
