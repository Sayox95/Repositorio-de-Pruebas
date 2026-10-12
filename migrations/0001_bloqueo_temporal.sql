-- Bloqueo temporal de login (vence solo a los 15 min).
-- Ejecutar UNA vez en la base D1 "facturas-utcd" ANTES de desplegar el cambio.
ALTER TABLE usuarios ADD COLUMN bloqueado_hasta INTEGER;
