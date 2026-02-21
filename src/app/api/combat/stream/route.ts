/**
 * GET /api/combat/stream
 *
 * Server-Sent Events endpoint for real-time combat turn streaming.
 * Client opens this connection when combat begins and receives turn events
 * as they resolve. Connection stays open for the entire encounter.
 *
 * Query params:
 *   encounterId — the active encounter's Firestore ID
 *
 * Event types pushed:
 *   round_start, player_turn, npc_turn, round_end,
 *   state_update, player_dead, combat_end, error
 */

import { NextRequest } from "next/server";
import { combatEventBus } from "../../../lib/combatEventBus";
import type { CombatSSEEvent } from "../../../lib/gameTypes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encounterId = req.nextUrl.searchParams.get("encounterId");

  if (!encounterId) {
    return new Response("encounterId query param required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[SSE] Client connected for encounter ${encounterId}`);

      const unsubscribe = combatEventBus.subscribe(encounterId, (event: CombatSSEEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Close the stream on terminal events
          if (event.type === "combat_end" || event.type === "player_dead") {
            setTimeout(() => {
              try { controller.close(); } catch { /* already closed */ }
            }, 100);
          }
        } catch {
          // Stream was closed by client
          console.log(`[SSE] Failed to write event for encounter ${encounterId} — client disconnected`);
        }
      });

      // Send initial keepalive comment so the client knows the connection is live
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Clean up on abort (client disconnects)
      req.signal.addEventListener("abort", () => {
        console.log(`[SSE] Client disconnected from encounter ${encounterId}`);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
