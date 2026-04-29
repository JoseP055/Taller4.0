import os
import json
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pyodbc
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def _pick_sqlserver_driver() -> str:
  drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
  if not drivers:
    raise RuntimeError('No se encontró un driver ODBC de SQL Server instalado.')

  def score(name: str) -> int:
    s = name.lower()
    if 'odbc driver 18' in s:
      return 180
    if 'odbc driver 17' in s:
      return 170
    if 'odbc driver 13' in s:
      return 130
    if 'odbc driver' in s:
      return 100
    return 10

  drivers.sort(key=score, reverse=True)
  return drivers[0]


def _build_conn_str(*, driver: str, server: str, database: str, user: str | None, password: str | None) -> str:
  if user and password:
    return (
      f'DRIVER={{{driver}}};'
      f'SERVER={server};'
      f'DATABASE={database};'
      f'UID={user};'
      f'PWD={password};'
      'TrustServerCertificate=yes;'
    )

  return (
    f'DRIVER={{{driver}}};'
    f'SERVER={server};'
    f'DATABASE={database};'
    'Trusted_Connection=yes;'
    'TrustServerCertificate=yes;'
  )


def _candidate_servers(raw_server: str | None) -> list[str]:
  if raw_server and raw_server.strip():
    return [raw_server.strip()]

  return [
    r'localhost',
    r'.\SQLEXPRESS',
    r'localhost\SQLEXPRESS',
    r'.\MSSQLSERVER',
    r'(localdb)\MSSQLLocalDB',
  ]


_RESOLVED_CONN_STR: str | None = None


def _supabase_url() -> str | None:
  url = os.environ.get('SUPABASE_URL')
  if url and url.strip():
    return url.strip().rstrip('/')
  return None


def _supabase_anon_key() -> str | None:
  key = os.environ.get('SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_KEY')
  if key and key.strip():
    return key.strip()
  return None


def _supabase_enabled() -> bool:
  return bool(_supabase_url() and _supabase_anon_key())


def _supabase_rpc(function_name: str, payload: dict):
  base = _supabase_url()
  key = _supabase_anon_key()
  if not base or not key:
    raise HTTPException(status_code=500, detail='Supabase no configurado')

  url = f'{base}/rest/v1/rpc/{function_name}'
  body = json.dumps(payload).encode('utf-8')
  req = Request(
    url,
    data=body,
    method='POST',
    headers={
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': f'Bearer {key}',
    },
  )

  try:
    with urlopen(req, timeout=10) as res:
      raw = res.read().decode('utf-8') if res else ''
      if not raw:
        return None
      return json.loads(raw)
  except HTTPError as e:
    raw = e.read().decode('utf-8') if hasattr(e, 'read') else ''
    detail = raw or str(e)
    raise HTTPException(status_code=500, detail=detail) from e
  except URLError as e:
    raise HTTPException(status_code=500, detail=f'Error de red Supabase: {e}') from e


def _connect():
  conn_str_override = os.environ.get('DB_CONN_STR')
  if conn_str_override and conn_str_override.strip():
    return pyodbc.connect(conn_str_override.strip(), timeout=5)

  global _RESOLVED_CONN_STR
  if _RESOLVED_CONN_STR:
    return pyodbc.connect(_RESOLVED_CONN_STR, timeout=5)

  raw_server = os.environ.get('DB_SERVER')
  database = os.environ.get('DB_DATABASE', 'InventarioTaller')
  user = os.environ.get('DB_USER')
  password = os.environ.get('DB_PASSWORD')
  driver = os.environ.get('DB_DRIVER') or _pick_sqlserver_driver()
  candidates = _candidate_servers(raw_server)

  last_error: Exception | None = None
  for server in candidates:
    try:
      conn_str = _build_conn_str(
        driver=driver,
        server=server,
        database=database,
        user=user,
        password=password,
      )
      conn = pyodbc.connect(conn_str, timeout=2)
      _RESOLVED_CONN_STR = conn_str
      return conn
    except Exception as e:
      last_error = e

  attempts = ', '.join(candidates)
  raise RuntimeError(
    f'No se pudo conectar a SQL Server. Intentos: {attempts}. '
    f'Define DB_SERVER (y si aplica DB_USER/DB_PASSWORD) o DB_CONN_STR. '
    f'Último error: {last_error}'
  )


def _fetch_all(sql: str, params: list):
  try:
    with _connect() as conn:
      cur = conn.cursor()
      cur.execute(sql, params)
      columns = [c[0] for c in cur.description]
      rows = cur.fetchall()
      return [dict(zip(columns, row)) for row in rows]
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Error de BD: {e}') from e


def _fetch_one(sql: str, params: list):
  try:
    with _connect() as conn:
      cur = conn.cursor()
      cur.execute(sql, params)
      row = cur.fetchone()
      return row[0] if row else None
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Error de BD: {e}') from e


def _category_code(kind: str) -> str:
  if kind == 'productos-terminados':
    return '40'
  if kind == 'subensambles':
    return '30'
  if kind == 'materias-primas':
    return '10'
  raise HTTPException(status_code=404, detail='Tipo de inventario no soportado')


def _default_location_code(kind: str) -> str:
  if kind == 'productos-terminados':
    return 'STOCK'
  if kind == 'subensambles':
    return 'SUBENSAMBLE'
  if kind == 'materias-primas':
    return 'CONSUMIBLES'
  raise HTTPException(status_code=404, detail='Tipo de inventario no soportado')


app = FastAPI(title='InventarioTaller API')

app.add_middleware(
  CORSMiddleware,
  allow_origins=[
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  allow_origin_regex=r'^http://(\d{1,3}\.){3}\d{1,3}:5173$',
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)


@app.get('/health')
def health():
  if _supabase_enabled():
    try:
      data = _supabase_rpc('inv_ping', {})
      return {'ok': True, 'source': 'supabase', 'ping': data}
    except Exception as e:
      return {'ok': False, 'source': 'supabase', 'error': str(e)}

  try:
    with _connect() as conn:
      cur = conn.cursor()
      cur.execute('SELECT 1')
      cur.fetchone()
    return {'ok': True, 'source': 'sqlserver', 'timestamp': datetime.utcnow().isoformat() + 'Z'}
  except Exception as e:
    return {'ok': False, 'source': 'sqlserver', 'error': str(e)}


@app.get('/inventario/{kind}/summary')
def inventory_summary(kind: str):
  if _supabase_enabled():
    return _supabase_rpc('inv_summary', {'kind': kind})

  category = _category_code(kind)
  location_code = _default_location_code(kind)

  total_articulos = _fetch_one(
    """
    SELECT COUNT(*)
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    WHERE c.codigo_categoria = ? AND a.activo = 1
    """,
    [category],
  )

  existencia = _fetch_one(
    """
    SELECT ISNULL(SUM(ISNULL(s.cantidad_actual, 0)), 0)
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
    LEFT JOIN STOCK s
      ON s.id_articulo = a.id_articulo
     AND s.id_ubicacion = u.id_ubicacion
    WHERE c.codigo_categoria = ? AND a.activo = 1
    """,
    [location_code, category],
  )

  alertas = _fetch_one(
    """
    SELECT COUNT(*)
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
    LEFT JOIN STOCK s
      ON s.id_articulo = a.id_articulo
     AND s.id_ubicacion = u.id_ubicacion
    WHERE c.codigo_categoria = ?
      AND a.activo = 1
      AND ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0)
    """,
    [location_code, category],
  )

  salud = 100
  if total_articulos:
    salud = round(((total_articulos - (alertas or 0)) / total_articulos) * 100)

  refs_por_subcategoria = _fetch_all(
    """
    SELECT sc.nombre_subcategoria AS subcategoria, COUNT(*) AS referencias
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    INNER JOIN SUBCATEGORIA sc ON sc.id_subcategoria = a.id_subcategoria
    WHERE c.codigo_categoria = ? AND a.activo = 1
    GROUP BY sc.nombre_subcategoria
    ORDER BY referencias DESC
    """,
    [category],
  )

  existencia_por_subcategoria = _fetch_all(
    """
    SELECT
      sc.nombre_subcategoria AS subcategoria,
      ISNULL(SUM(ISNULL(s.cantidad_actual, 0)), 0) AS existencia
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    INNER JOIN SUBCATEGORIA sc ON sc.id_subcategoria = a.id_subcategoria
    INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
    LEFT JOIN STOCK s
      ON s.id_articulo = a.id_articulo
     AND s.id_ubicacion = u.id_ubicacion
    WHERE c.codigo_categoria = ? AND a.activo = 1
    GROUP BY sc.nombre_subcategoria
    ORDER BY existencia DESC
    """,
    [location_code, category],
  )

  distribucion_estatus = _fetch_all(
    """
    SELECT
      CASE
        WHEN ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0) THEN 'Alerta'
        ELSE 'Disponible'
      END AS estatus,
      COUNT(*) AS articulos
    FROM ARTICULO a
    INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
    INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
    LEFT JOIN STOCK s
      ON s.id_articulo = a.id_articulo
     AND s.id_ubicacion = u.id_ubicacion
    WHERE c.codigo_categoria = ? AND a.activo = 1
    GROUP BY
      CASE
        WHEN ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0) THEN 'Alerta'
        ELSE 'Disponible'
      END
    ORDER BY articulos DESC
    """,
    [location_code, category],
  )

  return {
    'kind': kind,
    'categoria_codigo': category,
    'ubicacion_codigo': location_code,
    'kpis': {
      'articulos_registrados': total_articulos or 0,
      'referencias': total_articulos or 0,
      'en_existencia': float(existencia or 0),
      'alertas': alertas or 0,
      'salud': salud,
    },
    'refs_por_subcategoria': refs_por_subcategoria,
    'existencia_por_subcategoria': existencia_por_subcategoria,
    'distribucion_estatus': distribucion_estatus,
  }


@app.get('/inventario/{kind}/items')
def inventory_items(
  kind: str,
  search: str = Query('', max_length=100),
  estatus: str = Query('Todas', max_length=20),
  limit: int = Query(50, ge=1, le=200),
  offset: int = Query(0, ge=0),
):
  if _supabase_enabled():
    return _supabase_rpc(
      'inv_items',
      {
        'kind': kind,
        'search': search,
        'estatus': estatus,
        'lim': limit,
        'off': offset,
      },
    )

  category = _category_code(kind)
  location_code = _default_location_code(kind)

  where = [
    'c.codigo_categoria = ?',
    'a.activo = 1',
  ]
  params: list = [location_code, category]

  term = search.strip()
  if term:
    where.append(
      '(CAST(a.codigo_articulo AS VARCHAR(50)) LIKE ? OR a.nombre_base LIKE ? OR sc.nombre_subcategoria LIKE ? OR u.codigo_ubicacion LIKE ?)'
    )
    like = f'%{term}%'
    params.extend([like, like, like, like])

  if estatus and estatus != 'Todas':
    if estatus == 'Disponible':
      where.append('ISNULL(s.cantidad_actual, 0) >= ISNULL(s.minimo, 0)')
    elif estatus == 'Alerta':
      where.append('ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0)')
    else:
      raise HTTPException(status_code=400, detail='Estatus inválido')

  sql = f"""
  SELECT
    a.id_articulo AS id,
    a.codigo_articulo AS codigo,
    a.nombre_base AS nombre,
    sc.nombre_subcategoria AS subcategoria,
    a.dimension_principal AS medida,
    ISNULL(s.cantidad_actual, 0) AS cantidad,
    a.unidad_medida AS unidad,
    ISNULL(s.minimo, 0) AS min_stock,
    u.codigo_ubicacion AS ubicacion,
    CASE
      WHEN ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0) THEN 'Alerta'
      ELSE 'Disponible'
    END AS estatus
  FROM ARTICULO a
  INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
  INNER JOIN SUBCATEGORIA sc ON sc.id_subcategoria = a.id_subcategoria
  INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
  LEFT JOIN STOCK s
    ON s.id_articulo = a.id_articulo
   AND s.id_ubicacion = u.id_ubicacion
  WHERE {' AND '.join(where)}
  ORDER BY a.codigo_articulo DESC
  OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  """

  params.extend([offset, limit])
  items = _fetch_all(sql, params)
  return {'items': items, 'offset': offset, 'limit': limit}


@app.get('/inventario/{kind}/meta')
def inventory_meta(kind: str):
  if _supabase_enabled():
    return _supabase_rpc('inv_meta', {'kind': kind})

  category = _category_code(kind)

  subcategorias = _fetch_all(
    """
    SELECT
      sc.id_subcategoria AS id,
      sc.codigo_subcategoria AS codigo,
      sc.nombre_subcategoria AS nombre
    FROM SUBCATEGORIA sc
    INNER JOIN CATEGORIA c ON c.id_categoria = sc.id_categoria
    WHERE c.codigo_categoria = ? AND sc.activo = 1
    ORDER BY sc.nombre_subcategoria ASC
    """,
    [category],
  )

  ubicaciones = _fetch_all(
    """
    SELECT
      u.id_ubicacion AS id,
      u.codigo_ubicacion AS codigo,
      u.nombre_ubicacion AS nombre,
      u.tipo_ubicacion AS tipo
    FROM UBICACION u
    WHERE u.activa = 1
    ORDER BY u.codigo_ubicacion ASC
    """,
    [],
  )

  return {'subcategorias': subcategorias, 'ubicaciones': ubicaciones}


class CreateInventoryItem(BaseModel):
  codigo_articulo: int | None = Field(default=None, ge=1)
  codigo_sap: int | None = Field(default=None, ge=1)
  id_subcategoria: int = Field(..., ge=1)
  nombre_base: str = Field(..., min_length=1, max_length=150)
  descripcion: str | None = Field(default=None, max_length=255)
  dimension_principal: str | None = Field(default=None, max_length=50)
  detalle_adicional: str | None = Field(default=None, max_length=255)
  unidad_medida: str = Field(..., min_length=1, max_length=20)
  ubicacion_codigo: str = Field(..., min_length=1, max_length=50)
  cantidad_actual: float = Field(default=0, ge=0)
  minimo: float = Field(default=0, ge=0)
  maximo: float = Field(default=0, ge=0)
  punto_reorden: float = Field(default=0, ge=0)


class UpdateInventoryItem(BaseModel):
  nombre_base: str | None = Field(default=None, min_length=1, max_length=150)
  descripcion: str | None = Field(default=None, max_length=255)
  dimension_principal: str | None = Field(default=None, max_length=50)
  detalle_adicional: str | None = Field(default=None, max_length=255)
  unidad_medida: str | None = Field(default=None, min_length=1, max_length=20)


_CACHE_TTL_SECONDS = 120.0
_CAT_ID_CACHE: dict[str, tuple[int, float]] = {}
_SUBCAT_CODE_CACHE: dict[tuple[str, int], tuple[str, float]] = {}


def _get_categoria_id(conn, *, codigo_categoria: str) -> int:
  now = time.monotonic()
  cached = _CAT_ID_CACHE.get(codigo_categoria)
  if cached and cached[1] > now:
    return cached[0]

  cur = conn.cursor()
  cur.execute(
    "SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = ? AND activo = 1",
    [codigo_categoria],
  )
  row = cur.fetchone()
  if not row:
    raise HTTPException(status_code=400, detail='Categoría inválida')
  value = int(row[0])
  _CAT_ID_CACHE[codigo_categoria] = (value, now + _CACHE_TTL_SECONDS)
  return value


def _get_subcategoria_codigo(conn, *, codigo_categoria: str, id_subcategoria: int) -> str:
  key = (codigo_categoria, id_subcategoria)
  now = time.monotonic()
  cached = _SUBCAT_CODE_CACHE.get(key)
  if cached and cached[1] > now:
    return cached[0]

  cur = conn.cursor()
  cur.execute(
    """
    SELECT sc.codigo_subcategoria
    FROM SUBCATEGORIA sc
    INNER JOIN CATEGORIA c ON c.id_categoria = sc.id_categoria
    WHERE c.codigo_categoria = ?
      AND c.activo = 1
      AND sc.id_subcategoria = ?
      AND sc.activo = 1
    """,
    [codigo_categoria, id_subcategoria],
  )
  row = cur.fetchone()
  if not row:
    raise HTTPException(status_code=400, detail='Subcategoría inválida')

  codigo_subcategoria = str(row[0]).strip()
  _SUBCAT_CODE_CACHE[key] = (codigo_subcategoria, now + _CACHE_TTL_SECONDS)
  return codigo_subcategoria


def _next_codigo_articulo(conn, *, codigo_categoria: str, codigo_subcategoria: str) -> int:
  cur = conn.cursor()

  prefix = int(f'{codigo_categoria}{codigo_subcategoria}')
  base = prefix * 10000
  cur.execute(
    """
    SELECT ISNULL(MAX(a.codigo_articulo), ?)
    FROM ARTICULO a
    WHERE a.codigo_articulo BETWEEN ? AND ?
    """,
    [base, base, base + 9999],
  )
  row = cur.fetchone()
  max_code = int(row[0]) if row and row[0] is not None else base
  next_code = max_code + 1
  if next_code > base + 9999:
    raise HTTPException(status_code=400, detail='Se alcanzó el máximo de serie (9999)')
  return next_code


@app.get('/inventario/{kind}/next-codigo')
def next_codigo(kind: str, id_subcategoria: int = Query(..., ge=1)):
  if _supabase_enabled():
    codigo_articulo = _supabase_rpc(
      'inv_next_codigo',
      {'kind': kind, 'id_subcategoria': id_subcategoria},
    )
    return {'codigo_articulo': codigo_articulo}

  codigo_categoria = _category_code(kind)

  try:
    with _connect() as conn:
      codigo_subcategoria = _get_subcategoria_codigo(
        conn,
        codigo_categoria=codigo_categoria,
        id_subcategoria=id_subcategoria,
      )
      codigo_articulo = _next_codigo_articulo(
        conn,
        codigo_categoria=codigo_categoria,
        codigo_subcategoria=codigo_subcategoria,
      )
      return {'codigo_articulo': codigo_articulo}
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Error de BD: {e}') from e


@app.post('/inventario/{kind}/items')
def create_inventory_item(kind: str, payload: CreateInventoryItem):
  if _supabase_enabled():
    return _supabase_rpc(
      'inv_create_item',
      {
        'kind': kind,
        'codigo_sap': payload.codigo_sap,
        'id_subcategoria': payload.id_subcategoria,
        'nombre_base': payload.nombre_base,
        'descripcion': payload.descripcion,
        'dimension_principal': payload.dimension_principal,
        'detalle_adicional': payload.detalle_adicional,
        'unidad_medida': payload.unidad_medida,
        'cantidad_actual': payload.cantidad_actual,
        'minimo': payload.minimo,
        'maximo': payload.maximo,
        'punto_reorden': payload.punto_reorden,
      },
    )

  codigo_categoria = _category_code(kind)
  ubicacion_codigo = _default_location_code(kind)

  try:
    with _connect() as conn:
      cur = conn.cursor()
      id_categoria = _get_categoria_id(conn, codigo_categoria=codigo_categoria)
      codigo_subcategoria = _get_subcategoria_codigo(
        conn,
        codigo_categoria=codigo_categoria,
        id_subcategoria=payload.id_subcategoria,
      )
      codigo_articulo = _next_codigo_articulo(
        conn,
        codigo_categoria=codigo_categoria,
        codigo_subcategoria=codigo_subcategoria,
      )
      if payload.codigo_articulo and payload.codigo_articulo != codigo_articulo:
        raise HTTPException(
          status_code=400,
          detail=f'Código inválido. Siguiente código esperado: {codigo_articulo}',
        )

      cur.execute(
        "SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = ? AND activa = 1",
        [ubicacion_codigo.strip().upper()],
      )
      ubi_row = cur.fetchone()
      if not ubi_row:
        raise HTTPException(status_code=400, detail='Ubicación inválida')
      id_ubicacion = ubi_row[0]

      cur.execute(
        "SELECT 1 FROM ARTICULO WHERE codigo_articulo = ?",
        [codigo_articulo],
      )
      if cur.fetchone():
        raise HTTPException(status_code=400, detail='El código de artículo ya existe')

      cur.execute(
        """
        INSERT INTO ARTICULO (
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
        OUTPUT INSERTED.id_articulo
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1)
        """,
        [
          codigo_articulo,
          payload.codigo_sap,
          id_categoria,
          payload.id_subcategoria,
          payload.nombre_base.strip().upper(),
          payload.descripcion.strip().upper() if payload.descripcion else None,
          payload.dimension_principal.strip().upper()
          if payload.dimension_principal
          else None,
          payload.detalle_adicional.strip().upper() if payload.detalle_adicional else None,
          payload.unidad_medida.strip().upper(),
        ],
      )
      id_articulo = cur.fetchone()[0]

      cur.execute(
        """
        INSERT INTO STOCK (
          id_articulo,
          id_ubicacion,
          cantidad_actual,
          minimo,
          maximo,
          punto_reorden
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
          id_articulo,
          id_ubicacion,
          payload.cantidad_actual,
          payload.minimo,
          payload.maximo,
          payload.punto_reorden,
        ],
      )

      conn.commit()

    item = _fetch_all(
      """
      SELECT
        a.id_articulo AS id,
        a.codigo_articulo AS codigo,
        a.nombre_base AS nombre,
        sc.nombre_subcategoria AS subcategoria,
        a.dimension_principal AS medida,
        ISNULL(s.cantidad_actual, 0) AS cantidad,
        a.unidad_medida AS unidad,
        ISNULL(s.minimo, 0) AS min_stock,
        u.codigo_ubicacion AS ubicacion,
        CASE
          WHEN ISNULL(s.cantidad_actual, 0) < ISNULL(s.minimo, 0) THEN 'Alerta'
          ELSE 'Disponible'
        END AS estatus
      FROM ARTICULO a
      INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
      INNER JOIN SUBCATEGORIA sc ON sc.id_subcategoria = a.id_subcategoria
      INNER JOIN UBICACION u ON u.codigo_ubicacion = ?
      LEFT JOIN STOCK s
        ON s.id_articulo = a.id_articulo
       AND s.id_ubicacion = u.id_ubicacion
      WHERE c.codigo_categoria = ? AND a.id_articulo = ?
      """,
      [ubicacion_codigo.strip().upper(), codigo_categoria, id_articulo],
    )
    return {'item': item[0] if item else {'id': id_articulo}}
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Error de BD: {e}') from e


@app.patch('/inventario/{kind}/items/{id_articulo}')
def update_inventory_item(kind: str, id_articulo: int, payload: UpdateInventoryItem):
  if _supabase_enabled():
    return _supabase_rpc(
      'inv_update_item',
      {
        'kind': kind,
        'id_articulo': id_articulo,
        'nombre_base': payload.nombre_base,
        'unidad_medida': payload.unidad_medida,
        'dimension_principal': payload.dimension_principal,
      },
    )

  codigo_categoria = _category_code(kind)

  try:
    with _connect() as conn:
      cur = conn.cursor()

      cur.execute(
        """
        SELECT a.id_articulo
        FROM ARTICULO a
        INNER JOIN CATEGORIA c ON c.id_categoria = a.id_categoria
        WHERE a.id_articulo = ? AND c.codigo_categoria = ? AND a.activo = 1
        """,
        [id_articulo, codigo_categoria],
      )
      if not cur.fetchone():
        raise HTTPException(status_code=404, detail='Artículo no encontrado')

      set_parts = []
      params = []

      if payload.nombre_base is not None:
        set_parts.append('nombre_base = ?')
        params.append(payload.nombre_base.strip().upper())

      if payload.descripcion is not None:
        set_parts.append('descripcion = ?')
        params.append(payload.descripcion.strip().upper() if payload.descripcion else None)

      if payload.dimension_principal is not None:
        set_parts.append('dimension_principal = ?')
        params.append(
          payload.dimension_principal.strip().upper()
          if payload.dimension_principal
          else None
        )

      if payload.detalle_adicional is not None:
        set_parts.append('detalle_adicional = ?')
        params.append(
          payload.detalle_adicional.strip().upper() if payload.detalle_adicional else None
        )

      if payload.unidad_medida is not None:
        set_parts.append('unidad_medida = ?')
        params.append(payload.unidad_medida.strip().upper())

      if not set_parts:
        return {'ok': True, 'updated': False}

      params.append(id_articulo)
      cur.execute(f"UPDATE ARTICULO SET {', '.join(set_parts)} WHERE id_articulo = ?", params)
      conn.commit()

    return {'ok': True, 'updated': True}
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Error de BD: {e}') from e
