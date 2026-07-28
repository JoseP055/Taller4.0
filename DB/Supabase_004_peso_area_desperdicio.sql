-- =========================================================
-- Peso (kg) / Área (m²) para Subensambles y Productos terminados
-- + Factor de desperdicio (solo Productos terminados)
--
-- No se toca inv_create_item / inv_update_item (sus definiciones no
-- están versionadas en este repo, se crearon directo en Supabase).
-- En vez de reescribirlas a ciegas, se agrega una funcion aparte
-- (inv_set_extra_fields) que el backend llama justo despues de crear
-- o editar un articulo, para fijar estos campos sin arriesgar romper
-- la logica existente de codigo/stock/categoria.
-- =========================================================

ALTER TABLE articulo ADD COLUMN IF NOT EXISTS peso_kg numeric(18,3) NULL;
ALTER TABLE articulo ADD COLUMN IF NOT EXISTS area_m2 numeric(18,3) NULL;
ALTER TABLE articulo ADD COLUMN IF NOT EXISTS factor_desperdicio_pct numeric(6,3) NULL;
ALTER TABLE articulo ADD COLUMN IF NOT EXISTS factor_desperdicio_kg numeric(18,3) NULL;

-- ---------------------------------------------------------
-- Fija peso/área/factor de desperdicio de un articulo ya creado.
-- factor_desperdicio_kg se recalcula siempre a partir de peso_kg y
-- factor_desperdicio_pct (el % es lo que el usuario ve/edita; el kg
-- es el valor derivado que se guarda como columna aparte).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION inv_set_extra_fields(
  id_articulo integer,
  peso_kg numeric DEFAULT NULL,
  area_m2 numeric DEFAULT NULL,
  factor_desperdicio_pct numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_kg numeric;
BEGIN
  v_kg := CASE
    WHEN factor_desperdicio_pct IS NOT NULL AND peso_kg IS NOT NULL
    THEN ROUND(peso_kg * factor_desperdicio_pct / 100.0, 3)
    ELSE NULL
  END;

  UPDATE articulo SET
    peso_kg = inv_set_extra_fields.peso_kg,
    area_m2 = inv_set_extra_fields.area_m2,
    factor_desperdicio_pct = inv_set_extra_fields.factor_desperdicio_pct,
    factor_desperdicio_kg = v_kg
  WHERE articulo.id_articulo = inv_set_extra_fields.id_articulo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artículo no encontrado';
  END IF;

  RETURN jsonb_build_object('ok', true, 'factor_desperdicio_kg', v_kg);
END;
$$;

GRANT EXECUTE ON FUNCTION inv_set_extra_fields(integer, numeric, numeric, numeric) TO anon, authenticated;

-- ---------------------------------------------------------
-- inv_items: agrega los 4 campos nuevos al listado (para todas las
-- categorías; en materias primas/herramientas simplemente vienen NULL).
-- Es el mismo cuerpo de DB/Ajuste1_arreglo_rpc_inv_items.sql mas las
-- columnas nuevas en el SELECT.
-- ---------------------------------------------------------
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
        a.peso_kg AS peso_kg,
        a.area_m2 AS area_m2,
        a.factor_desperdicio_pct AS factor_desperdicio_pct,
        a.factor_desperdicio_kg AS factor_desperdicio_kg,
        COALESCE(s.cantidad_actual, 0) AS cantidad,
        a.unidad_medida AS unidad,
        COALESCE(s.minimo, 0) AS min_stock,
        COALESCE(s.maximo, 0) AS max_stock,
        COALESCE(s.punto_reorden, 0) AS punto_reorden,
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
