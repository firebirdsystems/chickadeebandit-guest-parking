import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "../src");

// The hub answers a failed database request three ways: a 5xx status, a 200
// carrying `{ error }`, and (a proxy, a crash) a 200 whose body is not JSON
// at all. A helper that hands any of those back as data makes the
// page draw "nothing here" for "could not read", or show a write as done.
// So every function in the page that posts to the database URL is run here
// against all three, and must reject each.
//
// A helper is exercised only when it first answers a well-formed response on
// its own — one that leans on page state this harness does not have is left
// to the browser lanes (the fault smoke), and named in the test title so its
// absence here is visible rather than silent.

const DB_NAMES = ["DB", "DB_URL", "DB_ENDPOINT"];
const CALLS_DB = /\bfetch\(\s*(?:DB|DB_URL|DB_ENDPOINT|window\.__DB_URL)\b/;

/** `async function name(…) { … }` blocks whose body posts to the database URL. */
function dbHelpers(source) {
  const found = [];
  const re = /async function (\w+)\s*\(/g;
  for (let m; (m = re.exec(source)); ) {
    const open = source.indexOf("{", source.indexOf(")", m.index));
    let depth = 0, end = -1, quote = null;
    for (let i = open; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "/" && source[i + 1] === "/") { i = source.indexOf("\n", i); if (i < 0) break; continue; }
      if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i) + 1; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i + 1; break; }
    }
    if (end < 0) continue;
    const text = source.slice(m.index, end);
    // Only the helper itself: a function that merely CALLS a helper has no
    // fetch of its own, and one that nests another function is too much page.
    if (CALLS_DB.test(text) && !/\n\s*(async )?function \w+\s*\(/.test(text.slice(15))) found.push({ name: m[1], text });
  }
  return found;
}

const response = {
  ok: () => new Response(JSON.stringify({ rows: [], results: [], changed: 0 }), { status: 200, headers: { "Content-Type": "application/json" } }),
  down: () => new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }),
  errorIn200: () => new Response(JSON.stringify({ error: "Query failed" }), { status: 200, headers: { "Content-Type": "application/json" } }),
  notJson: () => new Response("<!doctype html><title>Gateway</title>", { status: 200, headers: { "Content-Type": "text/html" } }),
};

async function call(helper, kind) {
  const sandbox = {
    fetch: async () => response[kind](),
    window: { __DB_URL: "/api/db" },
    console: { error() {}, warn() {}, log() {} },
    Response, JSON, Error, Promise, Array, Object, String, Number, Boolean,
  };
  for (const name of DB_NAMES) sandbox[name] = "/api/db";
  vm.createContext(sandbox);
  vm.runInContext(`${helper.text}\nglobalThis.__helper = ${helper.name};`, sandbox);
  return sandbox.__helper("SELECT 1", []);
}

// The slot helper posts to the claim and release URLs, not the database URL,
// so the sweep below does not reach it. It must meet the same three answers
// with its own error — a refusal it has no wording for is "<label> failed.".
describe("slotCall() rejects every answer that is not a result", () => {
  const html = readFileSync(join(srcDir, "index.html"), "utf-8");
  const start = html.indexOf("async function slotCall(");
  if (start < 0) throw new Error("slotCall() is no longer in src/index.html");
  const text = html.slice(start, html.indexOf("\n}\n", start) + 2);
  const slotCall = (make) => {
    const sandbox = { fetch: async () => make(), Response, JSON, Error, Object };
    vm.createContext(sandbox);
    vm.runInContext(`${text}\nglobalThis.__helper = slotCall;`, sandbox);
    return sandbox.__helper("/api/slots/claim", { slot_id: "n1" }, "Claim");
  };
  const refusal = (reason) => () => new Response(JSON.stringify({ error: "Refused", reason }), { status: 409, headers: { "Content-Type": "application/json" } });

  it("hands back a well-formed answer", async () => {
    await expect(slotCall(() => new Response(JSON.stringify({ success: true, claim_id: "c1" }), { status: 201 }))).resolves.toMatchObject({ claim_id: "c1" });
  });
  // The hub answers a claim or release that happened with `success: true`. A
  // 200 that does not say so is not a pass claimed.
  it("a 200 that does not say it succeeded is the helper's own failure", async () => {
    const err = await slotCall(() => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })).then(() => null, (e) => e);
    expect(err?.message).toBe("Claim failed.");
    expect(err.forUser).toBe(false);
  });
  it("a body that is not JSON is the helper's own failure, at any status", async () => {
    for (const status of [200, 502]) {
      const err = await slotCall(() => new Response("<!doctype html><title>Gateway</title>", { status, headers: { "Content-Type": "text/html" } })).then(() => null, (e) => e);
      expect(err?.name, `status ${status}`).toBe("Error");
      expect(err.message).toBe("Claim failed.");
      expect(err.forUser).toBe(false);
    }
  });
  it("an outage and an error body reject with the hub's text, not for the reader", async () => {
    for (const kind of ["down", "errorIn200"]) {
      const err = await slotCall(response[kind]).then(() => null, (e) => e);
      expect(err?.message, kind).toBe(kind === "down" ? "Service unavailable" : "Query failed");
      expect(err.forUser).toBe(false);
    }
  });
  it("the three named refusals keep this app's wording", async () => {
    const worded = { slot_full: "That night is fully booked.", already_claimed: "You already hold a pass for that night.", slot_closed: "That night is no longer open for passes." };
    for (const [reason, message] of Object.entries(worded)) {
      const err = await slotCall(refusal(reason)).then(() => null, (e) => e);
      expect(err).toMatchObject({ message, reason, forUser: true });
    }
  });
  it("any other refusal carries its status for the page to word", async () => {
    for (const status of [403, 404, 429]) {
      const err = await slotCall(() => new Response(JSON.stringify({ error: "Refused" }), { status, headers: { "Content-Type": "application/json" } })).then(() => null, (e) => e);
      expect(err).toMatchObject({ status, forUser: false });
    }
  });
});

const sources = readdirSync(srcDir)
  .filter((f) => /\.(html|js)$/.test(f))
  .map((f) => ({ file: f, helpers: dbHelpers(readFileSync(join(srcDir, f), "utf-8")) }))
  .filter((s) => s.helpers.length);

describe("database request helpers reject every answer that is not a result", () => {
  if (!sources.length) {
    it("has no self-contained database helper to exercise here", () => {});
    return;
  }
  for (const { file, helpers } of sources) {
    for (const helper of helpers) {
      it(`${file} ${helper.name}()`, async () => {
        const standsAlone = await call(helper, "ok").then(() => true, () => false);
        if (!standsAlone) return; // needs page state; covered by the fault smoke
        // A 403 is not in the list: a page may read a refusal as "not for this
        // viewer" on purpose. An outage, an error body and a non-JSON body
        // have no such reading.
        for (const kind of ["down", "errorIn200", "notJson"]) {
          await expect(call(helper, kind), `${helper.name}() resolved for a "${kind}" answer`).rejects.toBeTruthy();
        }
      });
    }
  }
});
