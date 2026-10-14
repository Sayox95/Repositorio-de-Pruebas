-- Jefe inmediato por sector: una sola fuente de verdad.
-- Ejecutar UNA vez en la base D1 "facturas-utcd" ANTES de desplegar el cambio.
CREATE TABLE IF NOT EXISTS sectores (
  Sector TEXT PRIMARY KEY COLLATE NOCASE,
  Jefe   TEXT
);

INSERT OR REPLACE INTO sectores (Sector, Jefe) VALUES
  ('CHOLUTECA',      'JUAN RAMON RIVERA DURON'),
  ('COMAYAGUA',      'GERSON OMAR VARGAS GODOY'),
  ('DANLI',          'BRYAN EFRAIN AMADOR RAMIREZ'),
  ('EL PROGRESO',    'MAYRON ANTONIO BENNETT SUAZO'),
  ('JUTICALPA',      'ALLAN EDUARDO ZELAYA ESCOBAR'),
  ('LA CEIBA',       'MAYNOR JOSUE RAMIREZ MEDINA'),
  ('SAN PEDRO SULA', 'ALEX FERNANDO SANTOS ESCOBAR'),
  ('SANTA BARBARA',  'EMANUEL DAVID ZEPEDA SOTO'),
  ('SANTA ROSA',     'FERNANDO JOSUE VASQUEZ VASQUEZ'),
  ('TEGUCIGALPA',    'BRYAN EFRAIN AMADOR RAMIREZ'),
  ('STA. CRUZ',      'MAYRON ANTONIO BENNETT SUAZO'),
  ('CORPORATIVO',    NULL);

-- Alinear la columna Jefe de cada vehículo con el jefe de su sector
UPDATE vehiculos
SET Jefe = (SELECT s.Jefe FROM sectores s WHERE s.Sector = TRIM(vehiculos.Sector));
