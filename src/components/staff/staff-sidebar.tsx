"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Calendar, Users, BookOpen, MessageSquare, BarChart2, ArrowLeft, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

const NAV_ITEMS = [
  { href: "/staff/calendar",  label: "Calendar",  icon: Calendar },
  { href: "/staff/students",  label: "Students",  icon: Users },
  { href: "/staff/resources", label: "Resources", icon: BookOpen },
  { href: "/staff/messages",  label: "Messages",  icon: MessageSquare },
  { href: "/staff/insights",  label: "Insights",  icon: BarChart2 },
];

export function StaffSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-56 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Stack N Scale" className="h-7 w-7 object-contain" />
          <span className="text-xs font-bold tracking-wide uppercase text-orange-400">Staff</span>
        </div>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-orange-500/10 text-orange-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom links */}
      <div className="p-3 border-t border-border shrink-0 space-y-1">
        {/* Settings — only for staff (not admin, who has no staff password to change) */}
        {!isAdmin && (
          <Link
            href="/staff/settings"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              pathname === "/staff/settings"
                ? "bg-orange-500/10 text-orange-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            Settings
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Back to Admin
          </Link>
        )}
      </div>
    </aside>
  );
}
