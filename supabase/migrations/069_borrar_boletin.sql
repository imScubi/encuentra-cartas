-- ============================================================
-- Se quitó por completo el feature de "Boletín de precios" (banner en
-- Inicio, vista dedicada, suscripción "me interesa" y la generación
-- automática cada 3 días en el cron). Esta migración borra las tablas
-- que ya no usa nadie.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop table if exists boletin_subscripciones;
drop table if exists boletines;
drop table if exists precio_historial_semanal;
