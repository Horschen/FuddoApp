"use client";

import { useRouter } from "next/navigation";

export default function SchemaPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-black/90 text-white flex flex-col">
      {/* Topprad med tillbaka + tider-knapp */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          type="button"
          className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => router.push("/")}
        >
          &#171;&#171;&#171; Tillbaka
        </button>

        <button
          type="button"
          className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-100 hover:bg-gray-600"
          onClick={() => {
            // här kommer vi senare öppna vy/modal för att justera tider
            alert("Här kommer funktionen för att lägga till / ändra / ta bort tider.");
          }}
        >
          + / - Tider
        </button>
      </header>

      {/* Sidinnehåll */}
      <section className="flex flex-col items-center px-4 pb-8 pt-4">
        <h1 className="mb-2 text-xl font-bold">Träningsschema</h1>
        <p className="mb-6 text-sm text-gray-300 text-center">
          Här kommer träningsschemat för den valda klubben att visas senare.
        </p>

        <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/60 p-4">
          <p className="text-xs text-gray-400">
            Detta är just nu en tom layout-sida. Vi kopplar den till riktig data och
            klubbval längre fram.
          </p>
        </div>
      </section>
    </main>
  );
}