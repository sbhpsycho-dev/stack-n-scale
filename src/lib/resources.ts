import type { BusinessType } from "@/lib/dashboard-config";

export type ResourceType = "sop" | "training" | "tool" | "template";

export type Resource = {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  type: ResourceType;
  businessTypes: BusinessType[];
  createdAt: string;
};
