"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CHARACTER_ID_KEY } from "./hooks/useChat";

/**
 * Root page — redirects immediately based on localStorage.
 * Has character ID → /dashboard (load existing session)
 * No character ID  → /character-creation (start fresh)
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const id = localStorage.getItem(CHARACTER_ID_KEY);
    router.replace(id ? "/dashboard" : "/character-creation");
  }, [router]);

  return (
    <main className="flex items-center justify-center min-h-screen bg-dungeon">
      <span className="font-cinzel text-gold text-4xl animate-pulse">✦</span>
    </main>
  );
}
