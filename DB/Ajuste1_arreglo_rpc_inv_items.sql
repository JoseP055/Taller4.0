CREATE OR REPLACE FUNCTION inv_items(
  kind text,
  search text DEFAULT '',
  estatus text DEFAULT 'Todas',
  lim integer DEFAULT 50,
  off integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  categoria_codigo text;
  ubicacion_codigo text;
  term text;
  est text;
  l integer;
  o integer;
BEGIN
  categoria_codigo := inv_category_code(kind);
  ubicacion_codigo := inv_default_location_code(kind);
  term := NULLIF(BTRIM(search), '');
  est := COALESCE(NULLIF(BTRIM(estatus), ''), 'Todas');
  l := GREATEST(COALESCE(lim, 50), 1);
  o := GREATEST(COALESCE(off, 0), 0);

  RETURN (
    SELECT jsonb_build_object(
      'items',
      COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb),
      'offset', o,
      'limit', l
    )
    FROM (
      SELECT
        a.id_articulo AS id,
        a.codigo_articulo AS codigo,
        a.nombre_base AS nombre,
        sc.nombre_subcategoria AS subcategoria,
        a.dimension_principal AS medida,
        COALESCE(s.cantidad_actual, 0) AS cantidad,
        a.unidad_medida AS unidad,
        COALESCE(s.minimo, 0) AS min_stock,
        u.codigo_ubicacion AS ubicacion,
        CASE
          WHEN COALESCE(s.cantidad_actual, 0) < COALESCE(s.minimo, 0) THEN 'Alerta'
          ELSE 'Disponible'
        END AS estatus
      FROM categoria c
      JOIN articulo a ON a.id_categoria = c.id_categoria
      JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
      JOIN ubicacion u ON u.codigo_ubicacion = ubicacion_codigo
      LEFT JOIN stock s ON s.id_articulo = a.id_articulo AND s.id_ubicacion = u.id_ubicacion
      WHERE a.activo = true
        AND c.activo = true
        AND sc.activo = true
        AND c.codigo_categoria = categoria_codigo
        AND (
          term IS NULL
          OR CAST(a.codigo_articulo AS text) ILIKE '%' || term || '%'
          OR a.nombre_base ILIKE '%' || term || '%'
          OR sc.nombre_subcategoria ILIKE '%' || term || '%'
          OR u.codigo_ubicacion ILIKE '%' || term || '%'
        )
        AND (
          est = 'Todas'
          OR (est = 'Disponible' AND COALESCE(s.cantidad_actual, 0) >= COALESCE(s.minimo, 0))
          OR (est = 'Alerta' AND COALESCE(s.cantidad_actual, 0) < COALESCE(s.minimo, 0))
        )
      ORDER BY a.codigo_articulo DESC
      LIMIT l OFFSET o
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inv_items(text, text, text, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

