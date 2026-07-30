-- =========================================================
-- Consolida asignaciones repetidas y permite devolver una cantidad
-- parcial (no toda la asignacion de una vez).
--
-- Antes: asignar la misma herramienta 2 veces a la misma persona creaba
-- 2 filas activas separadas (ej. TIJERA x1 y TIJERA x1 en vez de x2).
-- Ahora: si ya hay una asignacion ACTIVA de esa herramienta para ese
-- colaborador, se le suma la cantidad en vez de crear una fila nueva.
-- Y "Devolver" acepta una cantidad menor a la asignada: si devuelve
-- todo, cierra la asignacion; si devuelve una parte, resta esa cantidad
-- de la fila activa y deja un registro historico (DEVUELTA) de lo que
-- se devolvio, para no perder trazabilidad.
-- =========================================================

-- 1) Consolidar duplicados activos que ya existan (mismo herramienta +
--    colaborador con varias filas ACTIVA), sumando la cantidad en la
--    fila mas antigua y borrando el resto.
UPDATE asignacion_herramienta ah
SET cantidad = sums.total
FROM (
  SELECT id_herramienta, id_colaborador, MIN(id_asignacion) AS keep_id, SUM(cantidad) AS total
  FROM asignacion_herramienta
  WHERE estado = 'ACTIVA'
  GROUP BY id_herramienta, id_colaborador
  HAVING COUNT(*) > 1
) sums
WHERE ah.id_asignacion = sums.keep_id;

DELETE FROM asignacion_herramienta ah
WHERE ah.estado = 'ACTIVA'
  AND ah.id_asignacion NOT IN (
    SELECT MIN(id_asignacion)
    FROM asignacion_herramienta
    WHERE estado = 'ACTIVA'
    GROUP BY id_herramienta, id_colaborador
  );

-- 2) herr_asignar: si ya existe una asignacion ACTIVA de esa herramienta
--    para ese colaborador, suma la cantidad en vez de crear otra fila.
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
  v_id_asignacion_existente integer;
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

  SELECT ah.id_asignacion INTO v_id_asignacion_existente
  FROM asignacion_herramienta ah
  WHERE ah.id_herramienta = herr_asignar.id_herramienta
    AND ah.id_colaborador = herr_asignar.id_colaborador
    AND ah.estado = 'ACTIVA'
  ORDER BY ah.fecha_asignacion DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id_asignacion_existente IS NOT NULL THEN
    UPDATE asignacion_herramienta ah
    SET cantidad = ah.cantidad + herr_asignar.cantidad,
        observaciones = COALESCE(NULLIF(BTRIM(COALESCE(herr_asignar.observaciones, '')), ''), ah.observaciones)
    WHERE ah.id_asignacion = v_id_asignacion_existente;
  ELSE
    INSERT INTO asignacion_herramienta (id_herramienta, id_colaborador, cantidad, estado, observaciones)
    VALUES (
      herr_asignar.id_herramienta, herr_asignar.id_colaborador, herr_asignar.cantidad,
      'ACTIVA', NULLIF(BTRIM(COALESCE(observaciones, '')), '')
    );
  END IF;

  UPDATE herramienta_unidad hu
  SET estado = CASE WHEN v_disponible - herr_asignar.cantidad <= 0 THEN 'ASIGNADA' ELSE 'DISPONIBLE' END
  WHERE hu.id_herramienta = herr_asignar.id_herramienta;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) herr_devolver: ahora acepta una cantidad (opcional, por defecto
--    devuelve todo). Si devuelve una parte, resta de la fila activa y
--    deja un registro historico DEVUELTA con lo que se devolvio.
DROP FUNCTION IF EXISTS herr_devolver(integer, text);

CREATE OR REPLACE FUNCTION herr_devolver(
  id_asignacion integer,
  cantidad numeric DEFAULT NULL,
  observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_herramienta integer;
  v_id_colaborador integer;
  v_estado text;
  v_cantidad_actual numeric;
  v_fecha_asignacion timestamptz;
  v_cantidad_devolver numeric;
BEGIN
  SELECT ah.id_herramienta, ah.id_colaborador, ah.estado, ah.cantidad, ah.fecha_asignacion
  INTO v_id_herramienta, v_id_colaborador, v_estado, v_cantidad_actual, v_fecha_asignacion
  FROM asignacion_herramienta ah
  WHERE ah.id_asignacion = herr_devolver.id_asignacion
  FOR UPDATE;

  IF v_id_herramienta IS NULL THEN
    RAISE EXCEPTION 'Asignación no encontrada';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'Esta asignación ya fue devuelta';
  END IF;

  v_cantidad_devolver := COALESCE(cantidad, v_cantidad_actual);
  IF v_cantidad_devolver <= 0 OR v_cantidad_devolver > v_cantidad_actual THEN
    RAISE EXCEPTION 'Cantidad a devolver inválida (máximo %)', v_cantidad_actual;
  END IF;

  IF v_cantidad_devolver >= v_cantidad_actual THEN
    UPDATE asignacion_herramienta ah
    SET fecha_devolucion = now(),
        estado = 'DEVUELTA',
        observaciones = COALESCE(NULLIF(BTRIM(herr_devolver.observaciones), ''), ah.observaciones)
    WHERE ah.id_asignacion = herr_devolver.id_asignacion;
  ELSE
    UPDATE asignacion_herramienta ah
    SET cantidad = v_cantidad_actual - v_cantidad_devolver
    WHERE ah.id_asignacion = herr_devolver.id_asignacion;

    INSERT INTO asignacion_herramienta (
      id_herramienta, id_colaborador, cantidad, estado, fecha_asignacion, fecha_devolucion, observaciones
    ) VALUES (
      v_id_herramienta, v_id_colaborador, v_cantidad_devolver, 'DEVUELTA', v_fecha_asignacion, now(),
      NULLIF(BTRIM(COALESCE(herr_devolver.observaciones, '')), '')
    );
  END IF;

  UPDATE herramienta_unidad hu SET estado = 'DISPONIBLE' WHERE hu.id_herramienta = v_id_herramienta;

  RETURN jsonb_build_object('ok', true, 'cantidad_devuelta', v_cantidad_devolver);
END;
$$;

GRANT EXECUTE ON FUNCTION herr_asignar(integer, integer, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION herr_devolver(integer, numeric, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
