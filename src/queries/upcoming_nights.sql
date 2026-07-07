SELECT
  n.id,
  n.date,
  n.capacity,
  n.status,
  n.note,
  COUNT(c.id) AS claimed_count
FROM app_guest_parking__nights n
LEFT JOIN app_guest_parking__claims c
  ON c.night_id = n.id
WHERE n.date >= date('now')
GROUP BY n.id, n.date, n.capacity, n.status, n.note
ORDER BY n.date ASC
LIMIT 200
