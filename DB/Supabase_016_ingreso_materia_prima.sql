-- =========================================================
-- Ingreso de materias primas: mismo patron que inv_add_stock_subensamble
-- (Supabase_010) pero para categoria '10' (materia prima), aumentando
-- stock en la ubicacion CONSUMIBLES (ver inv_location_code_for_categoria).
-- =========================================================

CREATE OR REPLACE FUNCTION inv_add_stock_materia_prima(
  id_articulo integer,
  cantidad numeric,
  referencia text DEFAULT 'INGRESO_MP',
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
  WHERE a.id_articulo = inv_add_stock_materia_prima.id_articulo AND a.activo = true;

  IF v_categoria_codigo IS NULL OR v_categoria_codigo <> '10' THEN
    RAISE EXCEPTION 'El artículo no es una materia prima';
  END IF;

  SELECT id_ubicacion INTO v_loc_id FROM ubicacion WHERE codigo_ubicacion = 'CONSUMIBLES' AND activa = true;
  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'Ubicación CONSUMIBLES no configurada';
  END IF;

  INSERT INTO stock (id_articulo, id_ubicacion, cantidad_actual, minimo, maximo, punto_reorden)
  VALUES (inv_add_stock_materia_prima.id_articulo, v_loc_id, 0, 0, 0, 0)
  ON CONFLICT (id_articulo, id_ubicacion) DO NOTHING;

  SELECT COALESCE(s.cantidad_actual, 0) INTO v_before
  FROM stock s
  WHERE s.id_articulo = inv_add_stock_materia_prima.id_articulo AND s.id_ubicacion = v_loc_id
  FOR UPDATE;

  v_after := v_before + cantidad;

  UPDATE stock s SET cantidad_actual = v_after, fecha_ultima_actualizacion = now()
  WHERE s.id_articulo = inv_add_stock_materia_prima.id_articulo AND s.id_ubicacion = v_loc_id;

  INSERT INTO movimiento_stock (
    tipo_movimiento, id_articulo, id_ubicacion_origen, id_ubicacion_destino,
    cantidad, referencia, id_usuario, observaciones
  ) VALUES (
    'INGRESO_MP', inv_add_stock_materia_prima.id_articulo, NULL, v_loc_id,
    cantidad, NULLIF(BTRIM(COALESCE(referencia, '')), ''), id_usuario, NULLIF(BTRIM(COALESCE(observaciones, '')), '')
  );

  RETURN jsonb_build_object('ok', true, 'antes', v_before, 'despues', v_after);
END;
$$;

GRANT EXECUTE ON FUNCTION inv_add_stock_materia_prima(integer, numeric, text, text, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
