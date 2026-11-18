-- Brojač ponovnih generacija po telefonu (18. 11. 2026). Samo za bazu napravljenu pre ove izmene.
-- Pokretanje: npm run db:migrate3:local (ili db:migrate3:remote). Drugo pokretanje javlja
-- "duplicate column name: device" – to znači da je kolona već tu, i to je u redu.
ALTER TABLE sessions ADD COLUMN device TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device);
