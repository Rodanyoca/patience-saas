-- Reference defaults for a new installation. Never overwrite existing business settings.
INSERT INTO agency_settings(id,name) VALUES(1,'LA PATIENCE') ON CONFLICT(id) DO NOTHING;
INSERT INTO currencies(code,name,symbol,rate,active) VALUES('USD','Dollar américain','$',1,true) ON CONFLICT(code) DO NOTHING;
