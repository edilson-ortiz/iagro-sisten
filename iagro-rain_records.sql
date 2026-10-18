-- =========================================================
-- IAGRO — Tabla de registro de lluvias (pluviómetro digital)
-- Ejecutar UNA vez en la misma base de datos donde está la tabla public.users
-- =========================================================

CREATE TABLE IF NOT EXISTS public.rain_records (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fecha       DATE          NOT NULL DEFAULT CURRENT_DATE,
  mm          NUMERIC(6,1)  NOT NULL CHECK (mm >= 0 AND mm <= 500),
  lote        VARCHAR(60)   NOT NULL DEFAULT 'Lote principal',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rain_records_user_fecha
  ON public.rain_records (user_id, fecha DESC);

-- Prueba rápida (opcional): reemplaza 1 por el id de un usuario real
-- INSERT INTO public.rain_records (user_id, fecha, mm, lote) VALUES (1, CURRENT_DATE, 12.5, 'Lote principal');
-- SELECT * FROM public.rain_records ORDER BY id DESC LIMIT 5;
