export type StaffCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  source: "google" | "outlook";
  description?: string;
  location?: string;
};

export type StaffNotification = {
  id: string;
  message: string;
  link?: string;
  createdAt: string;
  read: boolean;
  type: "student_update" | "form_submission" | "doc_uploaded" | "general";
};

export type DiscordMessage = {
  id: string;
  content: string;
  author: string;
  authorAvatar?: string;
  timestamp: string;
};

export type StudentChannel = {
  email: string;
  channelId: string;
  channelName?: string;
  studentName?: string;
};
