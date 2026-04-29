import os
import json
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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


def _require_supabase():
  base = _supabase_url()
  key = _supabase_anon_key()
  if not base or not key:
    raise HTTPException(
      status_code=500,
      detail='Supabase no configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY.',
    )
  return base, key


def _supabase_rpc(function_name: str, payload: dict):
  base, key = _require_supabase()

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
  try:
    data = _supabase_rpc('inv_ping', {})
    return {'ok': True, 'source': 'supabase', 'ping': data}
  except Exception as e:
    return {'ok': False, 'source': 'supabase', 'error': str(e)}


@app.get('/inventario/{kind}/summary')
def inventory_summary(kind: str):
  return _supabase_rpc('inv_summary', {'kind': kind})


@app.get('/inventario/{kind}/items')
def inventory_items(
  kind: str,
  search: str = Query('', max_length=100),
  estatus: str = Query('Todas', max_length=20),
  limit: int = Query(50, ge=1, le=200),
  offset: int = Query(0, ge=0),
):
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


@app.get('/inventario/{kind}/meta')
def inventory_meta(kind: str):
  return _supabase_rpc('inv_meta', {'kind': kind})


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

@app.get('/inventario/{kind}/next-codigo')
def next_codigo(kind: str, id_subcategoria: int = Query(..., ge=1)):
  codigo_articulo = _supabase_rpc(
    'inv_next_codigo',
    {'kind': kind, 'id_subcategoria': id_subcategoria},
  )
  return {'codigo_articulo': codigo_articulo}


@app.post('/inventario/{kind}/items')
def create_inventory_item(kind: str, payload: CreateInventoryItem):
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


@app.patch('/inventario/{kind}/items/{id_articulo}')
def update_inventory_item(kind: str, id_articulo: int, payload: UpdateInventoryItem):
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
