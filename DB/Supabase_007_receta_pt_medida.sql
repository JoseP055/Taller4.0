-- =========================================================
-- inv_receta_list: agrega la medida/dimensión del producto terminado
-- (para mostrar "Nombre (medida)" en la tabla de Recetas)
-- Mismo cuerpo que Supabase_006_mejoras.sql, agregando 'pt_medida'.
-- =========================================================

CREATE OR REPLACE FUNCTION inv_receta_list(id_producto_terminado integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'nombre'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id_receta', rc.id_receta,
      'id_producto_terminado', rc.id_producto_terminado,
      'producto_terminado', pt.nombre_base,
      'pt_medida', pt.dimension_principal,
      'nombre', rc.nombre,
      'activa', rc.activa,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id_articulo', ri.id_articulo,
          'nombre', a.nombre_base,
          'medida', a.dimension_principal,
          'unidad_medida', a.unidad_medida,
          'cantidad_por_unidad', ri.cantidad_por_unidad,
          'stock_actual', COALESCE(s.cantidad_actual, 0)
        ) ORDER BY a.nombre_base)
        FROM receta_item ri
        JOIN articulo a ON a.id_articulo = ri.id_articulo
        JOIN categoria c ON c.id_categoria = a.id_categoria
        LEFT JOIN ubicacion u
          ON u.codigo_ubicacion = inv_location_code_for_categoria(c.codigo_categoria) AND u.activa = true
        LEFT JOIN stock s ON s.id_articulo = ri.id_articulo AND s.id_ubicacion = u.id_ubicacion
        WHERE ri.id_receta = rc.id_receta
      ), '[]'::jsonb)
    ) AS r
    FROM receta rc
    JOIN articulo pt ON pt.id_articulo = rc.id_producto_terminado
    WHERE (inv_receta_list.id_producto_terminado IS NULL
           OR rc.id_producto_terminado = inv_receta_list.id_producto_terminado)
  ) x;
$$;

GRANT EXECUTE ON FUNCTION inv_receta_list(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
