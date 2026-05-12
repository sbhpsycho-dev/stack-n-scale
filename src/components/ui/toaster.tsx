"use client";

import { Toast } from "@base-ui/react/toast";
import { toastManager } from "@/lib/toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Viewport className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 outline-none">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          toast={t}
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
            "bg-card text-foreground transition-all duration-200",
            "data-starting-style:translate-x-4 data-starting-style:opacity-0",
            "data-ending-style:translate-x-4 data-ending-style:opacity-0",
            t.type === "error"
              ? "border-red-500/30 bg-red-950/60"
              : "border-border"
          )}
        >
          <div className="flex-1 min-w-0">
            <Toast.Title className="font-semibold text-xs leading-snug" />
            {t.description && (
              <Toast.Description className="text-xs text-muted-foreground mt-0.5" />
            )}
          </div>
          <Toast.Close className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
            <X className="h-3.5 w-3.5" />
          </Toast.Close>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} timeout={3500}>
      <ToastList />
    </Toast.Provider>
  );
}
