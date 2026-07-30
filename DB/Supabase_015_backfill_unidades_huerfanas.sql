-- =========================================================
-- Backfill: hay tipos de herramienta (articulo.es_herramienta = true)
-- que se crearon en algun momento (probablemente una carga masiva)
-- pero nunca llegaron a tener su fila en herramienta_unidad, asi que
-- no aparecen en el listado del modulo (que se arma desde
-- herramienta_unidad, no desde articulo).
--
-- Este script les crea la unidad faltante: codigo = codigo del
-- articulo (mismo criterio que "Nueva herramienta"), cantidad_total
-- = 1 por defecto (ajustable despues con "Editar" en el modulo) y
-- ubicacion = AREA DE HERRAMIENTAS.
-- =========================================================

INSERT INTO herramienta_unidad (id_articulo, codigo_herramienta, estado, id_ubicacion_actual, cantidad_total)
SELECT
  a.id_articulo,
  a.codigo_articulo::text,
  'DISPONIBLE',
  (SELECT u.id_ubicacion FROM ubicacion u WHERE u.codigo_ubicacion = 'HERRAMIENTAS' LIMIT 1),
  1
FROM articulo a
WHERE a.es_herramienta = true
  AND NOT EXISTS (SELECT 1 FROM herramienta_unidad hu WHERE hu.id_articulo = a.id_articulo);
