-- Al expandir el selector de zona de "municipio de Nuevo León" a "estado
-- de México" (ESTADOS_MX en theme.js, sección 169 de SUSCRIPCIONES.md),
-- las filas ya guardadas con un municipio como zona ("Monterrey",
-- "General Escobedo", "San Nicolás de los Garza", etc.) dejarían de hacer
-- match exacto contra el nuevo filtro por estado -- el filtro es
-- comparación exacta de texto, no "contiene".
--
-- Se revisó primero (SELECT, sin escribir nada) el valor real de `zona`
-- en las 5 tablas que tienen esa columna: tiendas, mercado_listings,
-- alertas, carpetas, subastas. El 100% de las filas con zona no nula hoy
-- son municipios o colonias de Nuevo León (algunos con typos/variantes:
-- "San Nicolas" vs "San Nicolás " vs "San Nicolás de los Garza", "Escobedo"
-- vs "General Escobedo", "Centro"/"Mitras"/"Monterrey Sur" como colonias de
-- Monterrey, etc.) -- ninguna fila apunta a otro estado. Por eso este
-- update es seguro sin necesitar un mapeo caso por caso: todo lo que no
-- sea ya exactamente "Nuevo León" se normaliza a "Nuevo León".
update tiendas set zona = 'Nuevo León' where zona is not null and zona <> 'Nuevo León';
update mercado_listings set zona = 'Nuevo León' where zona is not null and zona <> 'Nuevo León';
update alertas set zona = 'Nuevo León' where zona is not null and zona <> 'Nuevo León';
update carpetas set zona = 'Nuevo León' where zona is not null and zona <> 'Nuevo León';
update subastas set zona = 'Nuevo León' where zona is not null and zona <> 'Nuevo León';
