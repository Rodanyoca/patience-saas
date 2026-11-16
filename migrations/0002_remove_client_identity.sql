-- Explicitly requested removal of client-only fields.
-- db-migrate creates and validates a full backup before applying this file.
-- Traveler fields and passport fields are deliberately preserved.
-- No CASCADE: unexpected SQL dependencies must block the migration.
ALTER TABLE clients DROP COLUMN nationality;
ALTER TABLE clients DROP COLUMN birth_date;
