-- Importación de reservas desde Desbravador.
--
-- `source` registra el origen de creación de la estadía. Nunca se reescribe:
-- una estadía creada a mano que luego se actualiza con datos de Desbravador
-- conserva `manual` y su vínculo queda en `stay_import_items`.
--
-- `external_id` es una REFERENCIA, no una clave. El campo ID del informe de
-- Desbravador identifica una reserva y se repite en varias filas (Check-in,
-- En Marcha, Check-out) y en días distintos, por lo que NO identifica de forma
-- única a una estadía y no se usa para deduplicar.
--
-- La deduplicación usa (habitación normalizada, check-in), que es estable
-- aunque el check-out o la cantidad de pasajeros cambien durante la estadía.
--
-- Ninguna tabla guarda nombres, documentos ni empresas: sólo lo necesario
-- para el servicio de desayuno.
--
-- `stay_imports` registra cada archivo procesado con sus resultados para poder
-- auditar qué se importó. Se escribe en la misma transacción que los cambios,
-- por lo que no se puede quedar una importación aplicada sin su registro.

ALTER TABLE stays ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'desbravador'));

ALTER TABLE stays ADD COLUMN external_id TEXT
  CHECK (external_id IS NULL OR length(trim(external_id)) <= 40);

CREATE INDEX stays_import_identity_idx ON stays(room_number, check_in_date);

CREATE TABLE stay_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  page_count INTEGER NOT NULL CHECK (page_count >= 0),
  created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  ignored_count INTEGER NOT NULL DEFAULT 0 CHECK (ignored_count >= 0)
);

CREATE INDEX stay_imports_recent_idx ON stay_imports(imported_at);
