-- User-approved retirement of uploaded documents. Commercial documents remain intact.
-- Stop if uploads appeared since the audit; never discard stored file references silently.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM files) THEN
  RAISE EXCEPTION 'Documents téléversés présents : archivage et traitement explicites requis';
 END IF;
END $$;
DROP TABLE files;
