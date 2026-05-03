"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Typ för en klubb
type Club = {
  id: string;
  name: string;
  logo: string;
};

// Här listar vi klubbarna (loggor kan läggas till senare)
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
    logo: "/main.png", // tillfällig, tills du har en bushido-logga
  },
];

export default function HomePage() {
  const router = useRouter();
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Om ingen klubb är vald visas main.png, annars klubbens logga
  const currentMainLogo = selectedClub?.logo ?? "/main.png";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-black via-[#220011] to-black text-white">
      {/* Bakgrundslogga (ligger still i botten) */}
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

        {/* Login-knapp */}
        <button
          type="button"
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          disabled={!selectedClub}
          onClick={() => setIsLoggedIn((prev) => !prev)}
        >
          {isLoggedIn ? "Logga ut" : "Login"}
        </button>

        {/* Knappar som bara syns efter login */}
        {isLoggedIn && (
       <div className="flex w-full flex-col gap-3">
         <button
           type="button"
           className="w-full rounded-md bg-emerald-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-emerald-700"
           onClick={() => {
             // här kommer vi senare skicka med vald klubb
             router.push("/karatekas");
           }}
         >
           Klubbmedlemmar
         </button>

         <button
           type="button"
           className="w-full rounded-md bg-purple-600 px-4 py-2 text-center text-sm font-semibold transition hover:bg-purple-700"
           onClick={() => {
             router.push("/schema");
           }}
         >
           Träningsschema
         </button>
       </div>
     )}

        {/* Liten statusrad (kan tas bort senare) */}
        <p className="mt-2 text-[11px] text-gray-500 sm:text-xs">
          {selectedClub ? `Klubb: ${selectedClub.name}` : "Ingen klubb vald"} |{" "}
          {isLoggedIn ? "Inloggad" : "Utloggad"}
        </p>
      </div>
    </main>
  );
}