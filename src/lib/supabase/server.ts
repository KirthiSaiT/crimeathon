import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type Access = { ok: true } | { ok: false; status: 401 | 403; message: string };

// Who may read the case data. Without a database the app stays open, as it was before sign-in existed.
// A visitor who is not signed in may read only when REQUIRE_SIGN_IN=false (the default is that sign-in is required). A signed-in account needs the
// view_case permission, which the vendor role does not have.
export async function authorizeCase(): Promise<Access> {
  if (!url || !key) return { ok: true };
  const store = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return process.env.REQUIRE_SIGN_IN !== "false" ?{ ok: false, status: 401, message: "Sign in to read the case data." } : { ok: true };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile) return { ok: false, status: 403, message: "Your account has no role yet." };
  const { data: permission } = await supabase.from("role_permissions").select("permission").eq("role", profile.role).eq("permission", "view_case").maybeSingle();
  return permission ? { ok: true } : { ok: false, status: 403, message: "Your account does not have access to the case data." };
}
