"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getBeltHexColor,
  getBeltTailwindClass,
  BeltRank as SharedBeltRank,
} from "@/lib/beltColors";

const beltOrderForTraining: SharedBeltRank[] = [
  "10_kyu",
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

const STORAGE_SELECTED_CLUB_ID_KEY = "selectedClubId";

type TrainingSession = {
  id: string;
  clubId: string;
  weekday: number; // 0–6
  startTime: string;
  endTime: string;
  name: string;
  active: boolean;
  location: string | null;
  belts: SharedBeltRank[];
};

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

function formatBelts(belts: string[]): string {
  if (!belts || belts.length === 0) return "Alla grader / ej specificerat";
  return belts.join(", ");
}

const ALL_BELTS: SharedBeltRank[] = [
  "10_kyu",
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
];

function formatBeltLabel(belt: string): string {
  const [n, type] = belt.split("_");
  if (!n || !type) return belt;
  return `${n} ${type}`;
}

/* =========================================================
   GRADIENT-BG FÖR ETT PASS
========================================================= */

function getSessionGradient(belts: SharedBeltRank[], active: boolean): string {
  // Inga bälten → neutral bakgrund
  if (!belts || belts.length === 0) {
    return active
      ? "linear-gradient(135deg, #16a34a, #0f766e)" // grön/blå-ish
      : "linear-gradient(135deg, #4b5563, #111827)"; // grå
  }

  // Unika bälten
  const uniqueBelts = Array.from(new Set(belts));

  // Sortera enligt beltOrderForTraining (från 10_kyu upp till 10_dan)
  const sortedBelts = uniqueBelts.sort((a, b) => {
    const idxA = beltOrderForTraining.indexOf(a);
    const idxB = beltOrderForTraining.indexOf(b);
    return idxA - idxB;
  });

  // Mappa till färger (hex)
  const colors = sortedBelts
    .map((b) => getBeltHexColor(b))
    .filter((c): c is string => typeof c === "string");

  if (colors.length === 0) {
    return active
      ? "linear-gradient(135deg, #16a34a, #0f766e)"
      : "linear-gradient(135deg, #4b5563, #111827)";
  }

  // EN färg → enkel toning
  if (colors.length === 1) {
    const c = colors[0];
    return active
      ? `linear-gradient(135deg, ${c}, ${c})`
      : `linear-gradient(135deg, ${c}, #020617)`;
  }

  // FLERA färger → upp till 16 band, tydliga
  const maxBands = 16;
  const usedColors = colors.slice(0, maxBands);
  const n = usedColors.length;
  const step = 100 / n;

  const stops: string[] = [];

  usedColors.forEach((c, idx) => {
    // Grundpositioner
    let start = idx * step;
    let end = (idx + 1) * step;

    // Första färgen: börja lite tidigare (‑1%)
    if (idx === 0) start = Math.max(0, start - 1);
    // Sista färgen: gå lite längre ( +1%)
    if (idx === n - 1) end = Math.min(100, end + 1);

    // Runda till en decimal
    const startStr = `${start.toFixed(1)}%`;
    const endStr = `${end.toFixed(1)}%`;
    const col = `${c}`; // 100% opacitet

    stops.push(`${col} ${startStr}`, `${col} ${endStr}`);
  });

  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/* =========================================================
   KOMPONENT
========================================================= */

export default function AdminTrainingPage() {
  const router = useRouter();

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [clubLoading, setClubLoading] = useState(true);

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // edit-läge: null = nytt, annars id för pass som redigeras
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const [formWeekday, setFormWeekday] = useState<number>(1);
  const [formStartTime, setFormStartTime] = useState<string>("18:00");
  const [formEndTime, setFormEndTime] = useState<string>("19:00");
  const [formName, setFormName] = useState<string>("");
  const [formLocation, setFormLocation] = useState<string>("");
  const [formBelts, setFormBelts] = useState<SharedBeltRank[]>([]);

  // Toast: grön oval "Träningspass sparat!"
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY);
    const cleaned =
      raw && raw !== "undefined" && raw !== "null" ? raw : "";

    setSelectedClubId(cleaned);
    setClubLoading(false);
  }, []);

  const selectedClubIdIsUuid = useMemo(
    () =>
      typeof selectedClubId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        selectedClubId
      ),
    [selectedClubId]
  );

  useEffect(() => {
    if (clubLoading) return;
    if (!selectedClubIdIsUuid) return;

    const loadSessions = async () => {
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
          console.error("Fel vid hämtning av träningspass:", res.status, json);
          setSessionsError(json?.error ?? "Kunde inte hämta träningspass.");
          setSessions([]);
          return;
        }

        if (!json || !Array.isArray(json.sessions)) {
          console.error("Oväntat svar från sessions/list:", json);
          setSessionsError("Oväntat svar från servern.");
          setSessions([]);
          return;
        }

        setSessions(json.sessions as TrainingSession[]);
      } catch (err) {
        console.error("Fel vid hämtning av träningspass:", err);
        setSessionsError("Kunde inte hämta träningspass (okänt fel).");
        setSessions([]);
      } finally {
        setSessionsLoading(false);
      }
    };

    loadSessions();
  }, [clubLoading, selectedClubId, selectedClubIdIsUuid]);

  const sessionsByDay = useMemo(() => {
    const map: Record<number, TrainingSession[]> = {};
    sessions.forEach((s) => {
      if (!map[s.weekday]) map[s.weekday] = [];
      map[s.weekday].push(s);
    });
    return map;
  }, [sessions]);

  const weekdaysOrder = [1, 2, 3, 4, 5, 6, 0];

  function resetForm() {
    setEditingSessionId(null);
    setFormWeekday(1);
    setFormStartTime("18:00");
    setFormEndTime("19:00");
    setFormName("");
    setFormLocation("");
    setFormBelts([]);
  }

  function toggleFormBelt(belt: SharedBeltRank) {
    setFormBelts((prev) =>
      prev.includes(belt) ? prev.filter((b) => b !== belt) : [...prev, belt]
    );
  }

  function handleEditSession(session: TrainingSession) {
    setEditingSessionId(session.id);
    setFormWeekday(session.weekday);
    setFormStartTime(session.startTime);
    setFormEndTime(session.endTime);
    setFormName(session.name || "");
    setFormLocation(session.location || "");
    setFormBelts(session.belts);
  }

  async function handleDeleteSession(id: string) {
    const ok = confirm("Är du säker på att du vill radera detta pass?");
    if (!ok) return;

    try {
      const res = await fetch("/api/admin/training/sessions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Fel vid delete:", res.status, json);
        alert(json?.error ?? "Kunde inte radera passet.");
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== id));

      if (editingSessionId === id) {
        resetForm();
      }
    } catch (err) {
      console.error("Fel vid delete:", err);
      alert("Ett fel uppstod när passet skulle raderas.");
    }
  }

  async function handleCreateOrUpdateSession(e: React.FormEvent) {
    e.preventDefault();

    if (!formStartTime.trim() || !formEndTime.trim()) {
      alert("Fyll i både start- och sluttid.");
      return;
    }

    if (formBelts.length === 0) {
      const ok = confirm(
        "Inga bälten valda. Vill du spara passet utan specifika grader?"
      );
      if (!ok) return;
    }

    try {
      const res = await fetch("/api/admin/training/sessions/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSessionId,
          clubId: selectedClubId,
          weekday: formWeekday,
          startTime: formStartTime.trim(),
          endTime: formEndTime.trim(),
          name: formName.trim(),
          location: formLocation.trim() || null,
          active: true,
          belts: formBelts,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Fel vid upsert:", res.status, json);
        alert(json?.error ?? "Kunde inte spara träningspasset.");
        return;
      }

      const saved = json.session as TrainingSession;
      if (!saved) {
        alert("Svar från servern saknar session-objekt.");
        return;
      }

      if (editingSessionId) {
        setSessions((prev) =>
          prev.map((s) => (s.id === saved.id ? saved : s))
        );
      } else {
        setSessions((prev) => [...prev, saved]);
      }

      resetForm();

      // Visa toast nere till höger
      setToastMessage("Träningspass sparat!");
      setTimeout(() => {
        setToastMessage(null);
      }, 2000);
    } catch (err) {
      console.error("Fel vid spara:", err);
      alert("Ett fel uppstod när passet skulle sparas.");
    }
  }

  if (clubLoading) {
    return (
      <main className="min-h-screen bg-black/90 text-white flex items-center justify-center">
        Laddar klubb...
      </main>
    );
  }

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
    <>
      {/* Toast */}
      {toastMessage && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-50 shadow-lg border border-emerald-300/70">
      {toastMessage}
    </div>
  </div>
)}

      <main className="min-h-screen bg-black/90 text-white flex flex-col">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            type="button"
            className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
            onClick={() => router.push("/admin")}
          >
            &#171;&#171;&#171; Tillbaka
          </button>

          <span className="text-[11px] text-gray-400">
            Klubb-ID: {selectedClubId}
          </span>
        </header>

        <section className="flex flex-col items-center px-4 pb-8 pt-4">
          <h1 className="mb-2 text-xl font-bold">Träningsschema (Admin)</h1>
          <p className="mb-4 text-sm text-gray-300 text-center">
            Lägg till, redigera och ta bort träningspass för denna klubb.
          </p>

          {/* FORMULÄR */}
          <div className="w-full max-w-md rounded-lg border-2 border-cyan-500/50 bg-black/70 p-4 mb-4">
            <h2 className="mb-2 text-sm font-semibold text-cyan-100">
              {editingSessionId
                ? "Redigera träningspass"
                : "Lägg till nytt träningspass"}
            </h2>

            <form
              className="space-y-3 text-xs"
              onSubmit={handleCreateOrUpdateSession}
            >
              {/* Veckodag */}
              <div>
                <label className="mb-1 block text-gray-300 text-[11px]">
                  Veckodag
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-1 pr-8 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                    value={formWeekday}
                    onChange={(e) => setFormWeekday(Number(e.target.value))}
                  >
                    <option value={1}>Måndag</option>
                    <option value={2}>Tisdag</option>
                    <option value={3}>Onsdag</option>
                    <option value={4}>Torsdag</option>
                    <option value={5}>Fredag</option>
                    <option value={6}>Lördag</option>
                    <option value={0}>Söndag</option>
                  </select>
                  <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.25 7.5L10 12.25 14.75 7.5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Tid */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-gray-300 text-[11px]">
                    Starttid
                  </label>
                  <input
                    type="time"
                    className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-1 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-gray-300 text-[11px]">
                    Sluttid
                  </label>
                  <input
                    type="time"
                    className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-1 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Namn */}
              <div>
                <label className="mb-1 block text-gray-300 text-[11px]">
                  Namn på pass (valfritt)
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-1 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="t.ex. Grund 10–8 kyu"
                />
              </div>

              {/* Plats */}
              <div>
                <label className="mb-1 block text-gray-300 text-[11px]">
                  Plats (valfritt)
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-700 bg-neutral-900/70 px-2 py-1 text-xs text-gray-100 focus:border-cyan-500 focus:outline-none"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="t.ex. Dojon, sal 2"
                />
              </div>

              {/* Bälten */}
              <div>
                <label className="mb-1 block text-gray-300 text-[11px]">
                  Bälten som passet riktar sig till
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_BELTS.map((belt) => {
                    const checked = formBelts.includes(belt);
                    const baseClass = getBeltTailwindClass(belt);

                    return (
                      <button
                        key={belt}
                        type="button"
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold ${baseClass} ${
                          checked
                            ? "border-cyan-500/60 ring-2 ring-cyan-500/60"
                            : "border-black/40"
                        }`}
                        onClick={() => toggleFormBelt(belt)}
                      >
                        {formatBeltLabel(belt)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spara / Avbryt */}
              <div className="mt-3 flex justify-end gap-2">
                {editingSessionId && (
                  <button
                    type="button"
                    className="rounded-md bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-100 hover:bg-gray-600"
                    onClick={resetForm}
                  >
                    Avbryt redigering
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-cyan-700 px-4 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-600"
                >
                  {editingSessionId ? "Spara ändringar" : "Spara nytt pass"}
                </button>
              </div>
            </form>
          </div>

          {/* LISTA PASS */}
          <div className="w-full max-w-md rounded-lg border-2 border-cyan-500/50 bg-black/60 p-4 mb-4">
            {sessionsLoading && (
              <p className="text-xs text-gray-300">Laddar träningspass...</p>
            )}

            {sessionsError && (
              <p className="text-xs text-red-400 mb-2">{sessionsError}</p>
            )}

            {!sessionsLoading && !sessionsError && sessions.length === 0 && (
              <p className="text-xs text-gray-300">
                Inga träningspass registrerade ännu för denna klubb.
              </p>
            )}

            {!sessionsLoading && sessions.length > 0 && (
              <div className="space-y-4 text-xs">
                {weekdaysOrder.map((day) => {
                  const daySessions = sessionsByDay[day] ?? [];
                  if (daySessions.length === 0) return null;

                  return (
                    <div key={day}>
                      <div className="mb-1 text-sm font-semibold text-gray-100">
                        {weekdayLabel(day)}
                      </div>
                      <div className="space-y-1">
                        {daySessions.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md border-2 border-cyan-500/60 px-2 py-1 relative overflow-hidden"
                            style={{
                              backgroundImage: getSessionGradient(
                                s.belts,
                                s.active
                              ),
                            }}
                          >
                            <div className="mb-1 flex justify-between gap-2">
                              <span className="font-semibold text-gray-100 drop-shadow-sm">
                                {s.startTime}–{s.endTime}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  className="rounded-md bg-black/50 px-3 py-2 text-[10px] font-semibold text-gray-100 hover:bg-black/80"
                                  onClick={() => handleEditSession(s)}
                                >
                                  Redigera
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md bg-red-700/85 px-3 py-2 text-[10px] font-semibold text-red-50 hover:bg-red-600"
                                  onClick={() => handleDeleteSession(s.id)}
                                >
                                  Radera
                                </button>
                              </div>
                            </div>
                            <div className="text-gray-50 drop-shadow-sm">
                              {s.name || "(ingen titel)"}
                            </div>
                            <div className="text-[11px] text-gray-100 drop-shadow-sm">
                              Bälten: {formatBelts(s.belts)}
                            </div>
                            {s.location && (
                              <div className="text-[11px] text-gray-100 drop-shadow-sm">
                                Plats: {s.location}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}