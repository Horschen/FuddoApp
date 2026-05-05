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
};

function parseBirthYmdToDate(ymd: string): Date | null {
  if (!/^\d{6}$/.test(ymd)) return null;
  const yy = Number(ymd.slice(0, 2));
  const mm = Number(ymd.slice(2, 4));
  const dd = Number(ymd.slice(4, 6));
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
function getDisplayAge(m: SharedMember): number {
  const d = parseBirthYmdToDate(m.birthYmd || "");
  if (!d) return m.age ?? 0;
  return calculateAgeFromBirthDate(d);
}
function label(v: GradingStatusValue) {
  if (v === "ready") return "Redo";
  if (v === "partial") return "Delvis redo";
  return "Icke redo";
}

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next säger att params är en Promise -> React.use() behövs i client components
  const { token } = React.use(params);

  const [member, setMember] = useState<SharedMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/share/${token}`, { cache: "no-store" });
        if (!res.ok) {
          setMember(null);
          return;
        }
        const json = await res.json();
        setMember(json.member);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

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
      <div className="w-full max-w-md rounded-xl bg-neutral-950 border border-white/10 p-4">
        <h1 className="text-xl font-bold mb-3">
          {member.firstName} {member.lastName}
        </h1>

        <div className="flex items-center gap-4 mb-4">
          <Image
            src={member.avatarUrl}
            alt={member.firstName}
            width={120}
            height={120}
            className="h-24 w-24 rounded-full object-cover"
          />
          <div className="text-sm text-gray-200">
            <div className="font-semibold">Progress</div>
            <div className="text-gray-300">
              {Math.round((member.progress ?? 0) * 100)}%
            </div>
          </div>
        </div>

        {member.visibility.showAge && (
          <p className="text-sm text-gray-200 mb-2">
            Ålder: <span className="font-semibold">{getDisplayAge(member)} år</span>
          </p>
        )}

        {member.visibility.showBeltInfo && (
          <div className="text-sm mb-3 space-y-1">
            <p className="text-gray-200">
              Nuvarande: <span className="font-semibold">{member.beltRank}</span>
            </p>
            <p className="text-gray-300">
              Nästa: <span className="font-semibold">{member.nextBeltRank}</span>
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4">
          Närvaro: {member.attendedSessions}/{member.requiredSessions} pass
        </p>

        {member.visibility.showGradingStatus && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 mb-4">
            <p className="text-xs font-semibold text-gray-200 mb-2">Graderingsstatus</p>
            <div className="space-y-2 text-xs text-gray-200">
              <div className="flex justify-between">
                <span>Kihon</span>
                <span className="text-gray-300">{label(member.gradingStatus.kihon)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kata</span>
                <span className="text-gray-300">{label(member.gradingStatus.kata)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kumite</span>
                <span className="text-gray-300">{label(member.gradingStatus.kumite)}</span>
              </div>
              {member.physicalEnabled && (
                <div className="flex justify-between">
                  <span>Fysik</span>
                  <span className="text-gray-300">{label(member.gradingStatus.physical)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {member.visibility.showMemberComment && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <p className="text-xs font-semibold text-gray-200 mb-2">Kommentar</p>
            <p className="text-xs text-gray-200 whitespace-pre-line">
              {member.memberComment || "Ingen kommentar ännu."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}