-- Ejecutar una sola vez en Supabase → SQL Editor, antes de desplegar el código nuevo.

-- 1. Nuevo campo track en preguntas (separa Consultor vs Desarrollador)
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'consultor';

-- 2. Reclasifica las 120 preguntas de desarrollador importadas el 2026-07-13
UPDATE preguntas SET track = 'desarrollador' WHERE id BETWEEN 321 AND 440;

-- 3. Tamaño de pool aleatorio por examen configurado (NULL = usar todo el pool)
ALTER TABLE exam_configs ADD COLUMN IF NOT EXISTS pool_size integer;
