EXEC sp_InsertArticulo
    @codigo_articulo     = 302010001,           -- ajusta según tu esquema
    @codigo_sap          = NULL,
    @codigo_categoria    = '30',
    @codigo_subcategoria = '201',
    @nombre_base         = 'CODO REDONDO 90 GRD',
    @descripcion         = 'CODO REDONDO 90 GRD 4PULG',
    @dimension_principal = '4 PULG',
    @detalle_adicional   = NULL,
    @unidad_medida       = 'UND',
    @es_maquinaria       = 0,
    @es_herramienta      = 0,
    @es_consumible       = 0;