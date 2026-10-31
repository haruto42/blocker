CREATE TABLE IF NOT EXISTS device_memo (
  id          TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  ip          TEXT,
  client_ip   TEXT,
  country     TEXT,
  user_agent  TEXT,
  model       TEXT,
  platform    TEXT,
  note        TEXT,
  raw         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_memo_ip ON device_memo (ip);
