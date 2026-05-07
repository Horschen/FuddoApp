// app/api/admin/logs/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  }
  return new TextEncoder().encode(secret);
}

async function getSessionRoleFromRequest(req: Request): Promise<
  "member" | "admin" | "superadmin" | "none"
> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k)
  );

  const token = cookies["admin_session"];
  if (!token) return "none";

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string | undefined;
    if (role === "superadmin" || role === "admin" || role === "member") {
      return role;
    }
    return "none";
  } catch {
    return "none";
  }
}

export async function GET(request: Request) {
  try {
    const role = await getSessionRoleFromRequest(request);
    if (role !== "superadmin") {
      return NextResponse.json(
        { error: "Endast SuperAdmin får se loggar." },
        { status: 403 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("admin_logs")
      .select("id, created_at, actor, action, details")
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) {
      console.error("Fel vid hämtning av admin_logs:", error);
      return NextResponse.json(
        { error: "Kunde inte hämta loggar." },
        { status: 500 }
      );
    }

    return NextResponse.json({ logs: data ?? [], limit: 10000 });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/logs:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}