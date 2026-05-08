// app/api/admin/training/sessions/delete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET saknas.");
  return new TextEncoder().encode(secret);
}

async function requireAdmin(): Promise<
  | { ok: true; role: "admin" | "superadmin" }
  | { ok: false; status: number; error: string }
> {
  const token = (await cookies()).get("admin_session")?.value;
  if (!token) return { ok: false, status: 401, error: "Ingen admin-session." };

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string | undefined;
    if (role !== "admin" && role !== "superadmin") {
      return { ok: false, status: 403, error: "Endast Admin / SuperAdmin." };
    }
    return { ok: true, role };
  } catch {
    return { ok: false, status: 401, error: "Ogiltig admin-session." };
  }
}

type DeleteBody = {
  sessionId: string;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => null)) as DeleteBody | null;
    if (!body || !body.sessionId) {
      return NextResponse.json(
        { error: "sessionId krävs." },
        { status: 400 }
      );
    }

    const sessionId = body.sessionId.trim();
    const isUuid =
      typeof sessionId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId
      );

    if (!isUuid) {
      return NextResponse.json(
        { error: "Ogiltigt sessionId-format." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Räcker att ta bort training_sessions – belts rensas via FK on delete cascade om satt
    const { error } = await supabaseAdmin
      .from("training_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      console.error("Fel vid delete training_sessions:", error);
      return NextResponse.json(
        { error: "Kunde inte radera passet." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(
      "Oväntat fel i /api/admin/training/sessions/delete:",
      err
    );
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}