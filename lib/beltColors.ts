// lib/beltColors.ts

export type BeltRank =
  | "10_kyu"
  | "9_kyu"
  | "8_kyu"
  | "7_kyu"
  | "6_kyu"
  | "5_kyu"
  | "4_kyu"
  | "3_kyu"
  | "2_kyu"
  | "1_kyu"
  | "1_dan"
  | "2_dan"
  | "3_dan"
  | "4_dan"
  | "5_dan"
  | "6_dan"
  | "7_dan"
  | "8_dan"
  | "9_dan"
  | "10_dan";

/**
 * Tailwind-klasser för bakgrundsfärg per bälte (kan användas i listor)
 */
export function getBeltTailwindClass(belt: BeltRank): string {
  switch (belt) {
    case "10_kyu":
      return "bg-stone-100/90 text-black";
    case "9_kyu":
      return "bg-red-900/60 text-white";
    case "8_kyu":
      return "bg-yellow-500/60 text-white";
    case "7_kyu":
      return "bg-orange-500/60 text-white";
    case "6_kyu":
      return "bg-green-800/40 text-white";
    case "5_kyu":
      return "bg-sky-500/30 text-white";
    case "4_kyu":
      return "bg-blue-700/30 text-white";
    case "3_kyu":
      return "bg-amber-600/30 text-white";
    case "2_kyu":
      return "bg-amber-700/30 text-white";
    case "1_kyu":
      return "bg-amber-800/30 text-white";
    default:
      return "bg-gray-800/60 text-white";
  }
}

/**
 * Färgkod i hex för gradienter etc – härleds grovt från Tailwind-färger.
 */
export function getBeltHexColor(belt: BeltRank): string {
  switch (belt) {
    case "10_kyu":
      return "#f5f5f4"; // gräddvit
    case "9_kyu":
      return "#b91c1c"; // röd
    case "8_kyu":
      return "#eab308"; // gul
    case "7_kyu":
      return "#f97316"; // orange
    case "6_kyu":
      return "#15803d"; // grön
    case "5_kyu":
      return "#0ea5e9"; // ljusblå
    case "4_kyu":
      return "#1d4ed8"; // blå
    case "3_kyu":
      return "#d97706"; // ljusbrun
    case "2_kyu":
      return "#b45309"; // brun
    case "1_kyu":
      return "#92400e"; // mörkbrun
    case "1_dan":
    case "2_dan":
    case "3_dan":
    case "4_dan":
    case "5_dan":
    case "6_dan":
    case "7_dan":
    case "8_dan":
    case "9_dan":
    case "10_dan":
      return "#111827"; // mörk grå/svart
    default:
      return "#111827";
  }
}