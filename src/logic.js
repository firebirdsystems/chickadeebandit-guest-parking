import { isAdult } from "./shared.js";
export { isAdult };

// ── Date helpers (all dates are "YYYY-MM-DD" local strings) ───────────────────

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// Inclusive list of ISO date strings from start to end (capped for safety).
export function daysInRange(startIso, endIso, cap = 120) {
  const days = [];
  let cur = startIso;
  while (cur <= endIso && days.length < cap) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayLabel(iso) {
  return WEEKDAY_LABELS[fromISODate(iso).getDay()];
}

export function monthDayLabel(iso) {
  const d = fromISODate(iso);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

export function relativeDay(iso, todayIso) {
  if (iso === todayIso) return "Tonight";
  if (iso === addDays(todayIso, 1)) return "Tomorrow";
  return `${weekdayLabel(iso)}, ${monthDayLabel(iso)}`;
}

// ── Claim math ────────────────────────────────────────────────────────────────

// Claims are rows { id, night_id, member_id, guest_name, vehicle }.

export function claimsForNight(claims, nightId) {
  return claims.filter((c) => c.night_id === nightId);
}

export function claimedCount(claims, nightId) {
  return claimsForNight(claims, nightId).length;
}

export function remaining(night, claims) {
  return Math.max(0, Number(night.capacity ?? 0) - claimedCount(claims, night.id));
}

export function myClaim(claims, nightId, memberId) {
  return claims.find((c) => c.night_id === nightId && c.member_id === memberId) ?? null;
}

// A night is claimable by a resident when it is open and has an open spot.
export function isClaimable(night, claims) {
  return night.status === "open" && remaining(night, claims) > 0;
}

// ── Opening a range of nights ─────────────────────────────────────────────────

// The INSERTs for one batch request, so a range lands whole or not at all. The
// hub binds at most 100 values a statement: 14 nights of 7 values each. The 120
// nights a range can hold are then 9 statements, inside the 25 a batch takes.
export function nightInsertStatements(rows, perStatement = 14) {
  const statements = [];
  for (let i = 0; i < rows.length; i += perStatement) {
    const chunk = rows.slice(i, i + perStatement);
    statements.push({
      sql: `INSERT INTO app_guest_parking__nights (id, date, capacity, status, note, created_by, created_at, updated_at) VALUES ${chunk.map(() => "(?, ?, ?, 'open', ?, ?, ?, ?)").join(", ")}`,
      params: chunk.flatMap((n) => [n.id, n.date, n.capacity, n.note, n.created_by, n.created_at, n.updated_at]),
    });
  }
  return statements;
}

// ── Access control ────────────────────────────────────────────────────────────

// Board members configure capacity and open/close nights. This mirrors the hub's
// `memberInAppGroupSetting`: privileged IFF a board group is configured, still
// exists, and the caller is in it. There is NO "all adults" fallback — the
// `nights` table is write_privileged_only, which the hub rejects entirely when no
// group is set. (See __tests__/helpers/privileged-gate.mjs.)
export function isBoard(member, groups, boardGroupId) {
  if (!member || !boardGroupId) return false;
  const g = (groups ?? []).find((x) => x.id === boardGroupId);
  return !!g && g.memberIds.includes(member.id);
}
