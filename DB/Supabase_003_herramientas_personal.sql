-- =========================================================
-- HERRAMIENTAS (por unidad) + PERSONAL (colaboradores)
--
-- Reutiliza tablas ya creadas en Supabase_001_schema_seed.sql:
--   articulo (tipo de herramienta, marcado con es_herramienta = true)
--   herramienta_unidad (unidad física asignable)
--   asignacion_herramienta (historial de asignaciones a colaborador)
--   colaborador (personal)
-- Ninguna de esas tablas necesita ALTER: ya existen y ya tienen RLS deshabilitada.
-- =========================================================

-- Migra el seed de una corrida anterior de este script (códigos '50'/'501'/'502')
-- a los códigos correctos '70'/'201'/'202'. No hace nada si nunca se corrió así.
UPDATE categoria SET codigo_categoria = '70'
WHERE codigo_categoria = '50' AND nombre_categoria = 'HERRAMIENTAS';

UPDATE subcategoria sc SET codigo_subcategoria = '201'
FROM categoria c
WHERE sc.id_categoria = c.id_categoria AND c.codigo_categoria = '70' AND sc.codigo_subcategoria = '501';

UPDATE subcategoria sc SET codigo_subcategoria = '202'
FROM categoria c
WHERE sc.id_categoria = c.id_categoria AND c.codigo_categoria = '70' AND sc.codigo_subcategoria = '502';

-- Seed: categoría/subcategorías para el catálogo de tipos de herramienta
-- 70 HERRAMIENTAS / 201 HERRAMIENTA MANUAL / 202 HERRAMIENTA ELECTRICA
-- (mismo esquema de código que materias primas: codigo_categoria + codigo_subcategoria + secuencia)
INSERT INTO categoria (codigo_categoria, nombre_categoria)
VALUES ('70', 'HERRAMIENTAS')
ON CONFLICT (codigo_categoria) DO NOTHING;

INSERT INTO subcategoria (id_categoria, codigo_subcategoria, nombre_subcategoria)
SELECT c.id_categoria, '201', 'HERRAMIENTA MANUAL'
FROM categoria c WHERE c.codigo_categoria = '70'
ON CONFLICT (id_categoria, codigo_subcategoria) DO NOTHING;

INSERT INTO subcategoria (id_categoria, codigo_subcategoria, nombre_subcategoria)
SELECT c.id_categoria, '202', 'HERRAMIENTA ELECTRICA'
FROM categoria c WHERE c.codigo_categoria = '70'
ON CONFLICT (id_categoria, codigo_subcategoria) DO NOTHING;

INSERT INTO ubicacion (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('HERRAMIENTAS', 'AREA DE HERRAMIENTAS', 'INTERNA')
ON CONFLICT (codigo_ubicacion) DO NOTHING;

-- ---------------------------------------------------------
-- Código correlativo para un nuevo tipo de herramienta (articulo)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_next_codigo(id_subcategoria integer)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  cat_cod text;
  sub_cod text;
  next_seq integer;
  candidate bigint;
BEGIN
  SELECT c.codigo_categoria, sc.codigo_subcategoria INTO cat_cod, sub_cod
  FROM subcategoria sc
  JOIN categoria c ON c.id_categoria = sc.id_categoria
  WHERE sc.id_subcategoria = herr_next_codigo.id_subcategoria;

  IF cat_cod IS NULL THEN
    RAISE EXCEPTION 'Subcategoría inválida';
  END IF;

  SELECT COUNT(*) + 1 INTO next_seq
  FROM articulo a
  WHERE a.id_subcategoria = herr_next_codigo.id_subcategoria;

  LOOP
    candidate := (cat_cod || sub_cod || lpad(next_seq::text, 4, '0'))::bigint;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM articulo WHERE codigo_articulo = candidate);
    next_seq := next_seq + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ---------------------------------------------------------
-- Catálogos para el formulario (subcategorías, ubicaciones, colaboradores)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_meta()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'subcategorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sc.id_subcategoria, 'nombre', sc.nombre_subcategoria) ORDER BY sc.nombre_subcategoria)
      FROM subcategoria sc
      JOIN categoria c ON c.id_categoria = sc.id_categoria
      WHERE c.codigo_categoria = '70' AND sc.activo = true AND c.activo = true
    ), '[]'::jsonb),
    'ubicaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', u.id_ubicacion, 'codigo', u.codigo_ubicacion, 'nombre', u.nombre_ubicacion) ORDER BY u.nombre_ubicacion)
      FROM ubicacion u WHERE u.activa = true
    ), '[]'::jsonb),
    'colaboradores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id_colaborador, 'nombre', BTRIM(c.nombre || ' ' || c.apellido), 'codigo', c.codigo_colaborador) ORDER BY c.nombre)
      FROM colaborador c WHERE c.activo = true
    ), '[]'::jsonb),
    'tipos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id_articulo, 'codigo', a.codigo_articulo, 'nombre', a.nombre_base, 'unidad_medida', a.unidad_medida) ORDER BY a.nombre_base)
      FROM articulo a WHERE a.es_herramienta = true AND a.activo = true
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------
-- Listado de unidades de herramienta (tabla principal del módulo)
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
        hu.estado AS estado,
        COALESCE(u.codigo_ubicacion, '-') AS ubicacion,
        (
          SELECT BTRIM(c.nombre || ' ' || c.apellido)
          FROM asignacion_herramienta ah
          JOIN colaborador c ON c.id_colaborador = ah.id_colaborador
          WHERE ah.id_herramienta = hu.id_herramienta AND ah.estado = 'ACTIVA'
          ORDER BY ah.fecha_asignacion DESC
          LIMIT 1
        ) AS asignado_a
      FROM herramienta_unidad hu
      JOIN articulo a ON a.id_articulo = hu.id_articulo
      JOIN subcategoria sc ON sc.id_subcategoria = a.id_subcategoria
      LEFT JOIN ubicacion u ON u.id_ubicacion = hu.id_ubicacion_actual
      WHERE a.activo = true
        AND (
          term IS NULL
          OR hu.codigo_herramienta ILIKE '%' || term || '%'
          OR a.nombre_base ILIKE '%' || term || '%'
        )
        AND (est = 'Todas' OR hu.estado = est)
      ORDER BY hu.id_herramienta DESC
      LIMIT l OFFSET o
    ) r
  );
END;
$$;

-- ---------------------------------------------------------
-- Crear tipo de herramienta (articulo, es_herramienta = true)
-- ---------------------------------------------------------
-- La versión anterior de esta función tenía 4 parámetros (sin codigo_sap);
-- se elimina explícitamente para que no quede como un overload muerto.
DROP FUNCTION IF EXISTS herr_create_tipo(integer, text, text, text);

CREATE OR REPLACE FUNCTION herr_create_tipo(
  id_subcategoria integer,
  nombre_base text,
  descripcion text DEFAULT NULL,
  unidad_medida text DEFAULT 'UND',
  codigo_sap bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_categoria integer;
  v_codigo bigint;
  v_id_articulo integer;
BEGIN
  SELECT sc.id_categoria INTO v_id_categoria
  FROM subcategoria sc
  WHERE sc.id_subcategoria = herr_create_tipo.id_subcategoria AND sc.activo = true;

  IF v_id_categoria IS NULL THEN
    RAISE EXCEPTION 'Subcategoría inválida';
  END IF;
  IF nombre_base IS NULL OR BTRIM(nombre_base) = '' THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;

  v_codigo := herr_next_codigo(herr_create_tipo.id_subcategoria);

  INSERT INTO articulo (
    codigo_articulo, codigo_sap, id_categoria, id_subcategoria, nombre_base, descripcion, unidad_medida, es_herramienta
  ) VALUES (
    v_codigo, herr_create_tipo.codigo_sap, v_id_categoria, herr_create_tipo.id_subcategoria, UPPER(BTRIM(nombre_base)),
    NULLIF(UPPER(BTRIM(COALESCE(descripcion, ''))), ''), UPPER(BTRIM(COALESCE(unidad_medida, 'UND'))), true
  )
  RETURNING id_articulo INTO v_id_articulo;

  RETURN jsonb_build_object('ok', true, 'id_articulo', v_id_articulo, 'codigo_articulo', v_codigo);
END;
$$;

-- ---------------------------------------------------------
-- Crear una unidad física de un tipo de herramienta ya existente
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_create_unidad(
  id_articulo integer,
  codigo_herramienta text,
  id_ubicacion integer DEFAULT NULL,
  observaciones text DEFAULT NULL
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

  INSERT INTO herramienta_unidad (id_articulo, codigo_herramienta, estado, id_ubicacion_actual, observaciones)
  VALUES (
    herr_create_unidad.id_articulo, UPPER(BTRIM(codigo_herramienta)), 'DISPONIBLE',
    id_ubicacion, NULLIF(BTRIM(COALESCE(observaciones, '')), '')
  )
  RETURNING id_herramienta INTO v_id_herramienta;

  RETURN jsonb_build_object('ok', true, 'id_herramienta', v_id_herramienta);
END;
$$;

-- ---------------------------------------------------------
-- Asignar / devolver una herramienta
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION herr_asignar(
  id_herramienta integer,
  id_colaborador integer,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT hu.estado INTO v_estado
  FROM herramienta_unidad hu
  WHERE hu.id_herramienta = herr_asignar.id_herramienta
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Herramienta no encontrada';
  END IF;
  IF v_estado <> 'DISPONIBLE' THEN
    RAISE EXCEPTION 'La herramienta no está disponible';
  END IF;

  PERFORM 1 FROM colaborador WHERE id_colaborador = herr_asignar.id_colaborador AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  INSERT INTO asignacion_herramienta (id_herramienta, id_colaborador, estado, observaciones)
  VALUES (herr_asignar.id_herramienta, herr_asignar.id_colaborador, 'ACTIVA', NULLIF(BTRIM(COALESCE(observaciones, '')), ''));

  UPDATE herramienta_unidad SET estado = 'ASIGNADA' WHERE id_herramienta = herr_asignar.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION herr_devolver(
  id_herramienta integer,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_asignacion integer;
BEGIN
  SELECT ah.id_asignacion INTO v_id_asignacion
  FROM asignacion_herramienta ah
  WHERE ah.id_herramienta = herr_devolver.id_herramienta AND ah.estado = 'ACTIVA'
  ORDER BY ah.fecha_asignacion DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id_asignacion IS NULL THEN
    RAISE EXCEPTION 'No hay una asignación activa para esta herramienta';
  END IF;

  UPDATE asignacion_herramienta
  SET fecha_devolucion = now(),
      estado = 'DEVUELTA',
      observaciones = COALESCE(NULLIF(BTRIM(observaciones), ''), observaciones)
  WHERE id_asignacion = v_id_asignacion;

  UPDATE herramienta_unidad SET estado = 'DISPONIBLE' WHERE id_herramienta = herr_devolver.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- PERSONAL (colaboradores)
-- =========================================================

CREATE OR REPLACE FUNCTION personal_list(search text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  term text;
BEGIN
  term := NULLIF(BTRIM(search), '');
  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.nombre), '[]'::jsonb)
    FROM (
      SELECT
        c.id_colaborador AS id,
        c.codigo_colaborador AS codigo,
        c.nombre AS nombre,
        c.apellido AS apellido,
        COALESCE(c.puesto, '-') AS puesto,
        COALESCE(c.area, '-') AS area,
        CASE WHEN c.activo THEN 'Activo' ELSE 'Inactivo' END AS estado,
        (
          SELECT COUNT(*) FROM asignacion_herramienta ah
          WHERE ah.id_colaborador = c.id_colaborador AND ah.estado = 'ACTIVA'
        ) AS herramientas_asignadas
      FROM colaborador c
      WHERE (
        term IS NULL
        OR c.nombre ILIKE '%' || term || '%'
        OR c.apellido ILIKE '%' || term || '%'
        OR c.codigo_colaborador ILIKE '%' || term || '%'
        OR c.area ILIKE '%' || term || '%'
      )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION personal_upsert(
  id_colaborador integer DEFAULT NULL,
  codigo_colaborador text DEFAULT NULL,
  nombre text DEFAULT NULL,
  apellido text DEFAULT NULL,
  puesto text DEFAULT NULL,
  area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id integer;
BEGIN
  IF nombre IS NULL OR BTRIM(nombre) = '' THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;
  IF apellido IS NULL OR BTRIM(apellido) = '' THEN
    RAISE EXCEPTION 'Apellido requerido';
  END IF;
  IF codigo_colaborador IS NULL OR BTRIM(codigo_colaborador) = '' THEN
    RAISE EXCEPTION 'Código requerido';
  END IF;

  IF id_colaborador IS NULL THEN
    INSERT INTO colaborador (codigo_colaborador, nombre, apellido, puesto, area)
    VALUES (
      UPPER(BTRIM(codigo_colaborador)), UPPER(BTRIM(nombre)), UPPER(BTRIM(apellido)),
      NULLIF(UPPER(BTRIM(COALESCE(puesto, ''))), ''), NULLIF(UPPER(BTRIM(COALESCE(area, ''))), '')
    )
    RETURNING colaborador.id_colaborador INTO v_id;
  ELSE
    UPDATE colaborador SET
      codigo_colaborador = UPPER(BTRIM(codigo_colaborador)),
      nombre = UPPER(BTRIM(nombre)),
      apellido = UPPER(BTRIM(apellido)),
      puesto = NULLIF(UPPER(BTRIM(COALESCE(puesto, ''))), ''),
      area = NULLIF(UPPER(BTRIM(COALESCE(area, ''))), '')
    WHERE colaborador.id_colaborador = personal_upsert.id_colaborador
    RETURNING colaborador.id_colaborador INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Colaborador no encontrado';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id_colaborador', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION personal_set_active(id_colaborador integer, activo boolean)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE colaborador SET activo = personal_set_active.activo
  WHERE colaborador.id_colaborador = personal_set_active.id_colaborador;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador no encontrado';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------
-- Permisos (mismo criterio que el resto del proyecto: backend
-- valida auth/roles antes de llamar al RPC con la anon key)
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION herr_next_codigo(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_meta() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_items(text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_create_tipo(integer, text, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_create_unidad(integer, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_asignar(integer, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_devolver(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION personal_list(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION personal_upsert(integer, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION personal_set_active(integer, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
