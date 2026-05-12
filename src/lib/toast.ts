import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

export function toast(title: string, opts?: { description?: string; type?: string }) {
  toastManager.add({ title, description: opts?.description, type: opts?.type ?? "success" });
}

export function toastError(title: string, description?: string) {
  toastManager.add({ title, description, type: "error" });
}
