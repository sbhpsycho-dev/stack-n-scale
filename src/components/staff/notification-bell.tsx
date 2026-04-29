"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { type StaffNotification } from "@/lib/staff-types";

export function NotificationBell() {
  const [notifs, setNotifs] = useState<StaffNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/staff/notifications");
        if (res.ok) setNotifs(await res.json());
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  async function markAllRead() {
    await fetch("/api/staff/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifs([]);
    setOpen(false);
  }

  async function dismiss(id: string) {
    await fetch("/api/staff/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-orange-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-72 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">Notifications</span>
              {notifs.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No notifications</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-border">
                {notifs.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => setOpen(false)}
                          className="text-xs text-foreground hover:text-orange-400 line-clamp-2"
                        >
                          {n.message}
                        </Link>
                      ) : (
                        <p className="text-xs text-foreground line-clamp-2">{n.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => dismiss(n.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
