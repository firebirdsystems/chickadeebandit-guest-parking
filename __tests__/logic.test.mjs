import { describe, it, expect } from "vitest";
import {
  addDays, relativeDay, toISODate, daysInRange,
  claimedCount, remaining, myClaim, isClaimable, isBoard,
} from "../src/logic.js";
import { testPrivilegedGateContract } from "./helpers/privileged-gate.mjs";

const NIGHT = (id, capacity, status = "open") => ({ id, capacity, status });
const CLAIM = (id, night_id, member_id) => ({ id, night_id, member_id });

describe("date helpers", () => {
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("daysInRange is inclusive and capped", () => {
    expect(daysInRange("2026-03-01", "2026-03-03")).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(daysInRange("2026-01-01", "2027-01-01", 5)).toHaveLength(5);
  });
  it("relativeDay labels tonight/tomorrow", () => {
    const today = toISODate(new Date());
    expect(relativeDay(today, today)).toBe("Tonight");
    expect(relativeDay(addDays(today, 1), today)).toBe("Tomorrow");
  });
});

describe("claim math", () => {
  const claims = [CLAIM("c1", "n1", "m1"), CLAIM("c2", "n1", "m2"), CLAIM("c3", "n2", "m1")];
  it("counts claims per night", () => {
    expect(claimedCount(claims, "n1")).toBe(2);
    expect(claimedCount(claims, "n2")).toBe(1);
    expect(claimedCount(claims, "n3")).toBe(0);
  });
  it("remaining never goes negative", () => {
    expect(remaining(NIGHT("n1", 3), claims)).toBe(1);
    expect(remaining(NIGHT("n1", 2), claims)).toBe(0);
    expect(remaining(NIGHT("n1", 1), claims)).toBe(0);
  });
  it("myClaim finds the caller's claim only", () => {
    expect(myClaim(claims, "n1", "m1")?.id).toBe("c1");
    expect(myClaim(claims, "n1", "m9")).toBeNull();
  });
  it("isClaimable requires open status and an open spot", () => {
    expect(isClaimable(NIGHT("n1", 3), claims)).toBe(true);
    expect(isClaimable(NIGHT("n1", 2), claims)).toBe(false); // full
    expect(isClaimable(NIGHT("n1", 3, "closed"), claims)).toBe(false); // closed
  });
});

// The board gate fronts a write_privileged_only table — it must mirror the hub's
// group resolution with NO adult fallback when unconfigured.
testPrivilegedGateContract("isBoard", isBoard, {
  member:   { id: "m-in",  role: "adult" },
  outsider: { id: "m-out", role: "adult" },
  groups:   [{ id: "g-board", name: "Board", memberIds: ["m-in"] }],
  groupId:  "g-board",
});
