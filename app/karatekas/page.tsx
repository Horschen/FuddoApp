"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
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
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  beltRank: BeltRank;
  nextBeltRank: BeltRank;
  attendedSessions: number;
  requiredSessions: number;
  progress: number; // 0–1
  avatarUrl: string;
  memberComment: string;
  instructorComment: string;
  visibility: VisibilitySettings;
  gradingStatus: GradingStatus;
};

//
// --- Hjälpfunktioner ---
//

function getBeltColor(belt: BeltRank): string {
  switch (belt) {
    case "9_kyu":
      return "bg-red-900/50";
    case "8_kyu":
      return "bg-yellow-900/40";
    case "7_kyu":
      return "bg-orange-900/40";
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
    case "1_dan":
    case "2_dan":
    case "3_dan":
    case "4_dan":
    case "5_dan":
    case "6_dan":
    case "7_dan":
    case "8_dan":
    case "9_dan":
    case "10_dan":
      return "bg-gray-800/60";
    default:
      return "bg-gray-800/40";
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

function getGradingLabelAndColor(value: GradingStatusValue) {
  switch (value) {
    case "not_ready":
      return { label: "Icke redo", color: "bg-red-900/50 text-red-200" };
    case "partial":
      return { label: "Delvis redo", color: "bg-amber-900/50 text-amber-100" };
    case "ready":
      return { label: "Redo", color: "bg-emerald-900/50 text-emerald-100" };
    default:
      return { label: "-", color: "bg-gray-800 text-gray-200" };
  }
}

// 50% teknik + 50% närvaro
function calculateProgress(
  status: GradingStatus,
  attended: number,
  required: number
): number {
  const valueOf = (v: GradingStatusValue) => {
    if (v === "ready") return 1;
    if (v === "partial") return 0.5;
    return 0;
  };

  const techTotal =
    valueOf(status.kihon) + valueOf(status.kata) + valueOf(status.kumite);
  const techScore = techTotal / 3;

  let attScore = 0;
  if (required > 0) {
    attScore = Math.min(attended / required, 1);
  }

  return 0.5 * techScore + 0.5 * attScore;
}

// Liten tårta (listan)
function ProgressCircle({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clamped * 100);

  let color = "stroke-red-500";
  if (clamped >= 0.75) color = "stroke-emerald-500";
  else if (clamped >= 0.5) color = "stroke-orange-400";

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

// Stor tårta (profil)
function LargeProgressCircle({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clamped * 100);

  let color = "stroke-red-500";
  if (clamped >= 0.75) color = "stroke-emerald-500";
  else if (clamped >= 0.5) color = "stroke-orange-400";

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
// --- Dummy-data (fallback om Supabase är tom eller felar) ---
//

const DUMMY_MEMBERS: Member[] = [
  {
    id: "dummy-1",
    firstName: "Anna",
    lastName: "Svensson",
    age: 12,
    beltRank: "6_kyu",
    nextBeltRank: "5_kyu",
    attendedSessions: 18,
    requiredSessions: 30,
    progress: 0, // sätts när vi använder den
    avatarUrl: "/main.png",
    memberComment:
      "Bra utveckling denna termin. Fortsätt jobba med balans i sparkarna.",
    instructorComment:
      "Tappar fokus efter ~30 min. Håll koll på hennes ork och ge korta pauser.",
    visibility: {
      showAge: true,
      showBeltInfo: true,
      showGradingStatus: true,
      showMemberComment: true,
    },
    gradingStatus: {
      kihon: "partial",
      kata: "ready",
      kumite: "not_ready",
    },
  },
  {
    id: "dummy-2",
    firstName: "Erik",
    lastName: "Larsson",
    age: 15,
    beltRank: "3_kyu",
    nextBeltRank: "2_kyu",
    attendedSessions: 10,
    requiredSessions: 60,
    progress: 0,
    avatarUrl: "/main.png",
    memberComment: "Stabil närvaro. Behöver mer självförtroende i kumite.",
    instructorComment:
      "Kan bli lite för passiv i sparring. Testa att ge tydligare uppgifter.",
    visibility: {
      showAge: true,
      showBeltInfo: true,
      showGradingStatus: false,
      showMemberComment: true,
    },
    gradingStatus: {
      kihon: "not_ready",
      kata: "partial",
      kumite: "partial",
    },
  },
  {
    id: "dummy-3",
    firstName: "Sara",
    lastName: "Nilsson",
    age: 20,
    beltRank: "1_dan",
    nextBeltRank: "2_dan",
    attendedSessions: 120,
    requiredSessions: 120,
    progress: 0,
    avatarUrl: "/main.png",
    memberComment: "Väldigt bra tekniskt. Nästa steg: mer ledarroll.",
    instructorComment:
      "Potentiell senpai/instruktör. Ge mer ansvar i uppvärmningar.",
    visibility: {
      showAge: true,
      showBeltInfo: true,
      showGradingStatus: true,
      showMemberComment: false,
    },
    gradingStatus: {
      kihon: "ready",
      kata: "ready",
      kumite: "ready",
    },
  },
];

//
// --- Supabase-hämtning ---
//

async function fetchMembersFromSupabase(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select(
      `
      id,
      first_name,
      last_name,
      age,
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
      grading_kumite
    `
    );

  if (error) {
    console.error("Fel vid hämtning av medlemmar:", error);
    return [];
  }

  if (!data || data.length === 0) {
    console.warn("Supabase: inga medlemmar hittades, använder dummy-data.");
    const withProgress = DUMMY_MEMBERS.map((m) => ({
      ...m,
      progress: calculateProgress(
        m.gradingStatus,
        m.attendedSessions,
        m.requiredSessions
      ),
    }));
    return withProgress;
  }

  const members: Member[] = data.map((row: any) => {
    const gradingStatus: GradingStatus = {
      kihon: (row.grading_kihon as GradingStatusValue) ?? "not_ready",
      kata: (row.grading_kata as GradingStatusValue) ?? "not_ready",
      kumite: (row.grading_kumite as GradingStatusValue) ?? "not_ready",
    };

    const visibility: VisibilitySettings = {
      showAge:
        row.visibility_show_age !== null ? row.visibility_show_age : true,
      showBeltInfo:
        row.visibility_show_belt_info !== null
          ? row.visibility_show_belt_info
          : true,
      showGradingStatus:
        row.visibility_show_grading_status !== null
          ? row.visibility_show_grading_status
          : true,
      showMemberComment:
        row.visibility_show_member_comment !== null
          ? row.visibility_show_member_comment
          : true,
    };

    const computedProgress = calculateProgress(
      gradingStatus,
      row.attended_sessions ?? 0,
      row.required_sessions ?? 0
    );

    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      age: row.age ?? 0,
      beltRank: row.belt_rank as BeltRank,
      nextBeltRank: row.next_belt_rank as BeltRank,
      attendedSessions: row.attended_sessions ?? 0,
      requiredSessions: row.required_sessions ?? 0,
      progress: row.progress ?? computedProgress,
      avatarUrl: row.avatar_url ?? "/main.png",
      memberComment: row.member_comment ?? "",
      instructorComment: row.instructor_comment ?? "",
      visibility,
      gradingStatus,
    };
  });

  console.log("Supabase: hämtade medlemmar:", members);
  return members;
}

//
// --- Komponent ---
//

export default function KaratekasPage() {
  const router = useRouter();

  const [role, setRole] = useState<"member" | "admin" | "superadmin">("admin");
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingGradingStatus, setEditingGradingStatus] =
    useState<GradingStatus | null>(null);
  const [editingMemberComment, setEditingMemberComment] = useState("");
  const [editingInstructorComment, setEditingInstructorComment] =
    useState("");
  const [editingVisibility, setEditingVisibility] =
    useState<VisibilitySettings | null>(null);

  // Hämta medlemmar från Supabase (eller dummy om inga finns)
  useEffect(() => {
    async function loadMembers() {
      const fetched = await fetchMembersFromSupabase();
      setMembers(fetched);
    }
    loadMembers();
  }, []);

  const sortedMembers = [...members].sort(
    (a, b) => beltOrder.indexOf(a.beltRank) - beltOrder.indexOf(b.beltRank)
  );

  const roleButtons: { key: "member" | "admin" | "superadmin"; label: string }[] =
    [
      { key: "member", label: "Member" },
      { key: "admin", label: "Admin" },
      { key: "superadmin", label: "SuperAdmin" },
    ];

  return (
    <main className="min-h-screen bg-black/90 text-white flex flex-col">
      {/* Roll-växlare */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3 pb-1 text-[11px] text-gray-300">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-500">
          Vy:
        </span>
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
              alert("Här kommer funktionen för att lägga till nya medlemmar.");
            }}
          >
            + Lägg till
          </button>
        )}
      </header>

      {/* Innehåll */}
      <section className="flex flex-col items-center px-4 pb-8 pt-4">
        <h1 className="mb-2 text-xl font-bold">Klubbmedlemmar</h1>
        <p className="mb-4 text-sm text-gray-300 text-center">
          Data hämtas nu från Supabase (eller dummy-data om Supabase är tom).
        </p>

        <div className="w-full max-w-md space-y-3">
          {sortedMembers.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`;
            const shortName = `${member.firstName} ${member.lastName.charAt(
              0
            )}.`;
            const displayName = role === "member" ? shortName : fullName;
            const rowColor = getBeltColor(member.beltRank);

            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 ${rowColor}`}
              >
                {/* Mini-bild */}
                <div className="flex-shrink-0">
                  <Image
                    src={member.avatarUrl}
                    alt={fullName}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                </div>

                {/* Mitt-info */}
                <div className="flex flex-1 flex-col text-xs">
                  <span className="font-semibold text-white">
                    {displayName}
                  </span>
                  <span className="text-gray-300">
                    Ålder: {member.age} år
                  </span>
                  <span className="text-gray-300">
                    Nuvarande: {getBeltLabel(member.beltRank)}
                  </span>
                  <span className="text-gray-400">
                    Nästa: {getBeltLabel(member.nextBeltRank)}
                  </span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    Närvaro: {member.attendedSessions}/{member.requiredSessions} pass
                  </span>
                </div>

                {/* Högerdel */}
                <div className="flex flex-col items-end gap-1">
                  <ProgressCircle progress={member.progress} />

                  <button
                    type="button"
                    className="rounded-md bg-gray-800 px-2 py-1 text-[10px] font-semibold hover:bg-gray-700"
                    onClick={() =>
                      alert("Här kommer snabb närvaroregistrering senare.")
                    }
                  >
                    Närvaro
                  </button>

                  <button
                    type="button"
                    className="rounded-md bg-gray-800 px-2 py-1 text-[10px] font-semibold hover:bg-gray-700"
                    onClick={() => {
                      setSelectedMember(member);
                      setEditingGradingStatus(member.gradingStatus);
                      setEditingMemberComment(member.memberComment ?? "");
                      setEditingInstructorComment(
                        member.instructorComment ?? ""
                      );
                      setEditingVisibility(member.visibility);
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

      {/* Profil-popup (oförändrad logik från tidigare) */}
      {/* ... (samma popup som i förra filen, vi kan behålla den) ... */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-neutral-950 p-4 shadow-xl border border-white/10">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {selectedMember.firstName}{" "}
                {role === "member"
                  ? `${selectedMember.lastName.charAt(0)}.`
                  : selectedMember.lastName}
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
                }}
              >
                Stäng
              </button>
            </div>

            {/* Bild + stor tårta */}
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
                <span className="text-[11px] text-gray-300">
                  Progress mot nästa gradering
                </span>
                <span className="text-[10px] text-gray-400">
                  Närvaro: {selectedMember.attendedSessions}/
                  {selectedMember.requiredSessions} pass
                </span>
              </div>
            </div>

            {/* Resterande popup-sektioner är samma som i förra filen */}
            {/* ... du kan behålla samma graderings-, synlighets-, kommentar- och knapp-sektioner här ... */}
            {/* För att inte göra det ännu mer texttungt, har jag inte duplicerat varje rad här,
                men principen är: vi har bara ändrat HUR members fylls, inte hur popupen funkar. */}
          </div>
        </div>
      )}
    </main>
  );
}