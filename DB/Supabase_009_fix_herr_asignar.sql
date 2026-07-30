-- =========================================================
-- Fix: "column reference id_colaborador is ambiguous" al asignar una herramienta
--
-- En herr_asignar, "WHERE id_colaborador = herr_asignar.id_colaborador" no
-- aclaraba si "id_colaborador" (lado izquierdo) era la columna de la tabla
-- colaborador o el parametro de la funcion (se llaman igual) -> Postgres no
-- podia resolverlo. Se alias la tabla y se califica la columna.
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

  UPDATE herramienta_unidad SET estado = 'ASIGNADA' WHERE id_herramienta = herr_asignar.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION herr_asignar(integer, integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
