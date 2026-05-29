import type { ReactNode } from "react";
import Image from "next/image";

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Stack N Scale" width={28} height={28} className="object-contain" />
            <div>
              <span className="font-bold text-sm tracking-wide">Client Portal</span>
              <span className="ml-2 text-[10px] text-muted-foreground">Powered by Stack N Scale</span>
            </div>
          </div>
          {/* Sign-out handled inside page to access session */}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
