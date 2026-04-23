
USE InventarioTaller;
GO
/* =========================================================================
   2. SEED BASICO
   ========================================================================= */
 -- USUARIO ADMIN
INSERT INTO USUARIO (username, password_hash)
VALUES ('admin', 'admin');
GO

INSERT INTO UBICACION (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('SUBENSAMBLE', 'AREA DE SUBENSAMBLE', 'INTERNA');

INSERT INTO UBICACION (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('STOCK', 'AREA DE STOCK', 'INTERNA');

INSERT INTO UBICACION (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('CONSUMIBLES', 'AREA DE CONSUMIBLES', 'INTERNA');

INSERT INTO UBICACION (codigo_ubicacion, nombre_ubicacion, tipo_ubicacion)
VALUES ('PROYECTO', 'PROYECTO', 'EXTERNA');
GO

-- CATEGORIAS
INSERT INTO CATEGORIA (codigo_categoria, nombre_categoria) VALUES
('10', 'MATERIA PRIMA'),
('30', 'SEMI-TERMINADO'),
('40', 'PRODUCTO TERMINADO');
GO

/* SUBCATEGORIAS MATERIA PRIMA (10) */
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '10'), '201', 'MATERIALES PARA FABRICACION DUCTOS (FABRICA)');

/* SEMI-TERMINADO (30) – lo que aparece en “Subensamble” */
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '30'), '201', 'SUBENSAMBLES');


/* PRODUCTO TERMINADO (40) – “Stock” */
INSERT INTO SUBCATEGORIA (id_categoria, codigo_subcategoria, nombre_subcategoria) VALUES
( (SELECT id_categoria FROM CATEGORIA WHERE codigo_categoria = '40'), '201', 'DUCTOS REDONDOS');

GO

/* =========================================================================
   SEED COLABORADORES - UNO POR AREA
   ========================================================================= */
INSERT INTO COLABORADOR (codigo_colaborador, nombre, apellido, puesto, area)
VALUES
('COL_SUP',  'MARIPAZ', 'APELLIDO1', 'ROL',    'FABRICA'),
('COL_TI',  'JOSE P', 'BARRANTES', 'ADMIN SISTEMA',   'TI');
GO

