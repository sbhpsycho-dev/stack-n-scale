export type LeadState =
  | "opted_in"
  | "contacted"
  | "call_booked"
  | "showed"
  | "closed"
  | "no_show"
  | "not_booked"
  | "never_reached";

export interface LeadContact {
  type: "sms" | "call" | "email";
  touchNumber: number;
  sentAt: string;
  message?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: "fanbasis" | "stripe";
  state: LeadState;
  createdAt: string;
  updatedAt: string;
  contactHistory: LeadContact[];
  callUrl?: string;
  notes?: string;
}
