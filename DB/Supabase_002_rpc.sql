CREATE OR REPLACE FUNCTION inv_category_code(kind text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF kind = 'productos-terminados' THEN
    RETURN '40';
  ELSIF kind = 'subensambles' THEN
    RETURN '30';
  ELSIF kind = 'materias-primas' THEN
    RETURN '10';
  END IF;
  RAISE EXCEPTION 'Tipo de inventario no soportado';
END;
$$;

CREATE OR REPLACE FUNCTION inv_default_location_code(kind text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF kind = 'productos-terminados' THEN
    RETURN 'STOCK';
  ELSIF kind = 'subensambles' THEN
    RETURN 'SUBENSAMBLE';
  ELSIF kind = 'materias-primas' THEN
    RETURN 'CONSUMIBLES';
  END IF;
  RAISE EXCEPTION 'Tipo de inventario no soportado';
END;
$$;

CREATE OR REPLACE FUNCTION inv_ping()
RETURNS jsonb
LANGUAGE sql
AS $$
SELECT jsonb_build_object('ok', true, 'ts', now());
$$;

CREATE OR REPLACE FUNCTION inv_meta(kind text)
RETURNS jsonb
LANGUAGE sql
AS $$
SELECT jsonb_build_object(
  'subcategorias',
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sc.id_subcategoria,
          'codigo', sc.codigo_subcategoria,
          'nombre', sc.nombre_subcategoria
        )
        ORDER BY sc.nombre_subcategoria
      )
      FROM subcategoria sc
      JOIN categoria c ON c.id_categoria = sc.id_categoria
      WHERE c.codigo_categoria = inv_category_code(kind)
        AND c.activo = true
        AND sc.activo = true
    ),
    '[]'::jsonb
  ),
  'ubicaciones',
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id_ubicacion,
          'codigo', u.codigo_ubicacion,
          'nombre', u.nombre_ubicacion,
          'tipo', u.tipo_ubicacion
        )
        ORDER BY u.codigo_ubicacion
      )
      FROM ubicacion u
      WHERE u.activa = true
    ),
    '[]'::jsonb
  )
);
$$;

CREATE OR REPLACE FUNCTION inv_next_codigo(kind text, id_subcategoria integer)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  codigo_categoria text;
  codigo_subcategoria text;
  prefix bigint;
  base bigint;
  max_code bigint;
  next_code bigint;
BEGIN
  codigo_categoria := inv_category_code(kind);

  SELECT sc.codigo_subcategoria
  INTO codigo_subcategoria
  FROM subcategoria sc
  JOIN categoria c ON c.id_categoria = sc.id_categoria
  WHERE c.codigo_categoria = codigo_categoria
    AND c.activo = true
    AND sc.id_subcategoria = id_subcategoria
    AND sc.activo = true;

  IF codigo_subcategoria IS NULL THEN
    RAISE EXCEPTION 'Subcategoría inválida';
  END IF;

  prefix := (codigo_categoria || codigo_subcategoria)::bigint;
  base := prefix * 10000;

  SELECT COALESCE(MAX(a.codigo_articulo), base)
  INTO max_code
  FROM articulo a
  WHERE a.codigo_articulo BETWEEN base AND (base + 9999);

  next_code := max_code + 1;
  IF next_code > base + 9999 THEN
    RAISE EXCEPTION 'Se alcanzó el máximo de serie (9999)';
  END IF;

  RETURN next_code;
END;
$$;

CREATE OR REPLACE FUNCTION inv_items(
  kind text,
  search text DEFAULT '',
  estatus text DEFAULT 'Todas',
  lim integer DEFAULT 50,
  off integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
AS $$
WITH params AS (
  SELECT
    inv_category_code(kind) AS categoria_codigo,
    inv_default_location_code(kind) AS ubicacion_codigo,
    NULLIF(BTRIM(search), '') AS term,
    COALESCE(NULLIF(BTRIM(estatus), ''), 'Todas') AS est,
    GREATEST(lim, 1) AS lim,
    GREATEST(off, 0) AS off
),
rows AS (
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
  FROM params p
  JOIN categoria c ON c.codigo_categoria = p.categoria_codigo
  JOIN articulo a ON a.id_categoria = c.id_categoria
  JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
  JOIN ubicacion u ON u.codigo_ubicacion = p.ubicacion_codigo
  LEFT JOIN stock s ON s.id_articulo = a.id_articulo AND s.id_ubicacion = u.id_ubicacion
  WHERE a.activo = true
    AND c.activo = true
    AND sc.activo = true
    AND (
      p.term IS NULL
      OR CAST(a.codigo_articulo AS text) ILIKE '%' || p.term || '%'
      OR a.nombre_base ILIKE '%' || p.term || '%'
      OR sc.nombre_subcategoria ILIKE '%' || p.term || '%'
      OR u.codigo_ubicacion ILIKE '%' || p.term || '%'
    )
    AND (
      p.est = 'Todas'
      OR (p.est = 'Disponible' AND COALESCE(s.cantidad_actual, 0) >= COALESCE(s.minimo, 0))
      OR (p.est = 'Alerta' AND COALESCE(s.cantidad_actual, 0) < COALESCE(s.minimo, 0))
    )
  ORDER BY a.codigo_articulo DESC
  OFFSET (SELECT off FROM params) ROWS
  FETCH NEXT (SELECT lim FROM params) ROWS ONLY
)
SELECT jsonb_build_object(
  'items',
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(rows)) FROM rows),
    '[]'::jsonb
  ),
  'offset', (SELECT off FROM params),
  'limit', (SELECT lim FROM params)
);
$$;

CREATE OR REPLACE FUNCTION inv_summary(kind text)
RETURNS jsonb
LANGUAGE sql
AS $$
WITH p AS (
  SELECT
    inv_category_code(kind) AS categoria_codigo,
    inv_default_location_code(kind) AS ubicacion_codigo
),
base AS (
  SELECT
    a.id_articulo,
    COALESCE(s.cantidad_actual, 0) AS cantidad_actual,
    COALESCE(s.minimo, 0) AS minimo,
    sc.nombre_subcategoria AS subcategoria
  FROM p
  JOIN categoria c ON c.codigo_categoria = p.categoria_codigo
  JOIN articulo a ON a.id_categoria = c.id_categoria
  JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
  JOIN ubicacion u ON u.codigo_ubicacion = p.ubicacion_codigo
  LEFT JOIN stock s ON s.id_articulo = a.id_articulo AND s.id_ubicacion = u.id_ubicacion
  WHERE a.activo = true AND c.activo = true AND sc.activo = true
),
kpis AS (
  SELECT
    COUNT(*)::int AS articulos_registrados,
    COALESCE(SUM(cantidad_actual), 0)::float8 AS en_existencia,
    SUM(CASE WHEN cantidad_actual < minimo THEN 1 ELSE 0 END)::int AS alertas
  FROM base
),
salud AS (
  SELECT
    CASE
      WHEN k.articulos_registrados = 0 THEN 0
      ELSE ROUND(((k.articulos_registrados - k.alertas)::numeric / k.articulos_registrados::numeric) * 100)::int
    END AS salud
  FROM kpis k
),
existencia_por_subcategoria AS (
  SELECT
    subcategoria,
    COALESCE(SUM(cantidad_actual), 0)::float8 AS existencia
  FROM base
  GROUP BY subcategoria
  ORDER BY existencia DESC
),
distribucion_estatus AS (
  SELECT
    CASE WHEN cantidad_actual < minimo THEN 'Alerta' ELSE 'Disponible' END AS estatus,
    COUNT(*)::int AS articulos
  FROM base
  GROUP BY CASE WHEN cantidad_actual < minimo THEN 'Alerta' ELSE 'Disponible' END
  ORDER BY articulos DESC
)
SELECT jsonb_build_object(
  'kind', kind,
  'categoria_codigo', (SELECT categoria_codigo FROM p),
  'ubicacion_codigo', (SELECT ubicacion_codigo FROM p),
  'kpis', jsonb_build_object(
    'articulos_registrados', (SELECT articulos_registrados FROM kpis),
    'en_existencia', (SELECT en_existencia FROM kpis),
    'alertas', (SELECT alertas FROM kpis),
    'salud', (SELECT salud FROM salud)
  ),
  'existencia_por_subcategoria',
  COALESCE((SELECT jsonb_agg(to_jsonb(existencia_por_subcategoria)) FROM existencia_por_subcategoria), '[]'::jsonb),
  'distribucion_estatus',
  COALESCE((SELECT jsonb_agg(to_jsonb(distribucion_estatus)) FROM distribucion_estatus), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION inv_create_item(
  kind text,
  codigo_sap bigint DEFAULT NULL,
  id_subcategoria integer DEFAULT NULL,
  nombre_base text DEFAULT NULL,
  descripcion text DEFAULT NULL,
  dimension_principal text DEFAULT NULL,
  detalle_adicional text DEFAULT NULL,
  unidad_medida text DEFAULT NULL,
  cantidad_actual numeric DEFAULT 0,
  minimo numeric DEFAULT 0,
  maximo numeric DEFAULT 0,
  punto_reorden numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  categoria_codigo text;
  ubicacion_codigo text;
  categoria_id integer;
  ubicacion_id integer;
  codigo bigint;
  new_id integer;
  item jsonb;
BEGIN
  categoria_codigo := inv_category_code(kind);
  ubicacion_codigo := inv_default_location_code(kind);

  SELECT id_categoria INTO categoria_id
  FROM categoria
  WHERE codigo_categoria = categoria_codigo AND activo = true;
  IF categoria_id IS NULL THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;

  SELECT id_ubicacion INTO ubicacion_id
  FROM ubicacion
  WHERE codigo_ubicacion = UPPER(BTRIM(ubicacion_codigo)) AND activa = true;
  IF ubicacion_id IS NULL THEN
    RAISE EXCEPTION 'Ubicación inválida';
  END IF;

  IF id_subcategoria IS NULL THEN
    RAISE EXCEPTION 'Subcategoría inválida';
  END IF;

  codigo := inv_next_codigo(kind, id_subcategoria);

  INSERT INTO articulo (
    codigo_articulo,
    codigo_sap,
    id_categoria,
    id_subcategoria,
    nombre_base,
    descripcion,
    dimension_principal,
    detalle_adicional,
    unidad_medida,
    es_maquinaria,
    es_herramienta,
    es_consumible,
    activo
  )
  VALUES (
    codigo,
    codigo_sap,
    categoria_id,
    id_subcategoria,
    UPPER(BTRIM(nombre_base)),
    NULLIF(UPPER(BTRIM(descripcion)), ''),
    NULLIF(UPPER(BTRIM(dimension_principal)), ''),
    NULLIF(UPPER(BTRIM(detalle_adicional)), ''),
    UPPER(BTRIM(unidad_medida)),
    false,
    false,
    false,
    true
  )
  RETURNING id_articulo INTO new_id;

  INSERT INTO stock (
    id_articulo,
    id_ubicacion,
    cantidad_actual,
    minimo,
    maximo,
    punto_reorden
  )
  VALUES (
    new_id,
    ubicacion_id,
    COALESCE(cantidad_actual, 0),
    COALESCE(minimo, 0),
    COALESCE(maximo, 0),
    COALESCE(punto_reorden, 0)
  )
  ON CONFLICT (id_articulo, id_ubicacion) DO UPDATE SET
    cantidad_actual = EXCLUDED.cantidad_actual,
    minimo = EXCLUDED.minimo,
    maximo = EXCLUDED.maximo,
    punto_reorden = EXCLUDED.punto_reorden,
    fecha_ultima_actualizacion = now();

  SELECT to_jsonb(r) INTO item
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
    FROM articulo a
    JOIN categoria c ON c.id_categoria = a.id_categoria
    JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
    JOIN ubicacion u ON u.id_ubicacion = ubicacion_id
    LEFT JOIN stock s ON s.id_articulo = a.id_articulo AND s.id_ubicacion = u.id_ubicacion
    WHERE c.codigo_categoria = categoria_codigo AND a.id_articulo = new_id
  ) r;

  RETURN jsonb_build_object('item', item);
END;
$$;

CREATE OR REPLACE FUNCTION inv_update_item(
  kind text,
  id_articulo integer,
  nombre_base text DEFAULT NULL,
  unidad_medida text DEFAULT NULL,
  dimension_principal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  categoria_codigo text;
  updated boolean;
BEGIN
  categoria_codigo := inv_category_code(kind);

  PERFORM 1
  FROM articulo a
  JOIN categoria c ON c.id_categoria = a.id_categoria
  WHERE a.id_articulo = inv_update_item.id_articulo
    AND c.codigo_categoria = categoria_codigo
    AND a.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artículo no encontrado';
  END IF;

  UPDATE articulo a
  SET
    nombre_base = COALESCE(UPPER(BTRIM(inv_update_item.nombre_base)), a.nombre_base),
    unidad_medida = COALESCE(UPPER(BTRIM(inv_update_item.unidad_medida)), a.unidad_medida),
    dimension_principal = CASE
      WHEN inv_update_item.dimension_principal IS NULL THEN a.dimension_principal
      WHEN BTRIM(inv_update_item.dimension_principal) = '' THEN NULL
      ELSE UPPER(BTRIM(inv_update_item.dimension_principal))
    END
  WHERE a.id_articulo = inv_update_item.id_articulo;

  updated := true;
  RETURN jsonb_build_object('ok', true, 'updated', updated);
END;
$$;

GRANT EXECUTE ON FUNCTION inv_ping() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_meta(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_summary(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_items(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_next_codigo(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_create_item(text, bigint, integer, text, text, text, text, text, numeric, numeric, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_update_item(text, integer, text, text, text) TO anon, authenticated;

