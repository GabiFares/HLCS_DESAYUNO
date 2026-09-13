PRAGMA foreign_keys = OFF;

CREATE TABLE breakfast_daily_status_new (
  stay_id INTEGER NOT NULL REFERENCES stays(id) ON DELETE RESTRICT,
  service_date TEXT NOT NULL CHECK (length(service_date) = 10),
  served_count INTEGER NOT NULL DEFAULT 0 CHECK (served_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stay_id, service_date)
);

INSERT INTO breakfast_daily_status_new (stay_id, service_date, served_count, updated_at)
  SELECT stay_id, service_date, served_count, updated_at FROM breakfast_daily_status;

DROP TRIGGER IF EXISTS stays_clamp_breakfast_after_guest_change;

DROP TABLE breakfast_daily_status;

ALTER TABLE breakfast_daily_status_new RENAME TO breakfast_daily_status;

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

PRAGMA foreign_keys = ON;