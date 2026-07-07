// Mirrors hub-sdk.js functions used by logic.js so they can be unit-tested
// without a browser environment. Keep in sync with /hub-sdk.js.

export function isAdult(member) {
  return !!member && (member.role === "adult" || member.role === "admin");
}

export function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
