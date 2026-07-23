/* =========================================================================
   NOTAS DE CALIDAD DE DATOS - LEER ANTES DE EJECUTAR
   =========================================================================
   1) MEDIDAS RECONSTRUIDAS: Excel convirtio automaticamente fracciones de
      pulgada (ej. 1/8, 3/8, 9/16) en fechas (ej. 08-ene, 08-mar, 16-sep).
      Se revirtio la conversion para los siguientes articulos de MATERIA PRIMA;
      verifica cada uno contra el Excel original antes de confiar en el dato:
        - [materia prima] 'Broca concreto': medida reconstruida de fecha corrupta -> '1/8"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca concreto': medida reconstruida de fecha corrupta -> '3/8"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca concreto': medida reconstruida de fecha corrupta -> '9/16"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca concreto': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca madera': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '1/4"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '3/16"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '1/8"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '1/4"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '3/8"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Broca metal': medida reconstruida de fecha corrupta -> '3/4"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Cedaso': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Gasa EMT dampers': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Hule dampers': medida reconstruida de fecha corrupta -> '1/16"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Remache': medida reconstruida de fecha corrupta -> '3/16"' (VERIFICAR contra el Excel original)
        - [materia prima] 'Tornillo frijolito broca': medida reconstruida de fecha corrupta -> '1/2"' (VERIFICAR contra el Excel original)

   2) 'WD-40' (materia prima) no tenia Estado definido; se asumio 'Disponible'.

   3) DUPLICADOS: 'DC-BD Damper 12"' aparece dos veces en la hoja de producto
      terminado con el mismo valor -> se cargo dos veces tal cual (revisa si
      es un duplicado real de captura o dos lotes distintos).

   4) RECETAS SIN ARTICULO EN STOCK: la hoja de recetas incluye las siguientes
      variantes para las que NO existe una fila en 'producto terminado', por
      lo que no se pudieron insertar en RECETA (no hay codigo_articulo al cual
      enlazarlas). Si estos productos SI se fabrican, hay que agregarlos primero
      a ARTICULO (categoria 40) con su codigo, y luego insertar su receta:
        - DC-DB Damper 14"
        - Codo 45° 10"
        - Codo 90° 6"
        - Gaza 4"
        - Gaza 16"

   5) INCONSISTENCIA DE NOMBRE: la hoja de producto terminado usa indistintamente
      'DC-BD Damper' y 'DC-DB Damper' para el mismo tipo de articulo (error de
      captura). Se dejo tal cual viene en el Excel; recomendado unificar a un
      solo nombre en el sistema real.

   6) 'Codo 40° 10"' en producto terminado no tiene receta ni aparenta existir
      en ninguna otra hoja (los demas Codos son 45° o 90°); revisar si es un
      typo de 'Codo 45° 10"'.
   ========================================================================= */

USE InventarioTaller;
GO

/* =========================================================================
   3. EXTENSION DE ESQUEMA
   - Se agrega la categoria SUMINISTROS (no existia en el seed original)
   - Se agregan subcategorias nuevas detectadas en los Excel
   - Se agrega la ubicacion SUMINISTROS
   - Se crean las tablas ARTICULO y RECETA (no existian en el script original)
   ========================================================================= */

-- Nueva ubicacion para el area de suministros/insumos
INSERT INTO UBICACION (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('SUMINISTROS', 'AREA DE SUMINISTROS', 'INTERNA');
GO

-- Nueva categoria: los Suministros no encajan en MATERIA PRIMA / SEMI-TERMINADO / PRODUCTO TERMINADO
INSERT INTO CATEGORIA (codigo_categoria, nombre_categoria) VALUES
('50', 'SUMINISTROS');
GO

-- Subcategorias nuevas por categoria (las que ya existian, 201, se respetan)
-- Subcategorias nuevas de MATERIA PRIMA (10)
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), '202', 'OTROS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), '203', 'SELLADORES' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), '204', 'LÁMINA GALVANIZADA' );
GO

-- Subcategorias nuevas de SEMI-TERMINADO (30)
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), '202', 'CODOS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), '203', 'COUPLINGS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), '204', 'TIRAS' );
GO

-- Subcategorias nuevas de PRODUCTO TERMINADO (40)
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '202', 'CODOS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '203', 'COUPLINGS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '204', 'DC-BD DAMPERS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '205', 'GAZAS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '206', 'SPIRO DUCTOS' );
GO

-- Subcategorias nuevas de SUMINISTROS (50)
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), '201', 'INSUMOS Y VARIOS' );
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), '202', 'PINTURAS' );
GO

-- Tabla generica de articulos/inventario: cubre materia prima, subensambles,
-- producto terminado y suministros con la misma estructura (tal como estaban
-- modelados en los 4 Excel de origen).
CREATE TABLE ARTICULO (
    id_articulo        INT IDENTITY(1,1) PRIMARY KEY,
    codigo_articulo     VARCHAR(20)  NOT NULL UNIQUE,   -- ej: 40-001 (categoria-consecutivo)
    nombre_articulo     VARCHAR(150) NOT NULL,
    id_categoria        INT          NOT NULL FOREIGN KEY REFERENCES CATEGORIA(id_categoria),
    id_subcategoria     INT          NULL     FOREIGN KEY REFERENCES SUBCATEGORIA(id_subcategoria),
    medida              VARCHAR(50)  NULL,
    cantidad            DECIMAL(10,2) NOT NULL DEFAULT 0,
    unidad              VARCHAR(20)  NOT NULL DEFAULT 'pzas',
    minimo_stock        DECIMAL(10,2) NOT NULL DEFAULT 0,
    id_ubicacion        INT          NULL     FOREIGN KEY REFERENCES UBICACION(id_ubicacion),
    estado              VARCHAR(20)  NOT NULL DEFAULT 'Disponible'
);
GO

-- Recetas de fabricacion: cada producto terminado puede tener 1 o mas variantes
-- (ej: Gaza sin aislamiento / con aislamiento / con canuela; Damper DC / DB)
CREATE TABLE RECETA (
    id_receta           INT IDENTITY(1,1) PRIMARY KEY,
    id_articulo         INT          NOT NULL FOREIGN KEY REFERENCES ARTICULO(id_articulo),
    variante            VARCHAR(30)  NOT NULL DEFAULT 'PRINCIPAL',
    descripcion_receta  VARCHAR(500) NOT NULL
);
GO

/* =========================================================================
   4. CARGA DE ARTICULOS (materia prima, subensambles, producto terminado, suministros)
   ========================================================================= */

-- PRODUCTO TERMINADO (categoria 40, ubicacion STOCK)
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-001', 'Codo 40° 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '40° 10"', 15, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-002', 'Codo 45° 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 12"', 15, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-003', 'Codo 45° 14"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 14"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-004', 'Codo 45° 16"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 16"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-005', 'Codo 45° 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 4"', 75, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-006', 'Codo 45° 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 6"', 5, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-007', 'Codo 45° 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '45° 8"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-008', 'Codo 90° 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 10"', 2, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-009', 'Codo 90° 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 12"', 15, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-010', 'Codo 90° 14"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 14"', 15, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-011', 'Codo 90° 16"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 16"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-012', 'Codo 90° 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 4"', 24, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-013', 'Codo 90° 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '90° 8"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-014', 'Codo 95° 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '95° 6"', 24, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-015', 'Coupling 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '10"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-016', 'Coupling 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '12"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-017', 'Coupling 14"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '14"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-018', 'Coupling 16"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '16"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-019', 'Coupling 18"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '18"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-020', 'Coupling 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '4"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-021', 'Coupling 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '6"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-022', 'Coupling 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '8"', 90, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-023', 'DC-BD Damper 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '10"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-024', 'DC-BD Damper 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '12"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-025', 'DC-BD Damper 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '12"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-026', 'DC-BD Damper 16"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '16"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-027', 'DC-BD Damper 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '8"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-028', 'DC-DB Damper 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '4"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-029', 'DC-DB Damper 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '6"', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-030', 'Gaza 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '10"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-031', 'Gaza 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '12"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-032', 'Gaza 14"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '14"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-033', 'Gaza 18"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '18"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-034', 'Gaza 20"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '20"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-035', 'Gaza 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '6"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-036', 'Gaza 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '205' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '8"', 30, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-037', 'Spiro Ducto 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '10"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-038', 'Spiro Ducto 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '12"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-039', 'Spiro Ducto 14"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '14"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-040', 'Spiro Ducto 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '4"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-041', 'Spiro Ducto 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '6"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('40-042', 'Spiro Ducto 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '206' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40')), '8"', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'STOCK'), 'Disponible');
-- SUBENSAMBLES (categoria 30, ubicacion SUBENSAMBLE)
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-001', 'Codo 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '10"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-002', 'Codo 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '12"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-003', 'Codo 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '4"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-004', 'Codo 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '6"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-005', 'Codo 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '8"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-006', 'Coupling 10"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '10"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-007', 'Coupling 12"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '12"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-008', 'Coupling 4"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '4"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-009', 'Coupling 6"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '6"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-010', 'Coupling 8"', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '8"', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-011', 'Tiras - Correderas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '—', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('30-012', 'Tiras - Eses', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30')), '—', 0, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUBENSAMBLE'), 'Disponible');
-- MATERIA PRIMA (categoria 10, ubicacion CONSUMIBLES)
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-001', 'Acrilico atrapa pelusa', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 0, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-002', 'Aguarras', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-003', 'Aguarras', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Litro', 6, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-004', 'Alcohol', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Galón', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-005', 'Alcohol', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Galon', 0, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-006', 'Bougges dampers', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 100, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-007', 'Broca concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/8"', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-008', 'Broca concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/8"', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-009', 'Broca concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '9/16"', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-010', 'Broca concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-011', 'Broca concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10')), '1', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-012', 'Broca madera', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-013', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/8 - 5/8', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-014', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/4"', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-015', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/16"', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-016', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/8"', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-017', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/4"', 11, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-018', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/8"', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-019', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '7/16 ¡', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-020', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 6, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-021', 'Broca metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/4"', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-022', 'Brocha', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1inch', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-023', 'Brocha', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '2inch', 14, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-024', 'Caca de mono', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Galon', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-025', 'Caca mono', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10')), 'Galon', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-026', 'Cedaso', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-027', 'Cedaso', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Mosquitero', 6, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-028', 'Cemento contacto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Galon', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-029', 'Cerraje dampers precion', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 100, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-030', 'Cerrajes damper palanca', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 50, 'pzas', 75, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-031', 'Chapetas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-032', 'Chevron soluble oil B', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Cubeta', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-033', 'Cinta de peligro', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 4, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-034', 'Cinta precaucion', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-035', 'CINTAS DE ALUMINIO', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '203' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10')), '—', 20, 'rollos', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-036', 'Clip para ducto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '5.875', 142, 'pzas', 20, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-037', 'Coolant', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-038', 'Cuchillaa couter', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-039', 'Disco corte concreto', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '9inch', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-040', 'Disco corte metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '14inch', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-041', 'Disco corte metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '9inch', 17, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-042', 'Disco esmeril', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '9inch', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-043', 'Disco mil hojas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '7inch', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-044', 'Discos corte', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '4 inch', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-045', 'Duretan', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Tubo', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-046', 'Enchufe', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-047', 'Escuadras TDC', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Caja', 0, 'pzas', 500, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-048', 'Esmalte de aluminio', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-049', 'Felpa', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '6inch', 27, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-050', 'Felpa', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '4inch', 23, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-051', 'Fibra', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1inch', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-052', 'Fibra negra', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1inch', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-053', 'GABACHAS', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Caja', 140, 'rollos', 40, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-054', 'Galv-off', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-055', 'Gasa EMT dampers', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 300, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-056', 'Gasa plastica', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Mediana', 36, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-057', 'Gasa plastica', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Pequeña', 28, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-058', 'Gasa plastica', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Grande', 22, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-059', 'Grasa litio blanca', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-060', 'Grasa spray wurth', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '204' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10')), '—', 8, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-061', 'Grasa tubo roja', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 4, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-062', 'Guantes latex', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 150, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-063', 'Guantes seguridad', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 20, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-064', 'Hule dampers', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/16"', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-065', 'Junta flexible', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-066', 'Kaflex', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 16, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-067', 'Kflex', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '2inch', 10, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-068', 'Lentes de seguridad', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 50, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-069', 'Lentes de seguridad', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 48, 'pzas', 10, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-070', 'Lija', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '120 agua', 0, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-071', 'Linga', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-072', 'Mascarillas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10')), '—', 120, 'pzas', 20, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-073', 'Mecha limpieza', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-074', 'Pegamento blanco fibra', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Cubeta', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-075', 'Pintura amarilla', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-076', 'Pintura blanca', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 3, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-077', 'Pintura gris', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-078', 'Pintura negra', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-079', 'Pintura roja', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 12, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-080', 'Plastico paletizar', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 8, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-081', 'Polimero 40 gris', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-082', 'Poliuterano', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-083', 'Prodex', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 5, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-084', 'Remache', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '3/16"', 40, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-085', 'Rodillo', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '6inch', 24, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-086', 'Rodillo', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '4inch', 26, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-087', 'Seguros damper', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 250, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-088', 'Silicon blanco', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 2, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-089', 'Silicon negro', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-090', 'Silicon transparente', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 1, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-091', 'Tapones orejas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 200, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-092', 'Thinner', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, 'Galon', 4, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-093', 'Tornillo damper', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '6mm × 1/2', 0, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-094', 'Tornillo damper', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '6mm × 1,1/4', 0, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-095', 'Tornillo frijolito broca', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '1/2"', 200, 'pzas', 100, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-096', 'Tubo damper', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '11,7mm', 16, 'pzas', 6, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('10-097', 'WD-40', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), NULL, '—', 7, 'pzas', 5, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'CONSUMIBLES'), 'Disponible');
-- SUMINISTROS (categoria 50, ubicacion SUMINISTROS)
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-001', 'Bolsa de basura', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-002', 'Bolsa de herramientas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-003', 'Caja de clavos', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'caja', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-004', 'Caja de cubos grande', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-005', 'Caja de guantes', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'caja', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-006', 'Cepillo para metal', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-007', 'Cilindro', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-008', 'Cinta amarilla', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'rollos', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-009', 'Cinta azul', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'rollos', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-010', 'Cinta Precaución', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'rollos', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-011', 'Cintas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 5, 'rollos', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-012', 'Conos', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 4, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-013', 'Decolan', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 3, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-014', 'Felpas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 4, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-015', 'Gasas grandes', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-016', 'Gasas pequeñas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-017', 'Grasa', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 4, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-018', 'Grasa en lata', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 3, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-019', 'Grasa líquida', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 3, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-020', 'Lijas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 5, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-021', 'Limpiador', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-022', 'Linas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 4, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-023', 'Mascarillas', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'caja', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-024', 'Mascarillas (pintura)', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'caja', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-025', 'Masilla', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 3, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-026', 'Masilla 3/4', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-027', 'Pintura Anaranjado', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-028', 'Pintura Anticorrosiva', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-029', 'Pintura Azul', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-030', 'Pintura Blanco', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-031', 'Pintura Blanco Corrosivo', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-032', 'Pintura Óxido Rojo', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-033', 'Pintura Plateado', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-034', 'Pintura Red Óxido', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-035', 'Pintura Rojo', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-036', 'Pintura Rojo Sur', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 9, 'galones', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-037', 'Rodillos 15" grande', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 15, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-038', 'Rodillos pequeños', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 4, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-039', 'Sellante de piso', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '202' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 1, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
INSERT INTO ARTICULO (codigo_articulo, nombre_articulo, id_categoria, id_subcategoria, medida, cantidad, unidad, minimo_stock, id_ubicacion, estado)
VALUES ('50-040', 'WD-40', (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50'), (SELECT id_subcategoria FROM SUBCATEGORIA WHERE codigo_subcategoria = '201' AND id_categoria = (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '50')), '—', 2, 'pzas', 0, (SELECT id_ubicacion FROM UBICACION WHERE codigo_ubicacion = 'SUMINISTROS'), 'Disponible');
GO

/* =========================================================================
   5. RECETAS (ligadas a PRODUCTO TERMINADO por codigo_articulo)
   ========================================================================= */

INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-020'), 'PRINCIPAL', '5.5" de ancho x 317.30mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-021'), 'PRINCIPAL', '5.5" de ancho x 456.89mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-022'), 'PRINCIPAL', '5.5" de ancho x 636.49mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-015'), 'PRINCIPAL', '5.5" de ancho x 796.08mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-016'), 'PRINCIPAL', '5.5" de ancho x 955.67mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-017'), 'PRINCIPAL', '5.5" de ancho x 1115.27mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-018'), 'PRINCIPAL', '5.5" de ancho x 1274.86mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-019'), 'PRINCIPAL', '5.5" de ancho x 1434.45mm' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-028'), 'PRINCIPAL', 'DC/ 1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-028'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-029'), 'PRINCIPAL', 'DC/ 1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-029'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-027'), 'PRINCIPAL', 'DC/1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-027'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-023'), 'PRINCIPAL', 'DC/1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-023'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-024'), 'PRINCIPAL', 'DC/1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-024'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-026'), 'PRINCIPAL', 'DC/1 cuello de Damper, 2 bujes, 1 hule de 3mm, remaches, dos galletas, tornillos, tuercas, herraje, SD y 1 tubo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-026'), 'VARIANTE_2', 'DB/ 1 cuello de Damper, 1 galleta y 1 kit de herraje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-005'), 'PRINCIPAL', '3 gajos de 326.19mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-006'), 'PRINCIPAL', '3 gajos de 485.78mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-007'), 'PRINCIPAL', '3 gajos de 645.37mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-002'), 'PRINCIPAL', '3 gajos de 964.56mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-003'), 'PRINCIPAL', '3 gajos de 1124.15mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-004'), 'PRINCIPAL', '3 gajos de 1283.74mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-012'), 'PRINCIPAL', '4 gajos de 326.19mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-013'), 'PRINCIPAL', '4 gajos de 645.37mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-008'), 'PRINCIPAL', '4 gajos de 804.96mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-009'), 'PRINCIPAL', '4 gajos de 964.56mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-010'), 'PRINCIPAL', '4 gajos de 1124.15mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-011'), 'PRINCIPAL', '4 gajos de 1283.74mm largo' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-035'), 'PRINCIPAL', '4" de ancho x 629.29mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-035'), 'VARIANTE_2', '4" de ancho x 705.49mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-035'), 'VARIANTE_3', '7" de ancho x 990.89mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-036'), 'PRINCIPAL', '4" de ancho x 788.89mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-036'), 'VARIANTE_2', '4" de ancho x 865.09mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-036'), 'VARIANTE_3', '7" de ancho x 1150.49mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-030'), 'PRINCIPAL', '4" de ancho x 948.48mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-030'), 'VARIANTE_2', '4" de ancho x 1024.68mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-030'), 'VARIANTE_3', '7" de ancho x 1310.8mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-031'), 'PRINCIPAL', '4" de ancho x 1108.07mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-031'), 'VARIANTE_2', '4" de ancho x 1184.27mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-031'), 'VARIANTE_3', '7" de ancho x 1469.67mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-032'), 'PRINCIPAL', '4" de ancho x 1267.67mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-032'), 'VARIANTE_2', '4" de ancho x 1343.87mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-032'), 'VARIANTE_3', '7" de ancho x 1629.27mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-033'), 'PRINCIPAL', '4" de ancho x 1586.85mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-033'), 'VARIANTE_2', '4" de ancho x 1663.05mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-033'), 'VARIANTE_3', '7" de ancho x 1948.45mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-034'), 'PRINCIPAL', '4" de ancho x 1746.44mm sin aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-034'), 'VARIANTE_2', '4" de ancho x 1822.64mm con aislamiento' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-034'), 'VARIANTE_3', '7" de ancho x 2108.04mm con canuela' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-040'), 'PRINCIPAL', 'Fleje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-041'), 'PRINCIPAL', 'Fleje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-042'), 'PRINCIPAL', 'Fleje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-037'), 'PRINCIPAL', 'Fleje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-038'), 'PRINCIPAL', 'Fleje' );
INSERT INTO RECETA (id_articulo, variante, descripcion_receta)
VALUES ( (SELECT id_articulo FROM ARTICULO WHERE codigo_articulo = '40-039'), 'PRINCIPAL', 'Fleje' );
GO