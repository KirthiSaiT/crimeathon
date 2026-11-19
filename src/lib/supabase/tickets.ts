"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/role-provider";
import { getSupabase } from "@/lib/supabase/client";

export interface Ticket {
  id: number;
  subject: string;
  body: string;
  created_by_email: string | null;
  created_at: string;
  secret_masked: boolean;
}
export interface TicketComment {
  id: number;
  ticket_id: number;
  body: string;
  created_by_email: string | null;
  created_at: string;
  secret_masked: boolean;
}
export interface SecretAlert {
  id: number;
  at: string;
  actor_email: string | null;
  action: "ticket.create" | "ticket.comment";
  ticket_id: number | null;
  patterns: string[];
  previews: string[];
  rotated_keys: string[];
  overridden: boolean;
  override_reason: string | null;
  status: "open" | "reviewed";
  reviewed_at: string | null;
}
// What the scanner said about a ticket or comment. The secret itself is never part of it.
export interface ScanResult {
  saved: boolean;
  blocked?: boolean;
  masked?: boolean;
  id?: number;
  patterns?: string[];
  previews?: string[];
  rotated?: string[];
}

const POLL_MS = 8000;
const friendly = (message: string) => (/row-level security|permission denied/i.test(message) ? "Your role does not allow this." : message);

// Tickets and their comments, refreshed every few seconds.
export function useTickets() {
  const { status, can } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || status !== "signed-in" || !can("view_case")) return;
    let live = true;
    const load = async () => {
      const [t, c] = await Promise.all([
        sb.from("support_tickets").select("id, subject, body, created_by_email, created_at, secret_masked").order("id", { ascending: false }).limit(50),
        sb.from("ticket_comments").select("id, ticket_id, body, created_by_email, created_at, secret_masked").order("id", { ascending: true }).limit(300),
      ]);
      if (!live) return;
      if (t.error || c.error) setError((t.error ?? c.error)!.message);
      else {
        setError(null);
        setTickets(t.data as Ticket[]);
        setComments(c.data as TicketComment[]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [status, can, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<{ result: ScanResult | null; error: string | null }> => {
      const sb = getSupabase();
      if (!sb) return { result: null, error: "The database is not configured." };
      const { data, error: failure } = await sb.rpc(fn, args);
      if (failure) return { result: null, error: friendly(failure.message) };
      reload();
      return { result: data as ScanResult, error: null };
    },
    [reload],
  );

  return {
    tickets,
    comments,
    error,
    reload,
    raise: (subject: string, body: string, overrideReason?: string) => call("raise_ticket", { p_subject: subject, p_body: body, p_override_reason: overrideReason || null }),
    comment: (ticketId: number, body: string, overrideReason?: string) => call("add_ticket_comment", { p_ticket_id: ticketId, p_body: body, p_override_reason: overrideReason || null }),
  };
}

// Alerts for administrators: someone tried to put a secret into a ticket.
export function useSecretAlerts() {
  const { status, can } = useAuth();
  const allowed = status === "signed-in" && can("review_secret_alerts");
  const [alerts, setAlerts] = useState<SecretAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !allowed) return;
    let live = true;
    const load = async () => {
      const r = await sb
        .from("secret_alerts")
        .select("id, at, actor_email, action, ticket_id, patterns, previews, rotated_keys, overridden, override_reason, status, reviewed_at")
        .order("at", { ascending: false })
        .limit(50);
      if (!live) return;
      if (r.error) setError(r.error.message);
      else {
        setError(null);
        setAlerts(r.data as SecretAlert[]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [allowed, attempt]);

  const review = useCallback(async (id: number, note: string) => {
    const sb = getSupabase();
    if (!sb) return "The database is not configured.";
    const { error: failure } = await sb.rpc("review_secret_alert", { p_id: id, p_note: note || null });
    if (failure) return friendly(failure.message);
    setAttempt((n) => n + 1);
    return null;
  }, []);

  return { alerts, error, allowed, review };
}

// How many alerts are still open, for the badge in the sidebar. Only administrators can see them.
export function useOpenSecretAlerts() {
  const { status, can } = useAuth();
  const allowed = status === "signed-in" && can("review_secret_alerts");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !allowed) return;
    let live = true;
    const load = async () => {
      const r = await sb.from("secret_alerts").select("id", { count: "exact", head: true }).eq("status", "open");
      if (live && !r.error) setCount(r.count ?? 0);
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [allowed]);

  return allowed ? count : 0;
}
