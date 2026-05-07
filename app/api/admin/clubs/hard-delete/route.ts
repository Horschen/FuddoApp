// app/api/admin/clubs/hard-delete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { insertAdminLog } from "../../logsHelper";
import { getAdminActorStringFromRequest } from "../../sessionHelper";

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

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const token = (await cookies()).get("admin_session")?.value;
  if (!token) return { ok: false, status: 401, error: "Ingen admin-session." };

  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "superadmin") {
      return { ok: false, status: 403, error: "Endast SuperAdmin." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, error: "Ogiltig admin-session." };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const clubId = body?.id as string | undefined;
    if (!clubId) return NextResponse.json({ error: "id krävs." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    // Hämta klubbinformation (för logg/response)
    const { data: club, error: clubErr } = await supabaseAdmin
      .from("clubs")
      .select("id, slug, name")
      .eq("id", clubId)
      .maybeSingle();

    if (clubErr) {
      console.error("Fel vid hämtning av klubb:", clubErr);
      return NextResponse.json({ error: "Kunde inte hämta klubb." }, { status: 500 });
    }
    if (!club) return NextResponse.json({ error: "Klubb hittades inte." }, { status: 404 });

    // Hämta alla memberId i klubben
    const { data: members, error: membersErr } = await supabaseAdmin
      .from("members")
      .select("id")
      .eq("club_id", clubId);

    if (membersErr) {
      console.error("Fel vid hämtning av medlemmar för klubb:", membersErr);
      return NextResponse.json({ error: "Kunde inte hämta medlemmar." }, { status: 500 });
    }

    const memberIds = (members ?? []).map((m: any) => m.id);
    const memberCount = memberIds.length;

    // 1) Radera share-links för dessa medlemmar (om några)
    if (memberIds.length > 0) {
      const { error: delLinksErr } = await supabaseAdmin
        .from("member_share_links")
        .delete()
        .in("member_id", memberIds);

      if (delLinksErr) {
        console.error("Fel vid radering av member_share_links:", delLinksErr);
        return NextResponse.json({ error: "Kunde inte radera delningslänkar." }, { status: 500 });
      }
    }

    // 2) Radera medlemmar i klubben
    const { error: delMembersErr } = await supabaseAdmin
      .from("members")
      .delete()
      .eq("club_id", clubId);

    if (delMembersErr) {
      console.error("Fel vid radering av medlemmar:", delMembersErr);
      return NextResponse.json({ error: "Kunde inte radera medlemmar." }, { status: 500 });
    }

    // 3) Radera klubben
    const { error: delClubErr } = await supabaseAdmin
      .from("clubs")
      .delete()
      .eq("id", clubId);

    if (delClubErr) {
      console.error("Fel vid radering av klubb:", delClubErr);
      return NextResponse.json({ error: "Kunde inte radera klubb." }, { status: 500 });
    }

    // Logga hard delete
    const actor = await getAdminActorStringFromRequest(request);
    await insertAdminLog({
      actor,
      action: "hard_delete_club",
      details: {
        clubId,
        slug: club.slug,
        name: club.name,
        deletedMembers: memberCount,
      },
    });

    return NextResponse.json(
      { success: true, clubId, deletedMembers: memberCount },
      { status: 200 }
    );
  } catch (err) {
    console.error("Oväntat fel i /api/admin/clubs/hard-delete:", err);
    return NextResponse.json({ error: "Internt serverfel." }, { status: 500 });
  }
}