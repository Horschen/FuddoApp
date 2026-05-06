import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function hashPassword(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.memberId !== "string" ||
      typeof body.newPassword !== "string"
    ) {
      return NextResponse.json(
        { error: "memberId och newPassword måste finnas." },
        { status: 400 }
      );
    }

    const memberId = body.memberId;
    const newPassword = body.newPassword.trim();

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Lösenordet måste vara minst 6 tecken." },
        { status: 400 }
      );
    }

    const salt = randomBytes(16).toString("hex");
    const hash = hashPassword(newPassword, salt);

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("members")
      .update({
        admin_password_hash: hash,
        admin_password_salt: salt,
      })
      .eq("id", memberId);

    if (error) {
      console.error("Fel vid sparande av adminlösenord:", error);
      return NextResponse.json(
        { error: "Kunde inte spara lösenord." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/setPassword:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}