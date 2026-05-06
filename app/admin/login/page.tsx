"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorText(null);

    if (!memberId.trim() || !password.trim()) {
      setErrorText("Fyll i både medlems-ID och lösenord.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: memberId.trim(),
          password: password,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorText(json?.error ?? "Kunde inte logga in.");
        setLoading(false);
        return;
      }

      // Inloggad, vidare till adminpanel (kan ändras senare)
      router.push("/admin");
    } catch (err) {
      console.error(err);
      setErrorText("Ett fel uppstod vid inloggning.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black/90 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-xl">
        <h1 className="text-xl font-bold mb-4 text-center">Admininloggning</h1>

        <form className="space-y-3" onSubmit={handleLogin}>
          <div>
            <label className="block text-xs text-gray-300 mb-1">
              Medlems-ID
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Klistra in medlemmens id från databasen"
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Senare kan vi ersätta detta med e‑post eller medlemsnummer.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1">
              Adminlösenord
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-gray-700 bg-black/70 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Lösenord satt på profilsidan"
            />
          </div>

          {errorText && (
            <p className="text-[11px] text-red-400 mt-1">{errorText}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-blue-50 hover:bg-blue-600 disabled:bg-gray-700"
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>
      </div>
    </main>
  );
}