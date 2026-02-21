/**
 * combatEventBus.ts
 *
 * In-memory event bus for SSE communication during combat.
 * The POST /api/combat/action handler emits events, and the
 * GET /api/combat/stream SSE endpoint subscribes to them.
 *
 * Keyed by encounterId so multiple encounters don't interfere.
 * Single-server only (no Redis/pubsub needed for single-player).
 */

import type { CombatSSEEvent } from "./gameTypes";

type Listener = (event: CombatSSEEvent) => void;

class CombatEventBus {
  private listeners = new Map<string, Set<Listener>>();

  /** Subscribe to events for a specific encounter. Returns an unsubscribe function. */
  subscribe(encounterId: string, listener: Listener): () => void {
    if (!this.listeners.has(encounterId)) {
      this.listeners.set(encounterId, new Set());
    }
    this.listeners.get(encounterId)!.add(listener);

    return () => {
      const set = this.listeners.get(encounterId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(encounterId);
      }
    };
  }

  /** Emit an event to all listeners for a specific encounter. */
  emit(encounterId: string, event: CombatSSEEvent): void {
    const set = this.listeners.get(encounterId);
    if (set) {
      set.forEach(listener => listener(event));
    }
  }

  /** Check if any listeners exist for an encounter. */
  hasListeners(encounterId: string): boolean {
    const set = this.listeners.get(encounterId);
    return set != null && set.size > 0;
  }
}

/** Singleton event bus — shared across all API route handlers. */
export const combatEventBus = new CombatEventBus();
