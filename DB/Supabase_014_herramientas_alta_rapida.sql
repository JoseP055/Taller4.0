-- =========================================================
-- Alta rápida de herramientas: crea el tipo (articulo) y su
-- primera unidad/cantidad en un solo paso, en vez de tener que
-- usar "Nuevo tipo" y luego "Agregar unidad" por separado.
-- Reutiliza herr_create_tipo + herr_create_unidad ya existentes,
-- así que queda atómico (si falla la unidad, no se crea el tipo).
-- =========================================================

CREATE OR REPLACE FUNCTION herr_create_herramienta(
  id_subcategoria integer,
  nombre_base text,
  descripcion text DEFAULT NULL,
  unidad_medida text DEFAULT 'UND',
  codigo_sap bigint DEFAULT NULL,
  id_ubicacion integer DEFAULT NULL,
  cantidad_total numeric DEFAULT 1,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo jsonb;
  v_id_articulo integer;
  v_codigo bigint;
  v_unidad jsonb;
BEGIN
  v_tipo := herr_create_tipo(
    herr_create_herramienta.id_subcategoria,
    herr_create_herramienta.nombre_base,
    herr_create_herramienta.descripcion,
    herr_create_herramienta.unidad_medida,
    herr_create_herramienta.codigo_sap
  );
  v_id_articulo := (v_tipo->>'id_articulo')::integer;
  v_codigo := (v_tipo->>'codigo_articulo')::bigint;

  v_unidad := herr_create_unidad(
    v_id_articulo,
    v_codigo::text,
    herr_create_herramienta.id_ubicacion,
    herr_create_herramienta.observaciones,
    herr_create_herramienta.cantidad_total
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_articulo', v_id_articulo,
    'codigo_articulo', v_codigo,
    'id_herramienta', (v_unidad->>'id_herramienta')::integer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION herr_create_herramienta(integer, text, text, text, bigint, integer, numeric, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
