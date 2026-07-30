-- =========================================================
-- Registro de movimientos de herramientas (asignaciones + devoluciones)
-- para la nueva pestaña "Movimientos" del modulo.
-- =========================================================

CREATE OR REPLACE FUNCTION herr_movimientos(lim integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.fecha DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM (
      SELECT
        'ASIGNACION'::text AS tipo,
        ah.fecha_asignacion AS fecha,
        hu.codigo_herramienta AS codigo,
        a.nombre_base AS nombre,
        ah.cantidad AS cantidad,
        BTRIM(c.nombre || ' ' || c.apellido) AS colaborador
      FROM asignacion_herramienta ah
      JOIN herramienta_unidad hu ON hu.id_herramienta = ah.id_herramienta
      JOIN articulo a ON a.id_articulo = hu.id_articulo
      JOIN colaborador c ON c.id_colaborador = ah.id_colaborador

      UNION ALL

      SELECT
        'DEVOLUCION'::text AS tipo,
        ah.fecha_devolucion AS fecha,
        hu.codigo_herramienta AS codigo,
        a.nombre_base AS nombre,
        ah.cantidad AS cantidad,
        BTRIM(c.nombre || ' ' || c.apellido) AS colaborador
      FROM asignacion_herramienta ah
      JOIN herramienta_unidad hu ON hu.id_herramienta = ah.id_herramienta
      JOIN articulo a ON a.id_articulo = hu.id_articulo
      JOIN colaborador c ON c.id_colaborador = ah.id_colaborador
      WHERE ah.fecha_devolucion IS NOT NULL
    ) u
    ORDER BY u.fecha DESC
    LIMIT GREATEST(COALESCE(lim, 50), 1)
  ) x;
$$;

GRANT EXECUTE ON FUNCTION herr_movimientos(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
