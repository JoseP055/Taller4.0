CREATE DATABASE InventarioTaller;
GO

USE InventarioTaller;
GO
-- CATEGORIA
CREATE TABLE CATEGORIA (
    id_categoria       INT IDENTITY(1,1) PRIMARY KEY,
    codigo_categoria   CHAR(2) NOT NULL UNIQUE,   
    nombre_categoria   VARCHAR(100) NOT NULL,
    activo             BIT NOT NULL DEFAULT 1
);
GO

-- SUBCATEGORIA
CREATE TABLE SUBCATEGORIA (
    id_subcategoria     INT IDENTITY(1,1) PRIMARY KEY,
    id_categoria        INT NOT NULL,
    codigo_subcategoria CHAR(3) NOT NULL,        
    nombre_subcategoria VARCHAR(100) NOT NULL,
    activo              BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_SUBCAT UNIQUE (id_categoria, codigo_subcategoria),
    CONSTRAINT FK_SUBCAT_CAT
        FOREIGN KEY (id_categoria) REFERENCES CATEGORIA(id_categoria)
);
GO

-- ARTICULO (codigo_articulo = ccssnnnn, ej 10010001)
CREATE TABLE ARTICULO (
    id_articulo          INT IDENTITY(1,1) PRIMARY KEY,
    codigo_articulo      BIGINT NOT NULL UNIQUE,       -- ccsssnnnn
    codigo_sap           BIGINT NULL,
    id_categoria         INT NOT NULL,
    id_subcategoria      INT NOT NULL,
    nombre_base          VARCHAR(150) NOT NULL,        -- mayúsculas, sin símbolos
    descripcion          VARCHAR(255) NULL,            -- descripción general (opcional)

    -- CAMPOS OPCIONALES QUE PEDISTE
    dimension_principal  VARCHAR(50)  NULL,            -- opcional: '2 PULG', '3 PULG', '8"', etc.
    detalle_adicional    VARCHAR(255) NULL,            -- opcional: material, color, nota extra

    unidad_medida        VARCHAR(20) NOT NULL,
    es_maquinaria        BIT NOT NULL DEFAULT 0,
    es_herramienta       BIT NOT NULL DEFAULT 0,
    es_consumible        BIT NOT NULL DEFAULT 0,
    activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_ART_CAT
        FOREIGN KEY (id_categoria) REFERENCES CATEGORIA(id_categoria),
    CONSTRAINT FK_ART_SUBCAT
        FOREIGN KEY (id_subcategoria) REFERENCES SUBCATEGORIA(id_subcategoria)
);
GO

-- UBICACION
CREATE TABLE UBICACION (
    id_ubicacion      INT IDENTITY(1,1) PRIMARY KEY,
    codigo_ubicacion  VARCHAR(50) NOT NULL UNIQUE,
    nombre_ubicacion  VARCHAR(150) NOT NULL,
    tipo_ubicacion    VARCHAR(50) NOT NULL,
    activa            BIT NOT NULL DEFAULT 1
);
GO

-- STOCK
CREATE TABLE STOCK (
    id_stock                    INT IDENTITY(1,1) PRIMARY KEY,
    id_articulo                 INT NOT NULL,
    id_ubicacion                INT NOT NULL,
    cantidad_actual             DECIMAL(18,3) NOT NULL DEFAULT 0,
    minimo                      DECIMAL(18,3) NOT NULL DEFAULT 0,
    maximo                      DECIMAL(18,3) NOT NULL DEFAULT 0,
    punto_reorden               DECIMAL(18,3) NOT NULL DEFAULT 0,
    fecha_ultima_actualizacion  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_STOCK UNIQUE (id_articulo, id_ubicacion),
    CONSTRAINT FK_STOCK_ART
        FOREIGN KEY (id_articulo) REFERENCES ARTICULO(id_articulo),
    CONSTRAINT FK_STOCK_UBI
        FOREIGN KEY (id_ubicacion) REFERENCES UBICACION(id_ubicacion)
);
GO

-- USUARIO (simple)
CREATE TABLE USUARIO (
    id_usuario      INT IDENTITY(1,1) PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    activo          BIT NOT NULL DEFAULT 1
);
GO

-- MOVIMIENTO_STOCK
CREATE TABLE MOVIMIENTO_STOCK (
    id_movimiento          INT IDENTITY(1,1) PRIMARY KEY,
    fecha_hora             DATETIME NOT NULL DEFAULT GETDATE(),
    tipo_movimiento        VARCHAR(20) NOT NULL,  -- INGRESO, SALIDA, AJUSTE, TRASLADO
    id_articulo            INT NOT NULL,
    id_ubicacion_origen    INT NULL,
    id_ubicacion_destino   INT NULL,
    cantidad               DECIMAL(18,3) NOT NULL,
    referencia             VARCHAR(100) NULL,
    id_usuario             INT NULL,
    observaciones          VARCHAR(255) NULL,
    CONSTRAINT FK_MOV_ART
        FOREIGN KEY (id_articulo) REFERENCES ARTICULO(id_articulo),
    CONSTRAINT FK_MOV_UBI_ORIG
        FOREIGN KEY (id_ubicacion_origen) REFERENCES UBICACION(id_ubicacion),
    CONSTRAINT FK_MOV_UBI_DEST
        FOREIGN KEY (id_ubicacion_destino) REFERENCES UBICACION(id_ubicacion)
);
GO

-- COLABORADOR
CREATE TABLE COLABORADOR (
    id_colaborador     INT IDENTITY(1,1) PRIMARY KEY,
    codigo_colaborador VARCHAR(20) NOT NULL UNIQUE,
    nombre             VARCHAR(100) NOT NULL,
    apellido           VARCHAR(100) NOT NULL,
    puesto             VARCHAR(100) NULL,
    area               VARCHAR(100) NULL,
    activo             BIT NOT NULL DEFAULT 1
);
GO

-- MAQUINA
CREATE TABLE MAQUINA (
    id_maquina          INT IDENTITY(1,1) PRIMARY KEY,
    id_articulo         INT NOT NULL,
    codigo_maquina      VARCHAR(50) NOT NULL UNIQUE,
    numero_serie        VARCHAR(100) NULL,
    modelo              VARCHAR(100) NULL,
    marca               VARCHAR(100) NULL,
    estado              VARCHAR(30) NOT NULL DEFAULT 'OPERATIVA',
    en_uso              BIT NOT NULL DEFAULT 0,
    id_ubicacion_actual INT NULL,
    observaciones       VARCHAR(255) NULL,
    CONSTRAINT FK_MAQ_ART
        FOREIGN KEY (id_articulo) REFERENCES ARTICULO(id_articulo),
    CONSTRAINT FK_MAQ_UBI
        FOREIGN KEY (id_ubicacion_actual) REFERENCES UBICACION(id_ubicacion)
);
GO

-- HERRAMIENTA_UNIDAD
CREATE TABLE HERRAMIENTA_UNIDAD (
    id_herramienta      INT IDENTITY(1,1) PRIMARY KEY,
    id_articulo         INT NOT NULL,
    codigo_herramienta  VARCHAR(50) NOT NULL UNIQUE,
    estado              VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE',
    id_ubicacion_actual INT NULL,
    observaciones       VARCHAR(255) NULL,
    CONSTRAINT FK_HERR_ART
        FOREIGN KEY (id_articulo) REFERENCES ARTICULO(id_articulo),
    CONSTRAINT FK_HERR_UBI
        FOREIGN KEY (id_ubicacion_actual) REFERENCES UBICACION(id_ubicacion)
);
GO

-- ASIGNACION_HERRAMIENTA
CREATE TABLE ASIGNACION_HERRAMIENTA (
    id_asignacion    INT IDENTITY(1,1) PRIMARY KEY,
    id_herramienta   INT NOT NULL,
    id_colaborador   INT NOT NULL,
    fecha_asignacion DATETIME NOT NULL DEFAULT GETDATE(),
    fecha_devolucion DATETIME NULL,
    estado           VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    observaciones    VARCHAR(255) NULL,
    CONSTRAINT FK_ASIG_HERR
        FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA_UNIDAD(id_herramienta),
    CONSTRAINT FK_ASIG_COL
        FOREIGN KEY (id_colaborador) REFERENCES COLABORADOR(id_colaborador)
);
GO

-- USO_MAQUINA
CREATE TABLE USO_MAQUINA (
    id_uso        INT IDENTITY(1,1) PRIMARY KEY,
    id_maquina    INT NOT NULL,
    id_colaborador INT NULL,
    fecha_inicio  DATETIME NOT NULL DEFAULT GETDATE(),
    fecha_fin     DATETIME NULL,
    ot            VARCHAR(50) NULL,
    observaciones VARCHAR(255) NULL,
    CONSTRAINT FK_USO_MAQ
        FOREIGN KEY (id_maquina) REFERENCES MAQUINA(id_maquina),
    CONSTRAINT FK_USO_COL
        FOREIGN KEY (id_colaborador) REFERENCES COLABORADOR(id_colaborador)
);
GO
