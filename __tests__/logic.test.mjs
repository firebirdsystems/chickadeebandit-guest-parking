import { describe, it, expect } from "vitest";
import {
  addDays, relativeDay, toISODate, daysInRange,
  claimedCount, remaining, myClaim, isClaimable, isBoard, nightInsertStatements,
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

// A range of nights is sent as ONE batch, so it lands whole or not at all. The
// hub takes at most 25 statements a batch and 100 bound values a statement.
describe("nightInsertStatements", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({
    id: `night-${i}`, date: addDays("2026-03-01", i), capacity: 2, note: "Season",
    created_by: "m1", created_at: "2026-02-01T00:00:00.000Z", updated_at: "2026-02-01T00:00:00.000Z",
  }));
  it("the largest range (120 nights) fits one batch", () => {
    const statements = nightInsertStatements(rows(120));
    expect(statements.length).toBeLessThanOrEqual(25);
    for (const s of statements) {
      expect(s.params.length).toBeLessThanOrEqual(100);
      expect(s.sql.split("?").length - 1).toBe(s.params.length);
      expect(s.sql).toMatch(/^INSERT INTO app_guest_parking__nights \(id, date, capacity, status, note, created_by, created_at, updated_at\)/);
    }
    const ids = statements.flatMap((s) => s.params.filter((p) => typeof p === "string" && p.startsWith("night-")));
    expect(ids).toEqual(rows(120).map((r) => r.id));
  });
  it("binds each night's own values, in column order", () => {
    const [only, ...rest] = nightInsertStatements(rows(2));
    expect(rest).toEqual([]);
    expect(only.params).toEqual([
      "night-0", "2026-03-01", 2, "Season", "m1", "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
      "night-1", "2026-03-02", 2, "Season", "m1", "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
    ]);
  });
  it("no nights is no statements", () => {
    expect(nightInsertStatements([])).toEqual([]);
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
