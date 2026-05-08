// app/api/admin/training/sessions/upsert/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

/* =========================================================
   SUPABASE ADMIN-CLIENT
========================================================= */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/* =========================================================
   ADMIN SESSION-VERIFY
========================================================= */
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

/* =========================================================
   BODY-TYP
========================================================= */

type UpsertBody = {
  id?: string | null;          // om finns: uppdatera, annars skapa nytt
  clubId: string;
  weekday: number;             // 0–6
  startTime: string;           // "18:00"
  endTime: string;             // "19:00"
  name?: string;               // får vara tomt
  location?: string | null;
  active?: boolean;
  belts: string[];             // t.ex. ["10_kyu","9_kyu"]
};

/* =========================================================
   POST: UPSERT
========================================================= */

export async function POST(request: Request) {
  try {
    // 1) Kontrollera admin
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 2) Läs body
    const body = (await request.json().catch(() => null)) as UpsertBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Ogiltig JSON i body." },
        { status: 400 }
      );
    }

    const {
      id,
      clubId,
      weekday,
      startTime,
      endTime,
      name,
      location,
      active = true,
      belts,
    } = body;

    // 3) Validering
    if (!clubId) {
      return NextResponse.json(
        { error: "clubId krävs." },
        { status: 400 }
      );
    }

    const isClubUuid =
      typeof clubId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        clubId
      );
    if (!isClubUuid) {
      return NextResponse.json(
        { error: "Ogiltigt clubId-format." },
        { status: 400 }
      );
    }

    if (typeof weekday !== "number" || weekday < 0 || weekday > 6) {
      return NextResponse.json(
        { error: "weekday måste vara 0–6." },
        { status: 400 }
      );
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: "startTime och endTime krävs." },
        { status: 400 }
      );
    }

    const safeName = (name ?? "").toString().trim(); // får vara tom
    const beltsArray = Array.isArray(belts) ? belts : [];

    const supabaseAdmin = getSupabaseAdmin();

    // 4) Insert eller Update i training_sessions
    let inserted: any = null;
    let insertError: any = null;

    const hasId =
      id && typeof id === "string" && id.trim() !== "" ? id.trim() : null;

    if (hasId) {
      // UPPDATERA befintligt pass
      const { data, error } = await supabaseAdmin
        .from("training_sessions")
        .update({
          weekday,
          start_time: startTime,
          end_time: endTime,
          name: safeName,
          active,
          location:
            location && location.toString().trim()
              ? location.toString().trim()
              : null,
        })
        .eq("id", hasId)
        .select(
          "id, club_id, weekday, start_time, end_time, name, active, location"
        )
        .single();

      inserted = data;
      insertError = error;
    } else {
      // SKAPA nytt pass
      const { data, error } = await supabaseAdmin
        .from("training_sessions")
        .insert({
          club_id: clubId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          name: safeName,
          active,
          location:
            location && location.toString().trim()
              ? location.toString().trim()
              : null,
        })
        .select(
          "id, club_id, weekday, start_time, end_time, name, active, location"
        )
        .single();

      inserted = data;
      insertError = error;
    }

    if (insertError || !inserted) {
      console.error("Fel vid upsert i training_sessions:", insertError);
      return NextResponse.json(
        { error: "Kunde inte spara träningspasset." },
        { status: 500 }
      );
    }

    const sessionId = inserted.id as string;

    // 5) Hantera bälten: ta bort gamla om vi uppdaterar, lägg till nya
    if (hasId) {
      // rensa gamla rader för detta pass
      const { error: delError } = await supabaseAdmin
        .from("training_session_belts")
        .delete()
        .eq("session_id", sessionId);

      if (delError) {
        console.error(
          "Fel vid delete i training_session_belts:",
          delError
        );
        // vi fortsätter ändå
      }
    }

    if (beltsArray.length > 0) {
      const insertBelts = beltsArray.map((belt) => ({
        session_id: sessionId,
        belt_rank: belt,
      }));

      const { error: beltsError } = await supabaseAdmin
        .from("training_session_belts")
        .insert(insertBelts);

      if (beltsError) {
        console.error(
          "Fel vid insert i training_session_belts:",
          beltsError
        );
        // Returnera passet utan bälten om det skiter sig
        return NextResponse.json(
          {
            session: {
              id: inserted.id,
              clubId: inserted.club_id,
              weekday: inserted.weekday,
              startTime: inserted.start_time,
              endTime: inserted.end_time,
              name: inserted.name,
              active: inserted.active,
              location: inserted.location,
              belts: [],
            },
            warning: "Passet sparades, men bältena kunde inte sparas.",
          },
          { status: 200 }
        );
      }
    }

    // 6) Hämta tillbaka alla bälten för detta pass
    const { data: beltsRows, error: beltsSelectError } = await supabaseAdmin
      .from("training_session_belts")
      .select("belt_rank")
      .eq("session_id", sessionId);

    if (beltsSelectError) {
      console.error(
        "Fel vid select training_session_belts för pass:",
        beltsSelectError
      );
    }

    const beltsFinal =
      (beltsRows ?? []).map((b: any) => b.belt_rank as string) ?? [];

    const result = {
      id: inserted.id as string,
      clubId: inserted.club_id as string,
      weekday: inserted.weekday as number,
      startTime: inserted.start_time as string,
      endTime: inserted.end_time as string,
      name: inserted.name as string,
      active: inserted.active as boolean,
      location: inserted.location as string | null,
      belts: beltsFinal,
    };

    return NextResponse.json({ session: result }, { status: 200 });
  } catch (err) {
    console.error(
      "Oväntat fel i /api/admin/training/sessions/upsert:",
      err
    );
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}