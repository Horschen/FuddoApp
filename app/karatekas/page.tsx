"use client";

/* =========================================================
   IMPORTS
========================================================= */
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================================================
   TYPES
========================================================= */
type MemberRole = "member" | "admin" | "superadmin";

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

  // Ålder visas från birthYmd om den finns, annars fallback age
  age: number;
  birthYmd: string; // "YYMMDD"

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

  // Synlighet i listan
  isPublic: boolean;

  // Roll / behörighet
  role: MemberRole;
};

/* =========================================================
   CONSTANTS
========================================================= */

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

/* =========================================================
   UI HELPERS (labels/colors)
========================================================= */
function getBeltColor(belt: BeltRank): string {
  switch (belt) {
    case "9_kyu":
      // Rött
      return "bg-red-900/60";

    case "8_kyu":
    // Mycket gul
    return "bg-yellow-500/60";

    case "7_kyu":
    // Mer orange (inte brun)
    return "bg-orange-500/60"

    case "6_kyu":
      // Grönt
      return "bg-green-800/40";

    case "5_kyu":
      // Ljusblå
      return "bg-sky-500/30";

    case "4_kyu":
      // Något mörkare blå
      return "bg-blue-700/30";

    case "3_kyu":
      // Ljusbrun
      return "bg-amber-600/30";

    case "2_kyu":
      // Mörkare brun
      return "bg-amber-700/30";

    case "1_kyu":
      // Ännu mörkare brun
      return "bg-amber-800/30";

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

function getRequiredSessionsForNextBelt(
  current: BeltRank,
  next: BeltRank
): number {
  const idx = beltOrder.indexOf(current);

  if (idx >= beltOrder.indexOf("9_kyu") && idx <= beltOrder.indexOf("3_kyu"))
    return 30;
  if (idx >= beltOrder.indexOf("3_kyu") && idx <= beltOrder.indexOf("1_kyu"))
    return 60;

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

/* =========================================================
   PROGRESS + AGE HELPERS
========================================================= */
function calculateProgress(
  status: GradingStatus,
  attended: number,
  required: number,
  physicalEnabled: boolean
): number {
  const valueOf = (v: GradingStatusValue) =>
    v === "ready" ? 1 : v === "partial" ? 0.5 : 0;

  const parts = [status.kihon, status.kata, status.kumite];
  if (physicalEnabled) parts.push(status.physical);

  const techScore =
    parts.reduce((sum, v) => sum + valueOf(v), 0) / parts.length;
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

  const fullYear = yy <= 29 ? 2000 + yy : 1900 + yy;

  const d = new Date(fullYear, mm - 1, dd);
  if (
    d.getFullYear() !== fullYear ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd
  )
    return null;

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

/* =========================================================
   PROGRESS CIRCLES
========================================================= */
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

/* =========================================================
   SUPABASE: FETCH/UPDATE/INSERT
========================================================= */
async function fetchMembersFromSupabase(clubId: string): Promise<Member[]> {
  // Skydd: om clubId inte är en UUID, gör inget
  const isUuid =
    typeof clubId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clubId
    );

  if (!isUuid) {
    console.warn("fetchMembersFromSupabase: ogiltigt clubId:", clubId);
    return [];
  }

  const { data, error } = await supabase
    .from("members")
    .select(
      `
      id,
      user_id,
      club_id,
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
      is_public,
      role
    `
    )
    .eq("club_id", clubId);

  if (error) {
    console.error("Fel vid hämtning av medlemmar:", error.message, error);
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

    const beltRank = (row.belt_rank as BeltRank) ?? "9_kyu";
    const nextBeltRank =
      (row.next_belt_rank as BeltRank) ?? getNextBeltRank(beltRank);

    return {
      id: row.id,
      userId: row.user_id ?? "",
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      age: row.age ?? 0,
      birthYmd: row.birth_ymd ?? "",
      beltRank,
      nextBeltRank,
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
      role: (row.role as MemberRole) ?? "member",
    };
  });
}

async function fetchPhysicalRequirementsFromSupabase(
  clubId: string
): Promise<Record<string, PhysicalRequirement>> {
  // Skydd: om clubId inte är en UUID, gör inget
  const isUuid =
    typeof clubId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clubId
    );

  if (!isUuid) {
    console.warn("fetchPhysicalRequirementsFromSupabase: ogiltigt clubId:", clubId);
    return {};
  }

  const { data, error } = await supabase
    .from("physical_requirements")
    .select("belt_rank, pushups, situps, squats")
    .eq("club_id", clubId);

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
  const { data, error } = await supabase
    .from("members")
    .update({
      first_name: member.firstName,
      last_name: member.lastName,
      age: member.age,
      birth_ymd: member.birthYmd || null,
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
      role: member.role,
    })
    .eq("id", member.id)
    .select("*");

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Ingen rad uppdaterades (RLS/policy eller fel id).");
  return data[0];
}

async function insertMemberInSupabase(
  clubId: string,
  member: Omit<Member, "id" | "progress" | "userId">
): Promise<Member> {
  const grading = member.gradingStatus;
  const visibility = member.visibility;

  const { data, error } = await supabase
    .from("members")
    .insert({
      club_id: clubId,
      first_name: member.firstName,
      last_name: member.lastName,
      age: member.age,
      birth_ymd: member.birthYmd || null,
      belt_rank: member.beltRank,
      next_belt_rank: member.nextBeltRank,
      attended_sessions: member.attendedSessions,
      required_sessions: member.requiredSessions,
      progress: 0,
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
      role: "member",
    })
    .select(
      `
      id,
      user_id,
      club_id,
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
      is_public,
      role
    `
    )
    .single();

  if (error) throw error;

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
    role: (data.role as MemberRole) ?? "member",
  };
}

async function fetchShareTokenForMember(
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("member_share_links")
    .select("token, revoked")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    console.error("Fel vid hämtning av share-token:", error);
    return null;
  }

  if (!data || data.revoked) return null;

  return data.token as string;
}

/* =========================================================
   PAGE COMPONENT
========================================================= */
function isDanRank(belt: BeltRank): boolean {
  return belt.includes("_dan");
}

function kyuGroupLabel(belt: BeltRank): string {
  const n = belt.split("_")[0];
  return `${n} kyu`;
}

function danGroupLabel(belt: BeltRank): string {
  const n = belt.split("_")[0];
  return `${n} dan`;
}

function buildBeltGroups(members: Member[]) {
  const total = members.length;

  const kyuCounts: Record<string, number> = {};
  const danCounts: Record<string, number> = {};

  for (const m of members) {
    if (m.beltRank.includes("_kyu")) {
      const label = kyuGroupLabel(m.beltRank);
      kyuCounts[label] = (kyuCounts[label] ?? 0) + 1;
    } else if (isDanRank(m.beltRank)) {
      const label = danGroupLabel(m.beltRank);
      danCounts[label] = (danCounts[label] ?? 0) + 1;
    }
  }

  const kyuOrder = beltOrder
    .filter((b) => b.includes("_kyu"))
    .map(kyuGroupLabel);
  const danOrder = beltOrder
    .filter((b) => b.includes("_dan"))
    .map(danGroupLabel);

  const kyuList = kyuOrder
    .filter((k) => kyuCounts[k])
    .map((k) => ({ label: k, count: kyuCounts[k] }));

  const danList = danOrder
    .filter((d) => danCounts[d])
    .map((d) => ({ label: d, count: danCounts[d] }));

  return { total, kyuList, danList };
}

export default function KaratekasPage() {
  const STORAGE_SELECTED_CLUB_ID_KEY = "selectedClubId";

  const router = useRouter();

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [clubLoading, setClubLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY);
    const cleaned =
      raw && raw !== "undefined" && raw !== "null" ? raw : "";

    setSelectedClubId(cleaned);
    setClubLoading(false);
  }, []);

  /* ---------- ADMIN SESSION ROLE ---------- */
  const [sessionRole, setSessionRole] = useState<
    "member" | "admin" | "superadmin" | "loading"
  >("loading");

  /* ---------- DATA ---------- */
  const [members, setMembers] = useState<Member[]>([]);
  const [physicalReqMap, setPhysicalReqMap] = useState<
    Record<string, PhysicalRequirement>
  >({});

  /* ---------- PROFILE POPUP STATE ---------- */
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingGradingStatus, setEditingGradingStatus] =
    useState<GradingStatus | null>(null);
  const [editingMemberComment, setEditingMemberComment] = useState("");
  const [
    editingInstructorComment,
    setEditingInstructorComment,
  ] = useState("");
  const [editingVisibility, setEditingVisibility] =
    useState<VisibilitySettings | null>(null);
  const [editingPhysicalEnabled, setEditingPhysicalEnabled] =
    useState(false);
  const [editingBeltRank, setEditingBeltRank] = useState<BeltRank>("9_kyu");
  const [editingBirthYmd, setEditingBirthYmd] = useState("");
  const [editingAdminPassword, setEditingAdminPassword] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  /* ---------- SHARE STATE (for admin) ---------- */
  const [shareToken, setShareToken] = useState<string | null>(null);

  /* ---------- TOAST ---------- */
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  /* ---------- ADD POPUP ---------- */
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newBirthYmd, setNewBirthYmd] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [newBeltRank, setNewBeltRank] = useState<BeltRank>("9_kyu");

  /* ---------- LOAD DATA ---------- */
useEffect(() => {
  const raw = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY);

  const cleaned =
    raw && raw !== "undefined" && raw !== "null" ? raw : "";

  setSelectedClubId(cleaned);
  setClubLoading(false);
}, []);

useEffect(() => {
  if (clubLoading) return;

  const isUuid =
    typeof selectedClubId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      selectedClubId
    );

  if (!isUuid) return;

  (async () => {
    const [m, req] = await Promise.all([
      fetchMembersFromSupabase(selectedClubId),
      fetchPhysicalRequirementsFromSupabase(selectedClubId),
    ]);
    setMembers(m);
    setPhysicalReqMap(req);
  })();
}, [clubLoading, selectedClubId]);

  // Hämta admin-roll från /api/admin/me
  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setSessionRole("member");
          return;
        }
        const json = await res.json();
        if (
          json.authenticated &&
          (json.role === "admin" || json.role === "superadmin")
        ) {
          if (!cancelled) setSessionRole(json.role);
        } else {
          if (!cancelled) setSessionRole("member");
        }
      } catch (err) {
        console.error("Kunde inte hämta adminsession:", err);
        if (!cancelled) setSessionRole("member");
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- BODY SCROLL LOCK FOR PROFILE POPUP ---------- */
  useEffect(() => {
    if (selectedMember) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedMember]);

  /* ---------- DERIVED LIST ---------- */
  const sortedMembers = useMemo(() => {
    return [...members].sort(
      (a, b) => beltOrder.indexOf(a.beltRank) - beltOrder.indexOf(b.beltRank)
    );
  }, [members]);

  const visibleMembers = useMemo(() => {
    return sessionRole === "admin" || sessionRole === "superadmin"
      ? sortedMembers
      : sortedMembers.filter((m) => m.isPublic);
  }, [sessionRole, sortedMembers]);

  const beltSummary = useMemo(() => {
  return buildBeltGroups(visibleMembers);
}, [visibleMembers]);


  /* =========================================================
     ACTION HELPERS (so we can reuse blocks)
  ========================================================= */
  async function openProfile(member: Member) {
    setSelectedMember(member);
    setEditingGradingStatus(member.gradingStatus);
    setEditingMemberComment(member.memberComment ?? "");
    setEditingInstructorComment(member.instructorComment ?? "");
    setEditingVisibility(member.visibility);
    setEditingPhysicalEnabled(member.physicalEnabled);
    setEditingBeltRank(member.beltRank);
    setEditingBirthYmd(member.birthYmd ?? "");
    setShareToken(null);
    setEditingAdminPassword("");


    // Försök hämta befintlig aktiv delningslänk från databasen
    try {
      const existingToken = await fetchShareTokenForMember(member.id);
      if (existingToken) {
        setShareToken(existingToken);
      }
    } catch (err) {
      console.error("Kunde inte hämta delningslänk:", err);
    }
  }

  function closeProfile() {
    setSelectedMember(null);
    setEditingGradingStatus(null);
    setEditingMemberComment("");
    setEditingInstructorComment("");
    setEditingVisibility(null);
    setEditingPhysicalEnabled(false);
    setEditingBeltRank("9_kyu");
    setEditingBirthYmd("");
    setShareToken(null);
    setEditingAdminPassword("");
  }

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
      progress: calculateProgress(
        newGrading,
        0,
        newRequired,
        member.physicalEnabled
      ),
    };

    // Anropa API-route för att säkerställa loggning
    const res = await fetch("/api/admin/members/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error ?? "Kunde inte uppdatera medlemmen.");
    }

    const serverMember = json.member as Member;

    // Uppdatera state med den server-returerade medlemmen
    setMembers((prev) => prev.map((m) => (m.id === serverMember.id ? serverMember : m)));
    setSelectedMember(serverMember);
  }

  /* =========================================================
     RENDER
  ========================================================= */
  if (clubLoading) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center">
        Laddar klubb...
      </main>
    );
  }

  // Om clubId inte är en riktig UUID: behandla som "ingen klubb vald"
  const selectedClubIdIsUuid =
    typeof selectedClubId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      selectedClubId
    );

  if (!selectedClubIdIsUuid) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <p>Ingen klubb vald.</p>
          <button
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600"
            onClick={() => router.push("/")}
          >
            Gå tillbaka och välj klubb
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black/90 text-white flex flex-col">
      {/* =====================================================
          TOAST (center)
      ====================================================== */}
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

      {/* =====================================================
          HEADER
      ====================================================== */}
      <header className="flex items-center justify-between px-4 pt-2 pb-2">
        <button
          type="button"
          className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => router.push("/")}
        >
          &#171;&#171;&#171; Tillbaka
        </button>

        {(sessionRole === "admin" || sessionRole === "superadmin") && (
          <button
            type="button"
            className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
            onClick={() => {
              setNewFirstName("");
              setNewLastName("");
              setNewBirthYmd("");
              setNewIsPublic(true);
              setNewBeltRank("9_kyu");
              setIsAddOpen(true);
            }}
          >
            + Lägg till
          </button>
        )}
      </header>


      {/* =====================================================
          MEMBER LIST
      ====================================================== */}
<section className="flex flex-col items-center px-4 pb-8 pt-4">
  <h1 className="mb-2 text-xl font-bold">Klubbmedlemmar</h1>
  <p className="mb-4 text-sm text-gray-300 text-center">
    Data hämtas från Supabase.
  </p>

  <div className="mb-4 w-full max-w-md rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-gray-200">
    <div className="text-center font-semibold text-gray-100 mb-2">
      Totalt antal medlemmar: {beltSummary.total}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="font-semibold text-gray-100 mb-1">Kyu</div>
        {beltSummary.kyuList.length === 0 ? (
          <div className="text-gray-400">Inga kyu ännu.</div>
        ) : (
          <div className="space-y-0.5">
            {beltSummary.kyuList.map((x) => (
              <div key={x.label} className="flex justify-between">
                <span className="text-gray-300">{x.label}</span>
                <span className="font-semibold">{x.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-semibold text-gray-100 mb-1">Dan</div>
        {beltSummary.danList.length === 0 ? (
          <div className="text-gray-400">Inga dan ännu.</div>
        ) : (
          <div className="space-y-0.5">
            {beltSummary.danList.map((x) => (
              <div key={x.label} className="flex justify-between">
                <span className="text-gray-300">{x.label}</span>
                <span className="font-semibold">{x.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>

  <div className="w-full max-w-md space-y-3">
    {visibleMembers.length === 0 && (
      <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-center text-sm text-gray-300">
        Inga medlemmar att visa.
      </div>
    )}

    {visibleMembers.map((member) => {
      const fullName = `${member.firstName} ${member.lastName}`;
      const shortName = `${member.firstName} ${member.lastName.charAt(0)}.`;
      const displayName = sessionRole === "member" ? shortName : fullName;
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
            <span className="text-gray-300">Ålder: {getDisplayAge(member)} år</span>
            <span className="text-gray-300">
              Nuvarande: {getBeltLabel(member.beltRank)}
            </span>
            <span className="text-gray-400">
              Nästa: {getBeltLabel(member.nextBeltRank)}
            </span>

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

<div className="flex flex-col items-end gap-2">
  <ProgressCircle progress={member.progress} />

  {/* Profil-knappen först (grå) */}
  <button
    type="button"
    className="rounded-md bg-gray-800 px-3 py-2 text-[12px] font-semibold text-gray-100 hover:bg-gray-700"
    onClick={() => openProfile(member)}
  >
    Profil
  </button>

  {/* Närvaro-knappen sen (grå) */}
  {(sessionRole === "admin" || sessionRole === "superadmin") && (
    <button
      type="button"
      className="rounded-md bg-gray-800 px-3 py-2 text-[12px] font-semibold text-gray-100 hover:bg-gray-700"
      onClick={() => alert("Här kommer snabb närvaroregistrering senare.")}
    >
      Närvaro
    </button>
  )}
</div>
        </div>
      );
    })}
  </div>
</section>

      {/* =====================================================
          PROFILE POPUP (sticky header/footer + scroll middle)
      ====================================================== */}
      {selectedMember && editingGradingStatus && editingVisibility && (
        <div className="fixed inset-0 z-50 bg-black/70 px-4 py-6">
          <div className="mx-auto w-full max-w-md h-[90dvh] rounded-xl bg-neutral-950 shadow-xl border border-white/10 overflow-hidden grid grid-rows-[auto,1fr,auto]">
            {/* HEADER */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-neutral-950">
              <h2 className="text-lg font-bold">
  {sessionRole !== "member" && (
    <span className="text-gray-300">
      #{selectedMember.userId || "------"}{" "}
    </span>
  )}
  <span>
    {selectedMember.firstName}{" "}
    {sessionRole === "member"
      ? `${selectedMember.lastName.charAt(0)}.`
      : selectedMember.lastName}
  </span>
</h2>

              <button
                type="button"
                className="text-xs text-gray-300 hover:text-white"
                onClick={closeProfile}
              >
                Stäng
              </button>
            </div>

            {/* SCROLL CONTENT */}
            <div className="overflow-y-auto px-4 py-3">
              
                   {/* Bild + progress */}
              <div className="mb-4 flex items-center gap-4">
                {/* Profilbild till vänster */}
                <Image
                  src={selectedMember.avatarUrl}
                  alt={selectedMember.firstName}
                  width={132}
                  height={132}
                  className="h-[5.5rem] w-[5.5rem] rounded-full object-cover"
                />

                {/* Tårta + förklaring till höger om bilden */}
                <div className="flex items-center gap-3">
                  {/* Tårtbit i mitten-kolumnen */}
                  <LargeProgressCircle progress={selectedMember.progress} />

                  {/* Förklarande text till höger om tårtan */}
                  <div className="flex flex-col justify-center text-[10px] text-gray-300 max-w-[11rem]">
                    <span className="font-semibold text-[11px] text-gray-100 mb-1">
                      Detta betyder progress‑cirkeln:
                    </span>

                    {/* En rad per färg (med dina ALT+255-mellanrum) */}
                    <span className="block">
                      Röd       - Ej redo för gradering
                    </span>
                    <span className="block">
                      Orange  - Delvis redo för gradering
                    </span>
                    <span className="block mb-2">
                      Grön      - Redo för gradering
                    </span>

                    <span className="font-semibold text-[11px] text-gray-100 mt-1">
                      Vad ingår i bedömningen?
                    </span>
                    <span className="block">
                      - Antal pass: {selectedMember.attendedSessions}/
                      {selectedMember.requiredSessions} pass
                    </span>
                    <span className="block">
                      - Godkänd Kihon, Kata och Kumite
                    </span>
                    <span className="block">
                      - Ev. fysiskt krav om det är aktiverat
                    </span>
                  </div>
                </div>
              </div>

{/* Byt profilbild (endast Admin/SuperAdmin) */}
              {(sessionRole === "admin" || sessionRole === "superadmin") && (
                <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-200">
                    Profilbild
                  </p>

                  <p className="mb-2 text-[11px] text-gray-400">
                    Ladda upp en ny bild för den här medlemmen. Bilden visas både
                    här och i medlemslistan.
                  </p>

                  {/* Dold fil-input + knapp */}
                  <input
                    id="avatar-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selectedMember) return;

                      setAvatarUploadError(null);
                      setUploadingAvatar(true);

                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("memberId", selectedMember.id);

                        const res = await fetch("/api/avatar-upload", {
                          method: "POST",
                          body: formData,
                        });

                        const json = await res.json().catch(() => null);

                        if (!res.ok) {
                          throw new Error(json?.error ?? "Kunde inte ladda upp bild.");
                        }

                        const newUrl = json.avatarUrl as string;

                        // Uppdatera valt member + listan
                        setSelectedMember((prev) =>
                          prev ? { ...prev, avatarUrl: newUrl } : prev
                        );
                        setMembers((prev) =>
                          prev.map((m) =>
                            m.id === selectedMember.id ? { ...m, avatarUrl: newUrl } : m
                          )
                        );

                        setToast({
                          type: "success",
                          text: "Profilbild uppdaterad!",
                        });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 1400);
                      } catch (err) {
                        console.error(err);
                        setAvatarUploadError(
                          err instanceof Error ? err.message : "Kunde inte ladda upp bild."
                        );
                        setToast({
                          type: "error",
                          text: "Kunde inte ladda upp bild.",
                        });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 2000);
                      } finally {
                        setUploadingAvatar(false);
                        // Töm file input så man kan välja samma fil igen om man vill
                        e.target.value = "";
                      }
                    }}
                    disabled={uploadingAvatar}
                  />

                  <label
                    htmlFor="avatar-upload-input"
                    className={`inline-flex cursor-pointer items-center justify-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                      uploadingAvatar
                        ? "bg-gray-900 text-gray-500"
                        : "bg-gray-800 text-gray-100 hover:bg-gray-700"
                    }`}
                  >
                    {uploadingAvatar ? "Laddar upp..." : "Ladda upp profilbild"}
                  </label>

                  {uploadingAvatar && (
                    <p className="mt-2 text-[11px] text-gray-300">
                      Laddar upp bild...
                    </p>
                  )}

                  {avatarUploadError && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {avatarUploadError}
                    </p>
                  )}
                </div>
              )}

              
              {/* Dela profil (komplett, inkl "Delar profil för" + "Öppna länk") */}
              {(sessionRole === "admin" || sessionRole === "superadmin") && (
                <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-200">
                    Dela profil
                  </p>

                  <p className="mb-3 text-[11px] text-gray-400">
                    Delar profil för:{" "}
                    <span className="font-semibold text-gray-200">
                      {selectedMember.firstName} {selectedMember.lastName}
                    </span>{" "}
                    <span className="text-gray-500">
                      (id: {selectedMember.id})
                    </span>
                  </p>

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-blue-50 hover:bg-blue-600"
                        onClick={async () => {
                          try {
                            setToast({ type: "success", text: "Skapar länk..." });
                            setToastVisible(true);

                            const res = await fetch("/api/share/create", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ memberId: selectedMember.id }),
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json?.error ?? "Kunde inte skapa länk");

                            setShareToken(json.token);

                            setToast({ type: "success", text: "Länk skapad!" });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 1200);
                          } catch (err) {
                            console.error(err);
                            setToast({ type: "error", text: "Kunde inte skapa länk." });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 2000);
                          }
                        }}
                      >
                        Skapa ny länk
                      </button>

                      <button
                        type="button"
                        className="flex-1 rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-red-50 hover:bg-red-600"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/share/revoke", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ memberId: selectedMember.id }),
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json?.error ?? "Kunde inte återkalla");

                            setShareToken(null);

                            setToast({ type: "success", text: "Länk återkallad." });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 1200);
                          } catch (err) {
                            console.error(err);
                            setToast({ type: "error", text: "Kunde inte återkalla." });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 2000);
                          }
                        }}
                      >
                        Återkalla
                      </button>
                    </div>

                    <div className="rounded-md border border-gray-700 bg-black/50 px-2 py-2 text-[11px] text-gray-200 break-all">
                      {shareToken
                        ? `${window.location.origin}/share/${shareToken}`
                        : "Ingen aktiv delningslänk ännu."}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-gray-800 px-3 py-2 text-[11px] font-semibold hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-500"
                        disabled={!shareToken}
                        onClick={async () => {
                          if (!shareToken) return;
                          const url = `${window.location.origin}/share/${shareToken}`;
                          await navigator.clipboard.writeText(url);
                          setToast({ type: "success", text: "Länk kopierad!" });
                          setToastVisible(true);
                          setTimeout(() => setToastVisible(false), 1200);
                        }}
                      >
                        Kopiera länk
                      </button>

                      <button
                        type="button"
                        className="rounded-md bg-gray-800 px-3 py-2 text-[11px] font-semibold hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-500"
                        disabled={!shareToken}
                        onClick={() => {
                          if (!shareToken) return;
                          const url = `${window.location.origin}/share/${shareToken}`;
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Öppna länk
                      </button>

                      <a
                        className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                          shareToken
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-900 text-gray-500 pointer-events-none"
                        }`}
                        href={
                          shareToken
                            ? `mailto:?subject=Karateprofil&body=${encodeURIComponent(
                                `Här är profilen:\n${window.location.origin}/share/${shareToken}`
                              )}`
                            : "#"
                        }
                      >
                        E‑post
                      </a>

                      <a
                        className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                          shareToken
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-900 text-gray-500 pointer-events-none"
                        }`}
                        href={
                          shareToken
                            ? `sms:&body=${encodeURIComponent(
                                `Här är profilen: ${window.location.origin}/share/${shareToken}`
                              )}`
                            : "#"
                        }
                      >
                        SMS
                      </a>

                      <a
                        className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                          shareToken
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-900 text-gray-500 pointer-events-none"
                        }`}
                        href={
                          shareToken
                            ? `https://wa.me/?text=${encodeURIComponent(
                                `Här är profilen: ${window.location.origin}/share/${shareToken}`
                              )}`
                            : "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>

                      <a
                        className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                          shareToken
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-900 text-gray-500 pointer-events-none"
                        }`}
                        href={
                          shareToken
                            ? `https://www.messenger.com/t/?link=${encodeURIComponent(
                                `${window.location.origin}/share/${shareToken}`
                              )}`
                            : "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Messenger
                      </a>
                    </div>

                    <p className="text-[10px] text-gray-500">
                      Skapa ny länk om du vill att den gamla ska sluta fungera.
                    </p>
                  </div>
                </div>
              )}

              {/* Adminlösenord (Admin + SuperAdmin) */}
              {(sessionRole === "admin" || sessionRole === "superadmin") && (
                <div className="mb-4 rounded-lg border border-cyan-500/30 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-cyan-100">
                    Adminlösenord
                  </p>

                  <p className="mb-2 text-[11px] text-gray-400">
                    Sätt eller byt adminlösenord för den här profilen. Lösenordet sparas
                    aldrig i klartext.
                  </p>

                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                    value={editingAdminPassword}
                    onChange={(e) => setEditingAdminPassword(e.target.value)}
                    placeholder="Skriv nytt lösenord"
                  />

                  <button
                    type="button"
                    className="mt-2 rounded-md bg-cyan-700 px-3 py-1 text-xs font-semibold text-cyan-50 hover:bg-cyan-600"
                    onClick={async () => {
                      try {
                        if (!selectedMember) return;

                        if (!editingAdminPassword.trim()) {
                          alert("Skriv in ett lösenord först.");
                          return;
                        }

                        const res = await fetch("/api/admin/setPassword", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            memberId: selectedMember.id,
                            newPassword: editingAdminPassword,
                          }),
                        });

                        const json = await res.json().catch(() => null);

                        if (!res.ok) {
                          throw new Error(json?.error ?? "Kunde inte spara lösenord.");
                        }

                        setEditingAdminPassword("");

                        setToast({
                          type: "success",
                          text: "Adminlösenord sparat!",
                        });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 1400);
                      } catch (err) {
                        console.error(err);
                        setToast({
                          type: "error",
                          text: "Kunde inte spara lösenord.",
                        });
                        setToastVisible(true);
                        setTimeout(() => setToastVisible(false), 2000);
                      }
                    }}
                  >
                    Spara lösenord
                  </button>
                </div>
              )}

              {/* Roll / rättigheter (endast SuperAdmin) */}
              {sessionRole === "superadmin" && (
                <div className="mb-4 rounded-lg border border-purple-500/40 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-purple-100">
                    Rättigheter / roll
                  </p>

                  <p className="mb-2 text-[11px] text-gray-300">
                    Nuvarande roll:{" "}
                    <span className="font-semibold">
                      {selectedMember.role === "member"
                        ? "Medlem"
                        : selectedMember.role === "admin"
                        ? "Admin"
                        : "SuperAdmin"}
                    </span>
                  </p>

                  <label className="mb-1 block text-[11px] text-gray-300">
                    Ändra roll
                  </label>

                  <select
                    className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-purple-500 focus:outline-none"
                    value={selectedMember.role}
                    onChange={(e) => {
                      const newRole = e.target.value as MemberRole;
                      setSelectedMember((prev) =>
                        prev ? { ...prev, role: newRole } : prev
                      );
                    }}
                  >
                    <option value="member">Medlem</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">SuperAdmin</option>
                  </select>

                  <p className="mt-2 text-[10px] text-gray-500">
                    Endast SuperAdmin kan ändra roller.
                  </p>
                </div>
              )}

              {/* Grundinfo */}
              <div className="mb-4 space-y-2 text-sm">
                {editingVisibility.showAge && (
                  <>
                    <p className="text-gray-200">
                      Ålder:{" "}
                      <span className="font-semibold">
                        {getDisplayAge(selectedMember)} år
                      </span>
                    </p>

                    {(sessionRole === "admin" || sessionRole === "superadmin") && (
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
                            const onlyDigits = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 6);
                            setEditingBirthYmd(onlyDigits);
                            setSelectedMember((prev) =>
                              prev ? { ...prev, birthYmd: onlyDigits } : prev
                            );
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
                    {sessionRole === "member" ? (
                      <>
                        <p className="text-gray-200">
                          Nuvarande:{" "}
                          <span className="font-semibold">
                            {getBeltLabel(selectedMember.beltRank)}
                          </span>
                        </p>
                        <p className="text-gray-300">
                          Nästa:{" "}
                          <span className="font-semibold">
                            {getBeltLabel(selectedMember.nextBeltRank)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="mb-1 block text-[11px] text-gray-300">
                            Nuvarande grad
                          </label>
                          <select
                            className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                            value={editingBeltRank}
                            onChange={(e) => {
                              const newCurrent = e.target.value as BeltRank;
                              const newNext = getNextBeltRank(newCurrent);
                              const newRequired =
                                getRequiredSessionsForNextBelt(
                                  newCurrent,
                                  newNext
                                );

                              setEditingBeltRank(newCurrent);

                              setSelectedMember((prev) => {
                                if (!prev || !editingGradingStatus) return prev;

                                const updatedLocal = {
                                  ...prev,
                                  beltRank: newCurrent,
                                  nextBeltRank: newNext,
                                  requiredSessions: newRequired,
                                };

                                const newProgress = calculateProgress(
                                  editingGradingStatus,
                                  updatedLocal.attendedSessions,
                                  updatedLocal.requiredSessions,
                                  editingPhysicalEnabled
                                );

                                return { ...updatedLocal, progress: newProgress };
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
                          <label className="mb-1 block text-[11px] text-gray-300">
                            Nästa grad (auto)
                          </label>
                          <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-xs text-gray-100">
                            {getBeltLabel(getNextBeltRank(editingBeltRank))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] text-gray-300">
                            Kräver antal pass (auto)
                          </label>
                          <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-xs text-gray-100">
                            {getRequiredSessionsForNextBelt(
                              editingBeltRank,
                              getNextBeltRank(editingBeltRank)
                            )}{" "}
                            pass
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Fysiska krav */}
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
                    <p className="text-[11px] text-gray-400">
                      Saknar fyskrav för detta bälte.
                    </p>
                  )}
                </div>
              )}

              {/* Graderingsstatus */}
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-200">
                  Graderingsstatus
                </p>

                {sessionRole === "member" && editingVisibility.showGradingStatus && (
                  <div className="space-y-2 text-xs">
                    {(["Kihon", "Kata", "Kumite", "Fysik"] as const).map(
                      (label, idx) => {
                        const key = ["kihon", "kata", "kumite", "physical"][
                          idx
                        ] as keyof GradingStatus;
                        const { label: text, color } =
                          getGradingLabelAndColor(
                            selectedMember.gradingStatus[key]
                          );
                        return (
                          <div
                            key={label}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-gray-200">{label}</span>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${color}`}
                            >
                              {text}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}

                {sessionRole !== "member" && (
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

                                let baseColor =
                                  "bg-gray-800 text-gray-200 border-gray-600";
                                if (val === "not_ready")
                                  baseColor =
                                    "bg-red-950/60 text-red-100 border-red-700";
                                if (val === "partial")
                                  baseColor =
                                    "bg-orange-950/60 text-orange-100 border-orange-700";
                                if (val === "ready")
                                  baseColor =
                                    "bg-emerald-950/60 text-emerald-100 border-emerald-700";

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

                                        const updatedStatus: GradingStatus = {
                                          ...prev,
                                          [key]: val,
                                        };

                                        const newProgress = calculateProgress(
                                          updatedStatus,
                                          selectedMember.attendedSessions,
                                          selectedMember.requiredSessions,
                                          editingPhysicalEnabled
                                        );

                                        setSelectedMember({
                                          ...selectedMember,
                                          gradingStatus: updatedStatus,
                                          progress: newProgress,
                                        });

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
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-md bg-blue-700 px-3 py-1 text-[11px] font-semibold text-blue-50 hover:bg-blue-600"
                        onClick={async () => {
                          try {
                            await approveGrading(selectedMember);
                            setToast({
                              type: "success",
                              text: "Gradering godkänd!",
                            });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 1400);
                          } catch (err) {
                            console.error(err);
                            setToast({
                              type: "error",
                              text: "Kunde inte godkänna.",
                            });
                            setToastVisible(true);
                            setTimeout(() => setToastVisible(false), 2000);
                          }
                        }}
                      >
                        Godkänn gradering (byt till{" "}
                        {getBeltLabel(selectedMember.nextBeltRank)})
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Kommentar */}
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-200">
                  Kommentar till medlem
                </p>
                {sessionRole === "member" ? (
                  selectedMember.visibility.showMemberComment ? (
                    <p className="text-xs text-gray-200 whitespace-pre-line">
                      {selectedMember.memberComment || "Ingen kommentar ännu."}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      Denna information är inte tillgänglig.
                    </p>
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
              {sessionRole !== "member" && (
                <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-200">
                    Intern instruktörskommentar
                  </p>
                  <textarea
                    className="h-20 w-full resize-none rounded-md border border-gray-700 bg-black/60 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                    value={editingInstructorComment}
                    onChange={(e) => setEditingInstructorComment(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10 bg-neutral-950">
              {sessionRole !== "member" && (
                <button
                  type="button"
                  className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-600"
                  onClick={async () => {
                    try {
                      setToast({ type: "success", text: "Sparar..." });
                      setToastVisible(true);

                      const newCurrent = editingBeltRank;
                      const newNext = getNextBeltRank(newCurrent);
                      const newRequired = getRequiredSessionsForNextBelt(
                        newCurrent,
                        newNext
                      );

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
                        role: selectedMember.role,
                      };

                      const res = await fetch("/api/admin/members/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(updated),
                      });

                      const json = await res.json().catch(() => null);

                      if (!res.ok) {
                        throw new Error(json?.error ?? "Kunde inte uppdatera medlemmen.");
                      }

                      const serverMember = json.member as Member;

                      setSelectedMember(serverMember);
                      setMembers((prev) =>
                        prev.map((m) =>
                          m.id === serverMember.id ? serverMember : m
                        )
                      );

                      setToast({ type: "success", text: "Sparat!" });
                      setToastVisible(true);
                      setTimeout(() => setToastVisible(false), 1200);
                    } catch (err) {
                      console.error(err);
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
                onClick={closeProfile}
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ADD MEMBER POPUP
      ====================================================== */}
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

              <div>
                <label className="mb-1 block text-gray-300">Födelsedata (YYMMDD)</label>
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
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-emerald-500"
                  checked={newIsPublic}
                  onChange={(e) => setNewIsPublic(e.target.checked)}
                />
                <span className="text-[11px] text-gray-200">Publik i medlemslistan</span>
              </div>

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
                <label className="mb-1 block text-gray-300">Kräver antal pass (auto)</label>
                <div className="rounded-md border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-100">
                  {getRequiredSessionsForNextBelt(newBeltRank, getNextBeltRank(newBeltRank))} pass
                </div>
              </div>
            </div>

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
                  const requiredNumber = getRequiredSessionsForNextBelt(newBeltRank, next);

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
                    role: "member",
                  };

                  try {
                    const created = await insertMemberInSupabase(selectedClubId, base);
                    setMembers((prev) => [...prev, created]);
                    setIsAddOpen(false);
                  } catch (err) {
                    console.error("Kunde inte skapa medlem:", err);
                    alert("Det gick inte att skapa medlemmen.");
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