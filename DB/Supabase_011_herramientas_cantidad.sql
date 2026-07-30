-- =========================================================
-- Herramientas por cantidad: un mismo codigo/tipo puede tener varias
-- unidades (ej. 5 alicates) y repartirse entre varios colaboradores a
-- la vez (ej. 2 a Hugo, 1 a Maria), en vez de una fila = una unica
-- unidad fisica asignable a una sola persona.
-- =========================================================

ALTER TABLE herramienta_unidad ADD COLUMN IF NOT EXISTS cantidad_total numeric(18,3) NOT NULL DEFAULT 1;
ALTER TABLE asignacion_herramienta ADD COLUMN IF NOT EXISTS cantidad numeric(18,3) NOT NULL DEFAULT 1;

-- ---------------------------------------------------------
-- Listado de tipos de herramienta con cantidad total/asignada/disponible
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_items(
  search text DEFAULT '',
  estatus text DEFAULT 'Todas',
  lim integer DEFAULT 200,
  off integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  term text;
  est text;
  l integer;
  o integer;
BEGIN
  term := NULLIF(BTRIM(search), '');
  est := COALESCE(NULLIF(BTRIM(estatus), ''), 'Todas');
  l := GREATEST(COALESCE(lim, 200), 1);
  o := GREATEST(COALESCE(off, 0), 0);

  RETURN (
    SELECT jsonb_build_object(
      'items', COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb),
      'offset', o,
      'limit', l
    )
    FROM (
      SELECT
        hu.id_herramienta AS id,
        hu.codigo_herramienta AS codigo,
        a.nombre_base AS nombre,
        sc.nombre_subcategoria AS tipo,
        hu.cantidad_total AS cantidad_total,
        COALESCE(asig.cantidad_asignada, 0) AS cantidad_asignada,
        hu.cantidad_total - COALESCE(asig.cantidad_asignada, 0) AS cantidad_disponible,
        CASE WHEN hu.cantidad_total - COALESCE(asig.cantidad_asignada, 0) <= 0 THEN 'ASIGNADA' ELSE 'DISPONIBLE' END AS estado,
        COALESCE(u.codigo_ubicacion, '-') AS ubicacion,
        asig.asignado_a AS asignado_a
      FROM herramienta_unidad hu
      JOIN articulo a ON a.id_articulo = hu.id_articulo
      JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
      LEFT JOIN ubicacion u ON u.id_ubicacion = hu.id_ubicacion_actual
      LEFT JOIN (
        SELECT
          ah.id_herramienta,
          SUM(ah.cantidad) AS cantidad_asignada,
          string_agg(BTRIM(c.nombre || ' ' || c.apellido) || ' (' || ah.cantidad::text || ')', ', ' ORDER BY c.nombre) AS asignado_a
        FROM asignacion_herramienta ah
        JOIN colaborador c ON c.id_colaborador = ah.id_colaborador
        WHERE ah.estado = 'ACTIVA'
        GROUP BY ah.id_herramienta
      ) asig ON asig.id_herramienta = hu.id_herramienta
      WHERE a.activo = true
        AND (
          term IS NULL
          OR hu.codigo_herramienta ILIKE '%' || term || '%'
          OR a.nombre_base ILIKE '%' || term || '%'
        )
        AND (
          est = 'Todas'
          OR (est = 'DISPONIBLE' AND hu.cantidad_total - COALESCE(asig.cantidad_asignada, 0) > 0)
          OR (est = 'ASIGNADA' AND COALESCE(asig.cantidad_asignada, 0) > 0)
        )
      ORDER BY hu.id_herramienta DESC
      LIMIT l OFFSET o
    ) r
  );
END;
$$;

-- ---------------------------------------------------------
-- Lista plana de asignaciones activas (para agrupar por colaborador)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_asignaciones_activas(search text DEFAULT '')
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.colaborador), '[]'::jsonb)
  FROM (
    SELECT
      ah.id_asignacion,
      ah.id_herramienta,
      hu.codigo_herramienta AS codigo,
      a.nombre_base AS nombre,
      sc.nombre_subcategoria AS tipo,
      COALESCE(u.codigo_ubicacion, '-') AS ubicacion,
      ah.cantidad,
      BTRIM(c.nombre || ' ' || c.apellido) AS colaborador,
      ah.fecha_asignacion
    FROM asignacion_herramienta ah
    JOIN herramienta_unidad hu ON hu.id_herramienta = ah.id_herramienta
    JOIN articulo a ON a.id_articulo = hu.id_articulo
    JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
    JOIN colaborador c ON c.id_colaborador = ah.id_colaborador
    LEFT JOIN ubicacion u ON u.id_ubicacion = hu.id_ubicacion_actual
    WHERE ah.estado = 'ACTIVA'
      AND (
        NULLIF(BTRIM(search), '') IS NULL
        OR hu.codigo_herramienta ILIKE '%' || search || '%'
        OR a.nombre_base ILIKE '%' || search || '%'
        OR c.nombre ILIKE '%' || search || '%'
        OR c.apellido ILIKE '%' || search || '%'
      )
  ) r;
$$;

-- ---------------------------------------------------------
-- Crear unidad (tipo) con cantidad total
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_create_unidad(
  id_articulo integer,
  codigo_herramienta text,
  id_ubicacion integer DEFAULT NULL,
  observaciones text DEFAULT NULL,
  cantidad_total numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_es_herramienta boolean;
  v_id_herramienta integer;
BEGIN
  SELECT a.es_herramienta INTO v_es_herramienta
  FROM articulo a
  WHERE a.id_articulo = herr_create_unidad.id_articulo AND a.activo = true;

  IF v_es_herramienta IS NOT TRUE THEN
    RAISE EXCEPTION 'El artículo seleccionado no es un tipo de herramienta';
  END IF;
  IF codigo_herramienta IS NULL OR BTRIM(codigo_herramienta) = '' THEN
    RAISE EXCEPTION 'Código de herramienta requerido';
  END IF;
  IF cantidad_total IS NULL OR cantidad_total <= 0 THEN
    RAISE EXCEPTION 'La cantidad total debe ser mayor a 0';
  END IF;

  INSERT INTO herramienta_unidad (id_articulo, codigo_herramienta, estado, id_ubicacion_actual, observaciones, cantidad_total)
  VALUES (
    herr_create_unidad.id_articulo, UPPER(BTRIM(codigo_herramienta)), 'DISPONIBLE',
    id_ubicacion, NULLIF(BTRIM(COALESCE(observaciones, '')), ''), herr_create_unidad.cantidad_total
  )
  RETURNING id_herramienta INTO v_id_herramienta;

  RETURN jsonb_build_object('ok', true, 'id_herramienta', v_id_herramienta);
END;
$$;

-- ---------------------------------------------------------
-- Editar tipo/unidad, incluyendo ajustar la cantidad total
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_update_unidad(
  id_herramienta integer,
  nombre_base text DEFAULT NULL,
  descripcion text DEFAULT NULL,
  id_ubicacion integer DEFAULT NULL,
  observaciones text DEFAULT NULL,
  cantidad_total numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_articulo integer;
  v_cantidad_asignada numeric;
BEGIN
  SELECT hu.id_articulo INTO v_id_articulo
  FROM herramienta_unidad hu
  WHERE hu.id_herramienta = herr_update_unidad.id_herramienta;

  IF v_id_articulo IS NULL THEN
    RAISE EXCEPTION 'Herramienta no encontrada';
  END IF;

  IF nombre_base IS NOT NULL AND BTRIM(nombre_base) <> '' THEN
    UPDATE articulo a SET nombre_base = UPPER(BTRIM(herr_update_unidad.nombre_base)) WHERE a.id_articulo = v_id_articulo;
  END IF;

  IF descripcion IS NOT NULL THEN
    UPDATE articulo a SET descripcion = NULLIF(UPPER(BTRIM(herr_update_unidad.descripcion)), '') WHERE a.id_articulo = v_id_articulo;
  END IF;

  SELECT COALESCE(SUM(ah.cantidad), 0) INTO v_cantidad_asignada
  FROM asignacion_herramienta ah
  WHERE ah.id_herramienta = herr_update_unidad.id_herramienta AND ah.estado = 'ACTIVA';

  IF cantidad_total IS NOT NULL THEN
    IF cantidad_total <= 0 THEN
      RAISE EXCEPTION 'La cantidad total debe ser mayor a 0';
    END IF;
    IF cantidad_total < v_cantidad_asignada THEN
      RAISE EXCEPTION 'No se puede bajar el total a % porque ya hay % unidad(es) asignada(s)', cantidad_total, v_cantidad_asignada;
    END IF;
  END IF;

  UPDATE herramienta_unidad hu SET
    id_ubicacion_actual = COALESCE(herr_update_unidad.id_ubicacion, hu.id_ubicacion_actual),
    observaciones = COALESCE(NULLIF(BTRIM(COALESCE(herr_update_unidad.observaciones, '')), ''), hu.observaciones),
    cantidad_total = COALESCE(herr_update_unidad.cantidad_total, hu.cantidad_total),
    estado = CASE
      WHEN COALESCE(herr_update_unidad.cantidad_total, hu.cantidad_total) - v_cantidad_asignada <= 0 THEN 'ASIGNADA'
      ELSE 'DISPONIBLE'
    END
  WHERE hu.id_herramienta = herr_update_unidad.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------
-- Asignar N unidades de una herramienta a un colaborador
-- (permite varios colaboradores activos a la vez sobre la misma herramienta,
-- mientras alcance la cantidad disponible)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_asignar(
  id_herramienta integer,
  id_colaborador integer,
  cantidad numeric,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cantidad_total numeric;
  v_cantidad_asignada numeric;
  v_disponible numeric;
BEGIN
  IF cantidad IS NULL OR cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT hu.cantidad_total INTO v_cantidad_total
  FROM herramienta_unidad hu
  WHERE hu.id_herramienta = herr_asignar.id_herramienta
  FOR UPDATE;

  IF v_cantidad_total IS NULL THEN
    RAISE EXCEPTION 'Herramienta no encontrada';
  END IF;

  SELECT COALESCE(SUM(ah.cantidad), 0) INTO v_cantidad_asignada
  FROM asignacion_herramienta ah
  WHERE ah.id_herramienta = herr_asignar.id_herramienta AND ah.estado = 'ACTIVA';

  v_disponible := v_cantidad_total - v_cantidad_asignada;

  IF cantidad > v_disponible THEN
    RAISE EXCEPTION 'Solo hay % unidad(es) disponible(s)', v_disponible;
  END IF;

  PERFORM 1 FROM colaborador c WHERE c.id_colaborador = herr_asignar.id_colaborador AND c.activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  INSERT INTO asignacion_herramienta (id_herramienta, id_colaborador, cantidad, estado, observaciones)
  VALUES (
    herr_asignar.id_herramienta, herr_asignar.id_colaborador, herr_asignar.cantidad,
    'ACTIVA', NULLIF(BTRIM(COALESCE(observaciones, '')), '')
  );

  UPDATE herramienta_unidad hu
  SET estado = CASE WHEN v_disponible - herr_asignar.cantidad <= 0 THEN 'ASIGNADA' ELSE 'DISPONIBLE' END
  WHERE hu.id_herramienta = herr_asignar.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------
-- Devolver una asignacion puntual (ya no "la herramienta" en general,
-- porque ahora puede tener varias asignaciones activas simultaneas)
-- ---------------------------------------------------------
DROP FUNCTION IF EXISTS herr_devolver(integer, text);

CREATE OR REPLACE FUNCTION herr_devolver(
  id_asignacion integer,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_herramienta integer;
  v_estado text;
BEGIN
  SELECT ah.id_herramienta, ah.estado INTO v_id_herramienta, v_estado
  FROM asignacion_herramienta ah
  WHERE ah.id_asignacion = herr_devolver.id_asignacion
  FOR UPDATE;

  IF v_id_herramienta IS NULL THEN
    RAISE EXCEPTION 'Asignación no encontrada';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'Esta asignación ya fue devuelta';
  END IF;

  UPDATE asignacion_herramienta ah
  SET fecha_devolucion = now(),
      estado = 'DEVUELTA',
      observaciones = COALESCE(NULLIF(BTRIM(herr_devolver.observaciones), ''), ah.observaciones)
  WHERE ah.id_asignacion = herr_devolver.id_asignacion;

  UPDATE herramienta_unidad hu SET estado = 'DISPONIBLE' WHERE hu.id_herramienta = v_id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION herr_items(text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_asignaciones_activas(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_create_unidad(integer, text, integer, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_update_unidad(integer, text, text, integer, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_asignar(integer, integer, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_devolver(integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
