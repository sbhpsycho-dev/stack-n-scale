export type StaffMeta = {
  id: string;
  name: string;
  password: string; // hashed via hashPassword()
  createdAt: string;
};

export const STAFF_KV_KEY = "sns-staff-registry";
