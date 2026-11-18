// Fork-only (MasonLoomis/t3code): decides which settle sound a thread change earns. See FORK.md.
import { isListedThreadLineage, type OrchestrationV2ThreadShell } from "@t3tools/contracts";

export type SettleSoundKind = "manual" | "automatic";

type SettleShell = Pick<OrchestrationV2ThreadShell, "lineage" | "settledOverride" | "archivedAt">;

/** A manual settle from this client claims the thread's next settle transition for this long. */
export const MANUAL_SETTLE_CLAIM_MS = 30_000;

/**
 * Compares a live shell snapshot with the last one seen. Listed threads that move from not
 * settled to settled are returned, except ones this client just settled by hand (it already
 * played the manual sound). A null `previous` seeds the baseline without reporting anything,
 * so a first load or reconnect never plays a burst of sounds.
 */
export function newlySettledThreads<Id extends string>(input: {
  readonly previous: ReadonlyMap<Id, boolean> | null;
  readonly threads: ReadonlyArray<SettleShell & { readonly id: Id }>;
  readonly manualClaims: ReadonlyMap<Id, number>;
  readonly nowMs: number;
}): { readonly next: Map<Id, boolean>; readonly settled: ReadonlyArray<Id> } {
  const next = new Map<Id, boolean>();
  const settled: Array<Id> = [];
  for (const thread of input.threads) {
    if (!isListedThreadLineage(thread.lineage)) continue;
    const isSettled = thread.settledOverride === "settled" && thread.archivedAt === null;
    next.set(thread.id, isSettled);
    if (!isSettled || input.previous === null || input.previous.get(thread.id) !== false) continue;
    const claimedAt = input.manualClaims.get(thread.id);
    if (claimedAt !== undefined && input.nowMs - claimedAt < MANUAL_SETTLE_CLAIM_MS) continue;
    settled.push(thread.id);
  }
  return { next, settled };
}
