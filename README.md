# Taller4.0 — Sistema de Inventario (Ductos)

Frontend en React + Backend en Python (FastAPI) conectado a Supabase (Postgres) vía RPC.

## Requisitos

- Proyecto creado en Supabase
- Node.js + npm
- Python 3

## Base de Datos (Supabase)

1) Crea un proyecto en Supabase y abre el SQL Editor.
2) Ejecuta estos scripts (en este orden):

- [DB/Supabase_001_schema_seed.sql](./DB/Supabase_001_schema_seed.sql)
- [DB/Supabase_002_rpc.sql](./DB/Supabase_002_rpc.sql)

3) Configura el backend para usar Supabase con variables de entorno:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Backend (FastAPI)

### Instalación

Desde la raíz del proyecto:

```powershell
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn pydantic
```

### Configuración de conexión

El backend usa Supabase por variables de entorno:

```powershell
$env:SUPABASE_URL="https://TU_PROYECTO.supabase.co"
$env:SUPABASE_ANON_KEY="TU_ANON_KEY"
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Ejemplo (Windows Auth):

```powershell
$env:DB_SERVER=".\SQLEXPRESS"
$env:DB_DATABASE="InventarioTaller"
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Endpoints útiles:
- Health: http://localhost:8000/health
- Swagger: http://localhost:8000/docs

## Frontend (React + Vite)

### Instalación

```powershell
cd frontend
npm install
```

### Configuración de API

Por defecto el frontend usa `http://localhost:8000`. Si necesitas otra URL:

```powershell
$env:VITE_API_URL="http://localhost:8000"
npm run dev
```

### Ejecutar

```powershell
cd frontend
npm run dev
```

Abrir: http://localhost:5173

Credenciales:
- Usuario: `admin`
- Contraseña: `admin`

## Levantar todo con 1 comando

Desde la raíz:

```powershell
.\start-dev.ps1
```

Si tu PowerShell bloquea scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

Nota: si necesitas configurar la BD antes, define `DB_SERVER`/`DB_DATABASE` en la misma terminal antes de ejecutar `start-dev.ps1`.

## Subir a GitHub (repo nuevo)

1) Crea un repositorio vacío en GitHub.
2) En la raíz del proyecto ejecuta:

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```
