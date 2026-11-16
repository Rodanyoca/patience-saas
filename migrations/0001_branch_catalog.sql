CREATE TABLE branches (
 id text PRIMARY KEY, code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9-]{1,39}$'),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160), description text,
 active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
INSERT INTO branches(id,code,name) VALUES ('branch-travel','TRAVEL','LA PATIENCE TRAVEL'),('branch-construction','CONSTRUCTION','LA PATIENCE CONSTRUCTION') ON CONFLICT(code) DO NOTHING;
CREATE TABLE branch_memberships (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 PRIMARY KEY(user_id,branch_id)
);
INSERT INTO branch_memberships SELECT id,'branch-travel' FROM "user" ON CONFLICT DO NOTHING;
CREATE TABLE prestation_types (
 id text PRIMARY KEY, branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z][A-Z0-9-]{1,39}$'),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160), description text,
 form_type text NOT NULL DEFAULT 'generic' CHECK(form_type IN ('generic','visa','flight','hotel','insurance')),
 legacy_type text UNIQUE CHECK(legacy_type IN ('visa','billet','hotel','assurance')),
 active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0 CHECK(display_order>=0),
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
 UNIQUE(id,branch_id)
);
CREATE INDEX prestation_types_branch_active_order_idx ON prestation_types(branch_id,active,display_order,name);
INSERT INTO prestation_types(id,branch_id,code,name,form_type,legacy_type,display_order) VALUES
 ('pt-trv-bil','branch-travel','TRV-BIL','Billetterie aérienne','flight','billet',10),
 ('pt-trv-vis','branch-travel','TRV-VIS','Assistance visa','visa','visa',20),
 ('pt-trv-hot','branch-travel','TRV-HOT','Réservation d''hôtel','hotel','hotel',30),
 ('pt-trv-ass','branch-travel','TRV-ASS','Assurance voyage','insurance','assurance',40)
 ON CONFLICT(code) DO NOTHING;
ALTER TABLE dossiers ADD COLUMN branch_id text REFERENCES branches(id) ON DELETE RESTRICT;
UPDATE dossiers SET branch_id='branch-travel' WHERE branch_id IS NULL;
ALTER TABLE dossiers ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE dossiers ADD CONSTRAINT dossiers_id_branch_unique UNIQUE(id,branch_id);
CREATE INDEX dossiers_branch_idx ON dossiers(branch_id);
ALTER TABLE services ADD COLUMN branch_id text;
ALTER TABLE services ADD COLUMN prestation_type_id text;
UPDATE services s SET branch_id=d.branch_id FROM dossiers d WHERE s.dossier_id=d.id;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM services WHERE branch_id IS NULL) THEN RAISE EXCEPTION 'Prestations orphelines : migration interrompue'; END IF; END $$;
UPDATE services s SET prestation_type_id=p.id FROM prestation_types p WHERE s.type=p.legacy_type AND s.branch_id=p.branch_id;
ALTER TABLE services ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE services ADD CONSTRAINT services_dossier_branch_fk FOREIGN KEY(dossier_id,branch_id) REFERENCES dossiers(id,branch_id) ON DELETE RESTRICT;
ALTER TABLE services ADD CONSTRAINT services_catalog_branch_fk FOREIGN KEY(prestation_type_id,branch_id) REFERENCES prestation_types(id,branch_id) ON DELETE RESTRICT;
CREATE INDEX services_catalog_idx ON services(prestation_type_id);
CREATE INDEX services_branch_catalog_status_idx ON services(branch_id,prestation_type_id,status);
CREATE FUNCTION protect_used_prestation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Désactivez la prestation au lieu de la supprimer'; END IF;
 IF OLD.legacy_type IS DISTINCT FROM NEW.legacy_type THEN RAISE EXCEPTION 'Correspondance historique immuable'; END IF;
 IF (OLD.code,OLD.branch_id,OLD.form_type) IS DISTINCT FROM (NEW.code,NEW.branch_id,NEW.form_type)
 AND EXISTS(SELECT 1 FROM services WHERE prestation_type_id=OLD.id) THEN RAISE EXCEPTION 'Code, branche et modèle protégés après utilisation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_used_prestation BEFORE UPDATE OR DELETE ON prestation_types FOR EACH ROW EXECUTE FUNCTION protect_used_prestation();
CREATE FUNCTION grant_initial_travel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO branch_memberships VALUES(NEW.id,'branch-travel') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER grant_initial_travel AFTER INSERT ON "user" FOR EACH ROW EXECUTE FUNCTION grant_initial_travel();

CREATE FUNCTION check_new_service_catalogue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p prestation_types; b branches;
BEGIN
 IF TG_OP='INSERT' AND NEW.prestation_type_id IS NULL THEN RAISE EXCEPTION 'Référentiel obligatoire pour une nouvelle prestation'; END IF;
 IF TG_OP='INSERT' OR NEW.prestation_type_id IS DISTINCT FROM OLD.prestation_type_id THEN
  SELECT * INTO p FROM prestation_types WHERE id=NEW.prestation_type_id FOR SHARE;
  IF NOT FOUND OR NOT p.active THEN RAISE EXCEPTION 'Prestation inactive ou inconnue'; END IF;
  SELECT * INTO b FROM branches WHERE id=p.branch_id FOR SHARE;
  IF NOT b.active THEN RAISE EXCEPTION 'Branche inactive'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_new_service_catalogue BEFORE INSERT OR UPDATE ON services FOR EACH ROW EXECUTE FUNCTION check_new_service_catalogue();
