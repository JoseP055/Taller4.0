-- =========================================================
-- Mejoras: editar herramientas, insumos de receta con medida,
-- "Vista de Creación" de subensambles (sumar stock sin receta)
-- =========================================================

-- ---------------------------------------------------------
-- Editar una unidad de herramienta (y su tipo/articulo padre)
-- ---------------------------------------------------------
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
    UPDATE articulo SET nombre_base = UPPER(BTRIM(nombre_base)) WHERE id_articulo = v_id_articulo;
  END IF;

  IF descripcion IS NOT NULL THEN
    UPDATE articulo SET descripcion = NULLIF(UPPER(BTRIM(descripcion)), '') WHERE id_articulo = v_id_articulo;
  END IF;

  UPDATE herramienta_unidad SET
    id_ubicacion_actual = COALESCE(herr_update_unidad.id_ubicacion, id_ubicacion_actual),
    observaciones = COALESCE(NULLIF(BTRIM(COALESCE(herr_update_unidad.observaciones, '')), ''), observaciones)
  WHERE id_herramienta = herr_update_unidad.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION herr_update_unidad(integer, text, text, integer, text) TO anon, authenticated;

-- ---------------------------------------------------------
-- inv_receta_list: agrega la medida/dimensión de cada insumo
-- (mismo cuerpo de DB/Supabase_002_rpc.sql, con 'medida' agregado)
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- "Vista de Creación": suma stock a un subensamble ya existente
-- sin pasar por receta. No toca inv_create_item/inv_update_item.
-- ---------------------------------------------------------
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

  SELECT COALESCE(cantidad_actual, 0) INTO v_before
  FROM stock
  WHERE id_articulo = inv_add_stock_subensamble.id_articulo AND id_ubicacion = v_loc_id
  FOR UPDATE;

  v_after := v_before + cantidad;

  UPDATE stock SET cantidad_actual = v_after, fecha_ultima_actualizacion = now()
  WHERE id_articulo = inv_add_stock_subensamble.id_articulo AND id_ubicacion = v_loc_id;

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

GRANT EXECUTE ON FUNCTION inv_add_stock_subensamble(integer, numeric, text, text, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
