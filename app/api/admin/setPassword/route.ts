import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { jwtVerify } from "jose";
import { insertAdminLog } from "../logsHelper";

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

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  }
  return new TextEncoder().encode(secret);
}

async function getAdminPayloadFromRequest(req: Request): Promise<{
  actorString: string;
}> {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("=", 2) as [string, string])
        .filter(([k]) => k)
    );

    const token = cookies["admin_session"];
    if (!token) return { actorString: "Okänd (ingen session)" };

    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = (payload.role as string) ?? "okänd roll";
    const name = (payload.name as string) ?? "Okänd";
    return { actorString: `${role} (${name})` };
  } catch (err) {
    console.warn("Kunde inte läsa admin_session i setPassword:", err);
    return { actorString: "Okänd (fel vid läsning av session)" };
  }
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

    // Hämta info om målanvändaren (för loggens details)
    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("members")
      .select("id, first_name, last_name")
      .eq("id", memberId)
      .maybeSingle();

    if (targetError) {
      console.error("Fel vid hämtning av target-medlem i setPassword:", targetError);
    }

    // Uppdatera lösenord
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

    // Plocka ut info om vem som gör ändringen (adminen)
    const { actorString } = await getAdminPayloadFromRequest(request);

    const targetName = targetMember
      ? `${targetMember.first_name ?? ""} ${targetMember.last_name ?? ""}`.trim()
      : null;

    // Skriv logg (best effort)
    await insertAdminLog({
      actor: actorString,
      action: "set_password",
      details: {
        memberId,
        targetName,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Oväntat fel i /api/admin/setPassword:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}