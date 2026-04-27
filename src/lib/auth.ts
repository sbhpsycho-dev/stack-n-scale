import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { type ClientMeta, SEED_REGISTRY } from "@/lib/sales-data";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const pw = credentials?.password;
        if (!pw) return null;

        // Admin check first
        if (pw === process.env.SNS_PASSWORD) {
          return { id: "admin", name: "Evan", role: "admin", clientId: null };
        }

        // Client registry — read from dedicated sns-registry key first,
        // then fall back to embedded registry in admin SalesData, then SEED
        try {
          const { kv } = await import("@vercel/kv");
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
        token.role = (user as { role: "admin" | "client" }).role;
        token.clientId = (user as { clientId: string | null }).clientId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.clientId = token.clientId;
      return session;
    },
  },
};
