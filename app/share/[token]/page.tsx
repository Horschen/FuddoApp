"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

type GradingStatusValue = "not_ready" | "partial" | "ready";
type GradingStatus = {
  kihon: GradingStatusValue;
  kata: GradingStatusValue;
  kumite: GradingStatusValue;
  physical: GradingStatusValue;
};

type VisibilitySettings = {
  showAge: boolean;
  showBeltInfo: boolean;
  showGradingStatus: boolean;
  showMemberComment: boolean;
};

type SharedTrainingSession = {
  id: string;
  weekday: number;        // 0–6
  startTime: string;      // "18:00"
  endTime: string;        // "19:00"
  name: string;
  belts: string[];        // t.ex. ["10_kyu","9_kyu"]
};

type SharedMember = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  birthYmd: string;
  beltRank: string;
  nextBeltRank: string;
  attendedSessions: number;
  requiredSessions: number;
  progress: number;
  avatarUrl: string;
  memberComment: string;
  visibility: VisibilitySettings;
  gradingStatus: GradingStatus;
  physicalEnabled: boolean;
  physicalRequirements?: {
    beltRank: string;
    pushups: number;
    situps: number;
    squats: number;
  } | null;
  trainingSessions?: SharedTrainingSession[]; // NYTT: kommer från API
};

/* =========================================================
   HJÄLPFUNKTIONER FÖR ÅLDER
========================================================= */
function parseBirthYmdToDate(ymd: string): Date | null {
  if (!/^\d{6}$/.test(ymd)) return null;
  const yy = Number(ymd.slice(0, 2));
  const mm = Number(ymd.slice(2, 4));
  const dd = Number(ymd.slice(4, 6));
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

function calculateAgeFromBirthDate(
  birthDate: Date,
  today = new Date()
): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function getDisplayAge(m: SharedMember): number {
  const d = parseBirthYmdToDate(m.birthYmd || "");
  if (!d) return m.age ?? 0;
  return calculateAgeFromBirthDate(d);
}

function formatBeltRankShort(belt: string): string {
  if (!belt) return "-";
  const [num, type] = belt.split("_");
  if (!num || !type) return belt;

  const n = Number(num);
  const labelNum = isNaN(n) ? num : n.toString();

  if (type === "kyu") {
    return `${labelNum} kyu`;
  }
  if (type === "dan") {
    return `${labelNum} dan`;
  }

  return belt;
}

function gradingLabel(v: GradingStatusValue) {
  if (v === "ready") {
    return {
      label: "Redo",
      className: "bg-emerald-900/60 text-emerald-100 border border-emerald-600",
    };
  }
  if (v === "partial") {
    return {
      label: "Delvis redo",
      className: "bg-orange-900/60 text-orange-100 border border-orange-600",
    };
  }
  return {
    label: "Icke redo",
    className: "bg-red-900/60 text-red-100 border border-red-600",
  };
}

/* =========================================================
   STOR TÅRTBIT
========================================================= */
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
   VECKODAG LABEL
========================================================= */
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

/* =========================================================
   PAGE COMPONENT
========================================================= */
export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = React.use(params);

  const [member, setMember] = useState<SharedMember | null>(null);
  const [trainingSessions, setTrainingSessions] = useState<
    SharedTrainingSession[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/share/${token}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setMember(null);
            setTrainingSessions([]);
          }
          return;
        }
        const json = await res.json();

        if (!cancelled) {
          setMember(json.member as SharedMember);
          setTrainingSessions(
            (json.trainingSessions as SharedTrainingSession[]) ?? []
          );
        }
      } catch {
        if (!cancelled) {
          setMember(null);
          setTrainingSessions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleClose() {
    window.close();
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center">
        Laddar...
      </main>
    );
  }

  if (!member) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center text-center px-6">
        Länken är ogiltig eller återkallad.
      </main>
    );
  }

  // Filtrera fram pass för elevens nuvarande grad
  const belt = member.beltRank;
  const matchedSessions = trainingSessions.filter((s) =>
    s.belts.includes(belt)
  );

  return (
    <main className="min-h-screen bg-black/90 text-white px-4 py-6 flex justify-center">
      <div className="w-full max-w-md rounded-xl bg-neutral-950 border border-white/10 p-4 relative">
        {/* STÄNG-KNAPP */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-full bg-gray-800 px-3 py-1 text-[11px] font-semibold text-gray-100 hover:bg-gray-700"
        >
          Stäng
        </button>

        <h1 className="text-xl font-bold mb-3 pr-16">
          {member.firstName} {member.lastName}
        </h1>

        {/* Bild + tårta */}
        <div className="mb-4 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Image
              src={member.avatarUrl}
              alt={member.firstName}
              width={132}
              height={132}
              className="h-[10.25rem] w-[10.25rem] rounded-full object-cover"
            />
            <LargeProgressCircle progress={member.progress ?? 0} />
          </div>
        </div>

        {/* Ålder / bälten */}
        {(member.visibility.showAge || member.visibility.showBeltInfo) && (
          <div className="mb-4 rounded-lg border-2 border-cyan-500/50 bg-black/40 p-3 text-sm">
            {member.visibility.showAge && (
              <p className="mb-1 text-gray-200">
                Ålder:{" "}
                <span className="font-semibold">
                  {getDisplayAge(member)} år
                </span>
              </p>
            )}

            {member.visibility.showBeltInfo && (
              <div className="mt-1 space-y-1">
                <p className="text-gray-200">
                  Nuvarande:{" "}
                  <span className="font-semibold">
                    {formatBeltRankShort(member.beltRank)}
                  </span>
                </p>
                <p className="text-gray-300">
                  Nästa:{" "}
                  <span className="font-semibold">
                    {formatBeltRankShort(member.nextBeltRank)}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

{/* NY: Träningstider */}
        <div className="mb-4 rounded-lg border-2 border-cyan-500/50 bg-black/40 p-3">
          <p className="mb-2 text-xs font-semibold text-cyan-100">
            Träningstider
          </p>

          {matchedSessions.length === 0 ? (
            <p className="text-xs text-gray-300">
              Inga specifika träningstider registrerade för denna grad ännu.
            </p>
          ) : (
            <ul className="space-y-1 text-xs text-gray-200">
              {matchedSessions
                .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
                .map((s) => (
                  <li key={s.id}>
                    <span className="font-semibold">
                      {weekdayLabel(s.weekday)} {s.startTime}–{s.endTime}
                    </span>
                    {s.name && <> – <span>{s.name}</span></>}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Graderingsstatus (oförändrat) */}
        {member.visibility.showGradingStatus && (
          <div className="mb-4 rounded-lg border-2 border-cyan-500/50 bg-black/40 p-3">
            <p className="mb-2 text-xs font-semibold text-cyan-100">
              Graderingsstatus
            </p>
            <div className="space-y-2 text-xs text-gray-200">
              {(["kihon", "kata", "kumite"] as const).map((key) => {
                const { label, className } = gradingLabel(
                  member.gradingStatus[key]
                );
                const title =
                  key === "kihon" ? "Kihon" : key === "kata" ? "Kata" : "Kumite";

                return (
                  <div key={key} className="flex items-center justify-between">
                    <span>{title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}

              {member.physicalEnabled && (
                <>
                  {(() => {
                    const { label, className } = gradingLabel(
                      member.gradingStatus.physical
                    );
                    return (
                      <div className="flex items-center justify-between">
                        <span>Fysik</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })()}

                  {member.physicalRequirements ? (
                    <div className="mt-1 text-[10px] text-gray-300">
                      <p className="mb-1 font-semibold text-gray-200">
                        Fysiska krav för kommande bälte:
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        <li>
                          Armhävningar:{" "}
                          <span className="font-semibold">
                            {member.physicalRequirements.pushups}
                          </span>
                        </li>
                        <li>
                          Situps:{" "}
                          <span className="font-semibold">
                            {member.physicalRequirements.situps}
                          </span>
                        </li>
                        <li>
                          Squats:{" "}
                          <span className="font-semibold">
                            {member.physicalRequirements.squats}
                          </span>
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-gray-400">
                      Inga specifika fysiska krav registrerade för detta bälte.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Kommentar + förklaring */}
        {member.visibility.showMemberComment && (
          <div className="mb-4 rounded-lg border-2 border-cyan-500/50 bg-black/40 p-3">
            <p className="mb-2 text-xs font-semibold text-cyan-100">
              Kommentar
            </p>
            <p className="whitespace-pre-line text-xs text-gray-200">
              {member.memberComment || "Ingen kommentar ännu."}
            </p>

            <div className="mt-3 rounded-md border border-gray-700 bg-black/40 px-2 py-2 text-[11px] text-gray-300">
              <p className="mb-1 font-semibold text-gray-100">
                Detta betyder progress‑cirkeln:
              </p>
              <p>Röd      - Ej redo för gradering</p>
              <p>Orange - Delvis redo för gradering</p>
              <p className="mb-2">Grön     - Redo för gradering</p>

              <p className="mt-1 font-semibold text-gray-100">
                Vad ingår i bedömningen?
              </p>
              <p>
                - Antal pass:{" "}
                {member.attendedSessions}/{member.requiredSessions} pass
              </p>
              <p>- Godkänd Kihon, Kata och Kumite</p>
              <p>- Ev. fysiskt krav om det är aktiverat</p>
            </div>
          </div>
        )}
       
      </div>
    </main>
  );
}