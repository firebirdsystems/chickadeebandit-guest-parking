CREATE INDEX IF NOT EXISTS app_guest_parking__nights_retention_idx
  ON app_guest_parking__nights (created_at, id);
