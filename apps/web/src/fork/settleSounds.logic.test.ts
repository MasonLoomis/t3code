import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { MANUAL_SETTLE_CLAIM_MS, newlySettledThreads } from "./settleSounds.logic";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

type Lineage = OrchestrationV2ThreadShell["lineage"];
const shell = (
  id: string,
  settled: boolean,
  lineage: Partial<Record<keyof Lineage, unknown>> = {},
  archivedAt: OrchestrationV2ThreadShell["archivedAt"] = null,
) => ({
  id,
  lineage: {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: id,
    ...lineage,
  } as unknown as Lineage,
  settledOverride: settled ? ("settled" as const) : null,
  archivedAt,
});

describe("newlySettledThreads", () => {
  const noClaims = new Map<string, number>();

  it("seeds without reporting, then reports settle and unsettle moves", () => {
    const first = newlySettledThreads({
      previous: null,
      threads: [shell("a", false), shell("b", true), shell("archived", true)],
      manualClaims: noClaims,
      nowMs: 0,
    });
    expect(first.settled).toEqual([]);
    expect(first.unsettled).toEqual([]);

    const second = newlySettledThreads({
      previous: first.next,
      threads: [
        shell("a", true),
        shell("b", false),
        shell("archived", true, {}, DateTime.makeUnsafe("2026-11-20T00:00:00.000Z")),
        shell("c", true),
        shell("d", false),
      ],
      manualClaims: noClaims,
      nowMs: 1,
    });
    expect(second.settled).toEqual(["a"]);
    // Archiving a settled thread or adding a new unsettled thread does not count as unsettling.
    expect(second.unsettled).toEqual(["b"]);
  });

  it("skips subagents, side chats, and threads this client just settled by hand", () => {
    const previous = new Map([
      ["sub", false],
      ["side", false],
      ["sub-unsettle", true],
      ["mine", false],
      ["old-claim", false],
    ]);
    const result = newlySettledThreads({
      previous,
      threads: [
        shell("sub", true, { parentThreadId: "p", relationshipToParent: "subagent" }),
        shell("side", true, { parentThreadId: "p", sideChat: true }),
        shell("sub-unsettle", false, { parentThreadId: "p", relationshipToParent: "subagent" }),
        shell("mine", true),
        shell("old-claim", true),
      ],
      manualClaims: new Map([
        ["mine", 1_000],
        ["old-claim", 0],
      ]),
      nowMs: MANUAL_SETTLE_CLAIM_MS + 1,
    });
    expect(result.settled).toEqual(["old-claim"]);
    expect(result.unsettled).toEqual([]);
    // The claim covers one transition, so the caller drops it and a later settle sounds.
    expect(result.consumed).toEqual(["mine"]);
  });
});
