import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas.");
  return new TextEncoder().encode(secret);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function requireAdminOrSuperadmin(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k)
  );

  const token = cookies["admin_session"];
  if (!token) {
    return { ok: false as const, status: 401 as const, error: "Inte inloggad." };
  }

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const role = (payload.role as string) ?? "member";
    if (role !== "admin" && role !== "superadmin") {
      return { ok: false as const, status: 403 as const, error: "Saknar behörighet." };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 401 as const, error: "Ogiltig session." };
  }
}

function isUuid(v: any): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminOrSuperadmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!isUuid(sessionId) || !date) {
    return NextResponse.json(
      { error: "Saknar eller ogiltigt sessionId/date." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Hämta ALLA relevanta typer för pass+datum
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("id, member_id, type")
    .eq("session_id", sessionId)
    .eq("date", date)
    .in("type", ["regular", "extra", "instructor"]);

  if (error) {
    console.error("attendance/forSession error:", error);
    return NextResponse.json({ error: "Kunde inte hämta närvaro." }, { status: 500 });
  }

  // regular: memberId -> logId
  const regular: Record<string, string> = {};
  // extra: memberId -> [logId,...]
  const extra: Record<string, string[]> = {};
  // instructor: memberId -> logId
  const instructor: Record<string, string> = {};

  (data ?? []).forEach((r: any) => {
    if (!r?.member_id || !r?.id || !r?.type) return;

    if (r.type === "regular") {
      regular[r.member_id] = r.id;
    } else if (r.type === "extra") {
      extra[r.member_id] = extra[r.member_id] ?? [];
      extra[r.member_id].push(r.id);
    } else if (r.type === "instructor") {
      instructor[r.member_id] = r.id;
    }
  });

  return NextResponse.json({ regular, extra, instructor });
}