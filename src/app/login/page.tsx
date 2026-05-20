"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken ?? ""));
  }, []);

  useEffect(() => {
    if (searchParams.get("error")) setError("Incorrect password. Try again.");
  }, [searchParams]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/callback/credentials";

    [
      { name: "csrfToken", value: csrfToken },
      { name: "callbackUrl", value: "/" },
      { name: "password", value: password },
    ].forEach(({ name, value }) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <Image src="/logo.png" alt="Stack N Scale" width={56} height={56} className="object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Stack N Scale</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Sales Pipeline Dashboard</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pr-10 bg-muted border-border h-10"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 text-center"
              >
                {error}
              </motion.p>
            )}

            <Button
              type="submit"
              disabled={loading || !password || !csrfToken}
              className="h-10 font-semibold bg-orange-500 hover:bg-orange-600 text-white mt-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            Forgot your password?{" "}
            <a href="mailto:evan@stacknscale.co" className="text-orange-400 hover:text-orange-300 underline-offset-2 hover:underline">
              Contact your admin
            </a>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Stack N Scale · Internal use only
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
