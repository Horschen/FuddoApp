// app/api/admin/logsHelper.ts
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

type AdminLogInput = {
  actor: string;
  action: string;
  details?: Record<string, any>;
};

export async function insertAdminLog(entry: AdminLogInput) {
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from("admin_logs").insert({
    actor: entry.actor,
    action: entry.action,
    details: entry.details ?? null,
  });

  if (error) {
    console.error("Kunde inte skriva admin_log:", error);
  }
}