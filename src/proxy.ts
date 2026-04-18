import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

const authMiddleware = withAuth({
  pages: { signIn: "/login" },
});

export function proxy(request: NextRequest) {
  return (authMiddleware as (req: NextRequest) => Response)(request);
}

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
