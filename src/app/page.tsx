"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root page — redirects immediately based on localStorage.
 * Has character ID → /dashboard (load existing session)
 * No character ID  → /character-creation (start fresh)
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/characters");
  }, [router]);

  return (
    <main className="flex items-center justify-center min-h-screen bg-dungeon">
      <span className="font-cinzel text-gold text-4xl animate-pulse">✦</span>
    </main>
  );
}
