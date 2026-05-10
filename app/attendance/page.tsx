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

type MemberRole = "member" | "admin" | "superadmin";

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
  role: MemberRole;
};

type DayLogRow = {
  id: string; // attendance_log id
  memberId: string;
  memberName: string;
  memberAvatarUrl: string;
  type: "regular" | "extra" | "instructor";
  sessionId: string | null;
  createdAt: string;
};

type DaySessionBlock = {
  session: {
    id: string;
    weekday: number;
    startTime: string;
    endTime: string;
    name: string;
    location: string | null;
  };
  logs: DayLogRow[];
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

function weekdayFromYmd(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.getUTCDay();
}

export default function AttendancePage() {
  const router = useRouter();

  // Session + klubb
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [clubLoading, setClubLoading] = useState(true);

  // Datum + pass (huvudläge)
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  // Medlemmar
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Presence (forSession)
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [regularMemberIds, setRegularMemberIds] = useState<Set<string>>(
    new Set()
  );
  const [regularLogIdByMemberId, setRegularLogIdByMemberId] = useState<
    Record<string, string>
  >({});
  const [extraMemberIds, setExtraMemberIds] = useState<Set<string>>(new Set());
  const [extraLogIdsByMemberId, setExtraLogIdsByMemberId] = useState<
    Record<string, string[]>
  >({});
  const [instructorMemberIds, setInstructorMemberIds] = useState<Set<string>>(
    new Set()
  );
  const [instructorLogIdByMemberId, setInstructorLogIdByMemberId] = useState<
    Record<string, string>
  >({});

  const [logLoadingMemberId, setLogLoadingMemberId] = useState<string | null>(
    null
  );
  const [deleteLoadingMemberId, setDeleteLoadingMemberId] = useState<
    string | null
  >(null);

  // Popups (huvudläge)
  const [showExtraPicker, setShowExtraPicker] = useState(false);
  const [extraSelectedIds, setExtraSelectedIds] = useState<
    Record<string, boolean>
  >({});
  const [extraSaving, setExtraSaving] = useState(false);

  const [showInstructorPicker, setShowInstructorPicker] = useState(false);
  const [instructorSelectedIds, setInstructorSelectedIds] = useState<
    Record<string, boolean>
  >({});
  const [instructorSaving, setInstructorSaving] = useState(false);

  // Popup: Se tidigare pass (dag-översikt)
  const [showHistory, setShowHistory] = useState(false);
  const [historyDate, setHistoryDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBlocks, setHistoryBlocks] = useState<DaySessionBlock[]>([]);

  // Add-in-history modal
  const [historyAddOpen, setHistoryAddOpen] = useState(false);
  const [historyAddSessionId, setHistoryAddSessionId] = useState<string>("");
  const [historyAddType, setHistoryAddType] = useState<
    "regular" | "extra" | "instructor"
  >("regular");
  const [historyAddSelectedIds, setHistoryAddSelectedIds] = useState<
    Record<string, boolean>
  >({});
  const [historyAddSaving, setHistoryAddSaving] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }

  const isLoggedInAdmin =
    session?.authenticated === true &&
    (session.role === "admin" || session.role === "superadmin");

  // --- load club id from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY);
    const cleaned = raw && raw !== "undefined" && raw !== "null" ? raw : "";
    setSelectedClubId(cleaned);
    setClubLoading(false);
  }, []);

  // --- load admin session
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

  // --- load training sessions for club
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

  // sessions for selectedDate weekday (main)
  const daySessionsMain = useMemo(() => {
    const wd = weekdayFromYmd(selectedDate);
    return sessions
      .filter((s) => s.weekday === wd)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [sessions, selectedDate]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions.find((s) => s.id === selectedSessionId) ?? null;
  }, [sessions, selectedSessionId]);

  // sessions for historyDate weekday (history popup)
  const daySessionsHistory = useMemo(() => {
    const wd = weekdayFromYmd(historyDate);
    return sessions
      .filter((s) => s.weekday === wd)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [sessions, historyDate]);

  // --- load members for club
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
          is_public,
          role
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
        role: (row.role as MemberRole) ?? "member",
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

  // --- load presence for pass+date (main)
  async function loadPresenceMain() {
    if (!selectedSession) {
      setRegularMemberIds(new Set());
      setRegularLogIdByMemberId({});
      setExtraMemberIds(new Set());
      setExtraLogIdsByMemberId({});
      setInstructorMemberIds(new Set());
      setInstructorLogIdByMemberId({});
      return;
    }

    try {
      setPresenceLoading(true);

      const res = await fetch(
        `/api/admin/attendance/forSession?sessionId=${encodeURIComponent(
          selectedSession.id
        )}&date=${encodeURIComponent(selectedDate)}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("forSession error:", res.status, json);
        setRegularMemberIds(new Set());
        setRegularLogIdByMemberId({});
        setExtraMemberIds(new Set());
        setExtraLogIdsByMemberId({});
        setInstructorMemberIds(new Set());
        setInstructorLogIdByMemberId({});
        return;
      }

      const regularObj =
        json && typeof json.regular === "object" && json.regular
          ? json.regular
          : {};
      const extraObj =
        json && typeof json.extra === "object" && json.extra ? json.extra : {};
      const instructorObj =
        json && typeof json.instructor === "object" && json.instructor
          ? json.instructor
          : {};

      setRegularLogIdByMemberId(regularObj as Record<string, string>);
      setRegularMemberIds(
        new Set(Object.keys(regularObj as Record<string, string>))
      );

      setExtraLogIdsByMemberId(extraObj as Record<string, string[]>);
      setExtraMemberIds(
        new Set(Object.keys(extraObj as Record<string, string[]>))
      );

      setInstructorLogIdByMemberId(instructorObj as Record<string, string>);
      setInstructorMemberIds(
        new Set(Object.keys(instructorObj as Record<string, string>))
      );
    } catch (e) {
      console.error(e);
      setRegularMemberIds(new Set());
      setRegularLogIdByMemberId({});
      setExtraMemberIds(new Set());
      setExtraLogIdsByMemberId({});
      setInstructorMemberIds(new Set());
      setInstructorLogIdByMemberId({});
    } finally {
      setPresenceLoading(false);
    }
  }

  async function refreshAll() {
    await loadMembers();
    await loadPresenceMain();
  }

  // initial load members + presence
  useEffect(() => {
    if (clubLoading) return;
    if (!selectedClubId) return;
    if (!isLoggedInAdmin) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubLoading, selectedClubId, isLoggedInAdmin]);

  // reload presence when pass/date changes
  useEffect(() => {
    if (!isLoggedInAdmin) return;
    loadPresenceMain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, selectedDate]);

  // combined list to render (main)
  const combinedMain = useMemo(() => {
    if (!selectedSession) return [];

    const belts = selectedSession.belts ?? [];

    const regularList = members
      .filter((m) => belts.includes(m.beltRank))
      .map((m) => ({ member: m, kind: "regular" as const }));

    const instructorList = Array.from(instructorMemberIds)
      .map((id) => members.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({ member: m as Member, kind: "instructor" as const }));

    const extraList = Array.from(extraMemberIds)
      .map((id) => members.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({ member: m as Member, kind: "extra" as const }));

    const map = new Map<
      string,
      { member: Member; kind: "regular" | "extra" | "instructor" }
    >();

    // priority: regular > instructor > extra
    for (const x of extraList) map.set(x.member.id, x);
    for (const x of instructorList) map.set(x.member.id, x);
    for (const x of regularList) map.set(x.member.id, x);

    const result = Array.from(map.values());

    const order = (k: "regular" | "instructor" | "extra") =>
      k === "regular" ? 0 : k === "instructor" ? 1 : 2;

    result.sort((a, b) => {
      if (a.kind !== b.kind) return order(a.kind) - order(b.kind);
      const an = `${a.member.lastName} ${a.member.firstName}`.toLowerCase();
      const bn = `${b.member.lastName} ${b.member.firstName}`.toLowerCase();
      return an.localeCompare(bn);
    });

    return result;
  }, [members, selectedSession, extraMemberIds, instructorMemberIds]);

  // --- shared delete helper
  async function deleteByLogId(logId: string, memberIdForLoading?: string) {
    try {
      if (memberIdForLoading) setDeleteLoadingMemberId(memberIdForLoading);

      const res = await fetch("/api/admin/attendance/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceLogId: logId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        alert(json?.error ?? "Kunde inte radera registrering.");
        return null;
      }

      const serverMember = json.member as any;
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

      return serverMember;
    } finally {
      setDeleteLoadingMemberId(null);
    }
  }

  // --- main actions
  async function regRegular(memberId: string) {
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
          date: selectedDate,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        alert(json?.error ?? "Kunde inte registrera närvaro.");
        return;
      }

      const serverMember = json.member as any;
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

      showToast("Närvaro registrerad!");
      await loadPresenceMain();
    } finally {
      setLogLoadingMemberId(null);
    }
  }

  async function deleteRegular(memberId: string) {
    const logId = regularLogIdByMemberId[memberId];
    if (!logId) return;

    const ok = await deleteByLogId(logId, memberId);
    if (ok) {
      showToast("Registrering raderad!");
      await loadPresenceMain();
    }
  }

  async function deleteExtra(memberId: string) {
    const ids = extraLogIdsByMemberId[memberId] ?? [];
    const logId = ids[ids.length - 1];
    if (!logId) return;

    const ok = await deleteByLogId(logId, memberId);
    if (ok) {
      showToast("Extra raderad!");
      await loadPresenceMain();
    }
  }

  async function deleteInstructor(memberId: string) {
    const logId = instructorLogIdByMemberId[memberId];
    if (!logId) return;

    const ok = await deleteByLogId(logId, memberId);
    if (ok) {
      showToast("Instruktör raderad!");
      await loadPresenceMain();
    }
  }

  async function saveExtraMain() {
    if (!selectedSession) return;

    const ids = Object.entries(extraSelectedIds)
      .filter(([, v]) => v === true)
      .map(([id]) => id);

    if (ids.length === 0) {
      alert("Välj minst en elev.");
      return;
    }

    try {
      setExtraSaving(true);

      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const memberId of ids) {
        const res = await fetch("/api/admin/attendance/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            type: "extra",
            sessionId: selectedSession.id,
            date: selectedDate,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          if (json?.error && String(json.error).toLowerCase().includes("dubblett")) {
            duplicateCount++;
          } else {
            errorCount++;
          }
          continue;
        }

        savedCount++;
        const serverMember = json.member as any;
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
      }

      setShowExtraPicker(false);
      setExtraSelectedIds({});
      await loadPresenceMain();

      const msg =
        `Extra sparade: ${savedCount}` +
        (duplicateCount ? ` • Redan fanns: ${duplicateCount}` : "") +
        (errorCount ? ` • Fel: ${errorCount}` : "");
      showToast(msg);
    } finally {
      setExtraSaving(false);
    }
  }

  async function saveInstructorsMain() {
    if (!selectedSession) return;

    const ids = Object.entries(instructorSelectedIds)
      .filter(([, v]) => v === true)
      .map(([id]) => id);

    if (ids.length === 0) {
      alert("Välj minst en instruktör.");
      return;
    }

    try {
      setInstructorSaving(true);

      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const memberId of ids) {
        const res = await fetch("/api/admin/attendance/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            type: "instructor",
            sessionId: selectedSession.id,
            date: selectedDate,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          if (json?.error && String(json.error).toLowerCase().includes("dubblett")) {
            duplicateCount++;
          } else {
            errorCount++;
          }
          continue;
        }

        savedCount++;
        const serverMember = json.member as any;
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
      }

      setShowInstructorPicker(false);
      setInstructorSelectedIds({});
      await loadPresenceMain();

      const msg =
        `Instruktörer sparade: ${savedCount}` +
        (duplicateCount ? ` • Redan fanns: ${duplicateCount}` : "") +
        (errorCount ? ` • Fel: ${errorCount}` : "");
      showToast(msg);
    } finally {
      setInstructorSaving(false);
    }
  }

  // --- history popup: load by date (all sessions even empty)
  async function loadHistory() {
    if (!selectedClubId) return;

    try {
      setHistoryError(null);
      setHistoryLoading(true);

      const res = await fetch(
        `/api/admin/attendance/byDate?clubId=${encodeURIComponent(
          selectedClubId
        )}&date=${encodeURIComponent(historyDate)}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("byDate error:", res.status, json);
        setHistoryBlocks([]);
        setHistoryError(json?.error ?? "Kunde inte hämta historik.");
        return;
      }

      // json.blocks: array of { session, logs }
      const blocks = Array.isArray(json?.blocks) ? (json.blocks as DaySessionBlock[]) : [];

      // Ensure empty sessions are shown: merge with daySessionsHistory
      const bySessionId = new Map<string, DaySessionBlock>();

      for (const s of daySessionsHistory) {
        bySessionId.set(s.id, {
          session: {
            id: s.id,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            name: s.name || "",
            location: s.location ?? null,
          },
          logs: [],
        });
      }

      for (const b of blocks) {
        if (b?.session?.id) {
          bySessionId.set(b.session.id, b);
        }
      }

      const merged = Array.from(bySessionId.values()).sort((a, b) =>
        a.session.startTime.localeCompare(b.session.startTime)
      );

      setHistoryBlocks(merged);
    } catch (e) {
      console.error(e);
      setHistoryBlocks([]);
      setHistoryError("Kunde inte hämta historik.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteHistoryLog(logId: string, memberId?: string) {
    const ok = await deleteByLogId(logId, memberId);
    if (ok) {
      showToast("Registrering raderad!");
      await loadHistory();
      // uppdatera även huvudläge om man råkar vara på samma datum/pass
      await loadPresenceMain();
    }
  }

  async function saveHistoryAdd() {
    if (!historyAddSessionId) {
      alert("Välj pass.");
      return;
    }

    const ids = Object.entries(historyAddSelectedIds)
      .filter(([, v]) => v === true)
      .map(([id]) => id);

    if (ids.length === 0) {
      alert("Välj minst en person.");
      return;
    }

    try {
      setHistoryAddSaving(true);

      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const memberId of ids) {
        const res = await fetch("/api/admin/attendance/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            type: historyAddType,
            sessionId: historyAddSessionId,
            date: historyDate,
          }),
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          if (json?.error && String(json.error).toLowerCase().includes("dubblett")) {
            duplicateCount++;
          } else {
            errorCount++;
          }
          continue;
        }

        savedCount++;
        const serverMember = json.member as any;
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
      }

      const msg =
        `Sparade: ${savedCount}` +
        (duplicateCount ? ` • Redan fanns: ${duplicateCount}` : "") +
        (errorCount ? ` • Fel: ${errorCount}` : "");
      showToast(msg);

      setHistoryAddOpen(false);
      setHistoryAddSelectedIds({});
      await loadHistory();
      await loadPresenceMain();
    } finally {
      setHistoryAddSaving(false);
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
          <p>Du måste vara inloggad som instruktör för att registrera närvaro.</p>
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
      {/* TOAST */}
      {toastMessage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-50 shadow-lg border border-emerald-300/70">
            {toastMessage}
          </div>
        </div>
      )}

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
        <div className="w-full max-w-md mb-3 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600"
            onClick={() => {
              setHistoryDate(selectedDate);
              setShowHistory(true);
              setHistoryBlocks([]);
              setHistoryError(null);
            }}
          >
            Se tidigare pass
          </button>
        </div>

        <h1 className="mb-2 text-xl font-bold">Närvaro</h1>
        <p className="mb-4 text-sm text-gray-300 text-center">
          Välj datum och pass och registrera närvaro.
        </p>

        {/* DATUM */}
        <div className="mb-3 w-full max-w-md">
          <label className="mb-1 block text-[11px] text-gray-300">Datum</label>
          <input
            type="date"
            className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedSessionId("");
            }}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Veckodag: {weekdayLabel(weekdayFromYmd(selectedDate))}
          </p>
        </div>

        {/* PASS */}
        <div className="w-full max-w-md rounded-lg border-2 border-cyan-500/50 bg-black/70 p-4 mb-4">
          <p className="mb-2 text-xs font-semibold text-cyan-100">Pass</p>

          {sessionsLoading && (
            <p className="text-xs text-gray-300">Laddar träningspass...</p>
          )}
          {sessionsError && (
            <p className="text-xs text-red-400">{sessionsError}</p>
          )}

          {!sessionsLoading && !sessionsError && daySessionsMain.length === 0 && (
            <p className="text-xs text-gray-300">
              Inga pass registrerade för valt datum ({weekdayLabel(weekdayFromYmd(selectedDate))}).
            </p>
          )}

          {daySessionsMain.length > 0 && (
            <div className="space-y-2">
              <label className="block text-[11px] text-gray-300">Välj pass</label>

              <select
                className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
              >
                <option value="">— Välj pass —</option>
                {daySessionsMain.map((s) => (
                  <option key={s.id} value={s.id}>
                    {weekdayLabel(s.weekday)} {s.startTime}–{s.endTime}
                    {s.name ? ` – ${s.name}` : ""}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="mt-3 flex-1 rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600 disabled:bg-gray-800"
                  disabled={membersLoading || sessionsLoading || presenceLoading}
                  onClick={refreshAll}
                >
                  {membersLoading || presenceLoading ? "Uppdaterar..." : "Uppdatera"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* LISTA */}
        {selectedSession && (
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-100">
              Närvaro-lista: {combinedMain.length}
            </div>

            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md bg-blue-700 px-3 py-2 text-[11px] font-semibold text-blue-50 hover:bg-blue-600"
                onClick={() => {
                  setExtraSelectedIds({});
                  setShowExtraPicker(true);
                }}
              >
                + Lägg till extra elev
              </button>

              <button
                type="button"
                className="rounded-md bg-purple-700 px-3 py-2 text-[11px] font-semibold text-purple-50 hover:bg-purple-600"
                onClick={() => {
                  setInstructorSelectedIds({});
                  setShowInstructorPicker(true);
                }}
              >
                Registrera instruktör
              </button>
            </div>

            {membersLoading && (
              <p className="text-xs text-gray-300">Laddar medlemmar...</p>
            )}
            {membersError && (
              <p className="text-xs text-red-400">{membersError}</p>
            )}

            <div className="space-y-2">
              {combinedMain.map(({ member: m, kind }) => (
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

                      {kind === "extra" && (
                        <div className="text-[11px] font-semibold text-blue-200">
                          Extra pass
                        </div>
                      )}
                      {kind === "instructor" && (
                        <div className="text-[11px] font-semibold text-purple-200">
                          Instruktör
                        </div>
                      )}
                    </div>
                  </div>

                  {kind === "extra" ? (
                    <button
                      type="button"
                      disabled={presenceLoading || deleteLoadingMemberId === m.id}
                      className="rounded-md bg-red-700 px-3 py-2 text-[11px] font-semibold text-red-50 hover:bg-red-600 disabled:bg-gray-700"
                      onClick={() => deleteExtra(m.id)}
                    >
                      {deleteLoadingMemberId === m.id ? "Raderar..." : "Radera extra"}
                    </button>
                  ) : kind === "instructor" ? (
                    <button
                      type="button"
                      disabled={presenceLoading || deleteLoadingMemberId === m.id}
                      className="rounded-md bg-red-700 px-3 py-2 text-[11px] font-semibold text-red-50 hover:bg-red-600 disabled:bg-gray-700"
                      onClick={() => deleteInstructor(m.id)}
                    >
                      {deleteLoadingMemberId === m.id ? "Raderar..." : "Radera instruktör"}
                    </button>
                  ) : regularMemberIds.has(m.id) ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-gray-700 px-3 py-2 text-[11px] font-semibold text-gray-200">
                        Redan registrerad
                      </span>
                      <button
                        type="button"
                        disabled={presenceLoading || deleteLoadingMemberId === m.id}
                        className="rounded-md bg-red-700 px-3 py-2 text-[11px] font-semibold text-red-50 hover:bg-red-600 disabled:bg-gray-700"
                        onClick={() => deleteRegular(m.id)}
                      >
                        {deleteLoadingMemberId === m.id ? "Raderar..." : "Radera"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={logLoadingMemberId === m.id || presenceLoading}
                      className="rounded-md bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
                      onClick={() => regRegular(m.id)}
                    >
                      {logLoadingMemberId === m.id ? "Registrerar..." : "Regga närvaro"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EXTRA PICKER (main) */}
        {showExtraPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-950 p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Lägg till extra elev</h2>
                <button
                  className="text-xs text-gray-300 hover:text-white"
                  onClick={() => setShowExtraPicker(false)}
                >
                  Stäng
                </button>
              </div>

              <p className="mb-3 text-[11px] text-gray-400">
                Datum: <span className="text-gray-200 font-semibold">{selectedDate}</span>
              </p>

              <div className="max-h-72 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
                {members
                  .slice()
                  .sort((a, b) =>
                    (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
                  )
                  .map((m) => {
                    const checked = extraSelectedIds[m.id] === true;
                    return (
                      <label
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/50 px-2 py-2 text-xs"
                      >
                        <div className="text-gray-200">
                          {m.firstName} {m.lastName}
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-500"
                          checked={checked}
                          onChange={(e) =>
                            setExtraSelectedIds((prev) => ({
                              ...prev,
                              [m.id]: e.target.checked,
                            }))
                          }
                        />
                      </label>
                    );
                  })}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600"
                  onClick={() => setShowExtraPicker(false)}
                  disabled={extraSaving}
                >
                  Avbryt
                </button>

                <button
                  type="button"
                  className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
                  onClick={saveExtraMain}
                  disabled={extraSaving}
                >
                  {extraSaving ? "Sparar..." : "Bekräfta"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* INSTRUCTOR PICKER (main) */}
        {showInstructorPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-950 p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Registrera instruktör</h2>
                <button
                  className="text-xs text-gray-300 hover:text-white"
                  onClick={() => setShowInstructorPicker(false)}
                >
                  Stäng
                </button>
              </div>

              <p className="mb-3 text-[11px] text-gray-400">
                Datum: <span className="text-gray-200 font-semibold">{selectedDate}</span>
              </p>

              <div className="max-h-72 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
                {members
                  .filter((m) => m.role === "admin" || m.role === "superadmin")
                  .slice()
                  .sort((a, b) =>
                    (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
                  )
                  .map((m) => {
                    const checked = instructorSelectedIds[m.id] === true;
                    return (
                      <label
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/50 px-2 py-2 text-xs"
                      >
                        <div className="text-gray-200">
                          {m.firstName} {m.lastName}{" "}
                          <span className="text-[10px] text-gray-400">(Instruktör)</span>
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-purple-500"
                          checked={checked}
                          onChange={(e) =>
                            setInstructorSelectedIds((prev) => ({
                              ...prev,
                              [m.id]: e.target.checked,
                            }))
                          }
                        />
                      </label>
                    );
                  })}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600"
                  onClick={() => setShowInstructorPicker(false)}
                  disabled={instructorSaving}
                >
                  Avbryt
                </button>

                <button
                  type="button"
                  className="rounded-md bg-purple-700 px-3 py-2 text-xs font-semibold text-purple-50 hover:bg-purple-600 disabled:bg-gray-700"
                  onClick={saveInstructorsMain}
                  disabled={instructorSaving}
                >
                  {instructorSaving ? "Sparar..." : "Bekräfta"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY POPUP */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-950 p-4 shadow-xl max-h-[85vh] overflow-y-auto">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Se tidigare pass</h2>
                <button
                  className="text-xs text-gray-300 hover:text-white"
                  onClick={() => setShowHistory(false)}
                >
                  Stäng
                </button>
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-[11px] text-gray-300">Datum</label>
                <input
                  type="date"
                  className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                  value={historyDate}
                  onChange={(e) => {
                    setHistoryDate(e.target.value);
                  }}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Veckodag: {weekdayLabel(weekdayFromYmd(historyDate))}
                </p>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600 disabled:bg-gray-800"
                    disabled={historyLoading}
                    onClick={loadHistory}
                  >
                    {historyLoading ? "Laddar..." : "Ladda dag"}
                  </button>

                  <button
                    type="button"
                    className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
                    onClick={() => {
                      setHistoryAddOpen(true);
                      setHistoryAddSessionId("");
                      setHistoryAddType("regular");
                      setHistoryAddSelectedIds({});
                    }}
                  >
                    + Lägg till
                  </button>
                </div>

                {historyError && (
                  <p className="mt-2 text-xs text-red-400">{historyError}</p>
                )}
              </div>

              {!historyLoading && historyBlocks.length === 0 && (
                <p className="text-xs text-gray-400">
                  Klicka “Ladda dag” för att visa pass och registreringar.
                </p>
              )}

              <div className="space-y-3">
                {historyBlocks.map((b) => (
                  <div
                    key={b.session.id}
                    className="rounded-lg border border-white/10 bg-black/40 p-3"
                  >
                    <div className="text-xs font-semibold text-gray-100">
                      {weekdayLabel(b.session.weekday)} {b.session.startTime}–{b.session.endTime}
                      {b.session.name ? ` – ${b.session.name}` : ""}
                    </div>

                    {b.logs.length === 0 ? (
                      <p className="mt-2 text-[11px] text-gray-400">
                        Inga registreringar för detta pass.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {b.logs.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/50 px-2 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <Image
                                src={r.memberAvatarUrl}
                                alt={r.memberName}
                                width={34}
                                height={34}
                                className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20"
                              />
                              <div className="text-xs">
                                <div className="font-semibold text-gray-100">
                                  {r.memberName}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  {r.type === "regular"
                                    ? "Ordinarie"
                                    : r.type === "extra"
                                    ? "Extra"
                                    : "Instruktör"}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="rounded-md bg-red-700 px-3 py-2 text-[11px] font-semibold text-red-50 hover:bg-red-600"
                              onClick={() => deleteHistoryLog(r.id)}
                            >
                              Radera
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ADD IN HISTORY */}
              {historyAddOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
                  <div className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-950 p-4 shadow-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold">Lägg till i efterhand</h2>
                      <button
                        className="text-xs text-gray-300 hover:text-white"
                        onClick={() => setHistoryAddOpen(false)}
                      >
                        Stäng
                      </button>
                    </div>

                    <p className="mb-3 text-[11px] text-gray-400">
                      Datum:{" "}
                      <span className="text-gray-200 font-semibold">{historyDate}</span>
                    </p>

                    <label className="mb-1 block text-[11px] text-gray-300">Välj pass</label>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                      value={historyAddSessionId}
                      onChange={(e) => setHistoryAddSessionId(e.target.value)}
                    >
                      <option value="">— Välj pass —</option>
                      {daySessionsHistory.map((s) => (
                        <option key={s.id} value={s.id}>
                          {weekdayLabel(s.weekday)} {s.startTime}–{s.endTime}
                          {s.name ? ` – ${s.name}` : ""}
                        </option>
                      ))}
                    </select>

                    <label className="mt-3 mb-1 block text-[11px] text-gray-300">
                      Typ
                    </label>
                    <select
                      className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-2 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                      value={historyAddType}
                      onChange={(e) =>
                        setHistoryAddType(e.target.value as any)
                      }
                    >
                      <option value="regular">Ordinarie</option>
                      <option value="extra">Extra</option>
                      <option value="instructor">Instruktör</option>
                    </select>

                    <div className="mt-3 max-h-64 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
                      {members
                        .filter((m) =>
                          historyAddType === "instructor"
                            ? m.role === "admin" || m.role === "superadmin"
                            : true
                        )
                        .slice()
                        .sort((a, b) =>
                          (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
                        )
                        .map((m) => {
                          const checked = historyAddSelectedIds[m.id] === true;
                          return (
                            <label
                              key={m.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/50 px-2 py-2 text-xs"
                            >
                              <div className="text-gray-200">
                                {m.firstName} {m.lastName}
                              </div>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-emerald-500"
                                checked={checked}
                                onChange={(e) =>
                                  setHistoryAddSelectedIds((prev) => ({
                                    ...prev,
                                    [m.id]: e.target.checked,
                                  }))
                                }
                              />
                            </label>
                          );
                        })}
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600"
                        onClick={() => setHistoryAddOpen(false)}
                        disabled={historyAddSaving}
                      >
                        Avbryt
                      </button>

                      <button
                        type="button"
                        className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
                        onClick={saveHistoryAdd}
                        disabled={historyAddSaving}
                      >
                        {historyAddSaving ? "Sparar..." : "Bekräfta"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}