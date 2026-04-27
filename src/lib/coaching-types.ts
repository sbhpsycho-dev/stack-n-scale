export type CoachingClient = {
  ghlContactId: string;
  name: string;
  email: string;
  phone?: string;
  status: CoachingStatus;
  createdAt: string;
  idVerification: "pending" | "submitted" | "approved" | "rejected";
  driveFolder: {
    url: string;
    id: string;
    idVerificationFolderId: string;
    onboardingFolderId: string;
    docs: Record<string, string>;
  } | null;
  activeDate?: string;
  coachAssigned?: string;
  rejectionReason?: string;
};

export type CoachingStatus =
  | "payment_received"
  | "id_pending"
  | "id_pending_review"
  | "id_verified"
  | "onboarding_form_sent"
  | "onboarding_complete"
  | "coach_assigned"
  | "kickoff_booked"
  | "active"
  | "alumni";

export const STATUS_LABELS: Record<CoachingStatus, string> = {
  payment_received: "Payment Received",
  id_pending: "ID Pending",
  id_pending_review: "ID Under Review",
  id_verified: "ID Verified",
  onboarding_form_sent: "Onboarding Sent",
  onboarding_complete: "Onboarding Done",
  coach_assigned: "Coach Assigned",
  kickoff_booked: "Kickoff Booked",
  active: "Active",
  alumni: "Alumni",
};

export const STATUS_ORDER: CoachingStatus[] = [
  "payment_received",
  "id_pending",
  "id_pending_review",
  "id_verified",
  "onboarding_form_sent",
  "onboarding_complete",
  "coach_assigned",
  "kickoff_booked",
  "active",
  "alumni",
];
