"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

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
  created_at: string;
};

export default function AdminClubsPage() {
  const router = useRouter();

  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);

  const [newClubName, setNewClubName] = useState("");
  const [newClubSlug, setNewClubSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const activeCount = useMemo(
    () => clubs.filter((c) => c.active).length,
    [clubs]
  );

  async function loadSession() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      setSession(json);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setSessionLoading(false);
    }
  }

  async function loadClubs() {
    try {
      setClubsError(null);
      setClubsLoading(true);

      const res = await fetch("/api/admin/clubs", { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setClubsError(json?.error ?? "Kunde inte hämta klubbar.");
        return;
      }

      setClubs(Array.isArray(json?.clubs) ? (json.clubs as Club[]) : []);
    } catch {
      setClubsError("Kunde inte hämta klubbar (okänt fel).");
    } finally {
      setClubsLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (session?.authenticated && session.role === "superadmin") {
      loadClubs();
    }
  }, [session]);

  if (sessionLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Laddar...
      </main>
    );
  }

  if (!session?.authenticated) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm">Du är inte inloggad.</p>
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

  if (session.role !== "superadmin") {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        Denna sida kräver SuperAdmin.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black/95 text-white px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <button
          className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold hover:bg-gray-600"
          onClick={() => router.push("/admin")}
        >
          Tillbaka
        </button>

        <div className="text-right text-[11px] text-gray-300">
          <div>{session.name ?? "Okänd användare"}</div>
          <div className="text-gray-400">Roll: SuperAdmin</div>
        </div>
      </header>

      <h1 className="text-xl font-bold mb-2">Klubbar</h1>
      <p className="text-[11px] text-gray-400 mb-4">
        Aktiva: {activeCount} / {clubs.length}
      </p>

      {/* Skapa klubb */}
      <div className="rounded-lg border border-white/10 bg-neutral-900 p-3 mb-4">
        <h2 className="text-sm font-semibold mb-2">Skapa ny klubb</h2>

        <div className="space-y-2">
          <div>
            <label className="block text-[11px] text-gray-300 mb-1">Namn</label>
            <input
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100"
              value={newClubName}
              onChange={(e) => setNewClubName(e.target.value)}
              placeholder="t.ex. Fudokan Malmö"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-300 mb-1">
              Slug (valfritt)
            </label>
            <input
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100"
              value={newClubSlug}
              onChange={(e) => setNewClubSlug(e.target.value)}
              placeholder="t.ex. fudokan-malmo"
            />
          </div>

          <button
            type="button"
            disabled={creating}
            className="w-full rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-600 disabled:bg-gray-700"
            onClick={async () => {
              try {
                if (!newClubName.trim()) {
                  alert("Skriv ett namn.");
                  return;
                }

                setCreating(true);
                const res = await fetch("/api/admin/clubs/create", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: newClubName.trim(),
                    slug: newClubSlug.trim() || undefined,
                  }),
                });

                const json = await res.json().catch(() => null);
                if (!res.ok)
                  throw new Error(json?.error ?? "Kunde inte skapa klubb.");

                setNewClubName("");
                setNewClubSlug("");
                await loadClubs();
              } catch (e) {
                alert(e instanceof Error ? e.message : "Kunde inte skapa klubb.");
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? "Skapar..." : "Skapa klubb"}
          </button>
        </div>
      </div>

      {/* Lista klubbar */}
      <div className="rounded-lg border border-white/10 bg-neutral-900 p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Alla klubbar</h2>
          <button
            className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold hover:bg-gray-600"
            onClick={loadClubs}
            disabled={clubsLoading}
          >
            {clubsLoading ? "Laddar..." : "Uppdatera"}
          </button>
        </div>

        {clubsError && (
          <p className="text-[11px] text-red-300 mb-2">{clubsError}</p>
        )}

        {clubs.length === 0 && !clubsLoading && (
          <p className="text-[11px] text-gray-400">Inga klubbar.</p>
        )}

        <div className="space-y-3">
          {clubs.map((club) => (
            <div
              key={club.id}
              className="rounded-md border border-white/10 bg-black/40 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Image
                    src={club.logo_url ?? "/main.png"}
                    alt={club.name}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-md object-cover bg-black"
                  />

                  <div className="text-xs">
                    <div className="font-semibold text-gray-100">
                      {club.name}
                    </div>
                    <div className="text-[10px] text-gray-400">{club.slug}</div>
                    <div className="text-[10px] text-gray-500 break-all">
                      {club.id}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <div className="text-[10px] text-gray-400 text-right max-w-[11rem]">
                    <div>
                      <span className="font-semibold">Aktiv</span> = syns i dropdown.
                    </div>
                    <div>
                      <span className="font-semibold">Inaktiv</span> = dold i dropdown.
                    </div>
                  </div>

                  <button
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                      club.active
                        ? "bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
                        : "bg-gray-700 text-gray-50 hover:bg-gray-600"
                    }`}
                    onClick={async () => {
                      const res = await fetch("/api/admin/clubs/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: club.id, active: !club.active }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        alert(json?.error ?? "Kunde inte uppdatera.");
                        return;
                      }
                      await loadClubs();
                    }}
                  >
                    {club.active ? "Sätt Inaktiv" : "Sätt Aktiv"}
                  </button>

                  <button
                    className="rounded-md bg-blue-700 px-3 py-1 text-[11px] font-semibold hover:bg-blue-600"
                    onClick={() => {
                      const input = document.getElementById(
                        `club-logo-input-${club.id}`
                      ) as HTMLInputElement | null;
                      input?.click();
                    }}
                  >
                    Byt logga
                  </button>

                  <button
                    className="rounded-md bg-red-800 px-3 py-1 text-[11px] font-semibold text-red-50 hover:bg-red-700"
                    onClick={async () => {
                      const ok = confirm(
                        `Är du säker på att du vill ta bort klubben?\n\n` +
                        `Alla medlemmar i listan kommer att raderas också!`
                      );
                      if (!ok) return;

                      const res = await fetch("/api/admin/clubs/hard-delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: club.id }),
                      });

                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        alert(json?.error ?? "Kunde inte radera klubb.");
                        return;
                      }

                      alert(`Klubb raderad. Raderade medlemmar: ${json.deletedMembers ?? 0}`);
                      await loadClubs();
                    }}
                  >
                    Radera klubb
                  </button>

                  <input
                    id={`club-logo-input-${club.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("clubId", club.id);

                        const res = await fetch("/api/admin/clubs/logo-upload", {
                          method: "POST",
                          body: formData,
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok) throw new Error(json?.error ?? "Kunde inte ladda upp.");

                        await loadClubs();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Kunde inte ladda upp.");
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}