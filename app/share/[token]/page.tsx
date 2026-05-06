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
   STOR TÅRTBIT (samma som internt)
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
   PAGE COMPONENT
========================================================= */
export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // OBS: params är en Promise i client components med din Next-version
  const { token } = React.use(params);

  const [member, setMember] = useState<SharedMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/share/${token}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setMember(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setMember(json.member);
      } catch {
        if (!cancelled) setMember(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleClose() {
    // Försök stänga fönstret/fliken (funkar om sidan öppnats via script)
    window.close();

    // Om det inte gick, gå tillbaka i historiken om möjligt
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

        {/* Bild + tårta + text i rad */}
        <div className="flex items-center gap-4 mb-4">
          {/* Profilbild till vänster */}
          <Image
            src={member.avatarUrl}
            alt={member.firstName}
            width={132}
            height={132}
            className="h-[5.5rem] w-[5.5rem] rounded-full object-cover"
          />

          {/* Tårta + förklaring till höger om bilden */}
          <div className="flex items-center gap-3">
            {/* Tårtbit i mitten-kolumnen */}
            <LargeProgressCircle progress={member.progress ?? 0} />

            {/* Förklarande text till höger om tårtan */}
            <div className="flex flex-col justify-center text-[10px] text-gray-300 max-w-[11rem]">
              <span className="font-semibold text-[11px] text-gray-100 mb-1">
                Detta betyder progress‑cirkeln:
              </span>

              {/* En rad per färg, med dina ALT+255‑mellanrum */}
              <span className="block">
                      Röd       - Ej redo för gradering
                    </span>
                    <span className="block">
                      Orange  - Delvis redo för gradering
                    </span>
                    <span className="block mb-2">
                      Grön      - Redo för gradering
                    </span>

              <span className="font-semibold text-[11px] text-gray-100 mt-1">
                Vad ingår i bedömningen?
              </span>
              <span className="block">
                - Antal pass: {member.attendedSessions}/{member.requiredSessions} pass
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

        {member.visibility.showAge && (
          <p className="text-sm text-gray-200 mb-2">
            Ålder:{" "}
            <span className="font-semibold">{getDisplayAge(member)} år</span>
          </p>
        )}

        {member.visibility.showBeltInfo && (
          <div className="text-sm mb-3 space-y-1">
            <p className="text-gray-200">
              Nuvarande:{" "}
              <span className="font-semibold">{member.beltRank}</span>
            </p>
            <p className="text-gray-300">
              Nästa:{" "}
              <span className="font-semibold">{member.nextBeltRank}</span>
            </p>
          </div>
        )}

        
         {member.visibility.showGradingStatus && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 mb-4">
            <p className="text-xs font-semibold text-gray-200 mb-2">
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
                  {/* Rad för Fysik */}
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

                  {/* Lista fysiska krav under Fysik */}
                  {member.physicalRequirements ? (
                    <div className="mt-1 text-[10px] text-gray-300">
                      <p className="font-semibold text-gray-200 mb-1">
                        Fysiska krav för kommande bälte:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5">
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

        {member.visibility.showMemberComment && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <p className="text-xs font-semibold text-gray-200 mb-2">
              Kommentar
            </p>
            <p className="text-xs text-gray-200 whitespace-pre-line">
              {member.memberComment || "Ingen kommentar ännu."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}