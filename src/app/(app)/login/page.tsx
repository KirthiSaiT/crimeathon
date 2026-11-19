"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Callout, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleLabel, useAuth } from "@/components/role-provider";

function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "up" ? "up" : "in");
  // Where to go after signing in: the page the visitor asked for, if it is a page of this app.
  const asked = params.get("next");
  const after = asked && asked.startsWith("/") && !asked.startsWith("//") && !asked.startsWith("/login") ? asked : "/overview";
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
      else router.push(after);
    } else {
      const result = await signUp(email.trim(), password);
      if (result.error) setError(result.error);
      else if (result.needsConfirmation) setNotice("Account created. Check your email for a confirmation link, then sign in.");
      else router.push(after);
    }
    setBusy(false);
  };

  // Signed out: a centred sign-in card, no sidebar and no duplicate sign-in buttons.
  if (configured && !(status === "signed-in" && user)) {
    const up = mode === "up";
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-(--gutter) py-12">
        <div className="flex flex-col gap-3">
          <Link href="/" className="w-fit font-medium underline-offset-4 hover:underline">
            Warden
          </Link>
          <h1 className="mt-4">{up ? "Create an account" : "Sign in"}</h1>
          <p className="lead text-[var(--ink-secondary)]">
            {up ? "New accounts start as viewers. An administrator gives you a wider role." : "Your role decides what you can do: read, request a release, approve a held bank change, or manage keys."}
          </p>
        </div>
        <form
          className="flex flex-col gap-5 border-t-2 border-[var(--ink)] pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            Email
            <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Password
            <Input name="password" type="password" autoComplete={up ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
            {up ? <span className="text-[var(--ink-tertiary)]">At least 6 characters.</span> : null}
          </label>
          {idleSignedOut ? <p className="text-sm text-[var(--ink-secondary)]">You were signed out after a period of inactivity.</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--tp)]">
              {error}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-[var(--fp)]">{notice}</p> : null}
          <Button type="submit" className="h-10 w-full" disabled={busy || !email || !password || (up && password.length < 6)}>
            {busy ? "Working" : up ? "Create account" : "Sign in"}
          </Button>
          <p className="text-sm text-[var(--ink-secondary)]">
            {up ? "Already have an account? " : "New here? "}
            <button
              type="button"
              className="font-medium text-[var(--ink)] underline underline-offset-4"
              disabled={busy}
              onClick={() => {
                setMode(up ? "in" : "up");
                setError(null);
                setNotice(null);
              }}
            >
              {up ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
      </div>
    );
  }

  return (
    <PageShell icon={LogIn} title="Sign in" lead="Warden is for signed-in people. Your role decides what you can do: read, request a release, approve a held bank change, or manage keys.">
      {!configured ? (
        <Callout icon={LogIn}>
          <p>The database is not configured, so sign-in is off. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).</p>
        </Callout>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-sm">
            Signed in as <span className="font-mono">{user?.email}</span> with the role <span className="font-medium">{roleLabel[role]}</span>.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => router.push(after)}>{after === "/overview" ? "Go to the overview" : "Continue"}</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
          {role === "viewer" ? <p className="text-sm text-[var(--ink-tertiary)]">New accounts start as viewers. An administrator gives you a wider role on the Access page.</p> : null}
          {role === "vendor" ? <p className="text-sm text-[var(--ink-tertiary)]">Vendor accounts do not see the case data.</p> : null}
        </div>
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
