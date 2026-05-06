"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  name: string;
  logo: string;
};

/* =========================================================
   CLUBS (hårdkodade tills vidare)
========================================================= */
const CLUBS: Club[] = [
  {
    id: "fuddo-barslov",
    name: "Fudokan Shutokan Bårslöv",
    logo: "/clubs/FudokanBarslov.png",
  },
  {
    id: "fuddo-solna",
    name: "Fudokan Shutokan Solna",
    logo: "/clubs/FudokanSolna.png",
  },
  {
    id: "bushido",
    name: "Bushido Karateklubb",
    logo: "/main.png",
  },
];

/* =========================================================
   PAGE COMPONENT
========================================================= */
export default function HomePage() {
  const router = useRouter();

  /* ---------- Klubb ---------- */
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  /* ---------- Admin-session ---------- */
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  /* ---------- Login-popup ---------- */
  const [showLogin, setShowLogin] = useState(false);
  const [loginMemberId, setLoginMemberId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  /* ---------- Hämta session (körs EN gång) ---------- */
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

  /* ---------- Härledda värden ---------- */
  const currentMainLogo = selectedClub?.logo ?? "/main.png";

  const isLoggedIn =
    session?.authenticated === true &&
    (session.role === "admin" || session.role === "superadmin");

  /* ---------- Hantera login ---------- */
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

  /* ---------- Hantera logout ---------- */
  async function handleLogout() {
    try {
      const res = await fetch("/api/admin/logout", {
        method: "POST",
      });
      console.log("logout status", res.status);
    } catch (err) {
      console.error("Kunde inte logga ut:", err);
    } finally {
      setSession({ authenticated: false });
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
  ========================================================== */
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
            className="w-full rounded-md border border-gray-600 bg-black/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            value={selectedClub?.id ?? ""}
            onChange={(e) => {
              const club = CLUBS.find((c) => c.id === e.target.value) || null;
              setSelectedClub(club);
            }}
          >
            <option value="">— Välj klubb —</option>
            {CLUBS.map((club) => (
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
  disabled={!selectedClub && !isLoggedIn}
  onClick={() => {
    if (isLoggedIn) {
      handleLogout();
    } else {
      setShowLogin(true);
    }
  }}
>
  {isLoggedIn ? "Logga ut" : "Login"}
</button>

        {/* Knappar som bara syns efter login OCH klubb vald */}
        {isLoggedIn && selectedClub && (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-emerald-700"
              onClick={() => router.push("/karatekas")}
            >
              Klubbmedlemmar
            </button>

            <button
              type="button"
              className="w-full rounded-md bg-purple-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-purple-700"
              onClick={() => router.push("/schema")}
            >
              Träningsschema
            </button>

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