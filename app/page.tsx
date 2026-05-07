"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/* =========================================================
   TYPES
========================================================= */
type AdminSession = {
  authenticated: boolean;
  memberId?: string;
  role?: "member" | "admin" | "superadmin";
  name?: string;
};

type Club = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  active: boolean;
};

const STORAGE_SELECTED_CLUB_ID_KEY = "selectedClubId";

/* =========================================================
   PAGE COMPONENT
========================================================= */
export default function HomePage() {
  const router = useRouter();

  /* ---------- Klubbdata från DB ---------- */
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);

  /* ---------- Vald klubb ---------- */
  const [selectedClubId, setSelectedClubId] = useState<string>("");

  /* ---------- Admin-session ---------- */
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  /* ---------- Login-popup ---------- */
  const [showLogin, setShowLogin] = useState(false);
  const [loginMemberId, setLoginMemberId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  /* ---------- Härledda värden ---------- */
  const selectedClub = useMemo(() => {
    if (!selectedClubId) return null;
    return clubs.find((c) => c.id === selectedClubId) ?? null;
  }, [clubs, selectedClubId]);

  const isLoggedIn =
    session?.authenticated === true &&
    (session.role === "admin" || session.role === "superadmin");

  const currentMainLogo = selectedClub?.logo_url ?? "/main.png";

  /* =========================================================
     LOAD: session
  ========================================================= */
  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setSession({ authenticated: false });
          return;
        }
        const json = await res.json();
        if (!cancelled) setSession(json);
      } catch {
        if (!cancelled) setSession({ authenticated: false });
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     LOAD: clubs (aktiva)
  ========================================================= */
  useEffect(() => {
    let cancelled = false;

    const loadClubs = async () => {
      try {
        setClubsLoading(true);
        const res = await fetch("/api/clubs", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          console.error("Kunde inte hämta klubbar:", res.status, json);
          if (!cancelled) setClubs([]);
          return;
        }

        if (!json || !Array.isArray(json.clubs)) {
          console.error("Oväntat svar från /api/clubs:", json);
          if (!cancelled) setClubs([]);
          return;
        }

        if (!cancelled) setClubs(json.clubs as Club[]);
      } catch (e) {
        console.error("Fel vid hämtning av klubbar:", e);
        if (!cancelled) setClubs([]);
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    };

    loadClubs();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     När vi är inloggade + har klubbar: återställ klubbval från localStorage
     (endast när inloggad)
  ========================================================= */
  useEffect(() => {
    if (!isLoggedIn) return;
    if (clubsLoading) return;
    if (!clubs || clubs.length === 0) return;

    const stored = localStorage.getItem(STORAGE_SELECTED_CLUB_ID_KEY) ?? "";
    if (!stored) return;

    const exists = clubs.some((c) => c.id === stored);
    if (exists) {
      setSelectedClubId(stored);
    }
  }, [isLoggedIn, clubsLoading, clubs]);

  /* =========================================================
     LOGIN
  ========================================================= */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);

    if (!loginMemberId.trim() || !loginPassword.trim()) {
      setLoginError("Fyll i både Medlems-ID och lösenord.");
      return;
    }

    try {
      setLoginLoading(true);

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: loginMemberId.trim(),
          password: loginPassword,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setLoginError(json?.error ?? "Kunde inte logga in.");
        return;
      }

      // Login lyckades – hämta session
      const meRes = await fetch("/api/admin/me", { cache: "no-store" });
      const meJson = await meRes.json();
      setSession(meJson);

      // Stäng popup och nollställ fält
      setShowLogin(false);
      setLoginMemberId("");
      setLoginPassword("");
    } catch {
      setLoginError("Ett fel uppstod vid inloggning.");
    } finally {
      setLoginLoading(false);
    }
  }

  /* =========================================================
     LOGOUT (rensa även sparad klubb)
  ========================================================= */
  async function handleLogout() {
    try {
      const res = await fetch("/api/admin/logout", { method: "POST" });
      console.log("logout status", res.status);
    } catch (err) {
      console.error("Kunde inte logga ut:", err);
    } finally {
      // Rensa session
      setSession({ authenticated: false });

      // Rensa klubbval så användaren måste välja igen nästa gång
      localStorage.removeItem(STORAGE_SELECTED_CLUB_ID_KEY);
      setSelectedClubId("");
    }
  }

  /* ---------- Laddar session ---------- */
  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>Laddar...</p>
      </main>
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-black via-[#220011] to-black text-white">
      {/* Bakgrundslogga */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-80">
        <Image
          src="/background.png"
          alt="Bakgrundslogga"
          width={675}
          height={675}
          priority
          className="object-contain"
        />
      </div>

      {/* Innehåll ovanpå bakgrunden */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 px-5 py-7 sm:max-w-md">
        {/* Huvudlogga */}
        <div className="flex flex-col items-center gap-2">
          <Image
            src={currentMainLogo}
            alt="Klubbmärke"
            width={150}
            height={150}
            className="object-contain opacity-95 drop-shadow-lg"
          />
          <p className="px-4 text-center text-xs text-gray-300 sm:text-sm">
            {selectedClub ? selectedClub.name : "Välj klubb för att fortsätta"}
          </p>
        </div>

        {/* Välj klubb */}
        <div className="w-full">
          <label className="mb-2 block text-xs font-semibold text-gray-200 sm:text-sm">
            Välj klubb
          </label>

          <select
            className="w-full rounded-md border border-gray-600 bg-black/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-60"
            value={selectedClubId}
            disabled={clubsLoading || clubs.length === 0}
            onChange={(e) => {
  const clubId = e.target.value;
  setSelectedClubId(clubId);

  // Spara alltid klubbvalet
  if (clubId) localStorage.setItem(STORAGE_SELECTED_CLUB_ID_KEY, clubId);
  else localStorage.removeItem(STORAGE_SELECTED_CLUB_ID_KEY);
}}
          >
            <option value="">
              {clubsLoading ? "Laddar klubbar..." : "— Välj klubb —"}
            </option>

            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </div>

        {/* Login / Logga ut -knapp */}
        <button
          type="button"
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          disabled={!selectedClubId && !isLoggedIn}
          onClick={() => {
            if (isLoggedIn) handleLogout();
            else setShowLogin(true);
          }}
        >
          {isLoggedIn ? "Logga ut" : "Login"}
        </button>

        {/* Knappar som bara syns efter login OCH klubb vald */}
        {isLoggedIn && selectedClubId && (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-emerald-700"
              onClick={() => router.push("/karatekas")}
            >
              Klubbmedlemmar
            </button>

            {/* Träningsschema-knappen borttagen enligt önskemål */}

            <button
              type="button"
              className="w-full rounded-md bg-gray-700 px-4 py-2 text-center text-sm font-semibold transition hover:bg-gray-600"
              onClick={() => router.push("/admin")}
            >
              Adminpanel
            </button>
          </div>
        )}

        {/* Statusrad */}
        <p className="mt-2 text-[11px] text-gray-500 sm:text-xs">
          {selectedClub ? `Klubb: ${selectedClub.name}` : "Ingen klubb vald"} |{" "}
          {isLoggedIn
            ? `Inloggad som ${session?.name ?? "Okänd"}`
            : "Ej inloggad"}
        </p>

        <p className="text-[11px] text-gray-500 sm:text-xs">
  debug: savedClubId={typeof window !== "undefined" ? localStorage.getItem("selectedClubId") : ""}
</p>

      </div>

      {/* =====================================================
          LOGIN-POPUP
      ====================================================== */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Admininloggning</h2>
              <button
                className="text-xs text-gray-300 hover:text-white"
                onClick={() => {
                  setShowLogin(false);
                  setLoginError(null);
                }}
              >
                Stäng
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleLogin}>
              <div>
                <label className="mb-1 block text-xs text-gray-300">
                  Medlems-ID
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                  value={loginMemberId}
                  onChange={(e) => setLoginMemberId(e.target.value)}
                  placeholder="t.ex. 000001"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-300">
                  Adminlösenord
                </label>
                <input
                  type="password"
                  className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Lösenord"
                />
              </div>

              {loginError && (
                <p className="text-[11px] text-red-400">{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-blue-50 hover:bg-blue-600 disabled:bg-gray-700"
              >
                {loginLoading ? "Loggar in..." : "Logga in"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}