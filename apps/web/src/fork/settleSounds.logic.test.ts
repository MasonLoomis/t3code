import { describe, expect, it } from "vite-plus/test";

import { MANUAL_SETTLE_CLAIM_MS, newlySettledThreads } from "./settleSounds.logic";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

type Lineage = OrchestrationV2ThreadShell["lineage"];
const shell = (
  id: string,
  settled: boolean,
  lineage: Partial<Record<keyof Lineage, unknown>> = {},
) => ({
  id,
  lineage: {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: id,
    ...lineage,
  } as unknown as Lineage,
  settledOverride: settled ? ("settled" as const) : null,
  archivedAt: null,
});

describe("newlySettledThreads", () => {
  const noClaims = new Map<string, number>();

  it("seeds without reporting, then reports only not-settled to settled moves", () => {
    const first = newlySettledThreads({
      previous: null,
      threads: [shell("a", false), shell("b", true)],
      manualClaims: noClaims,
      nowMs: 0,
    });
    expect(first.settled).toEqual([]);

    const second = newlySettledThreads({
      previous: first.next,
      threads: [shell("a", true), shell("b", true), shell("c", true)],
      manualClaims: noClaims,
      nowMs: 1,
    });
    expect(second.settled).toEqual(["a"]);
  });

  it("skips subagents, side chats, and threads this client just settled by hand", () => {
    const previous = new Map([
      ["sub", false],
      ["side", false],
      ["mine", false],
      ["old-claim", false],
    ]);
    const result = newlySettledThreads({
      previous,
      threads: [
        shell("sub", true, { parentThreadId: "p", relationshipToParent: "subagent" }),
        shell("side", true, { parentThreadId: "p", sideChat: true }),
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
    // The claim covers one transition, so the caller drops it and a later settle sounds.
    expect(result.consumed).toEqual(["mine"]);
  });
});
