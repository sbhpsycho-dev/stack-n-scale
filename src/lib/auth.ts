import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { type ClientMeta, SEED_REGISTRY } from "@/lib/sales-data";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";
import { verifyPassword } from "@/lib/password";
import { type BizClient } from "@/lib/biz-client-types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const pw = credentials?.password;
        const username = credentials?.username?.trim();
        if (!pw) return null;

        // Biz client portal login — username + password
        if (username) {
          try {
            const { kv } = await import("@vercel/kv");
            const bizClients = await kv.get<BizClient[]>("sns:biz-clients") ?? [];
            const bizClient = bizClients.find(
              (c) => c.portalUsername === username && c.portalPasswordHash && verifyPassword(pw, c.portalPasswordHash)
            );
            if (bizClient) {
              return { id: bizClient.id, name: bizClient.name, role: "biz_client", clientId: bizClient.id };
            }
          } catch { /* fall through */ }
          return null;
        }

        // Admin check — requires ADMIN_PASSWORD_HASH (bcrypt hash of admin password)
        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        const isAdmin = adminHash ? verifyPassword(pw, adminHash) : false;
        if (isAdmin) {
          return { id: "admin", name: process.env.ADMIN_NAME ?? "Evan", role: "admin", clientId: null };
        }

        try {
          const { kv } = await import("@vercel/kv");

          // Staff registry check
          const staffRegistry = await kv.get<StaffMeta[]>(STAFF_KV_KEY);
          if (staffRegistry) {
            const staff = staffRegistry.find((s) => verifyPassword(pw, s.password));
            if (staff) {
              const role = staff.role === "sales_exec" ? "sales_exec" : staff.role === "executive" ? "executive" : "staff";
              return { id: staff.id, name: staff.name, role, clientId: staff.id, sheetId: staff.sheetId ?? null };
            }
          }

          // Client registry — read from dedicated sns-registry key first,
          // then fall back to embedded registry in admin SalesData, then SEED
          const dedicated = await kv.get<ClientMeta[]>("sns-registry");
          const adminData = await kv.get<{ clientRegistry?: ClientMeta[] }>("sns-dashboard-v1");
          const registry = dedicated ?? adminData?.clientRegistry ?? SEED_REGISTRY;
          const client = registry.find((c) => verifyPassword(pw, c.password));
          if (client) {
            return { id: client.id, name: client.name, role: "client", clientId: client.id };
          }
        } catch {
          // KV unavailable — fall back to seed registry
          const client = SEED_REGISTRY.find((c) => verifyPassword(pw, c.password));
          if (client) {
            return { id: client.id, name: client.name, role: "client", clientId: client.id };
          }
        }

        return null;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role     = (user as { role: "admin" | "client" | "staff" | "biz_client" | "sales_exec" }).role;
        token.clientId = (user as { clientId: string | null }).clientId;
        token.sheetId  = (user as { sheetId?: string | null }).sheetId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role     = token.role;
      session.user.clientId = token.clientId;
      session.user.sheetId  = token.sheetId ?? null;
      return session;
    },
  },
};
