-- =========================================================
-- Fix: "new row violates row-level security policy for table receta"
--
-- receta / receta_item (creadas en Supabase_002_rpc.sql) quedaron sin el
-- ALTER TABLE ... DISABLE ROW LEVEL SECURITY que sí tienen el resto de
-- tablas operativas del proyecto (articulo, stock, colaborador, etc. en
-- Supabase_001_schema_seed.sql). La autorización de este proyecto se
-- controla en el backend FastAPI, no con políticas RLS de Postgres
-- (la única tabla con RLS real es app_user), así que se alinean estas
-- dos tablas con esa misma convención.
-- =========================================================

ALTER TABLE receta DISABLE ROW LEVEL SECURITY;
ALTER TABLE receta_item DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
