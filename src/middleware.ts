import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

const authMiddleware = withAuth({
  pages: { signIn: "/login" },
});

export function middleware(request: NextRequest) {
  return (authMiddleware as (req: NextRequest) => Response)(request);
}

export const config = {
  matcher: ["/((?!api/auth|api/data|login|_next/static|_next/image|favicon.ico).*)"],
};
