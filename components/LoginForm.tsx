"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wallet, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setMsg(
          "Account created. If email confirmation is on, check your inbox — otherwise you can sign in now."
        );
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-400 text-ink shadow-soft">
            <Wallet className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Household Finance</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "signin"
              ? "Sign in to your shared dashboard"
              : "Create your account"}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6 shadow-soft">
          {mode === "signup" && (
            <div>
              <label className="label mb-1.5 block">Full name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}
          <div>
            <label className="label mb-1.5 block">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          {err && (
            <p className="rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">
              {err}
            </p>
          )}
          {msg && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              {msg}
            </p>
          )}

          <button type="submit" className="btn-dark w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setErr(null);
              setMsg(null);
            }}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
