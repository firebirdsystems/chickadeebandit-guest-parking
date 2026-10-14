import { describe, it, expect } from "vitest";
import { failureLine } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);
const words = { action: "open the parking night", thing: "parking night" };

describe("failureLine", () => {
  it("names a duplicate by code, or by the hub's text while production lags", () => {
    expect(failureLine(err({ status: 400, code: "UNIQUE_CONSTRAINT" }), words)).toBe("That parking night already exists.");
    expect(failureLine(err({ status: 400 }, "UNIQUE constraint failed: x.id"), words)).toBe("That parking night already exists.");
  });
  it("names a refusal without asking for a retry", () => {
    expect(failureLine(err({ status: 403 }), words)).toBe("You don’t have permission to open the parking night.");
    expect(failureLine(err({ status: 507 }), words)).toBe("The household’s storage is full — free up space first.");
  });
  it("asks for a wait, not a retry now, when the hub is rate-limiting", () => {
    expect(failureLine(err({ status: 429 }), words)).toBe("Too many tries — wait a minute and try again.");
  });
  it("splits a write that changed nothing by the caller's re-read", () => {
    expect(failureLine(null, { ...words, found: false })).toBe("This parking night has been removed.");
    expect(failureLine(null, { ...words, found: true, guarded: true })).toBe("This parking night was changed by someone else — check it first.");
    expect(failureLine(err({ status: 409 }), { ...words, found: false })).toBe("This parking night has been removed.");
  });
  it("reads a row still there after a plain WHERE id = ? write as the row policy refusing it", () => {
    expect(failureLine(null, { ...words, found: true })).toBe("You don’t have permission to open the parking night.");
  });
  it("says neither removed nor changed when the re-read itself failed", () => {
    expect(failureLine(null, { ...words, found: null })).toBe("Couldn’t open the parking night — try again.");
  });
  it("reads a 404 as removed and a bare 409 as changed when there is no re-read", () => {
    expect(failureLine(err({ status: 404 }), words)).toBe("This parking night has been removed.");
    expect(failureLine(err({ status: 409 }), words)).toBe("This parking night was changed by someone else — check it first.");
  });
  it("asks for a retry only when retrying can work", () => {
    for (const e of [err({}), err({ status: 500 }), err({ status: 503 }), err({ status: 400 }), new TypeError("Failed to fetch"), undefined]) {
      expect(failureLine(e, words)).toBe("Couldn’t open the parking night — try again.");
    }
  });
  it("keeps a line the app wrote for the user, and never shows hub text", () => {
    expect(failureLine(err({ forUser: true, status: 409 }, "That night is fully booked."), words)).toBe("That night is fully booked.");
    expect(failureLine(err({ status: 500 }, "D1_ERROR: boom"), words)).not.toMatch(/D1_ERROR/);
  });
});
