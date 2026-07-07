SELECT
  c.id,
  c.night_id,
  n.date,
  c.member_id,
  c.guest_name,
  c.vehicle,
  c.claimed_at
FROM app_guest_parking__claims c
JOIN app_guest_parking__nights n
  ON n.id = c.night_id
WHERE n.date >= date('now')
ORDER BY n.date ASC, c.claimed_at ASC
LIMIT 200
