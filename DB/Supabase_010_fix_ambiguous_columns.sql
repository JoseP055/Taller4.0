-- =========================================================
-- Fix general: "column reference ... is ambiguous"
--
-- Postgres (con plpgsql.variable_conflict = error, el default) no deja
-- usar un nombre sin calificar dentro de un UPDATE/SELECT si ese nombre
-- es a la vez una columna de la tabla involucrada Y un parametro de la
-- funcion. Ya habiamos pisado esto una vez (herr_asignar / id_colaborador,
-- Supabase_009) pero era solo la punta del hilo: al arreglar esa linea,
-- la ejecucion llego mas lejos y aparecio el mismo problema con
-- id_herramienta en la linea de abajo. Se revisaron TODAS las funciones
-- de esta sesion con UPDATE/SET y se encontraron mas casos identicos:
--   - herr_asignar: id_herramienta en el UPDATE final
--   - herr_devolver: observaciones en el UPDATE de asignacion_herramienta,
--     id_herramienta en el UPDATE de herramienta_unidad
--   - herr_update_unidad: nombre_base y descripcion en los UPDATE de
--     articulo, observaciones e id_herramienta en el UPDATE final
--   - personal_upsert: nombre/apellido/puesto/area en el UPDATE de edicion
--   - inv_add_stock_subensamble: id_articulo en el SELECT...FOR UPDATE y
--     en el UPDATE de stock
-- Se corrige alias-ando siempre la tabla del UPDATE/SELECT y calificando
-- toda referencia a columna (tabla.columna) y a parametro (funcion.parametro).
-- =========================================================

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

  PERFORM 1 FROM colaborador c WHERE c.id_colaborador = herr_asignar.id_colaborador AND c.activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  INSERT INTO asignacion_herramienta (id_herramienta, id_colaborador, estado, observaciones)
  VALUES (herr_asignar.id_herramienta, herr_asignar.id_colaborador, 'ACTIVA', NULLIF(BTRIM(COALESCE(observaciones, '')), ''));

  UPDATE herramienta_unidad hu SET estado = 'ASIGNADA' WHERE hu.id_herramienta = herr_asignar.id_herramienta;

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

  UPDATE asignacion_herramienta ah
  SET fecha_devolucion = now(),
      estado = 'DEVUELTA',
      observaciones = COALESCE(NULLIF(BTRIM(herr_devolver.observaciones), ''), ah.observaciones)
  WHERE ah.id_asignacion = v_id_asignacion;

  UPDATE herramienta_unidad hu SET estado = 'DISPONIBLE' WHERE hu.id_herramienta = herr_devolver.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION herr_update_unidad(
  id_herramienta integer,
  nombre_base text DEFAULT NULL,
  descripcion text DEFAULT NULL,
  id_ubicacion integer DEFAULT NULL,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_articulo integer;
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

  UPDATE herramienta_unidad hu SET
    id_ubicacion_actual = COALESCE(herr_update_unidad.id_ubicacion, hu.id_ubicacion_actual),
    observaciones = COALESCE(NULLIF(BTRIM(COALESCE(herr_update_unidad.observaciones, '')), ''), hu.observaciones)
  WHERE hu.id_herramienta = herr_update_unidad.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION personal_upsert(
  id_colaborador integer DEFAULT NULL,
  prefijo text DEFAULT NULL,
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
  v_codigo text;
BEGIN
  IF nombre IS NULL OR BTRIM(nombre) = '' THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;
  IF apellido IS NULL OR BTRIM(apellido) = '' THEN
    RAISE EXCEPTION 'Apellido requerido';
  END IF;

  IF id_colaborador IS NULL THEN
    IF prefijo IS NULL OR BTRIM(prefijo) = '' THEN
      RAISE EXCEPTION 'Prefijo de código requerido';
    END IF;
    v_codigo := personal_next_codigo(prefijo);

    INSERT INTO colaborador (codigo_colaborador, nombre, apellido, puesto, area)
    VALUES (
      v_codigo, UPPER(BTRIM(nombre)), UPPER(BTRIM(apellido)),
      NULLIF(UPPER(BTRIM(COALESCE(puesto, ''))), ''), NULLIF(UPPER(BTRIM(COALESCE(area, ''))), '')
    )
    RETURNING colaborador.id_colaborador INTO v_id;
  ELSE
    UPDATE colaborador c SET
      nombre = UPPER(BTRIM(personal_upsert.nombre)),
      apellido = UPPER(BTRIM(personal_upsert.apellido)),
      puesto = NULLIF(UPPER(BTRIM(COALESCE(personal_upsert.puesto, ''))), ''),
      area = NULLIF(UPPER(BTRIM(COALESCE(personal_upsert.area, ''))), '')
    WHERE c.id_colaborador = personal_upsert.id_colaborador
    RETURNING c.id_colaborador, c.codigo_colaborador INTO v_id, v_codigo;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Colaborador no encontrado';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id_colaborador', v_id, 'codigo_colaborador', v_codigo);
END;
$$;

CREATE OR REPLACE FUNCTION inv_add_stock_subensamble(
  id_articulo integer,
  cantidad numeric,
  referencia text DEFAULT 'CREACION_SUBENSAMBLE',
  observaciones text DEFAULT NULL,
  id_usuario integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_categoria_codigo text;
  v_loc_id integer;
  v_before numeric;
  v_after numeric;
BEGIN
  IF cantidad IS NULL OR cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT c.codigo_categoria INTO v_categoria_codigo
  FROM articulo a
  JOIN categoria c ON c.id_categoria = a.id_categoria
  WHERE a.id_articulo = inv_add_stock_subensamble.id_articulo AND a.activo = true;

  IF v_categoria_codigo IS NULL OR v_categoria_codigo <> '30' THEN
    RAISE EXCEPTION 'El artículo no es un subensamble';
  END IF;

  SELECT id_ubicacion INTO v_loc_id FROM ubicacion WHERE codigo_ubicacion = 'SUBENSAMBLE' AND activa = true;
  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'Ubicación SUBENSAMBLE no configurada';
  END IF;

  INSERT INTO stock (id_articulo, id_ubicacion, cantidad_actual, minimo, maximo, punto_reorden)
  VALUES (inv_add_stock_subensamble.id_articulo, v_loc_id, 0, 0, 0, 0)
  ON CONFLICT (id_articulo, id_ubicacion) DO NOTHING;

  SELECT COALESCE(s.cantidad_actual, 0) INTO v_before
  FROM stock s
  WHERE s.id_articulo = inv_add_stock_subensamble.id_articulo AND s.id_ubicacion = v_loc_id
  FOR UPDATE;

  v_after := v_before + cantidad;

  UPDATE stock s SET cantidad_actual = v_after, fecha_ultima_actualizacion = now()
  WHERE s.id_articulo = inv_add_stock_subensamble.id_articulo AND s.id_ubicacion = v_loc_id;

  INSERT INTO movimiento_stock (
    tipo_movimiento, id_articulo, id_ubicacion_origen, id_ubicacion_destino,
    cantidad, referencia, id_usuario, observaciones
  ) VALUES (
    'CREACION_SUBENSAMBLE', inv_add_stock_subensamble.id_articulo, NULL, v_loc_id,
    cantidad, NULLIF(BTRIM(COALESCE(referencia, '')), ''), id_usuario, NULLIF(BTRIM(COALESCE(observaciones, '')), '')
  );

  RETURN jsonb_build_object('ok', true, 'antes', v_before, 'despues', v_after);
END;
$$;

GRANT EXECUTE ON FUNCTION herr_asignar(integer, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_devolver(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_update_unidad(integer, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION personal_upsert(integer, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inv_add_stock_subensamble(integer, numeric, text, text, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
