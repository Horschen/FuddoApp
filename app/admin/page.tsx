"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminSession = {
  authenticated: boolean;
  memberId?: string;
  role?: "member" | "admin" | "superadmin";
  name?: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        const json = await res.json();
        setSession(json);
      } catch (err) {
        console.error("Kunde inte hämta adminsession:", err);
        setSession({ authenticated: false });
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Laddar adminpanel...</p>
      </main>
    );
  }

  if (!session || !session.authenticated) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm mb-2">
            Du är inte inloggad som admin.
          </p>
          <button
            className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold hover:bg-blue-600"
            onClick={() => router.push("/admin/login")}
          >
            Gå till inloggning
          </button>
        </div>
      </main>
    );
  }

  const roleLabel =
    session.role === "superadmin"
      ? "SuperAdmin"
      : session.role === "admin"
      ? "Admin"
      : "Medlem";

  return (
    <main className="min-h-screen bg-black/95 text-white px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <button
          className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold hover:bg-gray-600"
          onClick={() => router.push("/")}
        >
          Tillbaka
        </button>

        <div className="text-right text-[11px] text-gray-300">
          <div>{session.name ?? "Okänd användare"}</div>
          <div className="text-gray-400">Roll: {roleLabel}</div>
        </div>
      </header>

      <h1 className="text-xl font-bold mb-3">Adminpanel</h1>

      <p className="text-sm text-gray-300 mb-4">
        Här bygger vi steg för steg upp verktyg för Admin och SuperAdmin.
      </p>

      <section className="space-y-3 text-sm">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-3">
          <h2 className="text-sm font-semibold mb-1">Översikt</h2>
          <p className="text-xs text-gray-300">
            Du är inloggad som{" "}
            <span className="font-semibold">{roleLabel}</span>. Senare kan vi
            härifrån styra vilka funktioner som är synliga för olika roller,
            se loggar, hantera träningsschema osv.
          </p>
        </div>

        {session.role === "superadmin" && (
          <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-3">
            <h2 className="text-sm font-semibold mb-1">
              Endast för SuperAdmin
            </h2>
            <p className="text-xs text-gray-200">
              Detta block syns bara för SuperAdmin. Här kan vi lägga globala
              klubbinställningar, loggvisning, export av data m.m.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}