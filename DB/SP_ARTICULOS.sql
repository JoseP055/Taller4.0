USE InventarioTaller;
GO

CREATE PROCEDURE sp_InsertArticulo
    @codigo_articulo     BIGINT,
    @codigo_sap          BIGINT = NULL,
    @codigo_categoria    CHAR(2),      -- ej: '30'
    @codigo_subcategoria CHAR(3),      -- ej: '201'
    @nombre_base         VARCHAR(150),
    @descripcion         VARCHAR(255) = NULL,
    @dimension_principal VARCHAR(50) = NULL,
    @detalle_adicional   VARCHAR(255) = NULL,
    @unidad_medida       VARCHAR(20),
    @es_maquinaria       BIT = 0,
    @es_herramienta      BIT = 0,
    @es_consumible       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

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
    VALUES (
        @codigo_articulo,
        @codigo_sap,
        (SELECT id_categoria
           FROM CATEGORIA
          WHERE codigo_categoria = @codigo_categoria),
        (SELECT id_subcategoria
           FROM SUBCATEGORIA
          WHERE codigo_subcategoria = @codigo_subcategoria
            AND id_categoria = (SELECT id_categoria
                                  FROM CATEGORIA
                                 WHERE codigo_categoria = @codigo_categoria)),
        @nombre_base,
        @descripcion,
        @dimension_principal,
        @detalle_adicional,
        @unidad_medida,
        @es_maquinaria,
        @es_herramienta,
        @es_consumible,
        1
    );
END;
GO