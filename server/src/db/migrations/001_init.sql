-- USERS
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN ('cutting_supervisor','cutting_verifier','sewing_supervisor')),
  full_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RECIPES (Bill of Materials header)
CREATE TABLE recipes (
  id               SERIAL PRIMARY KEY,
  recipe_code      TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  std_fabric_yards NUMERIC(6,2) NOT NULL CHECK (std_fabric_yards > 0),
  wastage_cap      NUMERIC(5,2) NOT NULL CHECK (wastage_cap >= 0)
);

-- RECIPE COMPONENTS (the cut parts)
CREATE TABLE recipe_components (
  id                 SERIAL PRIMARY KEY,
  recipe_id          INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  component_name     TEXT NOT NULL,
  pieces_per_garment INTEGER NOT NULL CHECK (pieces_per_garment > 0),
  image_url          TEXT
);

-- CUTTING ORDERS
CREATE TABLE cutting_orders (
  id                SERIAL PRIMARY KEY,
  order_no          TEXT NOT NULL UNIQUE,
  recipe_id         INTEGER NOT NULL REFERENCES recipes(id),
  target_qty        INTEGER NOT NULL CHECK (target_qty > 0),
  fabric_roll_id    TEXT NOT NULL,
  actual_fabric_yds NUMERIC(10,2) NOT NULL CHECK (actual_fabric_yds > 0),
  status            TEXT NOT NULL DEFAULT 'CUTTING_IN_PROGRESS'
                    CHECK (status IN ('CUTTING_IN_PROGRESS','PENDING_VERIFICATION',
                                      'REJECTED','VERIFIED','SEWING_STARTED')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sewing_started_by INTEGER REFERENCES users(id),
  sewing_started_at TIMESTAMPTZ
);

-- VERIFICATION ITEMS (one row per component per order)
CREATE TABLE verification_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES cutting_orders(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES recipe_components(id),
  expected_qty INTEGER NOT NULL CHECK (expected_qty > 0),
  actual_qty   INTEGER CHECK (actual_qty >= 0),   -- NULL = not counted yet
  status       TEXT CHECK (status IN ('GREEN','YELLOW','RED')),
  UNIQUE (order_id, component_id)
);

-- VERIFICATION LOGS (the permanent audit trail)
CREATE TABLE verification_logs (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES cutting_orders(id),
  verifier_id    INTEGER NOT NULL REFERENCES users(id),
  decision       TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  rejection_note TEXT,
  wastage_pct    NUMERIC(7,2),
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A rejection must always carry a real reason, enforced by the database itself
  CHECK (decision <> 'REJECTED' OR length(trim(coalesce(rejection_note, ''))) > 0)
);

-- Make the audit log immutable: block any UPDATE or DELETE
CREATE FUNCTION block_log_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_logs_immutable
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION block_log_changes();