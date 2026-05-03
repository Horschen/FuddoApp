import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FuddoApp",
  description: "Karateklubbsadministration och närvarosystem",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className="min-h-screen bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
