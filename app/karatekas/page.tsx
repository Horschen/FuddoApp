"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

//
// --- Typer ---
//

type BeltRank =
  | "9_kyu"
  | "8_kyu"
  | "7_kyu"
  | "6_kyu"
  | "5_kyu"
  | "4_kyu"
  | "3_kyu"
  | "2_kyu"
  | "1_kyu"
  | "1_dan"
  | "2_dan"
  | "3_dan"
  | "4_dan"
  | "5_dan"
  | "6_dan"
  | "7_dan"
  | "8_dan"
  | "9_dan"
  | "10_dan";

type VisibilitySettings = {
  showAge: boolean;
  showBeltInfo: boolean;
  showGradingStatus: boolean;
  showMemberComment: boolean;
};

type GradingStatusValue = "not_ready" | "partial" | "ready";

type GradingStatus = {
  kihon: GradingStatusValue;
  kata: GradingStatusValue;
  kumite: GradingStatusValue;
  physical: GradingStatusValue;
};

type PhysicalRequirement = {
  beltRank: BeltRank; // krav för "nästa bälte"
  pushups: number;
  situps: number;
  squats: number;
};

type Member = {
  id: string;
  userId: string; // löpnummer som text, t.ex. 000001
  firstName: string;
  lastName: string;

  // Vi behåller age som fallback men visar primärt beräknad ålder från birthYmd
  age: number;
  birthYmd: string; // "YYMMDD", t.ex. "770612"

  beltRank: BeltRank;
  nextBeltRank: BeltRank;

  attendedSessions: number;
  requiredSessions: number;

  progress: number;

  avatarUrl: string;

  memberComment: string;
  instructorComment: string;

  visibility: VisibilitySettings;

  gradingStatus: GradingStatus;

  physicalEnabled: boolean;

  // Synlighet i medlemslistan
  isPublic: boolean;
};

//
// --- Konstanter / Hjälp ---
//

const CLUB_ID = "112e386e-5e6b-4657-956e-f202f5558158";

const beltOrder: BeltRank[] = [
  "9_kyu",
  "8_kyu",
  "7_kyu",
  "6_kyu",
  "5_kyu",
  "4_kyu",
  "3_kyu",
  "2_kyu",
  "1_kyu",
  "1_dan",
  "2_dan",
  "3_dan",
  "4_dan",
  "5_dan",
  "6_dan",
  "7_dan",
  "8_dan",
  "9_dan",
  "10_dan",
];

function getBeltColor(belt: BeltRank): string {
  switch (belt) {
    case "9_kyu":
      return "bg-red-900/50";
    case "8_kyu":
      return "bg-yellow-900/40";
    case "7_kyu":
      return "bg-orange-500/40";
    case "6_kyu":
      return "bg-green-900/40";
    case "5_kyu":
      return "bg-blue-900/40";
    case "4_kyu":
      return "bg-blue-800/40";
    case "3_kyu":
      return "bg-amber-900/40";
    case "2_kyu":
      return "bg-amber-800/40";
    case "1_kyu":
      return "bg-amber-700/40";
    default:
      return "bg-gray-800/60";
  }
}

function getBeltLabel(belt: BeltRank): string {
  const map: Record<BeltRank, string> = {
    "9_kyu": "9 Kyu (Rött)",
    "8_kyu": "8 Kyu (Gult)",
    "7_kyu": "7 Kyu (Orange)",
    "6_kyu": "6 Kyu (Grönt)",
    "5_kyu": "5 Kyu (Blått)",
    "4_kyu": "4 Kyu (2 Blå)",
    "3_kyu": "3 Kyu (1 Brun)",
    "2_kyu": "2 Kyu (2 Bruna)",
    "1_kyu": "1 Kyu (3 Bruna)",
    "1_dan": "1 Dan (1 Svart)",
    "2_dan": "2 Dan (2 Svarta)",
    "3_dan": "3 Dan (3 Svarta)",
    "4_dan": "4 Dan",
    "5_dan": "5 Dan",
    "6_dan": "6 Dan",
    "7_dan": "7 Dan",
    "8_dan": "8 Dan",
    "9_dan": "9 Dan",
    "10_dan": "10 Dan",
  };
  return map[belt];
}

function getNextBeltRank(current: BeltRank): BeltRank {
  const idx = beltOrder.indexOf(current);
  if (idx === -1 || idx === beltOrder.length - 1) return current;
  return beltOrder[idx + 1];
}

function getRequiredSessionsForNextBelt(current: BeltRank, next: BeltRank): number {
  const idx = beltOrder.indexOf(current);

  if (idx >= beltOrder.indexOf("9_kyu") && idx <= beltOrder.indexOf("3_kyu")) return 30;
  if (idx >= beltOrder.indexOf("3_kyu") && idx <= beltOrder.indexOf("1_kyu")) return 60;

  if (current === "1_kyu" && next === "1_dan") return 120;
  if (current === "1_dan" && next === "2_dan") return 240;
  if (current === "2_dan" && next === "3_dan") return 360;
  if (current === "3_dan" && next === "4_dan") return 480;
  if (current === "5_dan" && next === "6_dan") return 600;
  if (current === "6_dan" && next === "7_dan") return 720;

  return 0;
}

function getGradingLabelAndColor(value: GradingStatusValue) {
  switch (value) {
    case "not_ready":
      return { label: "Icke redo", color: "bg-red-900/50 text-red-200" };
    case "partial":
      return { label: "Delvis redo", color: "bg-orange-500/70 text-white" };
    case "ready":
      return { label: "Redo", color: "bg-emerald-900/50 text-emerald-100" };
    default:
      return { label: "-", color: "bg-gray-800 text-gray-200" };
  }
}

// 50% teknik + 50% närvaro (3 eller 4 moment)
function calculateProgress(
  status: GradingStatus,
  attended: number,
  required: number,
  physicalEnabled: boolean
): number {
  const valueOf = (v: GradingStatusValue) => (v === "ready" ? 1 : v === "partial" ? 0.5 : 0);

  const parts = [status.kihon, status.kata, status.kumite];
  if (physicalEnabled) parts.push(status.physical);

  const techScore = parts.reduce((sum, v) => sum + valueOf(v), 0) / parts.length;
  const attScore = required > 0 ? Math.min(attended / required, 1) : 0;

  return 0.5 * techScore + 0.5 * attScore;
}

function parseBirthYmdToDate(ymd: string): Date | null {
  if (!/^\d{6}$/.test(ymd)) return null;

  const yy = Number(ymd.slice(0, 2));
  const mm = Number(ymd.slice(2, 4));
  const dd = Number(ymd.slice(4, 6));

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  // 00-29 => 2000-2029, annars 1900-1999
  const fullYear = yy <= 29 ? 2000 + yy : 1900 + yy;

  const d = new Date(fullYear, mm - 1, dd);

  if (d.getFullYear() !== fullYear || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;

  return d;
}

function calculateAgeFromBirthDate(birthDate: Date, today = new Date()): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function getDisplayAge(member: Member): number {
  const d = parseBirthYmdToDate(member.birthYmd || "");
  if (!d) return member.age ?? 0;
  return calculateAgeFromBirthDate(d);
}

function formatBirthIso(ymd: string): string | null {
  const d = parseBirthYmdToDate(ymd);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Liten tårta
function ProgressCircle({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clamped * 100);

  let color = "stroke-red-500";
  if (clamped >= 0.75) color = "stroke-emerald-500";
  else if (clamped >= 0.5) color = "stroke-orange-500";

  return (
    <div className="relative h-8 w-8">
      <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
        <path
          className="stroke-gray-700"
          strokeWidth="4"
          fill="none"
          d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
        />
        <path
          className={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={`${percentage}, 100`}
          d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white">
        {percentage}%
      </span>
    </div>
  );
}

// Stor tårta
function LargeProgressCircle({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clamped * 100);

  let color = "stroke-red-500";
  if (clamped >= 0.75) color = "stroke-emerald-500";
  else if (clamped >= 0.5) color = "stroke-orange-500";

  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
        <path
          className="stroke-gray-700"
          strokeWidth="4"
          fill="none"
          d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
        />
        <path
          className={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={`${percentage}, 100`}
          d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
        {percentage}%
      </span>
    </div>
  );
}

//
// --- Supabase-funktioner ---
//

async function fetchMembersFromSupabase(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select(
      `
      id,
      user_id,
      first_name,
      last_name,
      age,
      birth_ymd,
      belt_rank,
      next_belt_rank,
      attended_sessions,
      required_sessions,
      progress,
      avatar_url,
      member_comment,
      instructor_comment,
      visibility_show_age,
      visibility_show_belt_info,
      visibility_show_grading_status,
      visibility_show_member_comment,
      grading_kihon,
      grading_kata,
      grading_kumite,
      grading_physical,
      physical_enabled,
      is_public
    `
    );

  if (error) {
    console.error("Fel vid hämtning av medlemmar:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row: any) => {
    const gradingStatus: GradingStatus = {
      kihon: (row.grading_kihon as GradingStatusValue) ?? "not_ready",
      kata: (row.grading_kata as GradingStatusValue) ?? "not_ready",
      kumite: (row.grading_kumite as GradingStatusValue) ?? "not_ready",
      physical: (row.grading_physical as GradingStatusValue) ?? "not_ready",
    };

    const visibility: VisibilitySettings = {
      showAge: row.visibility_show_age ?? true,
      showBeltInfo: row.visibility_show_belt_info ?? true,
      showGradingStatus: row.visibility_show_grading_status ?? true,
      showMemberComment: row.visibility_show_member_comment ?? true,
    };

    const physicalEnabled: boolean = row.physical_enabled ?? false;

    const computedProgress = calculateProgress(
      gradingStatus,
      row.attended_sessions ?? 0,
      row.required_sessions ?? 0,
      physicalEnabled
    );

    return {
      id: row.id,
      userId: row.user_id ?? "",
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      age: row.age ?? 0,
      birthYmd: row.birth_ymd ?? "",
      beltRank: (row.belt_rank as BeltRank) ?? "9_kyu",
      nextBeltRank: (row.next_belt_rank as BeltRank) ?? getNextBeltRank(((row.belt_rank as BeltRank) ?? "9_kyu") as BeltRank),
      attendedSessions: row.attended_sessions ?? 0,
      requiredSessions: row.required_sessions ?? 0,
      progress: row.progress ?? computedProgress,
      avatarUrl: row.avatar_url ?? "/main.png",
      memberComment: row.member_comment ?? "",
      instructorComment: row.instructor_comment ?? "",
      visibility,
      gradingStatus,
      physicalEnabled,
      isPublic: row.is_public ?? true,
    };
  });
}

async function fetchPhysicalRequirementsFromSupabase(): Promise<Record<string, PhysicalRequirement>> {
  const { data, error } = await supabase
    .from("physical_requirements")
    .select("belt_rank, pushups, situps, squats")
    .eq("club_id", CLUB_ID);

  if (error) {
    console.error("Fel vid hämtning av fysiska krav:", error);
    return {};
  }

  const map: Record<string, PhysicalRequirement> = {};
  (data ?? []).forEach((row: any) => {
    map[row.belt_rank] = {
      beltRank: row.belt_rank as BeltRank,
      pushups: row.pushups ?? 0,
      situps: row.situps ?? 0,
      squats: row.squats ?? 0,
    };
  });

  return map;
}

async function updateMemberInSupabase(member: Member) {
  const { id } = member;

  const { data, error } = await supabase
    .from("members")
    .update({
      first_name: member.firstName,
      last_name: member.lastName,
      age: member.age,
      birth_ymd: member.birthYmd,
      belt_rank: member.beltRank,
      next_belt_rank: member.nextBeltRank,
      attended_sessions: member.attendedSessions,
      required_sessions: member.requiredSessions,
      progress: member.progress,
      avatar_url: member.avatarUrl,
      member_comment: member.memberComment,
      instructor_comment: member.instructorComment,
      visibility_show_age: member.visibility.showAge,
      visibility_show_belt_info: member.visibility.showBeltInfo,
      visibility_show_grading_status: member.visibility.showGradingStatus,
      visibility_show_member_comment: member.visibility.showMemberComment,
      grading_kihon: member.gradingStatus.kihon,
      grading_kata: member.gradingStatus.kata,
      grading_kumite: member.gradingStatus.kumite,
      grading_physical: member.gradingStatus.physical,
      physical_enabled: member.physicalEnabled,
      is_public: member.isPublic,
    })
    .eq("id", id)
    .select("*");

  if (error) {
    console.error("Fel vid uppdatering av medlem:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error("Ingen rad uppdaterades (RLS/policy blockerar eller fel id).");
  }

  return data[0];
}

async function insertMemberInSupabase(
  member: Omit<Member, "id" | "progress" | "userId">
): Promise<Member> {
  const grading = member.gradingStatus;
  const visibility = member.visibility;

  const { data, error } = await supabase
    .from("members")
    .insert({
      club_id: CLUB_ID,
      first_name: member.firstName,
      last_name: member.lastName,
      age: member.age,
      birth_ymd: member.birthYmd || null,
      belt_rank: member.beltRank,
      next_belt_rank: member.nextBeltRank,
      attended_sessions: member.attendedSessions,
      required_sessions: member.requiredSessions,
      avatar_url: member.avatarUrl,
      member_comment: member.memberComment,
      instructor_comment: member.instructorComment,
      visibility_show_age: visibility.showAge,
      visibility_show_belt_info: visibility.showBeltInfo,
      visibility_show_grading_status: visibility.showGradingStatus,
      visibility_show_member_comment: visibility.showMemberComment,
      grading_kihon: grading.kihon,
      grading_kata: grading.kata,
      grading_kumite: grading.kumite,
      grading_physical: grading.physical,
      physical_enabled: member.physicalEnabled,
      is_public: member.isPublic,
    })
    .select(
      `
      id,
      user_id,
      first_name,
      last_name,
      age,
      birth_ymd,
      belt_rank,
      next_belt_rank,
      attended_sessions,
      required_sessions,
      progress,
      avatar_url,
      member_comment,
      instructor_comment,
      visibility_show_age,
      visibility_show_belt_info,
      visibility_show_grading_status,
      visibility_show_member_comment,
      grading_kihon,
      grading_kata,
      grading_kumite,
      grading_physical,
      physical_enabled,
      is_public
    `
    )
    .single();

  if (error) {
    console.error("Fel vid skapande av medlem:", error);
    throw error;
  }

  const gradingStatus: GradingStatus = {
    kihon: (data.grading_kihon as GradingStatusValue) ?? "not_ready",
    kata: (data.grading_kata as GradingStatusValue) ?? "not_ready",
    kumite: (data.grading_kumite as GradingStatusValue) ?? "not_ready",
    physical: (data.grading_physical as GradingStatusValue) ?? "not_ready",
  };

  const vis: VisibilitySettings = {
    showAge: data.visibility_show_age ?? true,
    showBeltInfo: data.visibility_show_belt_info ?? true,
    showGradingStatus: data.visibility_show_grading_status ?? true,
    showMemberComment: data.visibility_show_member_comment ?? true,
  };

  const physicalEnabled: boolean = data.physical_enabled ?? false;

  const computedProgress = calculateProgress(
    gradingStatus,
    data.attended_sessions ?? 0,
    data.required_sessions ?? 0,
    physicalEnabled
  );

  return {
    id: data.id,
    userId: data.user_id ?? "",
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    age: data.age ?? 0,
    birthYmd: data.birth_ymd ?? "",
    beltRank: (data.belt_rank as BeltRank) ?? "9_kyu",
    nextBeltRank: (data.next_belt_rank as BeltRank) ?? "8_kyu",
    attendedSessions: data.attended_sessions ?? 0,
    requiredSessions: data.required_sessions ?? 0,
    progress: computedProgress,
    avatarUrl: data.avatar_url ?? "/main.png",
    memberComment: data.member_comment ?? "",
    instructorComment: data.instructor_comment ?? "",
    visibility: vis,
    gradingStatus,
    physicalEnabled,
    isPublic: data.is_public ?? true,
  };
}

//
// --- Komponent ---
//

export default function KaratekasPage() {
  const router = useRouter();

  const [role, setRole] = useState<"member" | "admin" | "superadmin">("admin");

  const [members, setMembers] = useState<Member[]>([]);
  const [physicalReqMap, setPhysicalReqMap] = useState<Record<string, PhysicalRequirement>>({});

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const [editingGradingStatus, setEditingGradingStatus] = useState<GradingStatus | null>(null);
  const [editingMemberComment, setEditingMemberComment] = useState("");
  const [editingInstructorComment, setEditingInstructorComment] = useState("");
  const [editingVisibility, setEditingVisibility] = useState<VisibilitySettings | null>(null);
  const [editingPhysicalEnabled, setEditingPhysicalEnabled] = useState<boolean>(false);
  const [editingBeltRank, setEditingBeltRank] = useState<BeltRank>("9_kyu");
  const [editingBirthYmd, setEditingBirthYmd] = useState("");

  // Toast i mitten
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Add popup
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newAge, setNewAge] = useState<number | "">("");
  const [newBeltRank, setNewBeltRank] = useState<BeltRank>("9_kyu");
  const [newBirthYmd, setNewBirthYmd] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, req] = await Promise.all([
        fetchMembersFromSupabase(),
        fetchPhysicalRequirementsFromSupabase(),
      ]);
      setMembers(m);
      setPhysicalReqMap(req);
    })();
  }, []);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => beltOrder.indexOf(a.beltRank) - beltOrder.indexOf(b.beltRank));
  }, [members]);

  const visibleMembers = useMemo(() => {
    return role === "admin" || role === "superadmin"
      ? sortedMembers
      : sortedMembers.filter((m) => m.isPublic);
  }, [role, sortedMembers]);

  const roleButtons: { key: "member" | "admin" | "superadmin"; label: string }[] = [
    { key: "member", label: "Member" },
    { key: "admin", label: "Admin" },
    { key: "superadmin", label: "SuperAdmin" },
  ];

  async function approveGrading(member: Member) {
    const newCurrent = member.nextBeltRank;
    const newNext = getNextBeltRank(newCurrent);
    const newRequired = getRequiredSessionsForNextBelt(newCurrent, newNext);

    const newGrading: GradingStatus = {
      kihon: "not_ready",
      kata: "not_ready",
      kumite: "not_ready",
      physical: "not_ready",
    };

    const updated: Member = {
      ...member,
      beltRank: newCurrent,
      nextBeltRank: newNext,
      attendedSessions: 0,
      requiredSessions: newRequired,
      gradingStatus: newGrading,
      progress: calculateProgress(newGrading, 0, newRequired, member.physicalEnabled),
    };

    await updateMemberInSupabase(updated);
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setSelectedMember(updated);
  }

  return (
    <main className="min-h-screen bg-black/90 text-white flex flex-col">
      {/* Toast-notis i mitten */}
      {toast && toastVisible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
          <div
            className={`rounded-xl border px-5 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${
              toast.type === "success"
                ? "border-emerald-400/30 bg-emerald-900/80 text-emerald-100"
                : "border-red-400/30 bg-red-900/80 text-red-100"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      {/* Roll-växlare */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3 pb-1 text-[11px] text-gray-300">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-500">Vy:</span>
        {roleButtons.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`rounded-full border px-2 py-1 ${
              role === r.key
                ? "border-blue-500 bg-blue-700 text-white"
                : "border-gray-500 bg-black text-gray-300 hover:bg-gray-800"
            } text-[10px] font-semibold`}
            onClick={() => setRole(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Topprad */}
      <header className="flex items-center justify-between px-4 pt-2 pb-2">
        <button
          type="button"
          className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => router.push("/")}
        >
          &#171;&#171;&#171; Tillbaka
        </button>

        {(role === "admin" || role === "superadmin") && (
          <button
            type="button"
            className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
            onClick={() => {
              setNewFirstName("");
              setNewLastName("");
              setNewAge("");
              setNewBeltRank("9_kyu");
              setIsAddOpen(true);
              setNewBirthYmd("");
              setNewIsPublic(true);
            }}
          >
            + Lägg till
          </button>
        )}
      </header>

      {/* Lista */}
      <section className="flex flex-col items-center px-4 pb-8 pt-4">
        <h1 className="mb-2 text-xl font-bold">Klubbmedlemmar</h1>
        <p className="mb-4 text-sm text-gray-300 text-center">Data hämtas från Supabase.</p>

        <div className="w-full max-w-md space-y-3">
          {visibleMembers.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-center text-sm text-gray-300">
              Inga medlemmar att visa.
            </div>
          )}

          {visibleMembers.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`;
            const shortName = `${member.firstName} ${member.lastName.charAt(0)}.`;
            const displayName = role === "member" ? shortName : fullName;
            const rowColor = getBeltColor(member.beltRank);
            const req = physicalReqMap[member.nextBeltRank];

            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 ${rowColor}`}
              >
                <div className="flex-shrink-0">
                  <Image
                    src={member.avatarUrl}
                    alt={fullName}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col text-xs">
                  <span className="font-semibold text-white">{displayName}</span>

                  {/* Ålder: alltid bara "XX år" för alla */}
                  <span className="text-gray-300">Ålder: {getDisplayAge(member)} år</span>

                  <span className="text-gray-300">Nuvarande: {getBeltLabel(member.beltRank)}</span>
                  <span className="text-gray-400">Nästa: {getBeltLabel(member.nextBeltRank)}</span>

                  {/* Fyskrav visas bara om aktiverad */}
                  {member.physicalEnabled && (
                    <div className="mt-1">
                      {req ? (
                        <span className="block text-[10px] text-gray-200">
                          Önskvärd fyskrav till nästa bälte:{" "}
                          <span className="font-semibold">{req.pushups}</span> armhävningar,{" "}
                          <span className="font-semibold">{req.situps}</span> situps,{" "}
                          <span className="font-semibold">{req.squats}</span> squats
                        </span>
                      ) : (
                        <span className="block text-[10px] text-gray-400">
                          (Saknar fyskrav för {member.nextBeltRank})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
  <ProgressCircle progress={member.progress} />

  <div className="flex items-center gap-1">
    
  {(role === "admin" || role === "superadmin") && (
  <button
    type="button"
    className="rounded-md bg-gray-800 px-2 py-1 text-[10px] font-semibold hover:bg-gray-700"
    onClick={() => alert("Här kommer snabb närvaroregistrering senare.")}
  >
    Närvaro
  </button>
)}

    {(role === "admin" || role === "superadmin") && (
      <button
        type="button"
        className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
          member.isPublic
            ? "bg-emerald-800 text-emerald-100"
            : "bg-red-800 text-red-100"
        }`}
        onClick={() => {
          // Ingen ändring här (enligt din önskan).
          // Denna knapp visar status. Ändring görs inne i profilen.
          setSelectedMember(member);
          setEditingGradingStatus(member.gradingStatus);
          setEditingMemberComment(member.memberComment ?? "");
          setEditingInstructorComment(member.instructorComment ?? "");
          setEditingVisibility(member.visibility);
          setEditingPhysicalEnabled(member.physicalEnabled);
          setEditingBeltRank(member.beltRank);
          setEditingBirthYmd(member.birthYmd ?? "");
        }}
        title="Ändra synlighet inne i profilen"
      >
        {member.isPublic ? "Publik" : "Ej publik"}
      </button>
    )}
  </div>

  <button
    type="button"
    className="rounded-md bg-gray-800 px-2 py-1 text-[10px] font-semibold hover:bg-gray-700"
    onClick={() => {
      setSelectedMember(member);
      setEditingGradingStatus(member.gradingStatus);
      setEditingMemberComment(member.memberComment ?? "");
      setEditingInstructorComment(member.instructorComment ?? "");
      setEditingVisibility(member.visibility);
      setEditingPhysicalEnabled(member.physicalEnabled);
      setEditingBeltRank(member.beltRank);
      setEditingBirthYmd(member.birthYmd ?? "");
    }}
  >
    Profil
  </button>
</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Profil-popup */}
      {selectedMember && editingGradingStatus && editingVisibility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-neutral-950 p-4 shadow-xl border border-white/10">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {role !== "member" && (
                  <span className="text-gray-300">#{selectedMember.userId || "------"} </span>
                )}
                <span>
                  {selectedMember.firstName}{" "}
                  {role === "member"
                    ? `${selectedMember.lastName.charAt(0)}.`
                    : selectedMember.lastName}
                </span>
              </h2>

              <button
                type="button"
                className="text-xs text-gray-300 hover:text-white"
                onClick={() => {
                  setSelectedMember(null);
                  setEditingGradingStatus(null);
                  setEditingMemberComment("");
                  setEditingInstructorComment("");
                  setEditingVisibility(null);
                  setEditingPhysicalEnabled(false);
                  setEditingBeltRank("9_kyu");
                  setEditingBirthYmd("");
                }}
              >
                Stäng
              </button>
            </div>

            {/* Bild + tårta */}
            <div className="mb-4 flex items-center gap-4">
              <Image
                src={selectedMember.avatarUrl}
                alt={selectedMember.firstName}
                width={120}
                height={120}
                className="h-24 w-24 rounded-full object-cover"
              />
              <div className="flex flex-col items-center gap-1">
                <LargeProgressCircle progress={selectedMember.progress} />
                <span className="text-[11px] text-gray-300">Progress mot nästa gradering</span>

                {/* Närvaro i profilen: syns för alla */}
                <span className="text-[10px] text-gray-400">
                  Närvaro: {selectedMember.attendedSessions}/{selectedMember.requiredSessions} pass
                </span>
              </div>
            </div>

            {/* Publik / Inte publik (endast admin/superadmin) */}
            {(role === "admin" || role === "superadmin") && (
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-200">
                  Synlighet i medlemslistan
                </p>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-300">
                    Status:{" "}
                    <span className="font-semibold">
                      {selectedMember.isPublic ? "Publik" : "Inte publik"}
                    </span>
                  </span>

                  <button
                    type="button"
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      selectedMember.isPublic
                        ? "bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
                        : "bg-red-700 text-red-50 hover:bg-red-600"
                    }`}
                    onClick={async () => {
                      try {
                        const updated = {
                          ...selectedMember,
                          isPublic: !selectedMember.isPublic,
                        };

                        await updateMemberInSupabase(updated);

                        setSelectedMember(updated);
                        setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

                        setToast({
                          type: "success",
                          text: updated.isPublic ? "Satt till Publik" : "Satt till Inte publik",
                        });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 1400);
                      } catch (err) {
                        console.error("Kunde inte ändra synlighet:", err);
                        setToast({ type: "error", text: "Kunde inte ändra synlighet." });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 2000);
                      }
                    }}
                  >
                    {selectedMember.isPublic ? "Gör Inte publik" : "Gör Publik"}
                  </button>
                </div>

                <p className="mt-2 text-[10px] text-gray-500">
                  Inte publik innebär att medlemmen inte syns för andra i medlemslistan.
                </p>
              </div>
            )}

            {/* Grundinfo */}
            <div className="mb-4 space-y-2 text-sm">
              {editingVisibility.showAge && (
                <>
                  <p className="text-gray-200">
                    Ålder: <span className="font-semibold">{getDisplayAge(selectedMember)} år</span>
                  </p>

                  {(role === "admin" || role === "superadmin") && (
                    <div className="mt-2">
                      <label className="mb-1 block text-[11px] text-gray-300">
                        Födelsedata (YYMMDD)
                      </label>

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                        value={editingBirthYmd}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setEditingBirthYmd(onlyDigits);
                          setSelectedMember((prev) => (prev ? { ...prev, birthYmd: onlyDigits } : prev));
                        }}
                        placeholder="t.ex. 770612"
                      />

                      <p className="mt-1 text-[10px] text-gray-500">
                        {editingBirthYmd && formatBirthIso(editingBirthYmd)
                          ? `Tolkning: ${formatBirthIso(editingBirthYmd)}`
                          : "Ange 6 siffror (YYMMDD)."}
                      </p>
                    </div>
                  )}
                </>
              )}

              {editingVisibility.showBeltInfo && (
                <>
                  {role === "member" ? (
                    <>
                      <p className="text-gray-200">
                        Nuvarande:{" "}
                        <span className="font-semibold">{getBeltLabel(selectedMember.beltRank)}</span>
                      </p>
                      <p className="text-gray-300">
                        Nästa:{" "}
                        <span className="font-semibold">{getBeltLabel(selectedMember.nextBeltRank)}</span>
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-gray-300">Nuvarande grad</label>
                        <select
                          className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                          value={editingBeltRank}
                          onChange={(e) => {
                            const newCurrent = e.target.value as BeltRank;
                            const newNext = getNextBeltRank(newCurrent);
                            const newRequired = getRequiredSessionsForNextBelt(newCurrent, newNext);

                            setEditingBeltRank(newCurrent);

                            setSelectedMember((prev) => {
                              if (!prev || !editingGradingStatus) return prev;

                              const updated = {
                                ...prev,
                                beltRank: newCurrent,
                                nextBeltRank: newNext,
                                requiredSessions: newRequired,
                              };

                              const newProgress = calculateProgress(
                                editingGradingStatus,
                                updated.attendedSessions,
                                updated.requiredSessions,
                                editingPhysicalEnabled
                              );

                              return { ...updated, progress: newProgress };
                            });
                          }}
                        >
                          {beltOrder.map((b) => (
                            <option key={b} value={b}>
                              {getBeltLabel(b)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-gray-300">Nästa grad (auto)</label>
                        <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-xs text-gray-100">
                          {getBeltLabel(getNextBeltRank(editingBeltRank))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-gray-300">Kräver antal pass (auto)</label>
                        <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-xs text-gray-100">
                          {getRequiredSessionsForNextBelt(editingBeltRank, getNextBeltRank(editingBeltRank))} pass
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Fysiska krav (visas bara om aktiverad) */}
            {selectedMember.physicalEnabled && (
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-200">
                  Fysiska krav inför {getBeltLabel(selectedMember.nextBeltRank)}
                </p>

                {physicalReqMap[selectedMember.nextBeltRank] ? (
                  <ul className="space-y-1 text-xs text-gray-200">
                    <li>
                      Armhävningar:{" "}
                      <span className="font-semibold">
                        {physicalReqMap[selectedMember.nextBeltRank].pushups}
                      </span>
                    </li>
                    <li>
                      Situps:{" "}
                      <span className="font-semibold">
                        {physicalReqMap[selectedMember.nextBeltRank].situps}
                      </span>
                    </li>
                    <li>
                      Squats:{" "}
                      <span className="font-semibold">
                        {physicalReqMap[selectedMember.nextBeltRank].squats}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray-400">Saknar fyskrav för detta bälte.</p>
                )}
              </div>
            )}

            {/* Graderingsstatus + Fysik */}
            <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-200">Graderingsstatus</p>

              {/* Member: read only */}
              {role === "member" && editingVisibility.showGradingStatus && (
                <div className="space-y-2 text-xs">
                  {(["Kihon", "Kata", "Kumite", "Fysik"] as const).map((label, idx) => {
                    const key = ["kihon", "kata", "kumite", "physical"][idx] as keyof GradingStatus;
                    const { label: text, color } = getGradingLabelAndColor(selectedMember.gradingStatus[key]);
                    return (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="text-gray-200">{label}</span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${color}`}>
                          {text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Admin: edit */}
              {role !== "member" && (
                <>
                  <div className="space-y-3 text-[11px] mt-2">
                    {(
                      [
                        ["Kihon", "kihon"],
                        ["Kata", "kata"],
                        ["Kumite", "kumite"],
                        ["Fysik", "physical"],
                      ] as [string, keyof GradingStatus][]
                    ).map(([label, key]) => {
                      const currentValue = editingGradingStatus[key];
                      const disabled = key === "physical" && !editingPhysicalEnabled;

                      return (
                        <div key={label} className="flex flex-col gap-1">
                          <span className="text-gray-200 text-xs">{label}</span>
                          <div className="flex gap-2">
                            {(
                              [
                                ["Icke redo", "not_ready"],
                                ["Delvis redo", "partial"],
                                ["Redo", "ready"],
                              ] as [string, GradingStatusValue][]
                            ).map(([btnLabel, val]) => {
                              const isActive = currentValue === val;

                              let baseColor = "bg-gray-800 text-gray-200 border-gray-600";
                              if (val === "not_ready") baseColor = "bg-red-950/60 text-red-100 border-red-700";
                              if (val === "partial") baseColor = "bg-orange-950/60 text-orange-100 border-orange-700";
                              if (val === "ready") baseColor = "bg-emerald-950/60 text-emerald-100 border-emerald-700";

                              return (
                                <button
                                  key={val}
                                  type="button"
                                  disabled={disabled}
                                  className={`flex-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                    disabled
                                      ? "bg-gray-900 text-gray-600 border-gray-700 cursor-not-allowed"
                                      : isActive
                                      ? baseColor
                                      : "bg-black text-gray-300 border-gray-600 hover:bg-gray-800"
                                  }`}
                                  onClick={() =>
                                    setEditingGradingStatus((prev) => {
                                      if (!prev || disabled) return prev;

                                      const updatedStatus: GradingStatus = { ...prev, [key]: val };

                                      const newProgress = calculateProgress(
                                        updatedStatus,
                                        selectedMember.attendedSessions,
                                        selectedMember.requiredSessions,
                                        editingPhysicalEnabled
                                      );

                                      setSelectedMember({ ...selectedMember, gradingStatus: updatedStatus, progress: newProgress });

                                      return updatedStatus;
                                    })
                                  }
                                >
                                  {btnLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Toggle Fysik */}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-emerald-500"
                        checked={editingPhysicalEnabled}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setEditingPhysicalEnabled(enabled);
                          setSelectedMember((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  progress: calculateProgress(
                                    editingGradingStatus,
                                    prev.attendedSessions,
                                    prev.requiredSessions,
                                    enabled
                                  ),
                                  physicalEnabled: enabled,
                                }
                              : prev
                          );
                        }}
                      />
                      <span className="text-[11px] text-gray-200">
                        Räkna in fysik i graderingen
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] text-gray-500">
                      (Ändringar sparas permanent först när du klickar på &quot;Spara ändringar&quot; längst ner.)
                    </p>
                  </div>

                  {/* Godkänn gradering */}
                  <div className="mt-3">
                    <button
                      type="button"
                      className="rounded-md bg-blue-700 px-3 py-1 text-[11px] font-semibold text-blue-50 hover:bg-blue-600"
                      onClick={async () => {
                        try {
                          await approveGrading(selectedMember);
                          setToast({ type: "success", text: "Gradering godkänd!" });
                          setToastVisible(true);
                          setTimeout(() => setToastVisible(false), 1400);
                        } catch (err) {
                          console.error("Kunde inte godkänna gradering:", err);
                          setToast({ type: "error", text: "Kunde inte godkänna." });
                          setToastVisible(true);
                          setTimeout(() => setToastVisible(false), 2000);
                        }
                      }}
                    >
                      Godkänn gradering (byt till {getBeltLabel(selectedMember.nextBeltRank)})
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Kommentar till medlem */}
            <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-200">Kommentar till medlem</p>

              {role === "member" ? (
                selectedMember.visibility.showMemberComment ? (
                  <p className="text-xs text-gray-200 whitespace-pre-line">
                    {selectedMember.memberComment || "Ingen kommentar ännu."}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500">Denna information är inte tillgänglig.</p>
                )
              ) : (
                <textarea
                  className="h-20 w-full resize-none rounded-md border border-gray-700 bg-black/60 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                  value={editingMemberComment}
                  onChange={(e) => setEditingMemberComment(e.target.value)}
                />
              )}
            </div>

            {/* Intern kommentar */}
            {role !== "member" && (
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-200">Intern instruktörskommentar</p>
                <textarea
                  className="h-20 w-full resize-none rounded-md border border-gray-700 bg-black/60 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                  value={editingInstructorComment}
                  onChange={(e) => setEditingInstructorComment(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-gray-500">Denna kommentar visas inte för medlemmen.</p>
              </div>
            )}

            {/* Popup-knappar */}
            <div className="flex justify-end gap-2">
              {role !== "member" && (
                <button
                  type="button"
                  className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-600"
                  onClick={async () => {
                    try {
                      if (!selectedMember || !editingGradingStatus || !editingVisibility) {
                        setToast({ type: "error", text: "Kan inte spara." });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 1600);
                        return;
                      }

                      setToast({ type: "success", text: "Sparar..." });
                      setToastVisible(true);

                      const newCurrent = editingBeltRank;
                      const newNext = getNextBeltRank(newCurrent);
                      const newRequired = getRequiredSessionsForNextBelt(newCurrent, newNext);

                      const updated: Member = {
                        ...selectedMember,
                        beltRank: newCurrent,
                        nextBeltRank: newNext,
                        requiredSessions: newRequired,
                        gradingStatus: editingGradingStatus,
                        progress: calculateProgress(
                          editingGradingStatus,
                          selectedMember.attendedSessions,
                          newRequired,
                          editingPhysicalEnabled
                        ),
                        memberComment: editingMemberComment,
                        instructorComment: editingInstructorComment,
                        visibility: editingVisibility,
                        physicalEnabled: editingPhysicalEnabled,
                        birthYmd: editingBirthYmd,
                      };

                      await updateMemberInSupabase(updated);

                      setSelectedMember(updated);
                      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

                      setToast({ type: "success", text: "Sparat!" });
                      setToastVisible(true);
                      setTimeout(() => setToastVisible(false), 1200);
                    } catch (err) {
                      console.error("Spara ändringar: FEL", err);
                      setToast({ type: "error", text: "Kunde inte spara." });
                      setToastVisible(true);
                      setTimeout(() => setToastVisible(false), 2000);
                    }
                  }}
                >
                  Spara ändringar
                </button>
              )}

              <button
                type="button"
                className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
                onClick={() => {
                  setSelectedMember(null);
                  setEditingGradingStatus(null);
                  setEditingMemberComment("");
                  setEditingInstructorComment("");
                  setEditingVisibility(null);
                  setEditingPhysicalEnabled(false);
                  setEditingBeltRank("9_kyu");
                  setEditingBirthYmd("");
                }}
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}

{/* Lägg till medlem-popup */}
{isAddOpen && (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6">
    <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl bg-neutral-950 p-4 shadow-xl border border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Lägg till medlem</h2>
        <button
          type="button"
          className="text-xs text-gray-300 hover:text-white"
          onClick={() => setIsAddOpen(false)}
        >
          Stäng
        </button>
      </div>

      <div className="space-y-3 text-xs">
        {/* Namn */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-gray-300">Förnamn</label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-gray-300">Efternamn</label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
            />
          </div>
        </div>

        {/* Födelsedata + auto-ålder */}
        <div>
          <label className="mb-1 block text-gray-300">
            Födelsedata (YYMMDD)
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
            value={newBirthYmd}
            onChange={(e) => {
              const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setNewBirthYmd(onlyDigits);
            }}
            placeholder="t.ex. 770612"
          />

          <div className="mt-2 rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-100">
            Ålder (auto):{" "}
            <span className="font-semibold">
              {(() => {
                const d = parseBirthYmdToDate(newBirthYmd);
                return d ? calculateAgeFromBirthDate(d) : "-";
              })()}
            </span>
          </div>

          <p className="mt-1 text-[10px] text-gray-500">
            Skriv 6 siffror (YYMMDD). Åldern beräknas automatiskt.
          </p>
        </div>

        {/* Publik vid skapande */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-3 w-3 accent-emerald-500"
            checked={newIsPublic}
            onChange={(e) => setNewIsPublic(e.target.checked)}
          />
          <span className="text-[11px] text-gray-200">
            Publik i medlemslistan
          </span>
        </div>

        {/* Nuvarande bälte */}
        <div>
          <label className="mb-1 block text-gray-300">Nuvarande bälte</label>
          <select
            className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
            value={newBeltRank}
            onChange={(e) => setNewBeltRank(e.target.value as BeltRank)}
          >
            {beltOrder.map((b) => (
              <option key={b} value={b}>
                {getBeltLabel(b)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-gray-300">Nästa bälte (auto)</label>
          <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-100">
            {getBeltLabel(getNextBeltRank(newBeltRank))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-gray-300">
            Kräver antal pass (auto)
          </label>
          <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-100">
            {getRequiredSessionsForNextBelt(
              newBeltRank,
              getNextBeltRank(newBeltRank)
            )}{" "}
            pass
          </div>
        </div>
      </div>

      {/* Knappar */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => setIsAddOpen(false)}
        >
          Avbryt
        </button>

        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-600"
          onClick={async () => {
            if (!newFirstName || !newLastName) {
              alert("Förnamn och efternamn måste fyllas i.");
              return;
            }

            if (newBirthYmd && !parseBirthYmdToDate(newBirthYmd)) {
              alert("Födelsedata måste vara giltigt (YYMMDD).");
              return;
            }

            const next = getNextBeltRank(newBeltRank);
            const requiredNumber = getRequiredSessionsForNextBelt(
              newBeltRank,
              next
            );

            const base: Omit<Member, "id" | "progress" | "userId"> = {
              firstName: newFirstName,
              lastName: newLastName,
              age: 0,
              birthYmd: newBirthYmd,
              beltRank: newBeltRank,
              nextBeltRank: next,
              attendedSessions: 0,
              requiredSessions: requiredNumber,
              avatarUrl: "/main.png",
              memberComment: "",
              instructorComment: "",
              visibility: {
                showAge: true,
                showBeltInfo: true,
                showGradingStatus: true,
                showMemberComment: true,
              },
              gradingStatus: {
                kihon: "not_ready",
                kata: "not_ready",
                kumite: "not_ready",
                physical: "not_ready",
              },
              physicalEnabled: false,
              isPublic: newIsPublic,
            };

            try {
              const created = await insertMemberInSupabase(base);
              setMembers((prev) => [...prev, created]);
              setIsAddOpen(false);
            } catch (err) {
              console.error("Kunde inte skapa medlem:", err);
              alert("Det gick inte att skapa medlemmen. Försök igen.");
            }
          }}
        >
          Spara medlem
        </button>
      </div>
    </div>
  </div>
)}   
      
    </main>
  );
}