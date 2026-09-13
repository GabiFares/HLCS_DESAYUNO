PRAGMA foreign_keys = ON;

CREATE TABLE stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_number TEXT NOT NULL CHECK (length(trim(room_number)) BETWEEN 1 AND 20),
  check_in_date TEXT NOT NULL CHECK (length(check_in_date) = 10),
  check_out_date TEXT NOT NULL CHECK (length(check_out_date) = 10 AND check_out_date >= check_in_date),
  guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 1 AND 99),
  completed_on TEXT CHECK (completed_on IS NULL OR length(completed_on) = 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX stays_service_dates_idx ON stays(check_in_date, check_out_date);
CREATE INDEX stays_open_idx ON stays(completed_on, check_out_date);
CREATE INDEX stays_room_idx ON stays(room_number);

CREATE TABLE breakfast_daily_status (
  stay_id INTEGER NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  service_date TEXT NOT NULL CHECK (length(service_date) = 10),
  served_count INTEGER NOT NULL DEFAULT 0 CHECK (served_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stay_id, service_date)
);

CREATE INDEX breakfast_date_idx ON breakfast_daily_status(service_date);

CREATE TRIGGER breakfast_validate_insert
BEFORE INSERT ON breakfast_daily_status
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM stays
      WHERE id = NEW.stay_id
        AND NEW.service_date BETWEEN check_in_date AND check_out_date
        AND NEW.served_count <= guest_count
    ) THEN RAISE(ABORT, 'invalid breakfast count or date')
  END;
END;

CREATE TRIGGER breakfast_validate_update
BEFORE UPDATE OF served_count, service_date, stay_id ON breakfast_daily_status
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM stays
      WHERE id = NEW.stay_id
        AND NEW.service_date BETWEEN check_in_date AND check_out_date
        AND NEW.served_count <= guest_count
    ) THEN RAISE(ABORT, 'invalid breakfast count or date')
  END;
END;

CREATE TRIGGER stays_clamp_breakfast_after_guest_change
AFTER UPDATE OF guest_count ON stays
BEGIN
  UPDATE breakfast_daily_status
  SET served_count = MIN(served_count, NEW.guest_count), updated_at = CURRENT_TIMESTAMP
  WHERE stay_id = NEW.id AND served_count > NEW.guest_count;
END;

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  unit TEXT CHECK (unit IS NULL OR length(trim(unit)) BETWEEN 1 AND 20),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_order_idx ON products(active, display_order, name);

CREATE TABLE daily_inventory (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  inventory_date TEXT NOT NULL CHECK (length(inventory_date) = 10),
  received_quantity REAL CHECK (received_quantity IS NULL OR received_quantity >= 0),
  remaining_quantity REAL CHECK (remaining_quantity IS NULL OR remaining_quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, inventory_date)
);

CREATE INDEX inventory_date_idx ON daily_inventory(inventory_date);

CREATE TABLE daily_notes (
  note_date TEXT PRIMARY KEY CHECK (length(note_date) = 10),
  content TEXT NOT NULL DEFAULT '' CHECK (length(content) <= 5000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (name, display_order) VALUES
  ('Leche entera', 1),
  ('Leche descremada', 2),
  ('Factura dulce', 3),
  ('Factura salada', 4),
  ('Sandwiches', 5),
  ('Pasta frola', 6),
  ('Torta', 7),
  ('Pan lactal', 8),
  ('Pan integral', 9),
  ('Jamón', 10),
  ('Queso', 11),
  ('Yogurt frutilla', 12),
  ('Yogurt durazno', 13),
  ('Cereal con azúcar', 14),
  ('Cereal sin azúcar', 15),
  ('Manteca', 16),
  ('Mermelada de durazno', 17),
  ('Mermelada de ciruela', 18),
  ('Mermelada de zapallo', 19),
  ('Mermelada de higo', 20),
  ('Jugo', 21),
  ('Café', 22),
  ('Té', 23),
  ('Azúcar', 24),
  ('Edulcorante', 25),
  ('Vascolet', 26),
  ('Agua', 27),
  ('Arándanos', 28),
  ('Frutilla / uva', 29),
  ('Manzana', 30),
  ('Naranja', 31),
  ('Durazno', 32),
  ('Bananas', 33),
  ('Melón / ciruelas', 34),
  ('Peras / ananá', 35),
  ('Kiwi', 36),
  ('Ensalada de fruta', 37);
