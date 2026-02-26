import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Dungeon Master",
  description: "An AI-powered Dungeon Master for D&D 5e",
};

/**
 * Font CSS variables are set via globals.css @import from Google Fonts.
 * This avoids build failures from next/font/google when the network is
 * unavailable (CI, sandboxed envs). At runtime, the browser loads the
 * fonts and the CSS variables resolve; if offline, the serif fallback
 * chain in Tailwind config kicks in.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=Crimson+Text:ital,wght@0,400;0,600;1,400;1,600&display=swap"
        />
      </head>
      <body className="font-crimson">
        {children}
      </body>
    </html>
  );
}
