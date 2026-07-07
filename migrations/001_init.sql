-- One row per bookable night. The board sets `capacity` (number of guest
-- passes available that night) and opens/closes the night. Written only by the
-- board group (owner_or_visibility + write_privileged_only); everyone reads.
-- `capacity` and `status` are plaintext so slot_claims can evaluate them.
CREATE TABLE IF NOT EXISTS app_guest_parking__nights (
  id          TEXT NOT NULL,
  date        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 2 CHECK (capacity >= 0),
  status      TEXT NOT NULL DEFAULT 'open',
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_guest_parking__nights_date_idx
  ON app_guest_parking__nights (date);

-- One row per claimed pass. Written ONLY by the hub slot_claims endpoints
-- (claim/release/swap), which atomically enforce capacity — never by app SQL.
CREATE TABLE IF NOT EXISTS app_guest_parking__claims (
  id          TEXT NOT NULL,
  night_id    TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  guest_name  TEXT NOT NULL DEFAULT '',
  vehicle     TEXT NOT NULL DEFAULT '',
  claimed_at  TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (night_id) REFERENCES app_guest_parking__nights(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS app_guest_parking__claims_night_idx
  ON app_guest_parking__claims (night_id);
CREATE INDEX IF NOT EXISTS app_guest_parking__claims_member_idx
  ON app_guest_parking__claims (member_id, night_id);

-- key/value settings: board_group_id (privileged group) and default_capacity.
-- Written only by the admin-gated /api/admin-config endpoint (app_config policy).
CREATE TABLE IF NOT EXISTS app_guest_parking__settings (
  key    TEXT NOT NULL,
  value  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (key)
);
