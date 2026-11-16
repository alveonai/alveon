-- Samo za bazu napravljenu PRE dodavanja scena (17. 11. 2026). Nova baza (schema.sql) već ima kolonu.
-- Pokretanje: npm run db:migrate:local (ili db:migrate:remote). Drugo pokretanje javlja grešku
-- "duplicate column name: scene" – to znači da je kolona već tu, i to je u redu.
ALTER TABLE sessions ADD COLUMN scene TEXT;
