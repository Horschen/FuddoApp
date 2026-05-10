"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type AdminSession = {
  authenticated: boolean;
  memberId?: string;
  role?: "member" | "admin" | "superadmin";
  name?: string;
};

type TrainingSession = {
  id: string;
  clubId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  name: string;
  active: boolean;
  location: string | null;
  belts: string[];
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  beltRank: string;
  attendedSessions: number;
  requiredSessions: number;
  progress: number;
  avatarUrl: string;
  isPublic: boolean;
};

const STORAGE_SELECTED_CLUB_ID_KEY = "selectedClubId";

function weekdayLabel(weekday: number): string {
  const labels = [
    "Söndag",
    "Måndag",
    "Tisdag",
    "Onsdag",
    "Torsdag",
    "Fredag",
    "Lördag",
  ];
  return labels[weekday] ?? `Dag ${weekday}`;
}

function todayWeekday(): number {
  // 0=sön..6=lör (lokalt)
  return new Date().getDay();
}

export default function AttendancePage() {
  const router = useRouter();

  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [clubLoading, setClubLoading] = useState(true);

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [presentMemberIds, setPresentMemberIds] = useState<Set<string>>(
    new Set()
  );
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presentLogIdByMemberId, setPresentLogIdByMemberId] = useState<Record<string, string>>({});
  const [deleteLoadingMemberId, setDeleteLoadingMemberId] = useState<string | null>(null);

  const [logLoadingMemberId, setLogLoadingMemberId] = useState<string | null>(
    null
  );

  const isLoggedInAdmin =
    session?.authenticated === true &&
    (session.role === "admin" || session.role === "superadmin");

  // 1) Läs klubb från localStorage
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY);
    const cleaned = raw && raw !== "undefined" && raw !== "null" ? raw : "";
    setSelectedClubId(cleaned);
    setClubLoading(false);
  }, []);

  // 2) Hämta session
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled) setSession(json);
      } catch {
        if (!cancelled) setSession({ authenticated: false });
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 3) Hämta träningspass för klubben
  useEffect(() => {
    if (clubLoading) return;
    if (!selectedClubId) return;
    if (!isLoggedInAdmin) return;

    let cancelled = false;

    const load = async () => {
      try {
        setSessionsError(null);
        setSessionsLoading(true);

        const res = await fetch(
          `/api/admin/training/sessions/list?clubId=${encodeURIComponent(
            selectedClubId
          )}`,
          { cache: "no-store" }
        );

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setSessions([]);
          setSessionsError(json?.error ?? "Kunde inte hämta träningspass.");
          return;
        }

        setSessions(Array.isArray(json?.sessions) ? json.sessions : []);
      } catch (e) {
        console.error(e);
        setSessions([]);
        setSessionsError("Kunde inte hämta träningspass.");
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [clubLoading, selectedClubId, isLoggedInAdmin]);

  const todaysSessions = useMemo(() => {
    const wd = todayWeekday();
    return sessions
      .filter((s) => s.weekday === wd)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [sessions]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions.find((s) => s.id === selectedSessionId) ?? null;
  }, [sessions, selectedSessionId]);

  // Hjälpfunktion: dagens datum i UTC (YYYY-MM-DD)
  function todayUtcYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  // 4) Hämta medlemmar (kan återanvändas av "Uppdatera")
  async function loadMembers() {
    try {
      setMembersError(null);
      setMembersLoading(true);

      const { data, error } = await supabase
        .from("members")
        .select(
          `
          id,
          first_name,
          last_name,
          belt_rank,
          attended_sessions,
          required_sessions,
          progress,
          avatar_url,
          is_public
        `
        )
        .eq("club_id", selectedClubId);

      if (error) {
        console.error(error);
        setMembers([]);
        setMembersError("Kunde inte hämta medlemmar.");
        return;
      }

      const mapped: Member[] = (data ?? []).map((row: any) => ({
        id: row.id,
        firstName: row.first_name ?? "",
        lastName: row.last_name ?? "",
        beltRank: row.belt_rank ?? "",
        attendedSessions: row.attended_sessions ?? 0,
        requiredSessions: row.required_sessions ?? 0,
        progress: row.progress ?? 0,
        avatarUrl: row.avatar_url ?? "/main.png",
        isPublic: row.is_public ?? true,
      }));

      setMembers(mapped);
    } catch (e) {
      console.error(e);
      setMembers([]);
      setMembersError("Kunde inte hämta medlemmar.");
    } finally {
      setMembersLoading(false);
    }
  }

  // 5) Hämta vilka som redan är registrerade för valt pass idag
  async function loadPresenceForSelectedSession() {
    if (!selectedSession) {
      setPresentMemberIds(new Set());
      return;
    }

    try {
      setPresenceLoading(true);

      const date = todayUtcYmd();

      const res = await fetch(
        `/api/admin/attendance/forSession?sessionId=${encodeURIComponent(
          selectedSession.id
        )}&date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("forSession error:", res.status, json);
        setPresentMemberIds(new Set());
        return;
      }

       const presentObj =
        json && typeof json.present === "object" && json.present ? json.present : {};

      setPresentLogIdByMemberId(presentObj as Record<string, string>);
      setPresentMemberIds(new Set(Object.keys(presentObj as Record<string, string>)));
    } catch (e) {
      console.error(e);
      setPresentMemberIds(new Set());
    } finally {
      setPresenceLoading(false);
    }
  }

  // 6) Uppdatera allt (medlemmar + registrerade) – används av "Uppdatera"-knappen
  async function refreshAll() {
    await loadMembers();
    await loadPresenceForSelectedSession();
  }

   // Första laddning: hämta data när sidan öppnas / klubb ändras
  useEffect(() => {
    if (clubLoading) return;
    if (!selectedClubId) return;
    if (!isLoggedInAdmin) return;

    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubLoading, selectedClubId, isLoggedInAdmin]);

  // När man byter pass -> hämta "redan registrerade" för det passet
  useEffect(() => {
    if (!isLoggedInAdmin) return;
    loadPresenceForSelectedSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId]);

  const matchedMembers = useMemo(() => {
    if (!selectedSession) return [];
    const belts = selectedSession.belts ?? [];
    return members
      .filter((m) => belts.includes(m.beltRank))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [members, selectedSession]);

  async function regAttendance(memberId: string) {
    if (!selectedSession) return;

    try {
      setLogLoadingMemberId(memberId);

      const res = await fetch("/api/admin/attendance/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          type: "regular",
          sessionId: selectedSession.id,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        alert(json?.error ?? "Kunde inte registrera närvaro.");
        return;
      }

      const serverMember = json.member as any;

      // Uppdatera medlem i listan
      setMembers((prev) =>
        prev.map((m) =>
          m.id === serverMember.id
            ? {
                ...m,
                attendedSessions: serverMember.attendedSessions,
                requiredSessions: serverMember.requiredSessions,
                progress: serverMember.progress,
              }
            : m
        )
      );

      // Hämta om "present"-listan så vi får rätt logg-id och UI direkt
      await loadPresenceForSelectedSession();
    } finally {
      setLogLoadingMemberId(null);
    }
  }

  async function deleteAttendanceForMember(memberId: string) {
    const logId = presentLogIdByMemberId[memberId];

    if (!logId) {
      alert("Hittar ingen registrering att radera för denna medlem.");
      return;
    }

    try {
      setDeleteLoadingMemberId(memberId);

      const res = await fetch("/api/admin/attendance/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceLogId: logId,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        alert(json?.error ?? "Kunde inte radera registrering.");
        return;
      }

      const serverMember = json.member as any;

      // Uppdatera medlem i listan
      setMembers((prev) =>
        prev.map((m) =>
          m.id === serverMember.id
            ? {
                ...m,
                attendedSessions: serverMember.attendedSessions,
                requiredSessions: serverMember.requiredSessions,
                progress: serverMember.progress,
              }
            : m
        )
      );

      // Ta bort lokalt ur "redan registrerade"
      setPresentMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });

      setPresentLogIdByMemberId((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } finally {
      setDeleteLoadingMemberId(null);
    }
  }

  // ---- UI states ----
  if (sessionLoading || clubLoading) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center">
        Laddar...
      </main>
    );
  }

  if (!isLoggedInAdmin) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <p>Du måste vara inloggad som Admin/SuperAdmin för att registrera närvaro.</p>
          <button
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600"
            onClick={() => router.push("/")}
          >
            Tillbaka
          </button>
        </div>
      </main>
    );
  }

  if (!selectedClubId) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <p>Ingen klubb vald.</p>
          <button
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600"
            onClick={() => router.push("/")}
          >
            Tillbaka och välj klubb
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black/90 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          type="button"
          className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => router.push("/")}
        >
          &#171;&#171;&#171; Tillbaka
        </button>

        <div className="text-[11px] text-gray-400">
          Inloggad: {session?.name ?? "Okänd"} ({session?.role})
        </div>
      </header>

      <section className="flex flex-col items-center px-4 pb-8 pt-4">
        <h1 className="mb-2 text-xl font-bold">Närvaro</h1>
        <p className="mb-4 text-sm text-gray-300 text-center">
          Välj dagens pass och registrera närvaro.
        </p>

        {/* PASSVAL */}
        <div className="w-full max-w-md rounded-lg border-2 border-cyan-500/50 bg-black/70 p-4 mb-4">
          <p className="mb-2 text-xs font-semibold text-cyan-100">Dagens pass</p>

          {sessionsLoading && (
            <p className="text-xs text-gray-300">Laddar träningspass...</p>
          )}
          {sessionsError && (
            <p className="text-xs text-red-400">{sessionsError}</p>
          )}

          {!sessionsLoading && !sessionsError && todaysSessions.length === 0 && (
            <p className="text-xs text-gray-300">
              Inga pass registrerade för idag ({weekdayLabel(todayWeekday())}).
            </p>
          )}

          {todaysSessions.length > 0 && (
            <div className="space-y-2">
              <label className="block text-[11px] text-gray-300">
                Välj pass
              </label>

              <select
                className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
              >
                <option value="">— Välj pass —</option>
                {todaysSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {weekdayLabel(s.weekday)} {s.startTime}–{s.endTime}
                    {s.name ? ` – ${s.name}` : ""}
                  </option>
                ))}
              </select>

              {selectedSession && (
                <p className="text-[11px] text-gray-400">
                  Matchar bälten:{" "}
                  <span className="text-gray-200">
                    {(selectedSession.belts ?? []).join(", ") || "(inga bälten)"}
                  </span>
                </p>
              )}
              <button
  type="button"
  className="mt-3 w-full rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600 disabled:bg-gray-800"
  disabled={membersLoading || sessionsLoading || presenceLoading}
  onClick={refreshAll}
>
  {membersLoading || presenceLoading ? "Uppdaterar..." : "Uppdatera"}
</button>
            </div>
          )}
        </div>

        {/* MEMBER LIST */}
        {selectedSession && (
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-100">
              Elever för detta pass: {matchedMembers.length}
            </div>

            {membersLoading && (
              <p className="text-xs text-gray-300">Laddar medlemmar...</p>
            )}
            {membersError && (
              <p className="text-xs text-red-400">{membersError}</p>
            )}

            {!membersLoading && !membersError && matchedMembers.length === 0 && (
              <p className="text-xs text-gray-300">
                Inga medlemmar matchar bältena för detta pass.
              </p>
            )}

            <div className="space-y-2">
              {matchedMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/50 px-2 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={m.avatarUrl}
                      alt={`${m.firstName} ${m.lastName}`}
                      width={42}
                      height={42}
                      className="h-10 w-10 rounded-full object-cover ring-1 ring-white/20"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-gray-100">
                        {m.firstName} {m.lastName}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {m.beltRank} • Pass: {m.attendedSessions}/{m.requiredSessions}
                      </div>
                    </div>
                  </div>

                  {presentMemberIds.has(m.id) ? (
  <div className="flex items-center gap-2">
    <span className="rounded-md bg-gray-700 px-3 py-2 text-[11px] font-semibold text-gray-200">
      Redan registrerad
    </span>

    <button
      type="button"
      disabled={presenceLoading || deleteLoadingMemberId === m.id}
      className="rounded-md bg-red-700 px-3 py-2 text-[11px] font-semibold text-red-50 hover:bg-red-600 disabled:bg-gray-700"
      onClick={() => deleteAttendanceForMember(m.id)}
    >
      {deleteLoadingMemberId === m.id ? "Raderar..." : "Radera"}
    </button>
  </div>
) : (
  <button
    type="button"
    disabled={logLoadingMemberId === m.id || presenceLoading}
    className="rounded-md bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
    onClick={() => regAttendance(m.id)}
  >
    {logLoadingMemberId === m.id ? "Registrerar..." : "Regga närvaro"}
  </button>
)}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}