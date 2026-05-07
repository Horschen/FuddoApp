"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminSession = {
  authenticated: boolean;
  memberId?: string;
  role?: "member" | "admin" | "superadmin";
  name?: string;
};

type AdminLog = {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  details: any;
};

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLimit, setLogsLimit] = useState<number | null>(null);

  // Hämta admin-session
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

  // Hämta loggar när vi har en superadmin-session
  useEffect(() => {
    if (!session || !session.authenticated || session.role !== "superadmin") {
      return;
    }

    const loadLogs = async () => {
      try {
        setLogsLoading(true);
        const res = await fetch("/api/admin/logs", { cache: "no-store" });

        let json: any = null;
        try {
          json = await res.json();
        } catch (e) {
          console.error("Kunde inte parsa JSON från /api/admin/logs:", e);
        }

        if (!res.ok) {
          console.error("Fel vid hämtning av loggar:", res.status, json);
          return;
        }

        if (!json || !Array.isArray(json.logs)) {
          console.error("Oväntat svar från /api/admin/logs:", json);
          return;
        }

        setLogs(json.logs);
        setLogsLimit(typeof json.limit === "number" ? json.limit : null);
      } catch (err) {
        console.error("Kunde inte hämta adminlogs:", err);
      } finally {
        setLogsLoading(false);
      }
    };

    loadLogs();
  }, [session]);

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
          <p className="text-sm mb-2">Du är inte inloggad som admin.</p>
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
            Du är inloggad som <span className="font-semibold">{roleLabel}</span>
            . Senare kan vi härifrån styra vilka funktioner som är synliga för
            olika roller, se loggar, hantera träningsschema osv.
          </p>
        </div>

        {session.role === "superadmin" && (
          <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-3 space-y-3">
            <h2 className="text-sm font-semibold mb-1">
              Endast för SuperAdmin
            </h2>
            <p className="text-xs text-gray-200">
              Detta block syns bara för SuperAdmin. Här kan vi lägga globala
              klubbinställningar, loggvisning, export av data m.m.
            </p>

            <div className="mt-2 rounded-md border border-white/10 bg-black/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
  <span className="text-xs font-semibold text-gray-100">
    Senaste admin‑ändringar
  </span>

  <div className="flex items-center gap-2">
    {logsLoading && (
      <span className="text-[10px] text-gray-400">Laddar loggar...</span>
    )}

    <button
      type="button"
      className="rounded-md bg-red-700 px-2 py-1 text-[10px] font-semibold text-red-50 hover:bg-red-600"
      onClick={async () => {
        const ok = confirm("Rensa ALLA loggar? Detta går inte att ångra.");
        if (!ok) return;

        const res = await fetch("/api/admin/logs/clear", { method: "POST" });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          alert(json?.error ?? "Kunde inte rensa loggar.");
          return;
        }

        // Ladda om loggar efter rensning
        const logsRes = await fetch("/api/admin/logs", { cache: "no-store" });
        const logsJson = await logsRes.json().catch(() => null);
        setLogs(Array.isArray(logsJson?.logs) ? logsJson.logs : []);
        setLogsLimit(typeof logsJson?.limit === "number" ? logsJson.limit : null);
      }}
    >
      Rensa loggar
    </button>
  </div>
</div>

<div className="text-[10px] text-gray-400 mb-2">
  Visar {logs.length}
  {logsLimit ? ` av ${logsLimit}` : ""} senaste loggar
</div>

              {logs.length === 0 && !logsLoading && (
                <p className="text-[11px] text-gray-400">Inga loggar ännu.</p>
              )}

              {logs.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-2 text-[11px]">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-300">{log.actor}</span>
                        <span className="text-[10px] text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-gray-200">
                        Åtgärd:{" "}
                        <span className="font-semibold">{log.action}</span>
                      </div>

                      {log.details?.targetName && (
                        <div className="text-gray-300">
                          Mål: {log.details.targetName}
                        </div>
                      )}

                      {log.details?.field && (
                        <div className="text-gray-300">
                          Fält:{" "}
                          <span className="font-semibold">
                            {log.details.field}
                          </span>
                        </div>
                      )}

                      {log.details?.from !== undefined &&
                        log.details?.to !== undefined && (
                          <div className="text-gray-300">
                            Ändrat från{" "}
                            <span className="font-semibold">
                              {String(log.details.from)}
                            </span>{" "}
                            till{" "}
                            <span className="font-semibold">
                              {String(log.details.to)}
                            </span>
                          </div>
                        )}

                      {log.details?.memberId && (
                        <div className="text-gray-400">
                          memberId: {log.details.memberId}
                        </div>
                      )}

                      {log.details?.userId && (
                        <div className="text-gray-400">
                          userId: {log.details.userId}
                        </div>
                      )}

                      {log.details?.token && (
                        <div className="text-gray-400 break-all">
                          token: {log.details.token}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}