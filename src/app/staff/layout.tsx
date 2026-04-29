"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StaffSidebar } from "@/components/staff/staff-sidebar";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && session.user.role === "client") router.replace("/");
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const role = session?.user?.role;
  if (status !== "authenticated" || (role !== "admin" && role !== "staff")) return null;

  return (
    <div className="min-h-screen bg-background">
      <StaffSidebar />
      <main className="pl-56">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
