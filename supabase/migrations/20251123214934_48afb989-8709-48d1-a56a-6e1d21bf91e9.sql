-- ============================================
-- TABLE: Ledger Updates (from backfill & v2/updates)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ledger_updates (
  update_id TEXT PRIMARY KEY,
  migration_id INTEGER,
  synchronizer_id TEXT,
  record_time TEXT,
  effective_at TEXT,
  "offset" TEXT,
  workflow_id TEXT,
  kind TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_updates_migration
  ON public.ledger_updates(migration_id);
CREATE INDEX IF NOT EXISTS idx_ledger_updates_record_time
  ON public.ledger_updates(record_time);

ALTER TABLE public.ledger_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ledger_updates" ON public.ledger_updates;
CREATE POLICY "Public read ledger_updates"
  ON public.ledger_updates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write ledger_updates" ON public.ledger_updates;
CREATE POLICY "Admins write ledger_updates"
  ON public.ledger_updates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));


-- ============================================
-- TABLE: Ledger Events (from backfill & v2/updates)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ledger_events (
  event_id TEXT PRIMARY KEY,
  update_id TEXT REFERENCES public.ledger_updates(update_id) ON DELETE CASCADE,
  contract_id TEXT,
  template_id TEXT,
  package_name TEXT,
  event_type TEXT,
  payload JSONB,
  signatories JSONB,
  observers JSONB,
  created_at_ts TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_events_update_id
  ON public.ledger_events(update_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_template
  ON public.ledger_events(template_id);

ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ledger_events" ON public.ledger_events;
CREATE POLICY "Public read ledger_events"
  ON public.ledger_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write ledger_events" ON public.ledger_events;
CREATE POLICY "Admins write ledger_events"
  ON public.ledger_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));


-- ============================================
-- TABLE: Backfill Cursors (used by fetch-backfill-history.js)
-- ============================================
CREATE TABLE IF NOT EXISTS public.backfill_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id INTEGER NOT NULL,
  synchronizer_id TEXT NOT NULL,
  min_time TEXT,
  max_time TEXT,
  last_before TEXT,
  complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backfill_cursors_multi
  ON public.backfill_cursors(migration_id, synchronizer_id);

ALTER TABLE public.backfill_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins write backfill_cursors" ON public.backfill_cursors;
CREATE POLICY "Admins write backfill_cursors"
  ON public.backfill_cursors FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public read backfill_cursors" ON public.backfill_cursors;
CREATE POLICY "Public read backfill_cursors"
  ON public.backfill_cursors FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_backfill_cursors_updated_at ON public.backfill_cursors;
CREATE TRIGGER update_backfill_cursors_updated_at
  BEFORE UPDATE ON public.backfill_cursors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- TABLE: Live Update Cursor (for /v2/updates tailing)
-- ============================================
CREATE TABLE IF NOT EXISTS public.live_update_cursor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  after_migration_id INTEGER NOT NULL,
  after_record_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_update_cursor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read live_update_cursor" ON public.live_update_cursor;
CREATE POLICY "Public read live_update_cursor"
  ON public.live_update_cursor FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write live_update_cursor" ON public.live_update_cursor;
CREATE POLICY "Admins write live_update_cursor"
  ON public.live_update_cursor FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_live_update_cursor_updated_at ON public.live_update_cursor;
CREATE TRIGGER update_live_update_cursor_updated_at
  BEFORE UPDATE ON public.live_update_cursor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- STORAGE BUCKET POLICIES (for ACS JSON payloads)
-- ============================================
DROP POLICY IF EXISTS "Admins write ACS bucket" ON storage.objects;
CREATE POLICY "Admins write ACS bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'acs-data'
    AND has_role(auth.uid(), 'admin'::app_role)
  );