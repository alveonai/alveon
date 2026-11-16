-- GTA booth schema. Bezbedno za ponovno pokretanje.

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,           -- tajni ID gosta (u njegovom linku)
  code          TEXT NOT NULL,              -- kratak kod za prepoznavanje na štandu
  status        TEXT NOT NULL,              -- created|pending|approved|generating|done|failed|rejected|expired|limit|deleted
  created_at    INTEGER NOT NULL,           -- ms
  updated_at    INTEGER NOT NULL,
  consent_at    INTEGER NOT NULL,           -- kada je dat pristanak
  consent_social INTEGER NOT NULL DEFAULT 0,-- pristanak za objavu na mrežama
  age_confirmed INTEGER NOT NULL DEFAULT 0, -- potvrđeno 18+
  submitted_at  INTEGER,                    -- kada je slika poslata na odobrenje
  photo_key     TEXT,
  photo_aspect  TEXT,                       -- format fotografije (npr. "3:4"), ako scena nema svoj format
  scene         TEXT,                       -- izabrana scena (src/scenes.js, npr. "05"); NULL = podrazumevani prompt
  result_key    TEXT,
  result_mime   TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 2,
  started_at    INTEGER,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

CREATE TABLE IF NOT EXISTS usage (
  day   TEXT PRIMARY KEY,                   -- YYYY-MM-DD (Beograd)
  n     INTEGER NOT NULL DEFAULT 0          -- broj pokrenutih generacija
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  minute INTEGER PRIMARY KEY,
  n      INTEGER NOT NULL DEFAULT 0
);
