import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { SignJWT } from "jose";

export const runtime = "nodejs";

// Skapa en Supabase-klient med service role (admin-åtkomst)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Enkel SHA256-hash med salt
function hashPassword(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

// Hämta hemlig nyckel för JWT-signering
function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  }
  return new TextEncoder().encode(secret);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.memberId !== "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json(
        { error: "memberId och password måste skickas med." },
        { status: 400 }
      );
    }

    const memberId = body.memberId.trim();
    const password = body.password;

    const supabaseAdmin = getSupabaseAdmin();

    // 1) Hämta medlemmen via user_id (t.ex. 000001)
    const { data: member, error } = await supabaseAdmin
      .from("members")
      .select(
        `
        id,
        user_id,
        first_name,
        last_name,
        role,
        admin_password_hash,
        admin_password_salt
      `
      )
      .eq("user_id", memberId)
      .maybeSingle();

    if (error) {
      console.error("Fel vid hämtning av medlem i login:", error);
      return NextResponse.json(
        { error: "Kunde inte hämta medlem." },
        { status: 500 }
      );
    }

    if (!member || !member.admin_password_hash || !member.admin_password_salt) {
      return NextResponse.json(
        { error: "Ingen adminåtkomst satt för denna profil." },
        { status: 401 }
      );
    }

    // 2) Verifiera lösenord
    const calcHash = hashPassword(password, member.admin_password_salt);
    if (calcHash !== member.admin_password_hash) {
      return NextResponse.json(
        { error: "Felaktigt lösenord." },
        { status: 401 }
      );
    }

    // 3) Bygg en JWT-session
    const secret = getAdminSessionSecret();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 60 * 60 * 4; // 4 timmar

    const token = await new SignJWT({
      sub: member.id,
      role: member.role,
      name: `${member.first_name ?? ""} ${member.last_name ?? ""}`,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .sign(secret);

    const response = NextResponse.json({ success: true });

    // 4) Sätt kakan admin_session (logout tar bort samma namn)
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn,
    });

    return response;
  } catch (err) {
    console.error("Oväntat fel i /api/admin/login:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}