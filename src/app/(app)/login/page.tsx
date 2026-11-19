"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Callout, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleLabel, useAuth } from "@/components/role-provider";

function LoginView() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">(useSearchParams().get("mode") === "up" ? "up" : "in");
  const { status, user, role, configured, idleSignedOut, signIn, signUp, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "in") {
      const message = await signIn(email.trim(), password);
      if (message) setError(message);
      else router.push("/overview");
    } else {
      const result = await signUp(email.trim(), password);
      if (result.error) setError(result.error);
      else if (result.needsConfirmation) setNotice("Account created. Check your email for a confirmation link, then sign in.");
      else router.push("/overview");
    }
    setBusy(false);
  };

  return (
    <PageShell icon={LogIn} title={mode === "up" ? "Create an account" : "Sign in"} lead="Signing in lets you save runs, review alerts and, as an approver, release a held bank change. Without it you can read everything.">
      {!configured ? (
        <Callout icon={LogIn}>
          <p>The database is not configured, so sign-in is off. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).</p>
        </Callout>
      ) : status === "signed-in" && user ? (
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-sm">
            Signed in as <span className="font-mono">{user.email}</span> with the role <span className="font-medium">{roleLabel[role]}</span>.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => router.push("/overview")}>Go to the overview</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
          {role === "viewer" ? <p className="text-sm text-[var(--ink-tertiary)]">New accounts start as viewers. An administrator gives you a wider role on the Access page.</p> : null}
          {role === "vendor" ? <p className="text-sm text-[var(--ink-tertiary)]">Vendor accounts do not see the case data.</p> : null}
        </div>
      ) : (
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            Email
            <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Password
            <Input name="password" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {idleSignedOut ? <p className="text-sm text-[var(--ink-secondary)]">You were signed out after a period of inactivity.</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--tp)]">
              {error}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-[var(--fp)]">{notice}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !email || !password || (mode === "up" && password.length < 6)}>
              {busy ? "Working" : mode === "up" ? "Create account" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode(mode === "up" ? "in" : "up");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "up" ? "I already have an account" : "Create an account"}
            </Button>
          </div>
        </form>
      )}
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
