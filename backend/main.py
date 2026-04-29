import os
import json
from datetime import datetime, timezone
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

_CACHE: dict[str, tuple[float, object]] = {}


def _cache_get(key: str):
  entry = _CACHE.get(key)
  if not entry:
    return None, False
  expires_at, value = entry
  if monotonic() >= expires_at:
    _CACHE.pop(key, None)
    return None, False
  return value, True


def _cache_set(key: str, value: object, ttl_seconds: float):
  _CACHE[key] = (monotonic() + max(float(ttl_seconds), 0.0), value)


def _cache_invalidate_prefix(prefix: str):
  to_delete = [k for k in _CACHE.keys() if k.startswith(prefix)]
  for k in to_delete:
    _CACHE.pop(k, None)


def _load_dotenv():
  base_dir = os.path.dirname(__file__)
  path = os.path.join(base_dir, '.env')
  if not os.path.exists(path):
    return
  try:
    with open(path, 'r', encoding='utf-8') as f:
      for raw in f:
        line = raw.strip()
        if not line or line.startswith('#'):
          continue
        if '=' not in line:
          continue
        k, v = line.split('=', 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if not k:
          continue
        if os.environ.get(k) is None:
          os.environ[k] = v
  except Exception:
    return


_load_dotenv()


def _supabase_url() -> str | None:
  url = os.environ.get('SUPABASE_URL')
  if url and url.strip():
    return url.strip().rstrip('/')
  return None


def _supabase_anon_key() -> str | None:
  key = (
    os.environ.get('SUPABASE_ANON_KEY')
    or os.environ.get('SUPABASE_PUBLISHABLE_KEY')
    or os.environ.get('SUPABASE_KEY')
  )
  if key and key.strip():
    return key.strip()
  return None


def _allowed_email_domains() -> list[str]:
  raw = os.environ.get('ALLOWED_EMAIL_DOMAINS') or os.environ.get('APP_ALLOWED_EMAIL_DOMAINS')
  if raw and raw.strip():
    parts = [p.strip().lower() for p in raw.split(',')]
    return [p for p in parts if p]
  return ['climatisacr.com']


def _is_allowed_email(email: str | None) -> bool:
  if not email:
    return False
  e = email.strip().lower()
  if '@' not in e:
    return False
  domain = e.split('@', 1)[1]
  return domain in _allowed_email_domains()


def _require_supabase():
  base = _supabase_url()
  key = _supabase_anon_key()
  if not base or not key:
    raise HTTPException(
      status_code=500,
      detail='Supabase no configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY.',
    )
  return base, key


def _require_bearer(authorization: str | None) -> str:
  if not authorization or not authorization.strip():
    raise HTTPException(status_code=401, detail='No autenticado')
  if not authorization.lower().startswith('bearer '):
    raise HTTPException(status_code=401, detail='Token inválido')
  return authorization.strip()


def _supabase_headers(authorization: str | None = None) -> dict[str, str]:
  _, key = _require_supabase()
  headers = {'Content-Type': 'application/json', 'apikey': key}
  if authorization and authorization.strip():
    headers['Authorization'] = authorization.strip()
  else:
    headers['Authorization'] = f'Bearer {key}'
  return headers


def _supabase_rpc(function_name: str, payload: dict, authorization: str | None = None):
  base, key = _require_supabase()

  url = f'{base}/rest/v1/rpc/{function_name}'
  body = json.dumps(payload).encode('utf-8')
  req = Request(
    url,
    data=body,
    method='POST',
    headers=_supabase_headers(authorization),
  )

  try:
    with urlopen(req, timeout=20) as res:
      raw = res.read().decode('utf-8') if res else ''
      if not raw:
        return None
      return json.loads(raw)
  except HTTPError as e:
    raw = e.read().decode('utf-8') if hasattr(e, 'read') else ''
    detail = raw or str(e)
    raise HTTPException(status_code=int(getattr(e, 'code', 500) or 500), detail=detail) from e
  except URLError as e:
    raise HTTPException(status_code=500, detail=f'Error de red Supabase: {e}') from e


def _supabase_get_user(authorization: str) -> dict:
  base, _ = _require_supabase()
  url = f'{base}/auth/v1/user'
  req = Request(url, method='GET', headers=_supabase_headers(authorization))
  try:
    with urlopen(req, timeout=20) as res:
      raw = res.read().decode('utf-8') if res else ''
      return json.loads(raw or '{}')
  except HTTPError as e:
    raw = e.read().decode('utf-8') if hasattr(e, 'read') else ''
    detail = raw or str(e)
    raise HTTPException(status_code=int(getattr(e, 'code', 500) or 500), detail=detail) from e


def _supabase_select_app_user(authorization: str, user_id: str):
  base, _ = _require_supabase()
  url = f'{base}/rest/v1/app_user?select=user_id,email,role,active&user_id=eq.{user_id}&limit=1'
  req = Request(url, method='GET', headers=_supabase_headers(authorization))
  with urlopen(req, timeout=20) as res:
    raw = res.read().decode('utf-8') if res else ''
    rows = json.loads(raw or '[]')
    return rows[0] if isinstance(rows, list) and rows else None


def _require_app_access(authorization: str | None) -> dict:
  bearer = _require_bearer(authorization)
  user = _supabase_get_user(bearer)
  user_id = user.get('id') or user.get('user', {}).get('id')
  email = user.get('email') or user.get('user', {}).get('email')
  if not user_id:
    raise HTTPException(status_code=401, detail='No autenticado')
  if not _is_allowed_email(email):
    raise HTTPException(status_code=403, detail='Correo no permitido')
  try:
    app_user = _supabase_select_app_user(bearer, user_id)
  except HTTPError:
    raise HTTPException(status_code=403, detail='Usuario no autorizado')
  if not app_user or not app_user.get('active'):
    raise HTTPException(status_code=403, detail='Usuario pendiente de aprobación')
  return {'user_id': user_id, 'email': email, 'role': app_user.get('role') or 'user'}


def _require_admin(authorization: str | None) -> dict:
  ctx = _require_app_access(authorization)
  if ctx.get('role') != 'admin':
    raise HTTPException(status_code=403, detail='No autorizado')
  return ctx


def _require_not_zebra(ctx: dict):
  if (ctx.get('role') or 'user') == 'zebra':
    raise HTTPException(status_code=403, detail='No autorizado')


app = FastAPI(title='InventarioTaller API')

app.add_middleware(
  CORSMiddleware,
  allow_origin_regex=r'^http://(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3}):\d+$',
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)


@app.get('/health')
def health():
  try:
    data = _supabase_rpc('inv_ping', {})
    return {'ok': True, 'source': 'supabase', 'ping': data}
  except Exception as e:
    return {'ok': False, 'source': 'supabase', 'error': str(e)}


@app.get('/inventario/{kind}/summary')
def inventory_summary(kind: str, authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  cache_key = f'summary:{kind}'
  cached, ok = _cache_get(cache_key)
  if ok:
    return cached
  data = _supabase_rpc('inv_summary', {'kind': kind}, authorization=authorization)
  _cache_set(cache_key, data, ttl_seconds=1.5)
  return data


@app.get('/inventario/{kind}/items')
def inventory_items(
  kind: str,
  search: str = Query('', max_length=100),
  estatus: str = Query('Todas', max_length=20),
  limit: int = Query(50, ge=1, le=1000),
  offset: int = Query(0, ge=0),
  authorization: str | None = Header(default=None),
):
  ctx = _require_app_access(authorization)
  if (ctx.get('role') or 'user') == 'zebra' and kind not in ('subensambles', 'productos-terminados'):
    raise HTTPException(status_code=403, detail='No autorizado')
  return _supabase_rpc(
    'inv_items',
    {
      'kind': kind,
      'search': search,
      'estatus': estatus,
      'lim': limit,
      'off': offset,
    },
    authorization=authorization,
  )


@app.get('/inventario/{kind}/meta')
def inventory_meta(kind: str, authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  cache_key = f'meta:{kind}'
  cached, ok = _cache_get(cache_key)
  if ok:
    return cached
  data = _supabase_rpc('inv_meta', {'kind': kind}, authorization=authorization)
  _cache_set(cache_key, data, ttl_seconds=300)
  return data


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
  cantidad_actual: float | None = Field(default=None, ge=0)
  minimo: float | None = Field(default=None, ge=0)
  maximo: float | None = Field(default=None, ge=0)
  punto_reorden: float | None = Field(default=None, ge=0)

class FabricacionPayload(BaseModel):
  id_subensamble: int = Field(..., ge=1)
  id_producto_terminado: int = Field(..., ge=1)
  cantidad: float = Field(..., gt=0)
  referencia: str | None = Field(default=None, max_length=100)
  observaciones: str | None = Field(default=None, max_length=255)

class AsociacionPayload(BaseModel):
  id_subensamble: int = Field(..., ge=1)
  id_producto_terminado: int = Field(..., ge=1)

class MovimientoPayload(BaseModel):
  tipo: str = Field(..., min_length=3, max_length=30)
  id_producto_terminado: int = Field(..., ge=1)
  cantidad: float = Field(..., gt=0)
  referencia: str | None = Field(default=None, max_length=100)
  observaciones: str | None = Field(default=None, max_length=255)

@app.get('/inventario/{kind}/next-codigo')
def next_codigo(kind: str, id_subcategoria: int = Query(..., ge=1), authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  codigo_articulo = _supabase_rpc(
    'inv_next_codigo',
    {'kind': kind, 'id_subcategoria': id_subcategoria},
    authorization=authorization,
  )
  return {'codigo_articulo': codigo_articulo}


@app.post('/inventario/{kind}/items')
def create_inventory_item(kind: str, payload: CreateInventoryItem, authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  res = _supabase_rpc(
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
    authorization=authorization,
  )
  _cache_invalidate_prefix(f'summary:{kind}')
  return res


@app.patch('/inventario/{kind}/items/{id_articulo}')
def update_inventory_item(kind: str, id_articulo: int, payload: UpdateInventoryItem, authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  res = _supabase_rpc(
    'inv_update_item',
    {
      'kind': kind,
      'id_articulo': id_articulo,
      'nombre_base': payload.nombre_base,
      'unidad_medida': payload.unidad_medida,
      'dimension_principal': payload.dimension_principal,
      'cantidad_actual': payload.cantidad_actual,
      'minimo': payload.minimo,
      'maximo': payload.maximo,
      'punto_reorden': payload.punto_reorden,
    },
    authorization=authorization,
  )
  _cache_invalidate_prefix(f'summary:{kind}')
  return res


@app.post('/logistica/fabricacion')
def crear_fabricacion(payload: FabricacionPayload, authorization: str | None = Header(default=None)):
  _require_app_access(authorization)
  res = _supabase_rpc(
    'inv_fabricate',
    {
      'id_subensamble': payload.id_subensamble,
      'id_producto_terminado': payload.id_producto_terminado,
      'cantidad': payload.cantidad,
      'referencia': payload.referencia or 'FABRICACION',
      'observaciones': payload.observaciones,
      'id_usuario': None,
    },
    authorization=authorization,
  )
  _cache_invalidate_prefix('summary:subensambles')
  _cache_invalidate_prefix('summary:productos-terminados')
  return res


@app.get('/logistica/asociaciones')
def listar_asociaciones(authorization: str | None = Header(default=None)):
  _require_app_access(authorization)
  return _supabase_rpc('inv_assoc_list', {}, authorization=authorization)


@app.post('/logistica/asociaciones')
def upsert_asociacion(payload: AsociacionPayload, authorization: str | None = Header(default=None)):
  _require_admin(authorization)
  return _supabase_rpc(
    'inv_assoc_upsert',
    {
      'id_subensamble': payload.id_subensamble,
      'id_producto_terminado': payload.id_producto_terminado,
    },
    authorization=authorization,
  )


@app.delete('/logistica/asociaciones/{id_subensamble}')
def borrar_asociacion(id_subensamble: int, authorization: str | None = Header(default=None)):
  _require_admin(authorization)
  return _supabase_rpc('inv_assoc_delete', {'id_subensamble': id_subensamble}, authorization=authorization)

@app.post('/logistica/movimientos')
def crear_movimiento(payload: MovimientoPayload, authorization: str | None = Header(default=None)):
  _require_app_access(authorization)
  tipo = (payload.tipo or '').strip().upper()
  if tipo not in ('SALIDA_PROYECTO', 'DEVOLUCION_PROYECTO'):
    raise HTTPException(status_code=400, detail='Tipo inválido')
  res = _supabase_rpc(
    'inv_move_pt_project',
    {
      'tipo': tipo,
      'id_producto_terminado': payload.id_producto_terminado,
      'cantidad': payload.cantidad,
      'referencia': payload.referencia,
      'observaciones': payload.observaciones,
      'id_usuario': None,
    },
    authorization=authorization,
  )
  _cache_invalidate_prefix('summary:productos-terminados')
  return res

@app.get('/logistica/movimientos/estado')
def movimiento_estado(id_producto_terminado: int = Query(..., ge=1), authorization: str | None = Header(default=None)):
  _require_app_access(authorization)
  return _supabase_rpc(
    'inv_pt_project_state',
    {'id_producto_terminado': id_producto_terminado},
    authorization=authorization,
  )


@app.get('/analytics/movimientos/daily')
def analytics_movimientos_daily(days: int = Query(30, ge=1, le=365), authorization: str | None = Header(default=None)):
  ctx = _require_app_access(authorization)
  _require_not_zebra(ctx)
  return _supabase_rpc('inv_movements_daily', {'days': days}, authorization=authorization)


@app.post('/auth/register')
def auth_register(authorization: str | None = Header(default=None)):
  bearer = _require_bearer(authorization)
  user = _supabase_get_user(bearer)
  user_id = user.get('id') or user.get('user', {}).get('id')
  email = user.get('email') or user.get('user', {}).get('email')
  if not user_id:
    raise HTTPException(status_code=401, detail='No autenticado')
  if not _is_allowed_email(email):
    raise HTTPException(status_code=403, detail='Correo no permitido')

  base, _ = _require_supabase()
  url = f'{base}/rest/v1/app_user'
  body = json.dumps(
    {'user_id': user_id, 'email': email, 'role': 'user', 'active': False},
  ).encode('utf-8')
  req = Request(
    url,
    method='POST',
    data=body,
    headers={**_supabase_headers(bearer), 'Prefer': 'return=minimal'},
  )
  try:
    with urlopen(req, timeout=20):
      pass
  except HTTPError as e:
    if int(getattr(e, 'code', 500) or 500) not in (409, 400):
      raw = e.read().decode('utf-8') if hasattr(e, 'read') else ''
      raise HTTPException(status_code=500, detail=raw or str(e)) from e
  return {'ok': True}


@app.get('/auth/me')
def auth_me(authorization: str | None = Header(default=None)):
  bearer = _require_bearer(authorization)
  user = _supabase_get_user(bearer)
  user_id = user.get('id') or user.get('user', {}).get('id')
  email = user.get('email') or user.get('user', {}).get('email')
  if not user_id:
    raise HTTPException(status_code=401, detail='No autenticado')
  app_user = _supabase_select_app_user(bearer, user_id)
  return {'user': {'id': user_id, 'email': email}, 'app_user': app_user}


class AdminUpdateUserPayload(BaseModel):
  role: str | None = Field(default=None, max_length=20)
  active: bool | None = None


@app.get('/admin/app-users')
def admin_list_app_users(authorization: str | None = Header(default=None)):
  bearer = _require_bearer(authorization)
  _require_admin(authorization)
  base, _ = _require_supabase()
  url = f'{base}/rest/v1/app_user?select=user_id,email,role,active,created_at,updated_at&order=created_at.desc'
  req = Request(url, method='GET', headers=_supabase_headers(bearer))
  with urlopen(req, timeout=20) as res:
    raw = res.read().decode('utf-8') if res else ''
    return {'users': json.loads(raw or '[]')}


@app.patch('/admin/app-users/{user_id}')
def admin_update_app_user(user_id: str, payload: AdminUpdateUserPayload, authorization: str | None = Header(default=None)):
  bearer = _require_bearer(authorization)
  _require_admin(authorization)
  patch = {}
  if payload.role is not None:
    patch['role'] = payload.role
  if payload.active is not None:
    patch['active'] = payload.active
  if not patch:
    return {'ok': True}
  patch['updated_at'] = datetime.now(timezone.utc).isoformat()

  base, _ = _require_supabase()
  url = f'{base}/rest/v1/app_user?user_id=eq.{user_id}'
  body = json.dumps(patch).encode('utf-8')
  req = Request(
    url,
    method='PATCH',
    data=body,
    headers={**_supabase_headers(bearer), 'Prefer': 'return=representation'},
  )
  with urlopen(req, timeout=20) as res:
    raw = res.read().decode('utf-8') if res else ''
    return {'ok': True, 'rows': json.loads(raw or '[]')}


@app.delete('/admin/app-users/{user_id}')
def admin_delete_app_user(user_id: str, authorization: str | None = Header(default=None)):
  bearer = _require_bearer(authorization)
  _require_admin(authorization)
  base, _ = _require_supabase()
  url = f'{base}/rest/v1/app_user?user_id=eq.{user_id}'
  req = Request(
    url,
    method='DELETE',
    headers={**_supabase_headers(bearer), 'Prefer': 'return=minimal'},
  )
  with urlopen(req, timeout=20):
    return {'ok': True}
