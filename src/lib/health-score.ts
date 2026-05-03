export interface CheckInRecord {
  studentName: string;
  programWeek: string;
  satisfactionScore: number;
  hoursThisWeek: string;
  goalsCompleted: string;
  couldDoBetter: string;
  submittedAt: string;
  healthScore: number;
}

const activityMap: Record<string, number> = {
  "Less than 2": 2,
  "2-5":  5,
  "5-10": 8,
  "10+":  10,
};

const completionMap: Record<string, number> = {
  "Yes all of them": 10,
  "Most of them":    7,
  "Some of them":    4,
  "No":              1,
};

export function calculateHealthScore(payload: {
  satisfactionScore: string | number;
  hoursWorked: string;
  goalsCompleted: string;
}): number {
  const sat        = Number(payload.satisfactionScore);
  const satScore   = sat * 0.6;
  const actScore   = ((activityMap[payload.hoursWorked] ?? 2) / 10) * 2;
  const compScore  = ((completionMap[payload.goalsCompleted] ?? 1) / 10) * 2;
  return Math.round(satScore + actScore + compScore);
}
