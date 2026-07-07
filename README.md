# Guest Parking Passes

First-come guest parking for HOAs and residential associations. The board sets how
many guest passes are available each night; residents claim an open pass, and can
release it or let it roll over by re-claiming another night.

## How it works

- **Nights** — each bookable night has a board-set capacity (number of guest passes)
  and an open/closed status. Only members of the configured **Board** group can open
  nights or change capacity (`nights` uses an `owner_or_visibility` policy with
  `write_privileged_only`); every resident can see them.
- **Claims** — residents claim a pass via the hub's atomic `slot_claims` endpoints
  (`claim` / `release` / `swap`). Capacity is enforced server-side in a single
  conditional insert, so the lot can never be overbooked even under a race, and each
  resident may hold at most one pass per night. The `claims` table is `endpoint_only`,
  so raw SQL cannot bypass the capacity guard.
- **Settings** — a hub admin picks the Board group and a default per-night capacity in
  Settings (written through the admin-only `app_config` endpoint).

This complements the **Vehicle & Parking Registry** (a registry of resident vehicles),
which is a directory, not a capacity-limited claim system.

## Data & security model

| Table | Policy | Who can read / write |
|-------|--------|----------------------|
| `nights` | `owner_or_visibility` + `write_privileged_only` | Everyone reads; only the Board group writes capacity/status |
| `claims` | `endpoint_only` (`read: everyone`) | Written only by the hub `slot_claims` endpoints |
| `settings` | `app_config` | Read-all; written only by the admin `/api/admin-config` endpoint |

Guest name and vehicle on a claim are intentionally visible to residents and the board
(like a physical gate register) and are stored plaintext so the claim endpoint can carry
them.

## Development

```bash
npm install
npm run dev     # serve locally with demo data
npm test        # unit tests + manifest validation
node build.mjs  # produce dist/bundle.json
```
