-- Explicitly approved removal of client documents and associated travelers.
-- Full archive is created and verified by db-migrate before this migration.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM files WHERE dossier_id IS NULL) THEN RAISE EXCEPTION 'Documents clients existants : rattachement manuel requis avant suppression du lien'; END IF;
 IF EXISTS(SELECT 1 FROM dossier_travelers) THEN RAISE EXCEPTION 'Voyageurs déjà utilisés dans des dossiers : migration particulière requise'; END IF;
END $$;
ALTER TABLE files DROP COLUMN client_id;
ALTER TABLE files ALTER COLUMN dossier_id SET NOT NULL;
ALTER TABLE files ADD CONSTRAINT files_dossier_id_fk FOREIGN KEY(dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT;
DROP TABLE dossier_travelers;
DROP TABLE travelers;

