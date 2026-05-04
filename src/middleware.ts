import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

// Routes that bypass auth — each handles its own auth internally
// (CRON_SECRET, webhook signatures, CORS, public onboarding forms)
export const config = {
  matcher: [
    "/((?!api/auth|api/data|api/webhooks|api/cron|api/agents|api/onboarding/form|api/onboarding/id-submit|login|onboarding|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp|jpg|jpeg)$).*)",
  ],
};
