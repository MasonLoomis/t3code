// Fork-only (MasonLoomis/t3code): decides which settle/unsettle sound a thread change earns. See FORK.md.
import { isListedThreadLineage, type OrchestrationV2ThreadShell } from "@t3tools/contracts";

export type SettleSoundKind = "manual" | "automatic" | "unsettle";

type SettleShell = Pick<OrchestrationV2ThreadShell, "lineage" | "settledOverride" | "archivedAt">;

/** A manual settle from this client claims the thread's next settle transition, for at most this long. */
export const MANUAL_SETTLE_CLAIM_MS = 30_000;

/**
 * Listed threads that transitioned between settled and unsettled since `previous`. A thread this
 * client settled by hand is left out of `settled` and returned in `consumed`, so its claim covers
 * one transition. Archiving a settled thread does not count as unsettling it. A null `previous`
 * only seeds the baseline, so a first load or reconnect stays silent.
 */
export function newlySettledThreads<Id extends string>(input: {
  readonly previous: ReadonlyMap<Id, boolean> | null;
  readonly threads: ReadonlyArray<SettleShell & { readonly id: Id }>;
  readonly manualClaims: ReadonlyMap<Id, number>;
  readonly nowMs: number;
}): {
  readonly next: Map<Id, boolean>;
  readonly settled: ReadonlyArray<Id>;
  readonly unsettled: ReadonlyArray<Id>;
  readonly consumed: ReadonlyArray<Id>;
} {
  const next = new Map<Id, boolean>();
  const settled: Array<Id> = [];
  const unsettled: Array<Id> = [];
  const consumed: Array<Id> = [];
  for (const thread of input.threads) {
    if (!isListedThreadLineage(thread.lineage)) continue;
    const isSettled = thread.settledOverride === "settled" && thread.archivedAt === null;
    next.set(thread.id, isSettled);
    if (input.previous === null) continue;
    const wasSettled = input.previous.get(thread.id);
    if (isSettled && wasSettled === false) {
      const claimedAt = input.manualClaims.get(thread.id);
      if (claimedAt !== undefined && input.nowMs - claimedAt < MANUAL_SETTLE_CLAIM_MS) {
        consumed.push(thread.id);
        continue;
      }
      settled.push(thread.id);
    } else if (!isSettled && wasSettled === true && thread.archivedAt === null) {
      unsettled.push(thread.id);
    }
  }
  return { next, settled, unsettled, consumed };
}
